# WowCar AI — Car Listing from Photo

Upload a car photo and get an AI-generated listing with make, model, year, specs, estimated price, and per-field confidence indicators.

## Repository layout

| Path | Role |
|------|------|
| [`frontend/`](frontend/) | React (Vite) SPA — UI, image upload, listing card |
| [`backend/`](backend/) | FastAPI service — Gemini proxy, retries, fallbacks |
| `.env` (repo root) | Shared secrets — read by Vite (`envDir`) and Python (`load_dotenv`) |

Static images for the UI live under **`frontend/public/assets/images/`** (served at `/assets/images/...`).

## Prerequisites

- **Node.js** 18+
- **Python** 3.10+
- A free **Gemini API key** from [AI Studio](https://aistudio.google.com/app/apikey)

## Setup

```bash
# 1. Frontend dependencies (from repo root)
npm run install:frontend
# or: cd frontend && npm install

# 2. Python virtual environment and backend dependencies
python -m venv .venv
.venv\Scripts\pip.exe install -r backend\requirements.txt
# source .venv/bin/activate && pip install -r backend/requirements.txt   # macOS / Linux

# 3. Environment — create .env at the repository root (same level as frontend/ and backend/)
copy .env.example .env
# cp .env.example .env   # macOS / Linux
```

Open `.env` at the **repo root** and set:

```
VITE_GEMINI_API_KEY=your_key_here
```

(The backend also reads `GEMINI_API_KEY` from the same file; see `.env.example`.)

## Running

You need **two terminals** — API and UI.

**Option A — from repository root (recommended)**

```bash
# Terminal 1 — API (port 8000)
npm run api
# Windows venv: npm run api:win

# Terminal 2 — Vite (port 5173)
npm run dev
```

**Option B — frontend only**

```bash
cd frontend
npm run dev
```

Run the API from root as in Terminal 1 above (`npm run api` or `python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000`).

Open [http://localhost:5173](http://localhost:5173)

> Vite proxies `/api/*` to the Python server, so the API key stays on the backend.

## Deploying (e.g. Render)

**Backend (Web Service)** — this repo’s API is **Python / FastAPI**, not Node.

| Field | Value |
|--------|--------|
| **Language** | **Python 3** (not Node) |
| **Root Directory** | `backend` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn main:app --host 0.0.0.0 --port $PORT` |

In the Render dashboard, set **Environment** variables: `GEMINI_API_KEY` (your key), and `ALLOW_ORIGINS` with your **frontend** URL(s), comma-separated (e.g. `https://your-site.netlify.app`).

**Frontend** — host `frontend` as a static site (Netlify, Cloudflare Pages, Render Static Site, etc.). Build: `npm run build` from `frontend/`, output `frontend/dist`. Set **`VITE_API_BASE_URL`** to your **backend** URL (no trailing slash), e.g. `https://your-api.onrender.com`, then rebuild.

**Frontend on Vercel:** [vercel.com](https://vercel.com) → New Project → import this GitHub repo → set **Root Directory** to `frontend` → Framework **Vite** (auto). The frontend build defaults to the Render API URL in code; you can override with **`VITE_API_BASE_URL`**. CORS on the API allows **`*.vercel.app`**. For a **custom domain** on Vercel, add it to Render’s **`ALLOW_ORIGINS`**. Push to `main` redeploys Vercel automatically; redeploy Render after backend changes.

## AI Flow

1. User uploads a car image (JPG, PNG, or WebP).
2. The React frontend sends the base64 image to `POST /api/analyze`.
3. The FastAPI backend forwards the image to **Google Gemini 2.5 Flash** with a structured prompt.
4. Gemini returns JSON with identified fields (make, model, year or year range, trim, body style, color, estimated price) plus a per-field confidence level (`confirmed` / `estimated` / `unknown`).
5. The backend retries on 503/429 errors and automatically falls back to `gemini-2.5-flash-lite`.
6. The frontend renders a marketplace-style listing card with confidence badges on every field.

## Error Handling

| Scenario                           | What the user sees                                        |
| ---------------------------------- | --------------------------------------------------------- |
| Blurry / dark photo                | "Image Too Unclear" with a tip                            |
| Half-visible / heavily cropped car | "Car Not Fully in Frame" (`partial_car`)                  |
| Multiple cars in frame             | "Multiple Cars Detected"                                  |
| Not a car at all                   | "Not a Car Image"                                         |
| No reliable identification         | "No Reliable Match Found"                                 |
| API key missing                    | "API Key Not Set"                                         |
| Gemini overloaded (503)            | Retries + fallback model, then "Service Temporarily Busy" |
| Rate limited (429)                 | "Too Many Requests"                                       |
| Malformed AI response              | "Analysis Failed"                                         |

## Limitations

- **No external pricing/specs database.** Price and specs come entirely from Gemini; they are estimates, not verified market data.
- **Single-image analysis only.** The app processes one photo per request; multi-angle uploads are not supported.
- **Free-tier rate limits.** Gemini free keys have low QPM; heavy use may trigger 429 errors.
- **AI accuracy varies.** Rare, modified, or partially visible cars may produce low-confidence or incorrect results.
- **No authentication.** The API is open on localhost; do not expose it to the public internet without adding auth.

## Project structure

```
├── backend/
│   ├── __init__.py
│   ├── main.py              # FastAPI app (Gemini proxy + retry logic)
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js       # Vite + /api proxy; envDir → repo root
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── public/
│   │   ├── vite.svg
│   │   └── assets/images/   # Static images (URLs: /assets/images/...)
│   └── src/
│       ├── components/      # App, CarListing, ImageUpload, etc.
│       ├── services/
│       │   └── geminiService.js
│       ├── main.jsx
│       └── index.css
├── package.json             # Root scripts: dev, build, api
├── .env.example
└── README.md
```
