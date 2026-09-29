package telegram

import (
	"context"
	"log"

	"github.com/1mpuser/tracker/backend-go/internal/days"
	"github.com/1mpuser/tracker/backend-go/internal/store"
)

// DeliveryService — рассылка сводок по всем чатам пользователя с идемпотентностью
// через TelegramPost (уникальность [dayId, chatId, kind]). Реализует
// days.Deliverer. Легаси-одиночная отправка детектится через
// Day.telegramMessageId / weeklyTelegramMessageId.
type DeliveryService struct {
	store  store.Store
	config *ConfigService
	client *Client
}

// NewDeliveryService создаёт сервис рассылки.
func NewDeliveryService(st store.Store, config *ConfigService, client *Client) *DeliveryService {
	return &DeliveryService{store: st, config: config, client: client}
}

// IsConfigured — есть ли токен и хотя бы один чат для kind.
func (s *DeliveryService) IsConfigured(ctx context.Context, userID int64, kind string) bool {
	token, err := s.config.ResolveToken(ctx, userID)
	if err != nil || token == nil {
		return false
	}
	recips, err := s.config.Recipients(ctx, userID, kind)
	if err != nil {
		return false
	}
	return len(recips) > 0
}

type deliveryReport struct {
	Sent    int
	Failed  int
	Skipped int
}

// DeliverDay — рассылает дневную сводку по всем чатам.
func (s *DeliveryService) DeliverDay(ctx context.Context, userID, dayID int64, view days.DayView) error {
	summary := FromDayView(view)
	_, err := s.deliver(ctx, userID, dayID, "day", func(token, chatID string) SendResult {
		return s.client.SendDaySummary(ctx, token, chatID, summary)
	})
	return err
}

// DeliverWeek — рассылает недельную сводку (текст + опциональный график).
func (s *DeliveryService) DeliverWeek(ctx context.Context, userID, dayID int64, text string, chartPNG *string) (days.TelegramReport, error) {
	report, err := s.deliver(ctx, userID, dayID, "week", func(token, chatID string) SendResult {
		return s.client.SendWeeklySummary(ctx, token, chatID, text, chartPNG)
	})
	if err != nil {
		return days.TelegramReport{}, err
	}
	return days.TelegramReport{Sent: report.Sent, Failed: report.Failed, Skipped: report.Skipped}, nil
}

func (s *DeliveryService) deliver(
	ctx context.Context,
	userID, dayID int64,
	kind string,
	send func(token, chatID string) SendResult,
) (deliveryReport, error) {
	report := deliveryReport{}
	token, err := s.config.ResolveToken(ctx, userID)
	if err != nil {
		return report, err
	}
	if token == nil {
		return report, nil
	}
	recipients, err := s.config.Recipients(ctx, userID, kind)
	if err != nil {
		return report, err
	}

	// Дни, разосланные старым одноканальным кодом, помечены прямо в Day. Кому
	// именно они ушли, неизвестно — считаем, что всем, иначе переоткрытие
	// старого дня разослало бы его заново.
	day, err := s.store.FindDayByID(ctx, dayID)
	if err != nil {
		return report, err
	}
	legacyID := day.TelegramMessageID
	if kind == "week" {
		legacyID = day.WeeklyTelegramMessageID
	}
	if legacyID != nil {
		report.Skipped = len(recipients)
		return report, nil
	}

	// Последовательно, а не параллельно: чатов единицы, логи читаются проще,
	// и не упираемся в лимиты Telegram на частоту сообщений.
	for _, chatID := range recipients {
		post, err := s.store.CreateTelegramPost(ctx, dayID, chatID, kind, 0)
		if err != nil {
			if store.IsUniqueViolation(err) {
				report.Skipped++
				continue
			}
			return report, err
		}

		result := send(*token, chatID)
		if result.OK {
			if err := s.store.UpdateTelegramPostMessageID(ctx, post.ID, result.MessageID); err != nil {
				return report, err
			}
			report.Sent++
		} else {
			// Освобождаем слот: следующее закрытие дня попробует этот чат снова.
			if err := s.store.DeleteTelegramPost(ctx, post.ID); err != nil {
				return report, err
			}
			log.Printf("Telegram %s → %s failed: %s", kind, chatID, result.Error)
			report.Failed++
		}
	}
	return report, nil
}

var _ days.Deliverer = (*DeliveryService)(nil)
