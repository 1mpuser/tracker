# Daily Tracker

Personal, single-user, self-hosted daily tracker. No auth, runs only on localhost via Docker Compose.

## Quick Start (with Docker)

### Prerequisites

You need:
- **Docker** (with Compose) — [macOS](https://docs.docker.com/desktop/setup/install/mac-install/) / [Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
- **Git** — [macOS](https://git-scm.com/download/mac) / [Windows](https://git-scm.com/download/win)
- **Bun** (for local dev only) — [macOS/Windows](https://bun.sh/docs/installation)

### macOS

1. **Clone the repo:**
   ```bash
   git clone <repo-url>
   cd tracker
   ```

2. **Install Bun** (if not already installed):
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

3. **Start the full stack:**
   ```bash
   cp .env.example .env
   docker compose up -d --build
   ```

4. **Check if services are running:**
   ```bash
   docker compose ps
   ```

5. **Access the app:**
   - Frontend: http://localhost:4887
   - Backend: http://localhost:3001

### Windows

1. **Clone the repo:**
   - Open PowerShell or Git Bash
   ```powershell
   git clone <repo-url>
   cd tracker
   ```

2. **Install Bun** (if not already installed):
   ```powershell
   powershell -Command "& {param($v='1.0'); iwr https://bun.sh/install.ps1 | iex}"
   ```
   Or using `scoop`:
   ```powershell
   scoop install bun
   ```

3. **Start the full stack:**
   ```powershell
   cp .env.example .env
   docker compose up -d --build
   ```

4. **Check if services are running:**
   ```powershell
   docker compose ps
   ```

5. **Access the app:**
   - Frontend: http://localhost:4887
   - Backend: http://localhost:3001

## Local Development (without Docker rebuilds)

### Backend Development

**macOS / Windows (same):**

1. Start only the database:
   ```bash
   docker compose up -d postgres
   ```

2. Set up the backend:
   ```bash
   cd backend
   cp ../.env.example .env
   ```

3. Edit `.env` — change the database host to your machine:
   ```
   DATABASE_URL=postgresql://tracker:tracker@localhost:5434/tracker
   ```

4. Install dependencies and set up database:
   ```bash
   bun install
   bunx prisma migrate dev
   bunx prisma db seed
   ```

5. Start dev server:
   ```bash
   bun run start:dev
   ```
   Backend runs on http://localhost:3001

6. Run backend tests:
   ```bash
   bun run test
   ```

### Frontend Development

**macOS / Windows (same):**

1. Start database + backend (or use running Docker stack):
   ```bash
   docker compose up -d postgres backend
   ```

2. Set up the frontend:
   ```bash
   cd frontend
   cp .env.example .env.local
   ```

3. Edit `.env.local` (usually no changes needed, but check):
   ```
   NEXT_PUBLIC_API_URL=http://localhost:3001
   ```

4. Install dependencies:
   ```bash
   bun install
   ```

5. Start dev server:
   ```bash
   bun run dev
   ```
   Frontend runs on http://localhost:4887 (not 3000 — backend CORS is locked to 4887)

6. Run frontend tests:
   ```bash
   bun run test
   ```

## Database Migrations

To apply migrations manually (if needed):

**macOS / Windows (same):**
```bash
docker compose exec backend bunx prisma migrate deploy
```

## HTTPS via tracker.performance (Optional)

Two browser features silently degrade on plain `http://localhost:4887`:

- **Safari doesn't reliably show the favicon** for pages served from the literal hostname `localhost`. Chrome/Firefox are unaffected.
- **The Notification API silently no-ops** on plain HTTP. Browsers only allow notifications on `https:` or the literal `localhost` — never on arbitrary `/etc/hosts` entries even if they resolve to `127.0.0.1`.

The fix is a real HTTPS origin using [mkcert](https://github.com/FiloSottile/mkcert) (locally-trusted certificates) and a Caddy reverse proxy.

### macOS Setup

1. **Install mkcert via Homebrew:**
   ```bash
   brew install mkcert
   ```

2. **Install the local CA into system trust store:**
   ```bash
   mkcert -install
   ```
   (asks for your sudo password)

3. **Add hostname to `/etc/hosts`:**
   ```bash
   echo '127.0.0.1  tracker.performance' | sudo tee -a /etc/hosts
   ```

4. **Generate certificates:**
   ```bash
   mkdir -p caddy/certs
   cd caddy/certs
   mkcert -cert-file tracker.performance.pem -key-file tracker.performance-key.pem tracker.performance
   cd ../..
   ```

5. **Start the full stack with Caddy:**
   ```bash
   docker compose up -d --build
   ```

6. **Open the app:**
   https://tracker.performance:4888

### Windows Setup

1. **Install mkcert via Chocolatey or Scoop:**
   
   Option A (Chocolatey):
   ```powershell
   choco install mkcert
   ```
   
   Option B (Scoop):
   ```powershell
   scoop install mkcert
   ```

2. **Install the local CA into Windows trust store:**
   ```powershell
   mkcert -install
   ```

3. **Add hostname to Windows hosts file:**
   - **Right-click Notepad** → **Run as administrator**
   - **File → Open** → navigate to `C:\Windows\System32\drivers\etc\hosts`
   - Add this line at the end:
     ```
     127.0.0.1  tracker.performance
     ```
   - **Save and close**

4. **Generate certificates:**
   ```powershell
   mkdir -p caddy\certs
   cd caddy\certs
   mkcert -cert-file tracker.performance.pem -key-file tracker.performance-key.pem tracker.performance
   cd ..\..
   ```

5. **Start the full stack with Caddy:**
   ```powershell
   docker compose up -d --build
   ```

6. **Open the app:**
   https://tracker.performance:4888

---

**Note:** `http://localhost:4887` still works for direct access. `backend/src/main.ts` allows both CORS origins (`http://localhost:4887` and `https://tracker.performance:4888`). The HTTPS route is primarily for Safari favicon + Notification API support.
