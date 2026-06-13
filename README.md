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

## ✅ Prerequisites

You only need **two things** installed:

- [Git](https://git-scm.com/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) ← **this is everything, no Node.js needed**

---

## 🚀 Quickstart (Docker — recommended)

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd SVE_Project
```

### 2. Build and start all services

```bash
docker compose up --build
```

That single command will:
1. Build the NestJS backend image
2. Build the React frontend image
3. Start PostgreSQL and wait for it to be healthy
4. Start Redis and wait for it to be healthy
5. Start the backend (connected to Postgres + Redis)
6. Start the frontend served by nginx

### 3. Open the app

| Service | URL |
|---|---|
| 🌐 Frontend | http://localhost:5173 |
| ⚙️ Backend API | http://localhost:3000 |
| 🐘 PostgreSQL | localhost:5432 |
| 🔴 Redis | localhost:6379 |

### 4. Stop everything

```bash
docker compose down
```

To also **wipe the database** (full reset):

```bash
docker compose down -v
```

---

## 🔁 After code changes — rebuild

If you make code changes and want to re-run:

```bash
docker compose up --build
```

To rebuild only one service (e.g. backend):

```bash
docker compose up --build backend
```

---

## 🛠️ Local Development (optional — without Docker)

If you prefer to run the app without Docker (you need Node.js v18+ installed):

### 1. Start only the databases via Docker

```bash
docker compose up postgres redis -d
```

### 2. Start the backend

```bash
cd backend
npm install
npm run start:dev
```

### 3. Start the frontend (new terminal)

```bash
cd frontend
npm install
npm run dev
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

**`docker compose up` fails on first run?**
PostgreSQL needs ~5 seconds to initialize. The `healthcheck` in `docker-compose.yml` handles this automatically — the backend waits until Postgres is ready.

**Port already in use?**
```bash
lsof -i :3000   # backend
lsof -i :5173   # frontend
lsof -i :5432   # postgres
```

**Want to see live logs?**
```bash
docker compose logs -f backend
docker compose logs -f frontend
```

**Want to reset everything from scratch?**
```bash
docker compose down -v
docker compose up --build
```

---

*Developed as a Final Year Engineering Project (PFE)*
