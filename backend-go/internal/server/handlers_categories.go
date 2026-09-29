package server

import (
	"net/http"
	"regexp"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/categories"
	"github.com/go-chi/chi/v5"
)

var categoryKeyRe = regexp.MustCompile(`^[a-z0-9_-]+$`)

// GET /categories — активные сферы.
func (s *Server) handleCategoriesList(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	list, err := s.categories.FindActive(r.Context(), u.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// POST /categories — создать сферу (201).
func (s *Server) handleCategoriesCreate(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	var req struct {
		Key   string `json:"key"`
		Label string `json:"label"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if !categoryKeyRe.MatchString(req.Key) || len(req.Key) > 40 || len(req.Label) > 80 || req.Label == "" {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	cat, err := s.categories.Create(r.Context(), u.ID, categories.CreateDTO{Key: req.Key, Label: req.Label})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, cat)
}

// PATCH /categories/{key} — обновить сферу.
func (s *Server) handleCategoriesUpdate(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	key := chi.URLParam(r, "key")
	var req struct {
		Label    *string `json:"label"`
		Order    *int    `json:"order"`
		Archived *bool   `json:"archived"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Label != nil && len(*req.Label) > 80 {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	cat, err := s.categories.Update(r.Context(), u.ID, key, categories.UpdateDTO{
		Label:    req.Label,
		Order:    req.Order,
		Archived: req.Archived,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, cat)
}
