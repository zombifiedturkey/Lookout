# Lookout

A polished camera web UI that uses [Frigate](https://frigate.video) as its backend.
Lookout logs in to Frigate server-side, so camera and Frigate credentials never reach the browser or a TV app.

**Status:** milestones M3/M4 (events, clips, live video) written, awaiting real-hardware test.

## Run locally (Windows PowerShell)

```powershell
npm install
Copy-Item .env.example .env   # then edit .env: set FRIGATE_PASSWORD
# PowerShell does not read .env by itself; set the variables for this session:
$env:FRIGATE_URL = "https://10.0.0.138:8971"
$env:FRIGATE_USER = "camui"
$env:FRIGATE_PASSWORD = Read-Host "Frigate password"
npm run dev
```

Then open <http://localhost:8080/health>. Expected: `"ok": true` and the four camera names.

## Run the UI in development

Two windows. Window 1 runs the backend (see above, `npm run dev` in the repo root). Window 2:

```powershell
cd web
npm install
npm run dev
```

Open <http://localhost:5173>. The UI forwards `/api` to the backend on port 8080.

## API

| Route | Returns |
|---|---|
| `GET /health` | Frigate login check, version and camera names (no token needed) |
| `GET /api/cameras` | `{ cameras: [{ name, label }] }` in Frigate's order |
| `GET /api/cameras/:name/snapshot.jpg?h=480` | Latest still image (height 120-1080), cached for 1 second |
| `GET /api/events?limit=60&camera=` | Recent detection events |
| `GET /api/events/:id/thumbnail.jpg`, `snapshot.jpg`, `clip.mp4` | Event media (clip supports Range/seeking) |
| `WS /api/cameras/:name/live` | Live video (fragmented MP4 over WebSocket, tunnelled to Frigate) |

If `LOOKOUT_TOKEN` is set, `/api/*` needs `Authorization: Bearer <token>` or `?token=<token>`.

## Settings (environment variables)

| Variable | Purpose |
|---|---|
| `FRIGATE_URL` | Frigate's authenticated address, e.g. `https://10.0.0.138:8971` |
| `FRIGATE_USER` / `FRIGATE_PASSWORD` | A read-only (viewer) Frigate account |
| `FRIGATE_INSECURE_TLS` | `true` to accept Frigate's self-signed certificate (default) |
| `LOOKOUT_TOKEN` | Optional. If set, `/api/*` routes require this token |
| `PORT` | Default `8080` |

LAN only. Do not port-forward.
