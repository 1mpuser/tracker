# Daily Tracker

Personal, single-user, self-hosted daily tracker. No auth, runs only on localhost via Docker Compose.

## Run

```bash
cp .env.example .env
docker compose up -d --build
```

Backend: http://localhost:3001
Frontend: http://localhost:4887 (added in a later phase)

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
