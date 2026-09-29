package server

import (
	"net/http"
	"strings"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/gtd"
	"github.com/1mpuser/tracker/backend-go/internal/icloud"
)

func (s *Server) handleIntegrationsICloudGet(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	view, err := s.integrations.GetICloud(r.Context(), u.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

func (s *Server) handleIntegrationsICloudSet(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	var req struct {
		AppleID       string `json:"appleId"`
		AppPassword   string `json:"appPassword"`
		RemindersList string `json:"remindersList"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	appleID := strings.TrimSpace(req.AppleID)
	if appleID == "" || len(appleID) > 254 {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	if len(req.AppPassword) < 8 {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	if len(req.RemindersList) > 64 {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	view, err := s.integrations.SetICloud(r.Context(), u.ID, appleID, req.AppPassword, req.RemindersList)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

func (s *Server) handleIntegrationsICloudClear(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	view, err := s.integrations.ClearICloud(r.Context(), u.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

func (s *Server) handleIntegrationsICloudResync(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	// Честное число — только те, у кого есть эффективная дата: именно их
	// SyncAllOnStartup реально отправит в iCloud.
	items, err := s.gtd.GetItems(r.Context(), u, nil)
	if err != nil {
		writeError(w, err)
		return
	}
	var dueItems []gtd.ItemView
	for _, item := range items {
		if icloud.EffectiveDueOf(item) != nil {
			dueItems = append(dueItems, item)
		}
	}
	if len(dueItems) > 0 {
		s.icloud.SyncAllOnStartup(r.Context(), u, dueItems)
	}
	writeJSON(w, http.StatusOK, map[string]any{"synced": len(dueItems)})
}

func (s *Server) handleIntegrationsSessionGet(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	view, err := s.integrations.GetSession(r.Context(), u.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

func (s *Server) handleIntegrationsSessionSet(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	var req struct {
		CalendarName string `json:"calendarName"`
		MinMinutes   *int   `json:"minMinutes"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	calendarName := strings.TrimSpace(req.CalendarName)
	if calendarName == "" || len(calendarName) > 64 {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	if req.MinMinutes != nil && *req.MinMinutes < 1 {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	view, err := s.integrations.SetSession(r.Context(), u.ID, calendarName, req.MinMinutes)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

func (s *Server) handleIntegrationsSessionClear(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	view, err := s.integrations.ClearSession(r.Context(), u.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}
