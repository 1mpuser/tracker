package server

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/1mpuser/tracker/backend-go/internal/apperr"
)

// decodeJSON разбирает тело запроса в dst; битый JSON → 400, превышение
// лимита тела → 413 (как useBodyParser limit в Express).
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeJSON(w, http.StatusRequestEntityTooLarge, errorBody{
				StatusCode: http.StatusRequestEntityTooLarge,
				Message:    "Payload too large",
				Error:      http.StatusText(http.StatusRequestEntityTooLarge),
			})
			return false
		}
		writeError(w, apperr.BadRequest("Malformed JSON"))
		return false
	}
	return true
}

// writeJSON отдаёт JSON с кодом. Содержимое не экранируется в HTML.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// writeNoContent отдаёт 204 без тела.
func writeNoContent(w http.ResponseWriter) {
	w.WriteHeader(http.StatusNoContent)
}

// NestJS-совместимое тело ошибки: {"statusCode": N, "message": "...", "error": "..."}.
type errorBody struct {
	StatusCode int    `json:"statusCode"`
	Message    string `json:"message"`
	Error      string `json:"error"`
}

func statusText(status int) string {
	return http.StatusText(status)
}

// writeError маппит ошибку домена на HTTP-статус и NestJS-совместимое тело.
func writeError(w http.ResponseWriter, err error) {
	var ae *apperr.Error
	if errors.As(err, &ae) {
		status := apperrStatus(ae.Kind)
		writeJSON(w, status, errorBody{StatusCode: status, Message: ae.Message, Error: statusText(status)})
		return
	}
	writeJSON(w, http.StatusInternalServerError, errorBody{
		StatusCode: http.StatusInternalServerError,
		Message:    "Internal server error",
		Error:      http.StatusText(http.StatusInternalServerError),
	})
}

func apperrStatus(kind apperr.Kind) int {
	switch kind {
	case apperr.KindUnauthorized:
		return http.StatusUnauthorized
	case apperr.KindNotFound:
		return http.StatusNotFound
	case apperr.KindBadRequest:
		return http.StatusBadRequest
	case apperr.KindConflict:
		return http.StatusConflict
	case apperr.KindBadGateway:
		return http.StatusBadGateway
	default:
		return http.StatusInternalServerError
	}
}
