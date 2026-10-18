# Home Valuation

A tool for real estate agents to get an AI-assisted property valuation. It pulls comparable sales from the RentCast AVM API, then sends the top comps plus the agent's own notes on condition/upgrades to Claude, which returns a reasoned value range and a ranked breakdown of each comp's relevance.

## Stack

- **Frontend** (`src/`) — React + TypeScript + Vite, Tailwind CSS, Google Maps.
- **Backend** (`server/`) — Express + TypeScript, calls the RentCast API and the Anthropic API.

The two are independent services with their own `package.json` and dependencies — see `server/` for the API, everything else at the root is the frontend.

## Setup

Install dependencies for both:

```bash
npm install
cd server && npm install
```

Create `.env` in the project root:

```
VITE_GOOGLE_MAPS_KEY=your_google_maps_key
VITE_API_URL=http://localhost:3000
```

Create `server/.env`:

```
ANTHROPIC_API_KEY=your_anthropic_key
RENTCAST_KEY=your_rentcast_key
APP_ACCESS_KEY=choose_a_shared_secret
FRONTEND_URL=http://localhost:5173
PORT=3000
USE_MOCK=false
```

`APP_ACCESS_KEY` gates the API behind a simple shared secret — the frontend prompts for it and stores it in `sessionStorage`. Set `USE_MOCK=true` to serve from `server/mock/sample-comps.json` instead of calling RentCast (useful for development without burning API calls).

Neither `.env` file should ever be committed — both are already covered by `.gitignore`.

## Running locally

```bash
# terminal 1
cd server && npm run dev

# terminal 2
npm run dev
```

Frontend runs at `http://localhost:5173`, backend at `http://localhost:3000`.

## Running with Docker

```bash
docker compose up --build
```

This builds and starts both containers — frontend (served via nginx) on `http://localhost:5173`, backend on `http://localhost:3000`. The backend container reads its environment from `server/.env` via `env_file` in `docker-compose.yml`; the frontend's `VITE_API_URL` is baked in at build time via a build arg.

## Scripts

| Command | Where | Does |
|---|---|---|
| `npm run dev` | root | Start the Vite dev server |
| `npm run build` | root | Typecheck and build the frontend |
| `npm run lint` | root | Lint the frontend |
| `npm run dev` | `server/` | Start the API with `tsx watch` |
| `npm run build` | `server/` | Compile the API to `dist/` |
