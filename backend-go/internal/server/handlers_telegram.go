package server

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
	"github.com/1mpuser/tracker/backend-go/internal/telegram"
	"github.com/go-chi/chi/v5"
)

var chatIDRe = regexp.MustCompile(`^(-?\d+|@[A-Za-z0-9_]{5,})$`)

func (s *Server) handleTelegramBotGet(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	view, err := s.telegram.GetBot(r.Context(), u.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

func (s *Server) handleTelegramBotSet(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	var req struct {
		Token string `json:"token"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Token) == "" || len(req.Token) > 200 {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	view, err := s.telegram.SetBotToken(r.Context(), u.ID, req.Token)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

func (s *Server) handleTelegramBotClear(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	view, err := s.telegram.ClearBotToken(r.Context(), u.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

func (s *Server) handleTelegramChatsList(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	chats, err := s.telegram.ListChats(r.Context(), u.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"chats": chats})
}

func (s *Server) handleTelegramChatsCreate(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	var req telegram.CreateChatDTO
	if !decodeJSON(w, r, &req) {
		return
	}
	title := strings.TrimSpace(req.Title)
	if title == "" || len(title) > 64 {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	chatID := strings.TrimSpace(req.ChatID)
	if !chatIDRe.MatchString(chatID) {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	chat, err := s.telegram.CreateChat(r.Context(), u.ID, telegram.CreateChatDTO{
		Title: title, ChatID: chatID, Daily: req.Daily, Weekly: req.Weekly,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, chat)
}

func (s *Server) handleTelegramChatsUpdate(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	var req telegram.UpdateChatDTO
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Title != nil {
		t := strings.TrimSpace(*req.Title)
		if t == "" || len(t) > 64 {
			writeError(w, apperr.BadRequest("Bad Request"))
			return
		}
		req.Title = &t
	}
	chat, err := s.telegram.UpdateChat(r.Context(), u.ID, id, req)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, chat)
}

func (s *Server) handleTelegramChatsDelete(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	if err := s.telegram.DeleteChat(r.Context(), u.ID, id); err != nil {
		writeError(w, err)
		return
	}
	writeNoContent(w)
}

func (s *Server) handleTelegramChatsTest(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, apperr.BadRequest("Bad Request"))
		return
	}
	if err := s.telegram.TestChat(r.Context(), u.ID, id); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleTelegramDiscover(w http.ResponseWriter, r *http.Request) {
	u, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	found, err := s.telegram.Discover(r.Context(), u.ID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, found)
}
