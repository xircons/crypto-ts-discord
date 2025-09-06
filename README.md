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
- Backend API/UI: http://localhost:4000 (serves JSON and bracket HTML at `/bracket`)
- Web (Vite dev): http://localhost:5173

Common PM2 commands:
- Status: `pm2 ls`
- Logs: `pm2 logs` (or `pm2 logs backend-dev` / `web-dev` / `valorant-bot`)
- Restart all: `pm2 restart all`
- Stop all: `pm2 stop all`

## Setup

1) Backend
- Create `backend/.env` with DB credentials and JWT (example values):
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
```
- Install deps: `cd backend && npm install`
- Run dev server: `npm run dev` (skip if using PM2 quick-start above)

2) Discord Bot
- Create `bot/.env` (minimum):
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
- Start: `npm start` (skip if using PM2 quick-start above)

3) Database (MySQL/XAMPP)
- Import schema and mock data: run `backend/SQL_SCHEMA.sql` in phpMySQLAdmin or MySQL client (UTF8MB4).

4) Tests
- Backend tests: `cd backend && npm test`

## Step 2: Team Registration & Roles
- Backend endpoint: `POST /register/team`
  - body: `{ name, logo?, captain_discord_id, players: [discordIds...] }`
- Bot command: `/register-team name:<string> logo?:<url> players:<id,id,...>`
- Set `API_BASE_URL` in `bot/.env` to your backend URL (e.g., `http://localhost:4000`).

## Step 3: Scheduling System
- Backend endpoints:
  - `POST /matches/create` body: `{ team_a, team_b, round, time: ISOString }`
  - `GET /matches/upcoming` returns upcoming scheduled matches
- Bot command: `/match-schedule team_a:<name> team_b:<name> round:<text> time_iso:<ISO>`
- Reminders: Bot checks upcoming matches every minute and announces at 30 minutes before start in `MATCH_ANNOUNCE_CHANNEL_ID`.

## Step 4: Match Results
- Backend endpoints:
  - `POST /matches/result` body: `{ match_id, winner: 'A'|'B', proof_url }` → sets status `pending_review`.
  - `POST /matches/confirm` body: `{ match_id, confirm: true }` → sets status `completed`.
- Bot commands:
  - `/match-result match_id:<id> winner:<A|B> proof_url:<url>`
  - `/match-confirm match_id:<id>` (admin)
- Announcements use Discord timestamps so times render in the viewer's local timezone.

### Result Channel & Proofs
- Bot env additions (`bot/.env`):
  - `GUILD_ID=<your_server_id>`
  - `RESULT_CATEGORY_ID=<optional_category_id_for_results>`
  - `STAFF_ROLE_ID=<optional_staff_role_id>`
- After the match time passes, bot will create a private text channel for each match without a result channel yet, visible only to the two team captains and staff.
- Captains upload a screenshot in that channel; the bot records the image URL and saves it to the backend (`proof_url_a`/`proof_url_b`).

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

1) Create a root `.env` (same folder as `docker-compose.yml`) with your values (see Bot env above and DB if needed).

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
- Slash command to move a ticket: `/ticket-move [category_id]` (defaults to `TICKET_CATEGORY_ID`).
