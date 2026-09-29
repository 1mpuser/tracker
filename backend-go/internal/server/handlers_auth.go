package server

import (
	"net/http"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/auth"
	"github.com/1mpuser/tracker/backend-go/internal/model"
)

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type authUserView struct {
	ID       int64  `json:"id"`
	Email    string `json:"email"`
	Timezone string `json:"timezone"`
}

type meView struct {
	ID       int64  `json:"id"`
	Email    string `json:"email"`
	Timezone string `json:"timezone"`
	IsAdmin  bool   `json:"isAdmin"`
}

func toAuthUserView(u model.AuthUser) authUserView {
	return authUserView{ID: u.ID, Email: u.Email, Timezone: u.Timezone}
}

func userAgent(r *http.Request) *string {
	if v := r.Header.Get("User-Agent"); v != "" {
		return &v
	}
	return nil
}

// POST /auth/login — публичный вход, ставит cookie sid.
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Email == "" || req.Password == "" || len(req.Password) > 128 {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	res, err := s.auth.Login(r.Context(), req.Email, req.Password, auth.Meta{UserAgent: userAgent(r)})
	if err != nil {
		writeError(w, err)
		return
	}
	setSessionCookie(w, s.cfg.Auth, res.SessionToken)
	writeJSON(w, http.StatusOK, map[string]any{"user": toAuthUserView(res.User)})
}

// GET /auth/me — текущий пользователь с признаком админа.
func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	user, err := s.auth.Me(r.Context(), u.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": meView{
		ID:       user.ID,
		Email:    user.Email,
		Timezone: user.Timezone,
		IsAdmin:  user.IsAdmin,
	}})
}

// PATCH /auth/me — обновление часового пояса.
func (s *Server) handleUpdateMe(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	var req struct {
		Timezone *string `json:"timezone"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Timezone == nil || *req.Timezone == "" || len(*req.Timezone) > 64 {
		writeError(w, apperr.BadRequest("Unknown timezone"))
		return
	}
	updated, err := s.auth.UpdateTimezone(r.Context(), u.ID, *req.Timezone)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": toAuthUserView(*updated)})
}

// POST /auth/password — смена пароля, закрывает все сессии кроме текущей.
func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	var req struct {
		Current string `json:"current"`
		Next    string `json:"next"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Current) < 8 || len(req.Current) > 128 || len(req.Next) < 8 || len(req.Next) > 128 {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	if err := s.auth.ChangePassword(r.Context(), u.ID, req.Current, req.Next, sessionToken(r)); err != nil {
		writeError(w, err)
		return
	}
	writeNoContent(w)
}

// POST /auth/logout — публичный выход, чистит cookie и сессию.
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	clearSessionCookie(w)
	if token := sessionToken(r); token != "" {
		_ = s.auth.Logout(r.Context(), token)
	}
	writeNoContent(w)
}

// POST /auth/logout-all — закрывает все сессии пользователя.
func (s *Server) handleLogoutAll(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	if err := s.auth.LogoutAll(r.Context(), u.ID); err != nil {
		writeError(w, err)
		return
	}
	clearSessionCookie(w)
	writeNoContent(w)
}

// sessionToken достаёт текущий токен сессии из cookie (аналог req.sessionToken).
func sessionToken(r *http.Request) string {
	if c, err := r.Cookie("sid"); err == nil {
		return c.Value
	}
	return ""
}
