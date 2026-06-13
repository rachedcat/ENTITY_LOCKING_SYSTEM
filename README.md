# SVE Project — Entity Locking System

A full-stack application implementing a **real-time entity locking system** to prevent concurrent edits on shared resources. Built as a Final Year Engineering Project (PFE).

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Zustand, Socket.IO Client |
| **Backend** | NestJS 11, TypeScript, TypeORM, Socket.IO, PostgreSQL, Redis |
| **Infrastructure** | Docker, Docker Compose |

---

## 📁 Project Structure

```
SVE_Project/
├── docker-compose.yml      # All 4 services: postgres, redis, backend, frontend
├── backend/
│   ├── Dockerfile          # NestJS build & run
│   └── src/
│       ├── lock/           # Entity locking logic
│       ├── product/        # Product management
│       ├── audit/          # Audit / activity logs
│       └── entities/       # TypeORM entities
└── frontend/
    ├── Dockerfile          # React build + nginx
    ├── nginx.conf          # SPA routing config
    └── src/
```

---

## 🧭 Which setup should I use?

| I want to… | Use |
|---|---|
| Just run and test the app (no code changes) | ✅ [Option A — Docker only](#option-a----just-run-the-app-docker-only) |
| Work on the code, make changes, see live updates | ✅ [Option B — Developer mode](#option-b----developer-mode-active-development) |

---

## Option A — Just run the app (Docker only)

### Prerequisites
- [Git](https://git-scm.com/downloads)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) ← make sure it's open and running

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/rachedcat/ENTITY_LOCKING_SYSTEM.git
cd ENTITY_LOCKING_SYSTEM

# 2. Build all images and start all services
#    (first run takes 2–5 min to download & build)
docker compose up --build

# 3. Open the app
# → http://localhost:5173
```

### Stop the app

```bash
# Stop everything (keeps the database data)
docker compose down

# Stop everything AND wipe the database (full reset)
docker compose down -v
```

---

## Option B — Developer mode (active development)

Use this if you will be **making code changes**. You get full hot reload — the app updates instantly on every file save, no rebuild needed.

### Prerequisites
- [Git](https://git-scm.com/downloads)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) ← for the databases only
- [Node.js v18+](https://nodejs.org/) ← required to run the backend and frontend locally

### Step 1 — Clone the repo and open in VS Code

```bash
git clone https://github.com/rachedcat/ENTITY_LOCKING_SYSTEM.git
cd ENTITY_LOCKING_SYSTEM
code .
```

### Step 2 — Start only the databases

Open a terminal in VS Code and run:

```bash
docker compose up postgres redis -d
```

> This starts PostgreSQL and Redis in the background. Leave this running the whole time you work.

### Step 3 — Start the Backend

Open a **new terminal** in VS Code (`Terminal > New Terminal`):

```bash
cd backend
npm install
npm run start:dev
```

✅ Backend is running at `http://localhost:3000` with **hot reload** — it restarts automatically on every file save.

### Step 4 — Start the Frontend

Open **another new terminal** in VS Code:

```bash
cd frontend
npm install
npm run dev
```

✅ Frontend is running at `http://localhost:5173` with **instant hot reload** — changes appear in the browser immediately on save.

### Stop everything

```bash
# In each terminal running backend/frontend: press Ctrl+C

# Then stop the databases:
docker compose down
```

---

## 🌐 Ports Summary

| Service | URL |
|---|---|
| 🌐 Frontend | http://localhost:5173 |
| ⚙️ Backend API | http://localhost:3000 |
| 🐘 PostgreSQL | localhost:5432 |
| 🔴 Redis | localhost:6379 |

---

## 🔁 After pulling new updates (Option B)

```bash
git pull origin main

# Restart backend and frontend (Ctrl+C then re-run):
npm run start:dev   # in /backend
npm run dev         # in /frontend
```

---

## ✨ Key Features

- 🔒 Real-time entity locking via WebSockets (Socket.IO)
- 🚫 Prevents concurrent edits on shared product records
- 📋 Lock activity audit log with session durations
- ⚡ Conflict detection with TypeORM versioning
- 👥 Role-based access control (RBAC)
- 🔄 Live UI updates across all connected clients

---

## 🔧 Troubleshooting

**App not loading on first `docker compose up`?**
PostgreSQL needs ~10 seconds to initialize on first run. Wait and refresh the browser. If still failing:
```bash
docker compose down && docker compose up --build
```

**Database connection error on backend start (Option B)?**
Make sure Docker is running and the databases are up:
```bash
docker compose up postgres redis -d
```

**Port already in use?**
```bash
lsof -i :3000   # backend
lsof -i :5173   # frontend
lsof -i :5432   # postgres
```

**View live logs (Option A):**
```bash
docker compose logs -f backend
docker compose logs -f frontend
```

---

*Developed as a Final Year Engineering Project (PFE)*
