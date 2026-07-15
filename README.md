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

## Known issues

### Safari doesn't show the favicon on `localhost`

Safari/WebKit has a long-standing quirk where it does not reliably fetch `<link rel="icon">` for pages served from the literal hostname `localhost` — the tab shows a generic placeholder ("l") instead, regardless of what the server sends, how the favicon is cached, or whether you use SVG or PNG. Confirmed by testing `localhost:4887` vs `127.0.0.1:4887` side by side in the same Safari session: `127.0.0.1` showed the icon immediately, `localhost` never did. Chrome and Firefox are unaffected.

**Workaround:** add a `/etc/hosts` entry mapping a fake local domain to the loopback address, then use that instead of `localhost` in Safari:

```bash
echo '127.0.0.1  tracker.test' | sudo tee -a /etc/hosts
```

Then open `http://tracker.test:4887`. `.test` was used instead of `.local` because `.local` can collide with macOS's Bonjour/mDNS resolution, while `.test` is IANA-reserved (RFC 2606) specifically for local/testing use and will never be a real public domain.

This is why `backend/src/main.ts` allows **two** CORS origins (`http://localhost:4887` and `http://tracker.test:4887`) instead of one — without both, loading the app via `tracker.test` would fetch the page fine but every API call would fail CORS silently, leaving the app stuck on "загрузка…". If you add yet another way to reach the frontend (a different port, a different hostname), it needs to be added to that same origin list.
