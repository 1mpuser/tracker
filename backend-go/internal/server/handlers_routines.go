package server

import (
	"net/http"
	"strconv"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/opt"
	"github.com/1mpuser/tracker/backend-go/internal/routines"
	"github.com/go-chi/chi/v5"
)

// GET /routines/history?weeks=&anchor=
func (s *Server) handleRoutinesHistory(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	weeks := 8
	if v := r.URL.Query().Get("weeks"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			weeks = n
		} else {
			weeks = 8
		}
	}
	var anchor *string
	if v := r.URL.Query().Get("anchor"); v != "" {
		anchor = &v
	}
	history, err := s.routines.GetHistory(r.Context(), u, weeks, anchor)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, history)
}

// GET /routines?week=
func (s *Server) handleRoutinesWeek(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	var week *string
	if v := r.URL.Query().Get("week"); v != "" {
		week = &v
	}
	view, err := s.routines.GetWeek(r.Context(), u, week)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

// POST /routines
func (s *Server) handleRoutinesCreate(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	var req struct {
		Title       string `json:"title"`
		TimesPerDay *int   `json:"timesPerDay"`
		DaysPerWeek *int   `json:"daysPerWeek"`
		CategoryID  *int64 `json:"categoryId"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Title == "" || len(req.Title) > 120 {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	if req.TimesPerDay != nil && (*req.TimesPerDay < 1 || *req.TimesPerDay > 10) {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	if req.DaysPerWeek != nil && (*req.DaysPerWeek < 1 || *req.DaysPerWeek > 7) {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	cat, err := s.routines.Create(r.Context(), u.ID, routines.CreateDTO{
		Title:       req.Title,
		TimesPerDay: req.TimesPerDay,
		DaysPerWeek: req.DaysPerWeek,
		CategoryID:  req.CategoryID,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, cat)
}

// PATCH /routines/{id}
func (s *Server) handleRoutinesUpdate(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	id, okID := parseID(w, r)
	if !okID {
		return
	}
	var req struct {
		Title       *string   `json:"title"`
		TimesPerDay *int      `json:"timesPerDay"`
		DaysPerWeek *int      `json:"daysPerWeek"`
		CategoryID  opt.Int64 `json:"categoryId"`
		Archived    *bool     `json:"archived"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Title != nil && len(*req.Title) > 120 {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	if req.TimesPerDay != nil && (*req.TimesPerDay < 1 || *req.TimesPerDay > 10) {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	if req.DaysPerWeek != nil && (*req.DaysPerWeek < 1 || *req.DaysPerWeek > 7) {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	cat, err := s.routines.Update(r.Context(), u.ID, id, routines.UpdateDTO{
		Title:       req.Title,
		TimesPerDay: req.TimesPerDay,
		DaysPerWeek: req.DaysPerWeek,
		CategoryID:  req.CategoryID.Value,
		CategorySet: req.CategoryID.Set,
		Archived:    req.Archived,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, cat)
}

// DELETE /routines/{id} — архивация.
func (s *Server) handleRoutinesArchive(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	id, okID := parseID(w, r)
	if !okID {
		return
	}
	res, err := s.routines.Archive(r.Context(), u.ID, id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// POST /routines/{id}/log
func (s *Server) handleRoutinesSetLog(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	id, okID := parseID(w, r)
	if !okID {
		return
	}
	var req struct {
		Date  string `json:"date"`
		Count int    `json:"count"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Count < 0 || req.Count > 10 {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	view, err := s.routines.SetLog(r.Context(), u, id, req.Date, req.Count)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

// DELETE /routines/{id}/log/{date}
func (s *Server) handleRoutinesRemoveLog(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	id, okID := parseID(w, r)
	if !okID {
		return
	}
	view, err := s.routines.RemoveLog(r.Context(), u, id, chi.URLParam(r, "date"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}
