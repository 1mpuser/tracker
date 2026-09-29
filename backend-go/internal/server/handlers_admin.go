package server

import (
	"net/http"
	"strconv"

	"github.com/1mpuser/tracker/backend-go/internal/admin"
	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/go-chi/chi/v5"
)

// GET /admin/users
func (s *Server) handleAdminList(w http.ResponseWriter, r *http.Request) {
	users, err := s.admin.List(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, users)
}

// POST /admin/users — админ выдаёт учётку (201).
func (s *Server) handleAdminCreate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string  `json:"email"`
		Password string  `json:"password"`
		Timezone *string `json:"timezone"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Email == "" || len(req.Password) < 8 || len(req.Password) > 128 {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	view, err := s.admin.Create(r.Context(), admin.CreateDTO{
		Email:    req.Email,
		Password: req.Password,
		Timezone: req.Timezone,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, view)
}

// POST /admin/users/{id}/password
func (s *Server) handleAdminChangePassword(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var req struct {
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Password) < 8 || len(req.Password) > 128 {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	if err := s.admin.ChangePassword(r.Context(), id, req.Password); err != nil {
		writeError(w, err)
		return
	}
	writeNoContent(w)
}

// POST /admin/users/{id}/block
func (s *Server) handleAdminBlock(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	if err := s.admin.Block(r.Context(), u.ID, id); err != nil {
		writeError(w, err)
		return
	}
	writeNoContent(w)
}

// POST /admin/users/{id}/unblock
func (s *Server) handleAdminUnblock(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	if err := s.admin.Unblock(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	writeNoContent(w)
}

// DELETE /admin/users/{id}
func (s *Server) handleAdminRemove(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	if err := s.admin.Remove(r.Context(), u.ID, id); err != nil {
		writeError(w, err)
		return
	}
	writeNoContent(w)
}

func parseID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	raw := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		writeError(w, apperr.BadRequest("Invalid id"))
		return 0, false
	}
	return id, true
}
