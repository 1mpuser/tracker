# syntax=docker/dockerfile:1

# Многостадийная сборка Go-бэкенда. Итог — лёгкий alpine-образ из двух статичных
# бинарников (server + migrate) без node_modules / Prisma query engine.
#
# golang:1.26-alpine выбран вместо 1.23, потому что go.mod требует go 1.26.1, а
# golang.org/x/crypto и golang-migrate тянут минимум go 1.26.0.

FROM golang:1.26-alpine AS builder
WORKDIR /src
# git + ca-certificates нужны `go mod download` (часть модулей тянет по git/https).
RUN apk add --no-cache git ca-certificates
ENV CGO_ENABLED=0
ENV GOOS=linux
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server
RUN go build -trimpath -ldflags="-s -w" -o /out/migrate ./cmd/migrate

FROM alpine:3.20
# ca-certificates — для исходящих HTTPS (Telegram Bot API, CalDAV iCloud);
# tzdata — для time.LoadLocation(<таimzone>) в днях/рутинах/стате.
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /out/server /out/server
COPY --from=builder /out/migrate /out/migrate
COPY --from=builder /src/migrations ./migrations
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3001
ENTRYPOINT ["docker-entrypoint.sh"]
