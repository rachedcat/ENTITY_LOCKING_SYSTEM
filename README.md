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
├── docker-compose.yml      # PostgreSQL + Redis services
├── backend/                # NestJS REST API + WebSocket server (port 3000)
│   └── src/
│       ├── lock/           # Entity locking logic
│       ├── product/        # Product management
│       ├── audit/          # Audit / activity logs
│       └── entities/       # TypeORM entities
└── frontend/               # React app (port 5173)
    └── src/
```

---

## ✅ Prerequisites

Make sure the following are installed on your machine:

- [Node.js](https://nodejs.org/) **v18+**
- [npm](https://www.npmjs.com/) **v9+**
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd SVE_Project
```

### 2. Start the databases (PostgreSQL + Redis)

```bash
docker compose up -d
```

This starts:
- **PostgreSQL** on port `5432` — user: `user` | password: `password` | db: `sve_db`
- **Redis** on port `6379`

> Wait a few seconds for PostgreSQL to finish initializing before starting the backend.

---

### 3. Start the Backend

```bash
cd backend
npm install
npm run start:dev
```

The API will be available at: **http://localhost:3000**

---

### 4. Start the Frontend

Open a **new terminal** tab/window:

```bash
cd frontend
npm install
npm run dev
```

The app will be available at: **http://localhost:5173**

---

## 🌐 Ports Summary

| Service | Address |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3000 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

---

## ✨ Key Features

- 🔒 Real-time entity locking via WebSockets (Socket.IO)
- 🚫 Prevents concurrent edits on shared product records
- 📋 Lock activity audit log with session durations
- ⚡ Conflict detection with TypeORM versioning
- 👥 Role-based access control (RBAC)
- 🔄 Live UI updates across all connected clients

---

## 🛑 Stopping the Project

```bash
# Stop Docker services
docker compose down

# To also wipe the database volume (full reset)
docker compose down -v
```

---

## 🔧 Troubleshooting

**Docker not starting?**
Make sure Docker Desktop is running before executing `docker compose up -d`.

**Port already in use?**
```bash
lsof -i :3000
lsof -i :5173
lsof -i :5432
```

**Database connection errors?**
Wait ~5 seconds after Docker starts for PostgreSQL to be fully ready, then restart the backend.

---

*Developed as a Final Year Engineering Project (PFE)*
