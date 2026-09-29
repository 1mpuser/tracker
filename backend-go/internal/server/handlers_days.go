package server

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/dateutil"
	"github.com/1mpuser/tracker/backend-go/internal/days"
	"github.com/go-chi/chi/v5"
)

// GET /days/:date
func (s *Server) handleDaysGet(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	view, err := s.days.GetDay(r.Context(), u, chi.URLParam(r, "date"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

// PATCH /days/:date/categories/:key
func (s *Server) handleDaysSetCategoryStatus(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	var req struct {
		Done bool `json:"done"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	view, err := s.days.SetCategoryStatus(r.Context(), u, chi.URLParam(r, "date"), chi.URLParam(r, "key"), req.Done)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

// PATCH /days/:date/distraction
func (s *Server) handleDaysUpdateDistraction(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	var req struct {
		Delta *int  `json:"delta"`
		Reset *bool `json:"reset"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	reset := req.Reset != nil && *req.Reset
	view, err := s.days.UpdateDistraction(r.Context(), u, chi.URLParam(r, "date"), req.Delta, reset)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

// PATCH /days/:date/pomodoros
func (s *Server) handleDaysUpdatePomodoros(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	var req struct {
		Delta *int  `json:"delta"`
		Reset *bool `json:"reset"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	reset := req.Reset != nil && *req.Reset
	view, err := s.days.UpdatePomodoros(r.Context(), u, chi.URLParam(r, "date"), req.Delta, reset)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

// POST /days/:date/pomodoros/sync-session — синхронизация с календарём Session.
func (s *Server) handleDaysSyncSession(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	date := chi.URLParam(r, "date")
	if !s.sessionSync.IsEnabledFor(r.Context(), u) {
		writeError(w, apperr.Conflict("Синхронизация с календарём Session не настроена"))
		return
	}
	count, err := s.sessionSync.SyncDate(r.Context(), u, date)
	if err != nil {
		writeError(w, err)
		return
	}
	if count == nil {
		// null — календарь прочитать не удалось: счётчик не трогаем.
		writeJSON(w, http.StatusBadGateway, errorBody{StatusCode: 502, Message: "Не удалось прочитать календарь Session", Error: http.StatusText(http.StatusBadGateway)})
		return
	}
	view, err := s.days.SetPomodoros(r.Context(), u, date, *count)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

// POST /days/:date/weekly-summary
func (s *Server) handleDaysWeeklySummary(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	dateStr := chi.URLParam(r, "date")
	date, err := dateutil.ParseDateParam(dateStr)
	if err != nil {
		writeError(w, apperr.BadRequest(err.Error()))
		return
	}
	if date.Weekday() != 0 {
		writeError(w, apperr.BadRequest("Недельная сводка публикуется только за воскресенье"))
		return
	}
	if !s.weekDeliver.IsConfigured(r.Context(), u.ID, "week") {
		writeError(w, apperr.Conflict("Telegram не настроен: задайте токен бота и хотя бы один чат для недельной сводки в настройках"))
		return
	}
	var req struct {
		ChartPng *string `json:"chartPng"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.ChartPng != nil && !strings.HasPrefix(*req.ChartPng, "iVBORw0KGgo") {
		writeError(w, apperr.BadRequest("chartPng must be a base64 PNG"))
		return
	}
	result, err := s.days.PostWeeklySummary(r.Context(), u, dateStr, req.ChartPng)
	if err != nil {
		writeError(w, err)
		return
	}
	if result.Reason == "send-failed" {
		writeJSON(w, http.StatusBadGateway, errorBody{StatusCode: 502, Message: "Не удалось опубликовать недельную сводку", Error: http.StatusText(http.StatusBadGateway)})
		return
	}
	if result.Reason == "already-posted" {
		writeJSON(w, http.StatusOK, map[string]any{"posted": false, "reason": "already-posted"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"posted": true, "withChart": result.WithChart})
}

// PATCH /days/:date
func (s *Server) handleDaysUpdate(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	var req struct {
		EveningClosed *bool   `json:"eveningClosed"`
		Rating        *int    `json:"rating"`
		Comment       *string `json:"comment"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Rating != nil && (*req.Rating < 1 || *req.Rating > 10) {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	if req.Comment != nil && len(*req.Comment) > 200 {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	view, err := s.days.UpdateDay(r.Context(), u, chi.URLParam(r, "date"), days.UpdateDayData{
		EveningClosed: req.EveningClosed,
		Rating:        req.Rating,
		Comment:       req.Comment,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

// GET /history
func (s *Server) handleHistory(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	limit := 21
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			limit = n
		} else {
			limit = 21
		}
	}
	var end *string
	if v := r.URL.Query().Get("end"); v != "" {
		end = &v
	}
	history, err := s.days.GetHistory(r.Context(), u, limit, end)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, history)
}
