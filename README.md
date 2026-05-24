# Vibe Check

A real-time DJ set song identification platform. Attendees at a live event can identify the song currently playing, rate tracks, and submit song requests — all updating live on every connected device. DJs and venue admins get a live view of the setlist and can manage events from a privileged dashboard.

---

## What it does

- 🎵 **Song identification** — a user holds up their phone, records a short audio clip, and the app identifies the song via ACRCloud audio fingerprinting
- 🎧 **Live setlist** — identified songs appear on every connected device in real time via WebSockets
- ⭐ **Ratings & requests** — attendees can rate songs and request tracks; requests are sorted by votes
- 🔒 **Role-based access** — Google OAuth login; DJs and admins can remove songs, delete events, and export Spotify playlists
- 🔁 **Duplicate detection** — if the same song is identified twice in a row, it is skipped and the user sees an "Already playing" message instead of a duplicate entry

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript, Vite, Tailwind CSS v4 |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL 16 (via Docker) |
| ORM | Prisma |
| Real-time | Socket.io |
| Cache / locks | Redis 7 (via Docker) |
| Auth | Google OAuth 2.0 via Passport.js, JWT session cookies |
| Song ID | ACRCloud audio fingerprinting |
| Music metadata | Spotify Web API |

---

## Project structure

```
setlist-live/
├── frontend/               # React + Vite app
│   └── src/
│       ├── components/     # UI components
│       ├── hooks/          # Custom React hooks (audio capture, socket, etc.)
│       └── pages/          # Page-level components
├── backend/                # Express API server
│   └── src/
│       ├── lib/            # Shared setup: Prisma client, Redis, Socket.io, Passport
│       ├── middleware/      # Auth guards
│       ├── routes/         # API route handlers
│       └── services/       # ACRCloud + Spotify integrations
├── docker-compose.yml      # Postgres + Redis containers
├── package.json            # Root monorepo scripts (runs both servers together)
└── README.md
```

---

## Prerequisites

Before running locally, you need:

- **Node.js** v20+ — [nodejs.org](https://nodejs.org)
- **Docker Desktop** — [docker.com](https://www.docker.com/products/docker-desktop/) (runs Postgres and Redis)
- **ACRCloud account** — [acrcloud.com](https://www.acrcloud.com) — free tier available; you need a project's Host, Access Key, and Access Secret
- **Google OAuth credentials** — [Google Cloud Console](https://console.cloud.google.com) — create an OAuth 2.0 Client ID with `http://localhost:3000/api/auth/google/callback` as an authorized redirect URI
- **Spotify app credentials** — [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) — free; used for album art and track metadata

---

## Local development setup

### 1. Install dependencies

From the project root:

```bash
npm install
npm install --prefix frontend
npm install --prefix backend
```

### 2. Set up environment variables

```bash
cp backend/.env.example backend/.env
```

Then open `backend/.env` and fill in your values:

```env
PORT=3000
DATABASE_URL=postgresql://postgres:password@localhost:5432/vibecheck
REDIS_URL=redis://localhost:6379

JWT_SECRET=          # any long random string
GOOGLE_CLIENT_ID=    # from Google Cloud Console
GOOGLE_CLIENT_SECRET=

ACRCLOUD_HOST=       # from your ACRCloud project
ACRCLOUD_ACCESS_KEY=
ACRCLOUD_ACCESS_SECRET=

SPOTIFY_CLIENT_ID=   # from Spotify Developer Dashboard
SPOTIFY_CLIENT_SECRET=
ENCRYPTION_KEY=      # any 32-character random string
```

### 3. Start Docker (Postgres + Redis)

```bash
docker compose up -d
```

Verify both containers are running:

```bash
docker compose ps
```

You should see `postgres` and `redis` with status `running`.

### 4. Run database migrations

```bash
cd backend
npx prisma migrate dev
```

This creates all the database tables. If prompted for a migration name, describe the change (e.g. `init`).

### 5. Start the dev server

From the project root:

```bash
npm run dev
```

This starts both servers concurrently:

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3000 |

---

## API overview

All routes are prefixed with `/api`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Server health check |
| `GET` | `/auth/google` | Initiate Google OAuth login |
| `GET` | `/auth/google/callback` | OAuth callback |
| `GET` | `/auth/me` | Get current user |
| `POST` | `/auth/logout` | Log out |
| `GET` | `/events` | List events |
| `POST` | `/events` | Create an event |
| `GET` | `/events/:id` | Get event + setlist |
| `PATCH` | `/events/:id` | Update event status |
| `DELETE` | `/events/:id` | Delete event (admin) |
| `DELETE` | `/events/:id/songs/:songId` | Remove a song (DJ/admin) |
| `POST` | `/events/:id/identify/reserve` | Acquire identification lock |
| `POST` | `/events/:id/identify` | Submit audio for identification |
| `GET` | `/spotify/search?q=...` | Search Spotify for tracks (DJ/admin only) |

---

## Stopping the dev environment

Stop the Node servers: `Ctrl+C` in the terminal running `npm run dev`

Stop Docker containers:
```bash
docker compose down
```

Your database data is preserved in a Docker volume and will be available next time you run `docker compose up -d`.

---

## Production deployment

> 🚧 Production deployment is not yet configured. This section will be updated when the app is ready to deploy.

Planned approach:
- Frontend: static build deployed to a CDN (e.g. Vercel, Netlify)
- Backend: containerized Node server (e.g. Railway, Render, or Fly.io)
- Database: managed Postgres (e.g. Supabase, Railway)
- Redis: managed Redis (e.g. Upstash)

To build for production:

```bash
# Frontend
npm run build --prefix frontend

# Backend
npm run build --prefix backend
npm run start --prefix backend
```

---

## Notes

