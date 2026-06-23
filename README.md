# AutoVision AI — Car Listing from Photo

Upload car photo(s) and get an AI-generated listing with make, model, year, specs, estimated price (THB), and per-field confidence indicators.

## Repository layout

| Path | Role |
|------|------|
| [`frontend/`](frontend/) | React (Vite) SPA — UI, image upload, listing card |
| [`backend/`](backend/) | FastAPI service — Vertex AI Gemini, retries, fallbacks |
| `.env` (repo root) | Local config — read by Vite (`envDir`) and Python (`load_dotenv`) |
| `Dockerfile` | Cloud Run container image |

Static images for the UI live under **`frontend/public/assets/images/`** (served at `/assets/images/...`).

## Prerequisites

- **Node.js** 18+ (frontend)
- **Python** 3.10+ (backend)
- **GCP project** with Vertex AI API enabled
- **Local dev:** [gcloud CLI](https://cloud.google.com/sdk/docs/install) with `gcloud auth application-default login`

No Gemini API key is required — the backend uses **Vertex AI** with Application Default Credentials (ADC).

## Setup (local)

```bash
# 1. Frontend dependencies (from repo root)
npm run install:frontend

# 2. Python virtual environment and backend dependencies
python -m venv .venv
.venv\Scripts\pip.exe install -r backend\requirements.txt
# source .venv/bin/activate && pip install -r backend/requirements.txt   # macOS / Linux

# 3. Environment — create .env at the repository root
copy .env.example .env
# cp .env.example .env   # macOS / Linux
```

Open `.env` at the **repo root** and set:

```
VERTEX_AI_PROJECT_ID=your-gcp-project-id
VERTEX_AI_LOCATION=us-central1
```

Then authenticate locally:

```bash
gcloud auth application-default login
```

See `.env.example` for optional model overrides (`GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS`).

## Running (local)

You need **two terminals** — API and UI.

```bash
# Terminal 1 — API (port 8000)
npm run api
# Windows venv: npm run api:win

# Terminal 2 — Vite (port 5173)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

> Vite proxies `/api/*` to the Python server.

**Health check:** `GET http://127.0.0.1:8000/api/health`

## Deploy backend to GCP Cloud Run

Build and deploy from the **repository root** (where `Dockerfile` lives):

```bash
gcloud config set project YOUR_PROJECT_ID

# Enable APIs (once per project)
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com aiplatform.googleapis.com

# Build and deploy
gcloud run deploy car-vision-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars VERTEX_AI_LOCATION=us-central1,VERTEX_AI_PROJECT_ID=YOUR_PROJECT_ID
```

Set `VERTEX_AI_PROJECT_ID` to your GCP project id (e.g. `wow-car-496713`). The backend also reads `GOOGLE_CLOUD_PROJECT` and GCP metadata when that env var is present.

**Service account IAM:** attach a service account with **Vertex AI User** (`roles/aiplatform.user`) to the Cloud Run service. Without this, `/api/analyze` returns `GEMINI_ACCESS_DENIED`.

**Region:** deploy Cloud Run in a region where Gemini is available on Vertex (e.g. `us-central1`). Set `VERTEX_AI_LOCATION` to match or to a supported Gemini region.

**Verify after deploy:**

```bash
curl https://YOUR-SERVICE-xxxx.a.run.app/api/health
```

Expected: `"vertex_initialized": true`, `"has_project": true`.

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Config and Vertex init status |
| POST | `/api/analyze` | Vehicle identification from image(s) |
| POST | `/predict-features` | Safety/comfort feature detection |

## Deploy frontend

Host `frontend` as a static site (Vercel, Netlify, etc.). Build from `frontend/`, output `frontend/dist`. Set **`VITE_API_BASE_URL`** to your Cloud Run URL (no trailing slash), then rebuild.

## AI Flow

1. User uploads one or more car images (JPG, PNG, or WebP).
2. The frontend sends base64 image(s) to `POST /api/analyze`.
3. The FastAPI backend calls **Vertex AI Gemini 2.5 Flash** with a structured prompt.
4. Gemini returns JSON with identified fields plus per-field confidence (`confirmed` / `estimated` / `unknown`).
5. The backend retries on 503/429 errors and falls back to `gemini-2.5-flash-lite`.
6. Optional: `include_features: true` runs safety/comfort feature detection in the same request.

## Error Handling

| Scenario | API error code |
| -------- | -------------- |
| Blurry / dark photo | `unclear_image` |
| Heavily cropped car | `partial_car` |
| Multiple cars in one image | `multiple_cars` |
| Not a car | `not_a_car` |
| No reliable match | `no_match` |
| Vertex project not configured | `VERTEX_CONFIG_MISSING` |
| Missing IAM / API access | `GEMINI_ACCESS_DENIED` |
| Gemini overloaded (503) | Retries + fallback, then `SERVICE_UNAVAILABLE` |
| Rate limited (429) | `RATE_LIMIT` |
| Malformed AI response | `PARSE_ERROR` |

## Limitations

- **No external pricing/specs database.** Price and specs come from Gemini; they are estimates for the Thailand used-car market (THB), not verified market data.
- **Multi-image:** several photos in one request are merged into one listing for a single vehicle.
- **Vertex quotas apply.** Heavy use may hit rate limits; the backend retries and falls back to a lighter model.
- **AI accuracy varies.** Rare, modified, or partially visible cars may produce low-confidence or incorrect results.

## Project structure

```
├── backend/
│   ├── main.py                  # FastAPI app
│   ├── gemini_client.py         # Vertex AI client, retries, image handling
│   ├── feature_detection/       # Safety & comfort feature detectors
│   └── requirements.txt
├── frontend/
│   └── ...
├── Dockerfile                   # Cloud Run image
├── .env.example
└── README.md
```
