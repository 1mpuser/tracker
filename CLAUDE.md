# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal, single-user, self-hosted daily habit tracker. No auth. Four Docker Compose services: `postgres`, `backend` (NestJS + Prisma), `frontend` (Next.js App Router), `caddy` (TLS-terminating reverse proxy). Runs only on localhost.

- Frontend: http://localhost:4887 (direct, no TLS)
- Frontend over HTTPS: https://tracker.performance:4888 (via Caddy — see "HTTPS / tracker.performance" below; this is the only origin where Safari favicons and the Notification API both work correctly)
- Backend API: http://localhost:3001
- Postgres: localhost:5434 (mapped from container's internal 5432 — 5432 was already taken by an unrelated container on the dev machine; this has no effect on container-to-container networking, which still uses 5432)

Design docs live in `docs/superpowers/specs/` (approved feature designs) and `docs/superpowers/plans/` (implementation plans, task-by-task). `claude_code_prompt.md` is the original product spec the first two plans were built from — later features evolved past it organically and it was not kept in sync; don't treat it as current truth.

## Commands

Package manager & runtime is **Bun** everywhere (`bun install` / `bun run` / `bunx`) — not npm/yarn/pnpm.

### Full stack

```bash
docker compose up -d --build   # rebuild + run all 3 services
docker compose ps               # check health
docker compose logs backend     # or frontend/postgres
```

Backend and frontend commands and architecture: see `backend/CLAUDE.md` and `frontend/CLAUDE.md`.

## Architecture

### CORS / origins

`backend/src/main.ts` allows exactly two origins: `http://localhost:4887` and `https://tracker.performance:4888`. If you add another way to reach the frontend, it needs an entry in this CORS origin list or every API call will silently fail client-side.

### HTTPS / tracker.performance

Plain `http://localhost:4887` has two browser-level limitations that can't be fixed in application code: Safari doesn't reliably fetch favicons for the literal hostname `localhost` (confirmed by A/B testing `localhost` vs `127.0.0.1`, a known WebKit quirk), and the Notification API is silently inert on any HTTP origin other than `localhost`/loopback-IP — `window.isSecureContext` is `false` there per the W3C secure-contexts spec, even for a `/etc/hosts` entry that resolves to `127.0.0.1`.

The fix is a real HTTPS origin on a dedicated hostname: `caddy/Caddyfile` terminates TLS for `tracker.performance:443` using a [mkcert](https://github.com/FiloSottile/mkcert)-issued, locally-trusted certificate (`caddy/certs/`, gitignored — private key must never be committed) and reverse-proxies to the `frontend` container. The `caddy` service in `docker-compose.yml` publishes this on host port **4888**. Requires a one-time `mkcert -install` and a `127.0.0.1 tracker.performance` entry in `/etc/hosts` on the dev machine (see README's "HTTPS via tracker.performance" section for exact commands) — neither is part of the repo.

### Docker

Both `backend/Dockerfile` and `frontend/Dockerfile` are Bun-based multi-stage builds (`oven/bun:1-alpine`), not Node. The backend needs `apk add openssl` in both stages for Prisma's query engine to work on Alpine (missing `openssl` CLI breaks engine detection even though `libssl3` is present). The frontend uses Next's `output: 'standalone'`, so its runtime stage only needs `.next/standalone` + `.next/static` + `public/`, not a full `node_modules` copy. `NEXT_PUBLIC_API_URL` is a build `ARG` (not just a runtime `ENV`) because Next.js inlines `NEXT_PUBLIC_*` vars into the client bundle at `next build` time.
