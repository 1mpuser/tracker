package server

import (
	"net/http"
	"regexp"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/gtd"
)

var gtdStatuses = map[string]bool{
	"inbox": true, "backlog": true, "calendar": true, "someday": true,
	"waiting": true, "project": true, "reference": true, "done": true, "archived": true,
}

var hhmmRe = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

// GET /gtd/items?status=
func (s *Server) handleGtdItems(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	var status *string
	if v := r.URL.Query().Get("status"); v != "" {
		status = &v
	}
	items, err := s.gtd.GetItems(r.Context(), u, status)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// POST /gtd/items
func (s *Server) handleGtdCreate(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	var req struct {
		Title    string `json:"title"`
		ParentID *int64 `json:"parentId"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Title == "" || len(req.Title) > 500 {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	item, err := s.gtd.Create(r.Context(), u, req.Title, req.ParentID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

// POST /gtd/items/today
func (s *Server) handleGtdCreateForDate(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	var req struct {
		Title string `json:"title"`
		Date  string `json:"date"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Title == "" || len(req.Title) > 500 {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	item, err := s.gtd.CreateForDate(r.Context(), u, req.Title, req.Date)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

// PATCH /gtd/items/{id}
func (s *Server) handleGtdUpdate(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	id, okID := parseID(w, r)
	if !okID {
		return
	}
	var req gtd.UpdateDTO
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Title != nil && (len(*req.Title) == 0 || len(*req.Title) > 500) {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	if req.Status != nil && !gtdStatuses[*req.Status] {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	if req.ScheduledTime.Set && req.ScheduledTime.Value != nil && !hhmmRe.MatchString(*req.ScheduledTime.Value) {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	item, err := s.gtd.Update(r.Context(), u, id, req)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

// DELETE /gtd/items/{id}
func (s *Server) handleGtdRemove(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	id, okID := parseID(w, r)
	if !okID {
		return
	}
	res, err := s.gtd.Remove(r.Context(), u, id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}
