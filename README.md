# init.Habits — Fullstack Android + Web

A terminal-inspired habit tracker with one frontend codebase for Web and Android.

## Stack

- Frontend: React + Vite
- Android: Capacitor (same React codebase)
- Backend: FastAPI + SQLAlchemy
- Database: PostgreSQL
- Infrastructure: Docker Compose

## Features

- Daily habit checklist
- Morning / focused / evening groups
- Streaks
- Completion history
- 7/30/90/365-day statistics
- Contribution heatmap
- Achievements / XP
- Profile + theme selector
- Create/edit/delete habits
- Responsive desktop dashboard + mobile layout
- PostgreSQL persistence
- REST API

## Requirements

- Node.js 20+
- npm
- Docker Desktop / Docker Engine
- For Android: Android Studio + Android SDK + JDK 17+ (JDK 21 is fine with current Android tooling)

## 1. Start backend + PostgreSQL

From the project root:

```bash
docker compose up -d --build
```

Check:

```bash
curl http://localhost:8000/health
```

Expected:

```json
{"status":"ok"}
```

API docs:

http://localhost:8000/docs

## 2. Start the Web app

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite, normally:

http://localhost:5173

The frontend defaults to:

```text
http://localhost:8000
```

for the API.

## 3. Run Android

Install dependencies:

```bash
cd frontend
npm install
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
```

Then:

```bash
npm run build
npx cap sync android
npx cap open android
```

In Android Studio, start an emulator or connect a phone and press Run.

### Android API address

Android emulator:
```text
http://10.0.2.2:8000
```

Physical Android phone:
use the computer's LAN IP, for example:
```text
http://192.168.1.10:8000
```

Create `frontend/.env`:

```env
VITE_API_URL=http://10.0.2.2:8000
```

For a physical phone, replace it with your computer's LAN IP.

If using a physical phone, make sure the phone and computer are on the same network and port 8000 is reachable.

## 4. Useful commands

Backend:

```bash
docker compose logs -f api
docker compose down
docker compose down -v
```

Frontend:

```bash
npm run dev
npm run build
```

Android after frontend changes:

```bash
npm run build
npx cap sync android
```

## Architecture

```text
                 ┌─────────────────────┐
                 │     React + Vite     │
                 │  Web + Capacitor UI  │
                 └──────────┬──────────┘
                            │ REST/JSON
                            ▼
                 ┌─────────────────────┐
                 │       FastAPI       │
                 │       REST API      │
                 └──────────┬──────────┘
                            │ SQLAlchemy
                            ▼
                 ┌─────────────────────┐
                 │     PostgreSQL      │
                 └─────────────────────┘
```

This is a functional fullstack MVP. Authentication, cloud deployment, push notifications, Apple Health / Google Health Connect, and production-grade migrations are intentionally left as the next engineering layer.

## Interactive contribution heatmap

The contribution heatmap is data-driven, not decorative:

- Each square represents a calendar day.
- Color intensity is calculated from real habit completions stored in PostgreSQL.
- Hovering a square shows the date and completion count.
- Clicking a past/today square changes the Daily view to that date.
- The habit checkboxes then read/write completions for the selected date.
- A `today` action appears when viewing another date.
- Future dates are disabled visually.

The heatmap loads the latest 84 days from `GET /api/stats?days=84`.
