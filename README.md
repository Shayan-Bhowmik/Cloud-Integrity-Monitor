# Cairn — Secure Cloud Backup with Integrity Checks

Cairn stores your files in a private cloud bucket and proves they haven't changed. Every upload is fingerprinted with **SHA-256**, every version record is sealed with an **HMAC-SHA256 signature**, and an integrity check detects objects that were **modified**, **deleted** or whose database **record was tampered with** — then lets you **restore** a clean version.

A built-in demo mode lets you attack your own sample files and watch Cairn catch it.

---

## Contents

- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Supabase setup](#supabase-setup)
- [Environment variables](#environment-variables)
- [Run with Docker Compose](#run-with-docker-compose)
- [Run locally without Docker](#run-locally-without-docker)
- [Tests](#tests)
- [API reference](#api-reference)
- [Demo: the four attack scenarios](#demo-the-four-attack-scenarios)
- [How status is decided](#how-status-is-decided)
- [Troubleshooting](#troubleshooting)
- [Security notes and limitations](#security-notes-and-limitations)

---

## Architecture

```
Browser (React + Vite)
  │  Supabase Auth (email + password) ──► access token (JWT)
  │  Authorization: Bearer <JWT>
  ▼
FastAPI backend
  │  verifies JWT (ES256 via the project's JWKS, or legacy HS256 secret) → user_id
  │  upload : sha256(bytes) → HMAC signature → Storage object + `versions` row
  │  verify : per version → signature → object exists → re-hash → status + alerts
  ▼
Supabase: Postgres (files, versions, alerts) + private Storage bucket `backups`
```

- The browser never touches Storage or writes to the database. Row Level Security only allows users to **select** their own rows; all writes go through the backend with the service-role key.
- Storage paths are built from IDs (`user_id/file_id/v{n}`), never from user file names.
- Signature input: `version_id | file_id | user_id | version_no | sha256 | size | storage_path`.

## Tech stack

| Part | Choice |
|---|---|
| Frontend | React 19, Vite, TypeScript (strict), Tailwind CSS v4, React Router, React Three Fiber + three.js, lucide-react |
| Backend | Python 3.11, FastAPI, Uvicorn, PyJWT, supabase-py, pytest |
| Data | Supabase (Postgres, Auth, Storage) — free plan |
| Containers | Docker, Docker Compose, nginx (serves the SPA and proxies the API) |
| Tests | pytest (backend), Vitest + Testing Library (frontend) |

## Repository structure

```
.
├── docker-compose.yml
├── .env.example
├── supabase/schema.sql            # tables + RLS
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py  config.py  auth.py  db.py  storage.py  integrity.py  schemas.py
│   │   └── routes/  files.py  verify.py  alerts.py  demo.py
│   └── tests/
└── frontend/
    ├── Dockerfile  nginx.conf  vite.config.ts  index.html
    └── src/
        ├── app/AuthProvider.tsx
        ├── components/            # Navbar, Vault3D, LoadingIntro, StatCard, StatusBadge,
        │   ├── ui/                #   UploadBox, DemoPanel, ProtectedRoute, ...
        │   └── vault/             # 3D scenes (lazy-loaded)
        ├── hooks/useResource.ts
        ├── lib/                   # api.ts, supabase.ts, types.ts, status.ts, ...
        ├── pages/                 # Landing, Auth, Dashboard, Files, FileDetail, Activity
        └── test/
```

## Prerequisites

- **Docker Desktop** (for the one-command setup), or
- **Python 3.11** and **Node.js 20.19+** (tested with Node 24) for local development
- A free **Supabase** project

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** → run [`supabase/schema.sql`](supabase/schema.sql). It creates `files`, `versions`, `alerts` and select-only RLS policies.
3. **Storage** → create a bucket named **`backups`** and keep it **private**.
4. **Authentication → Providers → Email**: enabled. If *Confirm email* is on, new users must click the link in their inbox before logging in (the app shows this). Under **URL Configuration**, add your site URL(s), e.g. `http://localhost:3000` and `http://localhost:5173`, so confirmation links redirect back.
5. **Project Settings → API**: copy the project URL, the `anon`/publishable key and the `service_role` key. **Project Settings → JWT** (or *JWT Keys*): copy the legacy JWT secret if your project has one.

> **JWT signing keys.** Newer Supabase projects sign user tokens with asymmetric keys (ES256). The backend reads the public keys from `SUPABASE_URL/auth/v1/.well-known/jwks.json` automatically. `SUPABASE_JWT_SECRET` is still used for legacy HS256 tokens.

## Environment variables

Copy `.env.example` to `.env` in the repository root. One file serves both apps; Vite only exposes variables prefixed with `VITE_` to the browser.

| Variable | Used by | Secret? | Purpose |
|---|---|---|---|
| `SUPABASE_URL` | backend | no | Project URL; also used to find the JWKS |
| `SUPABASE_SERVICE_ROLE_KEY` | backend | **yes** | Server-side DB/Storage access. Never in the frontend. |
| `SUPABASE_JWT_SECRET` | backend | **yes** | Verifies legacy HS256 tokens |
| `SIGNING_SECRET` | backend | **yes** | HMAC key for version signatures. Changing it makes every existing version read as `record_tampered`. |
| `ALLOWED_ORIGINS` | backend | no | Comma-separated CORS origins, e.g. `http://localhost:3000,http://localhost:5173` |
| `MAX_UPLOAD_MB` | backend | no | Upload limit (default 10) |
| `VITE_API_URL` | frontend | no | Backend URL for local dev, e.g. `http://localhost:8000`. Ignored by the Docker image (it uses the nginx proxy). |
| `VITE_SUPABASE_URL` | frontend | no | Same as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | frontend | no | Public anon/publishable key |

Generate a signing secret with `python -c "import secrets; print(secrets.token_hex(32))"`.

## Run with Docker Compose

```bash
docker compose up --build
```

| Service | URL | Notes |
|---|---|---|
| web | http://localhost:3000 | nginx serving the built SPA; proxies `/api/*` and `/health` to `api:8000` |
| api | http://localhost:8000 | FastAPI; `GET /health` is public |

How configuration flows:

- `api` reads `.env` at runtime (`env_file`).
- `web` is a static build. Vite inlines `VITE_*` values **at build time**, so Compose passes `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build args from `.env`. If you change them, rebuild: `docker compose up --build`.
- The browser never needs to resolve the Docker service name `api`: it calls `http://localhost:3000/api/...` (same origin) and nginx forwards the request inside the Docker network. No CORS is involved.
- React Router deep links (e.g. `/files/<id>`) work after refresh thanks to nginx's SPA fallback.

Stop with `docker compose down`.

## Run locally without Docker

**Backend** (Python 3.11):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows; use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend** (in a second terminal):

```bash
cd frontend
npm ci
npm run dev                     # http://localhost:5173
```

In this mode the browser calls `VITE_API_URL` (e.g. `http://localhost:8000`) directly, so `ALLOWED_ORIGINS` must include `http://localhost:5173`.

## Tests

```bash
cd backend && python -m pytest -v
```

```bash
cd frontend && npm test             # Vitest: API client, status rules, routing guard, fallbacks
cd frontend && npm run typecheck
cd frontend && npm run build
```

## API reference

All `/api/*` routes need `Authorization: Bearer <Supabase access token>`. Errors always look like `{"error_code": "...", "message": "..."}`.

| Method & path | Body | Returns |
|---|---|---|
| `GET /health` | – | `{"status": "ok"}` (public) |
| `GET /api/summary` | – | `total_files, total_versions, last_check_at, open_alerts, status` |
| `GET /api/files` | – | `{files: [{id, name, is_demo, created_at, latest_version}]}` |
| `POST /api/files` | multipart field `file` (≤ 10 MB) | new version (`version_no`, `sha256`, `signature`, …). Same name → next version. |
| `GET /api/files/{id}/versions` | – | versions, newest first |
| `GET /api/versions/{id}/download` | – | file bytes; `409 INTEGRITY_COMPROMISED` if the hash no longer matches |
| `POST /api/files/{id}/restore` | `{}` or `{"version_id": "..."}` | new version copied from the chosen / newest `ok` version |
| `POST /api/verify` | – | counts (`ok/modified/missing/tampered`), `mass_change_alert_created`, per-version results |
| `GET /api/alerts` | – | `{alerts: [...]}` |
| `POST /api/alerts/{id}/ack` | – | the acknowledged alert |
| `POST /api/demo/seed` | – | creates 5 demo files (2 clean versions each) |
| `POST /api/demo/attack` | `{"type": "corrupt"|"delete"|"encrypt"|"tamper_record", "file_id": "..."}` | what was done; refuses non-demo files with `403 DEMO_RESTRICTION` |

## Demo: the four attack scenarios

All attacks act **only on demo files** (`is_demo = true`, owned by you). The UI only lists server-marked demo files, and the backend refuses anything else.

**Setup:** log in → **Files** → **Create demo files**. Each sample gets two clean versions; attacks hit the newest one, so the older one remains a valid restore source.

| Scenario | Steps | Expected result |
|---|---|---|
| **A. Corruption** | Choose a demo file → *Simulate corrupt* → confirm | The check runs automatically: version shows **Modified**, a *Modified object* alert appears, dashboard vault turns **red** |
| **B. Deletion** | *Simulate delete* | **Missing**, *Missing object* alert |
| **C. Ransomware encryption** | *Simulate encrypt* | Object overwritten with random bytes → **Modified** |
| **D. Record tampering** | *Simulate tamper record* | The stored SHA-256 in the DB row is changed → signature fails → **Record tampered** |

**Then:** open the file (link in the demo panel or from **Activity**) → **Restore last clean version** → confirm. A new version is created from the newest clean one. Go to **Dashboard** → **Check integrity**: the current version is intact. Mark the alerts as seen on **Activity**.

> The damaged version stays in history and keeps failing checks — that's intentional (history is never rewritten), so the vault shows **amber (warning)** rather than green while damaged history exists. See below.
>
> Demo files seeded before this version of the app have a single version and can't be restored after an attack. Delete those rows in Supabase (or seed with a different account) to get the two-version samples.

**Mass change:** attack three different demo files with *corrupt* or *encrypt*, then run a check — a critical *Mass change* alert is raised.

## How status is decided

Per version (backend, in this order): signature invalid → `record_tampered`; object not in storage → `missing`; SHA-256 differs → `modified`; else `ok`.

Vault status on the dashboard (frontend, `src/lib/status.ts`):

| Vault | Rule |
|---|---|
| **Compromised** (red) | The **current** version of at least one file is modified, missing or tampered |
| **Warning** (amber) | All current versions are intact, but `/api/summary` still reports a problem — older versions are damaged or alerts are unacknowledged |
| **Healthy** (green) | Nothing outstanding |
| **Checking** (cyan) | While `POST /api/verify` runs and the data refreshes |

A `200 OK` from the check is never treated as "healthy" by itself — the vault is derived from the refreshed file statuses and summary.

## Troubleshooting

| Problem | Fix |
|---|---|
| Every API call returns `401 INVALID_TOKEN` | Check `SUPABASE_URL` points at the same project the frontend logs into. For ES256 projects the backend must reach `…/auth/v1/.well-known/jwks.json`. For HS256 projects check `SUPABASE_JWT_SECRET`. |
| Browser shows a CORS error (local dev) | Add the page's origin (e.g. `http://localhost:5173`) to `ALLOWED_ORIGINS` and restart the backend. Docker (port 3000) is same-origin and needs nothing. |
| "Supabase is not configured" on the auth page | Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; for Docker, rebuild the `web` image. |
| Sign-up says "check your inbox" | Email confirmation is on in Supabase. Confirm, then log in. |
| "Waking up the vault server…" banner | The backend is cold-starting (Render's free tier sleeps after ~15 min). Requests retry for about a minute; press *Stop waiting* to cancel. |
| Restore says `NO_SAFE_VERSION` | No version is marked `ok`. Upload a fresh copy or run a check first. |
| Every version shows `record_tampered` | `SIGNING_SECRET` changed since those versions were created. |
| Docker `web` build fails on `VITE_SUPABASE_URL` | Those two values must be present in `.env` for the build. |

### Cold starts

The loading intro (first visit to `/` per browser session) calls `GET /health` and keeps animating until it answers. After 8 s it shows *Waking up the vault*; after 75 s it offers *Retry* or *Continue anyway* — it never blocks the app. Inside the app, read-only requests retry with backoff for up to ~45 s with a visible banner and a *Stop waiting* button. Uploads, checks, restores and attacks are **never** retried automatically.

## Security notes and limitations

- Only public values (`VITE_*`) are compiled into the frontend. The service-role key, JWT secret and signing secret stay on the server. `.env` is excluded from Git and from both Docker build contexts.
- Integrity is detected, not prevented: anyone holding the service-role key can still alter Storage and the database; Cairn detects it afterwards because they cannot forge signatures without `SIGNING_SECRET`.
- Signatures are HMAC (symmetric). The server that verifies can also sign; there is no third-party verifiability.
- `download` and `restore` check the SHA-256 against the database row; `verify` additionally checks the row's signature. Run a check before restoring if you suspect record tampering.
- Damaged versions are never deleted, so after an attack the vault stays in **warning** until those versions are removed manually.
- Uploads are read into memory on the server (10 MB cap).
- The demo seeds include mock "sensitive" names and fake data only.
