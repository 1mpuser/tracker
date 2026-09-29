package server

import (
	"net/http"
	"strings"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/settings"
)

// GET /settings
func (s *Server) handleSettingsGet(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	view, err := s.settings.Get(r.Context(), u.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

// PATCH /settings
func (s *Server) handleSettingsUpdate(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	var req struct {
		DistractionBudget    *int    `json:"distractionBudget"`
		DistractionLabel     *string `json:"distractionLabel"`
		NotificationsEnabled *bool   `json:"notificationsEnabled"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.DistractionBudget != nil && *req.DistractionBudget < 0 {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	if req.DistractionLabel != nil {
		trimmed := strings.TrimSpace(*req.DistractionLabel)
		if trimmed == "" || len(trimmed) > 32 {
			writeError(w, apperr.BadRequest("Bad Request"))
			return
		}
		req.DistractionLabel = &trimmed
	}
	view, err := s.settings.Update(r.Context(), u.ID, settings.UpdateDTO{
		DistractionBudget:    req.DistractionBudget,
		DistractionLabel:     req.DistractionLabel,
		NotificationsEnabled: req.NotificationsEnabled,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}
