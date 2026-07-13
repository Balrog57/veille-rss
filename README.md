# Veille RSS — IA News Monitor

Multi-source RSS news monitoring with automatic French summarization via an Ollama model. Designed for lightweight deployment on a ZimaOS mini PC or any Docker host.

Ollama runs as a **separate, shared service** (not bundled with this stack) on the `ai_net` Docker network — see [Prerequisites](#prerequisites).

## Architecture

```
┌──────────────────┐     ┌──────────────┐     ┌───────────┐
│ Ollama (external)│ ◄── │ Backend      │ ◄── │ Frontend  │
│ ai-stack-ollama  │     │ Express +    │     │ Next.js   │
│ (qwen2.5:1.5b)   │     │ SQLite +     │     │ Tailwind  │
│      ai_net      │     │ node-cron    │     │ @dnd-kit  │
└──────────────────┘     └──────┬───────┘     └───────────┘
                               │ (veille_default)
                          ┌────▼────┐
                          │ SQLite  │
                          │ ./data/ │
                          └─────────┘
```

- **Ollama** — external LLM server (qwen2.5:1.5b, ~1 GB RAM), shared via the `ai_net` network. Not started by this stack.
- **Backend** — Express API with SQLite, RSS ingestion, dedup pipeline, and cron. Attached to both `veille_default` and `ai_net`.
- **Frontend** — Next.js standalone build, browser-direct API calls, dark theme.

## Prerequisites

- Docker and Docker Compose (v2+)
- **An Ollama instance reachable on the `ai_net` Docker network.** This stack does not bundle Ollama — it connects to the shared `ai-stack-ollama` container (or any Ollama service you publish on `ai_net`). The model `qwen2.5:1.5b` (~1 GB) must be pulled on that instance.
- ~512 MB free RAM for the veille stack itself (Ollama RAM is accounted for by its own deployment)
- ~200 MB free disk for SQLite + dependencies (the Ollama model lives on its own deployment)

## Quick Start

### 1. Clone and configure

```bash
git clone <repo-url> veille-rss
cd veille-rss
cp .env.example .env
```

### 2. Set environment variables

Edit `.env` and set at minimum:

| Variable | Description | Required |
|---|---|---|---|
| `APP_PASSWORD` | Single shared password for all users | **Yes** |
| `SESSION_SECRET` | Random hex string to sign cookies (generate: `openssl rand -hex 32`) | **Yes** |
| `OLLAMA_MODEL` | Ollama model name (default: `qwen2.5:1.5b`) | No |
| `TZ` | Timezone (default: `Europe/Paris`) | No |
| `FRONTEND_ORIGIN` | Allowed CORS origin(s). Comma-separated for multi-device access (e.g., `http://192.168.1.98:3000,http://localhost:3000`). Default: `http://localhost:3000` | No |
| `SECURE_COOKIE` | Set to `true` when behind HTTPS (sets `secure` flag on the session cookie). Default: `false` | No |

### 3. Start the stack

```bash
docker compose up -d --build
```

This will start:
1. The backend (Express on port 4000) — connected to both `veille_default` and `ai_net`
2. The frontend (Next.js on port 3000)

Ollama is **not** started by this stack. It must already be running on the `ai_net` network (see [Prerequisites](#prerequisites)). The backend waits up to 5 minutes for the model to appear in Ollama's `/api/tags`.

### 4. Access the UI

Open http://localhost:3000 (or your Docker host IP).

Log in with the password you set in `APP_PASSWORD`.

### Accessing from another device

If you run the stack on a headless server (e.g., ZimaOS) and access the UI from your laptop, set `FRONTEND_ORIGIN` in `.env` to include both the server's IP and localhost:

```bash
# .env
FRONTEND_ORIGIN=http://192.168.1.98:3000,http://localhost:3000
```

Then rebuild:
```bash
docker compose up -d --build
```

The login endpoint is rate-limited (5 attempts per 15 minutes per IP) to prevent brute-force attacks.

### 5. First edition

The pipeline runs automatically at 00:00, 06:00, 12:00, 18:00 (Paris time).

To trigger an immediate collection:
- Click the **"Collecter"** button in the dashboard header, or
- Send a POST request:
  ```bash
  # First get a session cookie by logging in via the browser, then:
  curl -X POST http://localhost:4000/api/admin/run-tick \
    -b "veille_sess=<your-session-cookie>"
  ```

## Edits and Maintenance

### Change the Ollama model

1. Update `OLLAMA_MODEL` in `.env` (e.g., `qwen2.5:3b`)
2. Pull the model on the **Ollama instance** (not in this stack):
   ```bash
   docker exec ai-stack-ollama ollama pull qwen2.5:3b
   ```
3. Rebuild and restart the backend:
   ```bash
   docker compose up -d --build backend
   ```

### View logs

```bash
docker compose logs -f backend   # Backend + pipeline logs
docker compose logs -f frontend  # Frontend logs
# Ollama logs are on its own deployment, e.g.:
# docker logs -f ai-stack-ollama
```

### Reset the database

```bash
docker compose down
rm -rf data/
docker compose up -d
```

## API Endpoints

All endpoints require authentication via the `veille_sess` cookie (except `/api/auth/login`).

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Log in with `APP_PASSWORD` |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/auth/me` | Check if authenticated |
| GET | `/api/feeds` | List all RSS feeds |
| POST | `/api/feeds` | Add a feed (validates URL) |
| DELETE | `/api/feeds/:id` | Remove a feed |
| GET | `/api/editions` | List all editions |
| GET | `/api/editions/:id` | Get edition with articles |
| PATCH | `/api/articles/:id` | Update article position |
| POST | `/api/admin/run-tick` | Trigger manual pipeline run |

## Pipeline Details

### Ingestion
- Reads all active RSS feeds (default seed: `https://rss.app/feeds/_u8zC1uDC9Whqhhut.xml`)
- Extracts: title, description, link, image, pubDate, source
- Caps at 200 articles per feed per tick

### Deduplication
1. **Seen filter** — excludes articles already present in any past edition
2. **TF-IDF char 3-5-gram** vector similarity on title + first 200 chars of description
3. **Cosine ≥ 0.55** = duplicate cluster
4. **Ollama tie-breaker** — only for clusters of 4+ articles where all are within 0.1 cosine of each other
5. **Default** — keeps the most recent article from each cluster

### Summarization
- Uses the configured Ollama model (default: `qwen2.5:1.5b`)
- Prompts: "Résume cet article en français en 2-3 phrases, ton neutre, factuel"
- Concurrency: 3 simultaneous calls
- Fallback: if Ollama is unavailable, stores the original description with a `summary_fallback` flag

### Cron schedule
- Four times daily: 00:00, 06:00, 12:00, 18:00 (Europe/Paris, DST-aware)
- Each tick is idempotent — creates at most one edition per 6h bucket
- Manual tick via `POST /api/admin/run-tick`

## Troubleshooting

### "APP_PASSWORD is required"
Ensure `.env` exists (not just `.env.example`) and contains the required variables.

### "Cannot connect to Ollama"
Ollama runs as a separate service on the `ai_net` network. Check that it is up and that the model is pulled:
```bash
docker ps --filter name=ai-stack-ollama                 # is Ollama running?
docker exec ai-stack-ollama ollama list                 # is the model present?
docker logs ai-stack-ollama                             # Ollama logs
```
Also verify the `ai_net` network exists and that the veille backend is attached to it:
```bash
docker network inspect ai_net --format '{{range .Containers}}{{.Name}} {{end}}'
```
The backend waits up to 5 minutes for the model to appear in `/api/tags`. If Ollama was started after the backend, restart it: `docker restart veille-backend`.

### CORS / frontend shows blank page / API errors
The frontend calls the backend at `http://<hostname>:4000`. Make sure port 4000 is accessible. CORS is configured to allow the frontend origin (`http://localhost:3000` on desktop).

If you access the frontend from a different device (e.g., a ZimaOS mini PC), set `FRONTEND_ORIGIN` in `.env` to include the device's IP:

```bash
# .env — allow access from both localhost and 192.168.1.98
FRONTEND_ORIGIN=http://192.168.1.98:3000,http://localhost:3000
```

Then rebuild and restart:
```bash
docker compose up -d --build
```

### Pipeline runs but no articles appear
- Check feed URLs in the admin page
- Check backend logs for feed fetch errors
- Some feeds may return empty results; try adding a different feed
- The seed feed is inserted only on first boot

### Model too slow / out of memory
- Switch to `qwen2.5:1.5b` (default, ~1 GB) — the lightest option
- The upgrade path to `qwen2.5:3b` (~2 GB) is documented
- Summarization runs at 3 concurrent calls to avoid overwhelming Ollama

## What's NOT included in v1

The following features are **explicitly excluded** from this v1 release:

- ❌ **Checkboxes / selection UI** (article selection for batch actions)
- ❌ **"Actu du jour"** (daily news highlight / editorial pick)
- ❌ **Podcast script generation** (TTS / audio summary pipeline)
- ❌ **Audio / video generation** (no media synthesis)
- ❌ **Multi-user roles** (single shared password only)
- ❌ **User preferences / personalization** (per-user feed subscriptions)
- ❌ **Article archiving / pinning** (articles are tied to editions)

These may be considered for v2.

## License

MIT
