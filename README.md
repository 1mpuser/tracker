# Daily Tracker

Personal, single-user, self-hosted daily tracker. No auth, runs on localhost via Docker Compose.

## Run it (Docker only — no Bun / Node needed)

The **only** things you need installed are **Docker** (with Compose) and **Git**. Everything else — Bun, the database, migrations — lives inside the containers.

- Docker Desktop: [macOS](https://docs.docker.com/desktop/setup/install/mac-install/) · [Windows](https://docs.docker.com/desktop/setup/install/windows-install/) (on Windows, enable the **WSL2** backend when prompted)
- Git: [macOS](https://git-scm.com/download/mac) · [Windows](https://git-scm.com/download/win)

Then, in a terminal (macOS Terminal, or on Windows: PowerShell / Git Bash):

```bash
git clone <repo-url>
cd tracker
docker compose up -d --build postgres backend frontend
```

Open **http://localhost:4887**. That's it. 🎉

- You do **not** need Bun or Node — the containers already have everything.
- The backend **applies database migrations and seeds the data automatically** on startup. No manual step.
- Data is stored in a Docker volume (`pgdata`) and survives restarts.

Handy commands:

```bash
docker compose ps            # service status
docker compose logs -f       # follow logs (add a service name to filter)
docker compose down          # stop everything (data is kept in the volume)
docker compose down -v       # stop AND wipe the database volume
```

> The 4th service, `caddy`, is only for the optional HTTPS hostname below — that's why it's left out of the command above. Skipping it means one less thing to set up, and `http://localhost:4887` works without it.

---

## Local development (optional)

**Only** needed if you want to edit the code with hot-reload or run the test suites. A regular user just running the app can skip this whole section.

This is the only part that needs **Bun** installed on your machine — [install instructions](https://bun.sh/docs/installation) (`curl -fsSL https://bun.sh/install | bash` on macOS/Linux, `scoop install bun` on Windows).

### Backend

```bash
docker compose up -d postgres            # just the database
cd backend
cp ../.env.example .env                   # then set DATABASE_URL to use localhost:5434:
                                          #   postgresql://tracker:tracker@localhost:5434/tracker
bun install
bunx prisma migrate dev                   # create/apply migrations
bunx prisma db seed                       # seed categories + settings
bun run start:dev                         # dev server on http://localhost:3001
bun run test                              # backend tests
```

### Frontend

```bash
docker compose up -d postgres backend     # backend deps
cd frontend
cp .env.example .env.local                 # NEXT_PUBLIC_API_URL=http://localhost:3001
bun install
bun run dev                                # dev server on http://localhost:4887 (NOT 3000 — backend CORS is locked to 4887)
bun run test                               # frontend tests
```

### Database migrations

The running backend container applies existing migrations on startup automatically. You only touch this when **creating a new** migration during development (`bunx prisma migrate dev`, above). To re-apply migrations manually inside the container:

```bash
docker compose exec backend bunx prisma migrate deploy
```

---

## HTTPS via `tracker.performance` (optional — a macOS nicety)

**Fully optional. Most people don't need this.** Plain `http://localhost:4887` works everywhere.

This exists only because of two **Safari / macOS** quirks on plain `http://localhost`:

- Safari doesn't reliably show the favicon for the literal hostname `localhost`.
- The Notification API silently does nothing on non-`localhost` HTTP origins.

**On Windows / Linux with Chrome, Edge or Firefox you do not need any of this** — `http://localhost:4887` is already a "secure context" (loopback is trusted), so notifications and favicons work there. Just use **http://localhost:4887** and skip this section.

If you still want the pretty HTTPS hostname (mainly for Safari on a Mac), it uses [mkcert](https://github.com/FiloSottile/mkcert) for a locally-trusted certificate plus the `caddy` reverse proxy:

### macOS

```bash
brew install mkcert
mkcert -install                                     # add local CA to the trust store (asks for sudo)
echo '127.0.0.1  tracker.performance' | sudo tee -a /etc/hosts
mkdir -p caddy/certs && cd caddy/certs
mkcert -cert-file tracker.performance.pem -key-file tracker.performance-key.pem tracker.performance
cd ../..
docker compose up -d --build                        # now includes caddy
```

Open **https://tracker.performance:4888**.

### Windows

1. Install mkcert: `choco install mkcert` (Chocolatey) or `scoop install mkcert` (Scoop).
2. `mkcert -install` — adds the local CA to the Windows trust store (Chrome/Edge pick it up).
3. Add the hostname to the hosts file: open **Notepad as administrator**, File → Open `C:\Windows\System32\drivers\etc\hosts`, add a line `127.0.0.1  tracker.performance`, save.
4. Generate the certificate:
   ```powershell
   mkdir caddy\certs; cd caddy\certs
   mkcert -cert-file tracker.performance.pem -key-file tracker.performance-key.pem tracker.performance
   cd ..\..
   ```
5. `docker compose up -d --build` (now includes caddy), then open **https://tracker.performance:4888**.

> The generated certificate + private key live in `caddy/certs/` and are git-ignored — generate your own per machine, and never commit the private key.

---

**Note:** `http://localhost:4887` always works for direct access. `backend/src/main.ts` allows both CORS origins (`http://localhost:4887` and `https://tracker.performance:4888`), so both routes work once set up.
