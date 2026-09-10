import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUTH_CONFIG, AuthConfig } from './auth.config';
import type { MailMessage } from './mail-templates';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(@Inject(AUTH_CONFIG) private readonly cfg: AuthConfig) {}

  // С ключом — реальная отправка через HTTP API Resend; без ключа (только не
  // production) письмо печатается в лог бэкенда — так локально видно ссылку и
  // код подтверждения. Ошибка Resend бросается как Error без ключа в тексте.
  async send(to: string, mail: MailMessage): Promise<void> {
    const apiKey = this.cfg.resendApiKey;
    if (!apiKey) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('MailerService не настроен: RESEND_API_KEY отсутствует');
      }
      this.logger.log(`[письмо без Resend] to="${to}" subject="${mail.subject}"\n${mail.text}`);
      return;
    }

    const from = this.cfg.mailFrom ?? '';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      // Тело может содержать ключ в эхе? Режем его на всякий случай.
      const safe = body.split(apiKey).join('<redacted>');
      throw new Error(`Resend ответил ${response.status}: ${safe}`);
    }
  }
}
