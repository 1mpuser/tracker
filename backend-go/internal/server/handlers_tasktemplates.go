package server

import (
	"net/http"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/store"
)

// GET /task-templates
func (s *Server) handleTaskTemplatesList(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	list, err := s.taskTemplate.FindAll(r.Context(), u.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// POST /task-templates
func (s *Server) handleTaskTemplatesCreate(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	var req struct {
		Text string `json:"text"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Text == "" || len(req.Text) > 200 {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	item, err := s.taskTemplate.Create(r.Context(), u.ID, req.Text)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

// PATCH /task-templates/{id}
func (s *Server) handleTaskTemplatesUpdate(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	id, okID := parseID(w, r)
	if !okID {
		return
	}
	var req struct {
		Text  *string `json:"text"`
		Order *int    `json:"order"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Text != nil && (len(*req.Text) == 0 || len(*req.Text) > 200) {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	item, err := s.taskTemplate.Update(r.Context(), u.ID, id, store.TaskTemplateUpdate{Text: req.Text, Order: req.Order})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

// DELETE /task-templates/{id}
func (s *Server) handleTaskTemplatesRemove(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	id, okID := parseID(w, r)
	if !okID {
		return
	}
	res, err := s.taskTemplate.Remove(r.Context(), u.ID, id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}
