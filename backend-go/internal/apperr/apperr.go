package apperr

// Kind — тип ошибки, отображаемый на HTTP-статус в обработчиках.
type Kind int

const (
	KindUnauthorized Kind = iota
	KindNotFound
	KindBadRequest
	KindConflict
	KindInternal
	KindBadGateway
)

// Error — ошибка домена с понятным HTTP-отображением (аналог исключений NestJS).
type Error struct {
	Kind    Kind
	Message string
}

func (e *Error) Error() string { return e.Message }

func Unauthorized(msg string) *Error { return &Error{Kind: KindUnauthorized, Message: msg} }
func NotFound(msg string) *Error     { return &Error{Kind: KindNotFound, Message: msg} }
func BadRequest(msg string) *Error   { return &Error{Kind: KindBadRequest, Message: msg} }
func Conflict(msg string) *Error     { return &Error{Kind: KindConflict, Message: msg} }
func Internal(err error) *Error      { return &Error{Kind: KindInternal, Message: err.Error()} }
func BadGateway(msg string) *Error   { return &Error{Kind: KindBadGateway, Message: msg} }
