# Valorant Tournament System

## Development (one command, auto-restart)
- Install PM2 (once):
```
npm i -g pm2
```
- Start all services with watch (backend, web, bot):
```
pm2 start ecosystem.config.cjs
pm2 save
```
- On changes: backend and bot auto-restart; web hot-reloads via Vite.
- After reboot, restore processes:
```
pm2 resurrect
```

URLs:
- Backend API/UI: http://localhost:4000 (Challonge proxy endpoints)
- Web (Vite dev): http://localhost:5173

Common PM2 commands:
- Status: `pm2 ls`
- Logs: `pm2 logs` (or `pm2 logs backend-dev` / `web-dev` / `valorant-bot`)
- Restart all: `pm2 restart all`
- Stop all: `pm2 stop all`

## Setup

1) Backend
- Create `backend/.env` with DB credentials, JWT, Challonge:
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=valorant_tournament
PORT=4000
ENABLE_AUTH=false
ADMIN_USER=staff
ADMIN_PASS=valorant_tournament_staff
JWT_SECRET=change_me
CHALLONGE_API_KEY=your_key
CHALLONGE_TOURNAMENT_ID=your_tournament_slug_or_id
```
- Install deps: `cd backend && npm install`
- Run dev server: `npm run dev`

2) Discord Bot
- Create `bot/.env`:
```
BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
GUILD_ID=your_guild_id
API_BASE_URL=http://localhost:4000
MATCH_ANNOUNCE_CHANNEL_ID=<channel_id>
TICKET_CATEGORY_ID=<category_id_for_new_tickets>
TICKET_ARCHIVE_CATEGORY_ID=<category_id_for_closed_tickets>
STAFF_ROLE_ID=<role_id>
TICKET_PANEL_CHANNEL_ID=<channel_id_for_ticket_panel>
TICKET_PANEL_TITLE=📝   Ticket - สอบถามเพิ่มเติม
TICKET_PANEL_DESCRIPTION=สอบถามเพิ่มเติมคลิก Ticket ได้เลยครับ
TICKET_PANEL_BUTTON=📩 Open Ticket
```
- Install deps: `cd bot && npm install`
- Start: `npm start`

3) Database (MySQL/XAMPP)
- Import schema and mock data: run `backend/SQL_SCHEMA.sql` in MySQL (UTF8MB4).

4) Web
- `web/.env`:
```
VITE_API_BASE_URL=http://localhost:4000
VITE_CHALLONGE_TOURNAMENT_ID=your_tournament_slug_or_id
```

## Challonge Edition
- Brackets & matches sourced from Challonge API.
- Backend endpoints (selection):
  - `POST /register/player` (unchanged)
  - `POST /register/team` → creates team in DB + Challonge participant; stores `challonge_participant_id`.
  - `GET /matches/upcoming` → pending Challonge matches (names mapped from teams when possible)
  - `GET /bracket` → raw Challonge matches JSON (web uses iframe embed instead)
  - `POST /matches/result` → save proof + winner side to DB (awaiting_proof)
  - `POST /matches/confirm` → declares winner to Challonge; sets local status completed
  - `POST /matches/result-channel` → bind Discord result channel to Challonge match
  - `GET /matches/awaiting-proof` → matches past time with no result channel; enriched with captain IDs
  - `POST /matches/schedule` (admin, optional) → store local scheduled time metadata

- Discord Bot (new/updated):
  - `/register-team` unchanged (persists to DB and creates role)
  - `/match-schedule` deprecated to local metadata only
  - `/announce-matches [count]` → fetch upcoming from backend and announce
  - `/match-result` and `/match-confirm` unchanged in flow (now syncs with Challonge)

- Web
  - Bracket page uses Challonge iframe via `VITE_CHALLONGE_TOURNAMENT_ID`.

## Auth (Admin)
- Backend supports optional JWT auth.
- Enable by setting in `backend/.env`:
```
ENABLE_AUTH=true
ADMIN_USER=staff
ADMIN_PASS=valorant_tournament_staff
JWT_SECRET=<strong_secret>
```
- Get a token:
```
POST /login { "username": "staff", "password": "valorant_tournament_staff" }
```
- Use `Authorization: Bearer <token>` for admin endpoints.
- Web: visit `/login`, then `/admin` (token saved in localStorage).

## Docker Compose
Prereqs: Docker Desktop.

1) Create a root `.env` with your values (DB, Bot, Challonge).

2) Start stack:
```
docker compose up -d --build
```

3) Services:
- Backend: http://localhost:4000
- Web: http://localhost:5173 (served by Nginx)
- MySQL: localhost:3306 (user root / pass root in compose)

4) Web pages: `/schedule`, `/bracket`, `/login`, `/admin`

## Ticket Commands
- Use the “📩 Open Ticket” button in `TICKET_PANEL_CHANNEL_ID` to create a ticket under `TICKET_CATEGORY_ID`.
- Slash command to move a ticket: `/ticket-move [category_id]`.
