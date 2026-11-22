package server

import (
	"net/http/httptest"
	"testing"

	"github.com/1mpuser/tracker/backend-go/internal/model"
	"github.com/1mpuser/tracker/backend-go/internal/store/storetest"
	"github.com/1mpuser/tracker/backend-go/internal/telegram"
)

func TestTelegramChatsListEmptyIsArray(t *testing.T) {
	svc := telegram.NewConfigService(&storetest.Fake{}, nil, "", nil, nil)
	s := &Server{telegram: svc}
	req := httptest.NewRequest("GET", "/telegram/chats", nil)
	req = req.WithContext(WithUser(req.Context(), model.AuthUser{ID: 1}))
	res := httptest.NewRecorder()
	s.handleTelegramChatsList(res, req)
	if res.Code != 200 || res.Body.String() != "{\"chats\":[]}\n" {
		t.Fatalf("status=%d body=%s, want empty chats array", res.Code, res.Body.String())
	}
}
