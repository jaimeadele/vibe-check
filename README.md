# Vibe Check

A real-time, multi-tenant DJ set song identification platform. Each Operator (DJ collective, promoter, venue) has their own public URL slug, event list, and rooms. Attendees at a live event can identify the song currently playing, rate tracks, and submit song requests — all updating live on every connected device. Operators can manage their events and rooms from a privileged dashboard.

---

## What it does

- 🎵 **Song identification** — a user holds up their phone, records a short audio clip, and the app identifies the song via ACRCloud audio fingerprinting
- 🎧 **Live setlist** — identified songs appear on every connected device in real time via WebSockets
- ⭐ **Ratings & requests** — attendees can rate songs and request tracks; requests are sorted by votes
- 🔒 **Role-based access** — Google OAuth login; Operators and assigned DJs can add/remove songs; master Admins manage operator accounts
- 🔁 **Duplicate detection** — if the same song is identified twice in a row, it is skipped and the user sees an "Already playing" message instead of a duplicate entry
- 📍 **Venues & geofencing** — events can be linked to a venue; regular users must be within the venue's geofence radius to identify songs (checked on every tap, not just room entry)
- 🏟️ **Venue management** — admins can edit any venue's name, address, coordinates, and geofence radius; deleting a venue soft-deletes it (the row stays in the database so linked events are unaffected) and removes it from the event-creation dropdown; deleted venues can be restored
- 🔥 **Song reactions** — attendees react to each song with 🔥 ❤️ 🥱 🤮 (no login required); reactions are tied to a server-issued anonymous voter cookie; one reaction per song per browser; reactions are only open for 15 minutes after a song is identified; vibe scores update live on all connected devices via Socket.io
- 🏢 **Multi-tenant operator platform** — each Operator (DJ collective, promoter, venue brand) gets a unique slug and public URL; their events and rooms are scoped to them
- 🚪 **Single and multi-room events** — operators choose at creation time: single-room events drop attendees directly into the room; multi-room events show inline room buttons so attendees pick their room without a separate page
- ✏️ **Room management** — operators can rename rooms and add new rooms to an existing event from the operator dashboard

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript, Vite, Tailwind CSS v4, React Router v7 |
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
vibe-check/
├── frontend/               # React + Vite app
│   └── src/
│       ├── components/     # Shared UI components (Layout, modals, etc.)
│       ├── contexts/       # React context providers (AuthContext)
│       ├── hooks/          # Custom React hooks (audio capture, socket, etc.)
│       └── pages/          # Route-level page components
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
- **Google Maps API key** — [Google Cloud Console](https://console.cloud.google.com) — enable the **Places API (New)**; used for venue address autocomplete in the admin form

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

The frontend also needs its own env file:

```bash
cp frontend/.env.example frontend/.env
```

```env
VITE_GOOGLE_MAPS_API_KEY=   # from Google Cloud Console (Places API New enabled)
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

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | Server health check |
| `POST` | `/auth/register` | — | Bootstrap the first Admin account |
| `POST` | `/auth/login` | — | Email/password login — returns a JWT cookie |
| `GET` | `/auth/me` | cookie | Get current user |
| `POST` | `/auth/logout` | — | Clear session cookie |
| `GET` | `/auth/google` | — | Initiate Google OAuth |
| `POST` | `/auth/register-operator` | Admin | Create an Operator account with slug |
| `GET` | `/operators` | — | List all operators with active event counts |
| `GET` | `/operators/:slug` | — | Operator profile + events + rooms |
| `PATCH` | `/operators/:id` | Admin | Edit operator name or slug |
| `POST` | `/events` | Operator | Create an event |
| `PATCH` | `/events/:id/startTime` | Operator/Admin | Update event start time |
| `PATCH` | `/events/:id/venue` | Operator/Admin | Assign or clear the event venue |
| `DELETE` | `/events/:id` | Operator/Admin | Delete event (ownership check) |
| `POST` | `/events/:id/rooms` | Operator/Admin | Create a room within the event |
| `PATCH` | `/events/:id/rooms/:roomId` | Operator/Admin | Rename a room |
| `PATCH` | `/events/:id/rooms/:roomId/status` | Operator/Admin | Update room status (broadcasts via socket) |
| `DELETE` | `/events/:id/rooms/:roomId` | Operator/Admin | Delete a room |
| `GET` | `/rooms/:roomCode/setlist` | — | Room setlist + event info + `isPrivileged` flag |
| `POST` | `/events/:id/rooms/:roomId/songs` | Operator/DJ | Add a song |
| `DELETE` | `/events/:id/rooms/:roomId/songs/:songId` | Operator/DJ | Remove a song |
| `POST` | `/rooms/:roomCode/identify/lock` | — | Acquire identification lock |
| `DELETE` | `/rooms/:roomCode/identify/lock` | — | Release identification lock |
| `POST` | `/rooms/:roomCode/identify` | — | Submit audio for song identification |
| `GET` | `/venues` | — | List active venues |
| `GET` | `/venues/all` | Operator/Admin | All venues including inactive |
| `POST` | `/venues` | Operator/Admin | Create a venue (stores createdById) |
| `POST` | `/venues/validate-location/:roomCode` | — | Check coordinates against room's venue geofence |
| `PATCH` | `/venues/:id` | Creator/Admin | Edit venue fields |
| `DELETE` | `/venues/:id` | Creator/Admin | Soft-delete a venue |
| `PATCH` | `/venues/:id/restore` | Creator/Admin | Restore a soft-deleted venue |
| `GET` | `/spotify/search?q=...` | Operator/DJ | Search Spotify for tracks |
| `POST` | `/songs/:id/react` | — | Submit or change an emoji reaction (15-min window, rate-limited) |

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

> 🚧 In progress — being deployed to Railway.

Approach:
- Frontend: Vite static build served by Express from the same Railway service
- Backend: Node/Express server on Railway
- Database: Railway-managed Postgres
- Redis: Railway-managed Redis

To build for production locally:

```bash
# Frontend
npm run build --prefix frontend

# Backend
npm run build --prefix backend
npm run start --prefix backend
```

---

## Notes

