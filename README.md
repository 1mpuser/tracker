# Daily Tracker

Personal, single-user, self-hosted daily tracker. No auth, runs only on localhost via Docker Compose.

## Run

```bash
cp .env.example .env
docker compose up -d --build
```

Backend: http://localhost:3001
Frontend: http://localhost:4887

## Apply migrations manually (if needed)

```bash
docker compose exec backend bunx prisma migrate deploy
```

## Local backend development (without full Docker rebuild each time)

```bash
docker compose up -d postgres
cd backend
cp ../.env.example .env   # then edit DATABASE_URL host to localhost, e.g.:
                          # DATABASE_URL=postgresql://tracker:tracker@localhost:5434/tracker
bun install
bunx prisma migrate dev
bunx prisma db seed
bun run start:dev
```

## Tests

```bash
cd backend && bun run test
```

## Local frontend development (without full Docker rebuild each time)

```bash
docker compose up -d postgres backend
cd frontend
cp .env.example .env.local   # then edit: NEXT_PUBLIC_API_URL=http://localhost:3001
bun install
bun run dev
```

Opens on http://localhost:4887 (not the Next.js default 3000 — the backend's CORS is locked to 4887).

## Frontend tests

```bash
cd frontend && bun run test
```

## HTTPS via tracker.performance

Two browser features silently degrade on plain `http://localhost:4887`:

- **Safari doesn't reliably show the favicon** for pages served from the literal hostname `localhost` (confirmed by A/B testing `localhost` vs `127.0.0.1` — only `127.0.0.1` showed the icon). Chrome/Firefox are unaffected.
- **The Notification API silently no-ops** on any non-`localhost` HTTP origin. Browsers only grant the "potentially trustworthy" exception (`window.isSecureContext === true`) to `https:` or to the literal hostnames `localhost`/loopback-IP — never to an arbitrary `/etc/hosts` entry like `tracker.test`, even though it resolves to `127.0.0.1`. On an insecure context the click handler runs but `Notification.requestPermission()` never shows a real prompt.

The fix is a real HTTPS origin: a locally-trusted certificate (via [mkcert](https://github.com/FiloSottile/mkcert)) served through a Caddy reverse proxy, on a custom hostname (`tracker.performance`) that never collides with `localhost`'s quirks.

**One-time setup (per dev machine):**

```bash
brew install mkcert
mkcert -install                                  # installs a local CA into the system trust store (asks for sudo)
echo '127.0.0.1  tracker.performance' | sudo tee -a /etc/hosts

mkdir -p caddy/certs
cd caddy/certs
mkcert -cert-file tracker.performance.pem -key-file tracker.performance-key.pem tracker.performance
cd ../..
```

`caddy/certs/` is gitignored — the private key must never be committed. `docker compose up -d --build` also starts a `caddy` service (`caddy/Caddyfile`) that terminates TLS for `tracker.performance:443` and reverse-proxies to the `frontend` container, published on host port **4888**.

Open **`https://tracker.performance:4888`**. This is now the primary way to use the app in Safari — it fixes both the favicon and the notifications issue at once, which the old `tracker.test` plain-HTTP workaround (favicon only) could not.

`http://localhost:4887` still works directly (no proxy) for local dev — see the sections above. This is why `backend/src/main.ts` allows **two** CORS origins (`http://localhost:4887` and `https://tracker.performance:4888`) instead of one; if you add yet another way to reach the frontend, add it to that same origin list.
