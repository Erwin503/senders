# TG Kanban

Telegram mini app kanban MVP with a Nest.js API, Knex migrations, MySQL storage, and a Vue/Vite frontend.

## Stack

- Backend: Nest.js, Knex, MySQL
- Frontend: Vue 3, Vite, Telegram WebApp SDK
- Local DB: Docker Compose with MySQL 8.4

## Setup

```bash
npm install
copy example.env .env
docker compose up -d
npm run migrate
npm run start:backend
npm run start:frontend
```

Frontend: http://localhost:5173

Backend API: http://localhost:3000/api

## API

- `GET /api/board` returns columns with tasks
- `POST /api/columns` creates a column
- `PATCH /api/columns/:id` updates a column
- `POST /api/tasks` creates a task
- `PATCH /api/tasks/:id` updates a task
- `PATCH /api/tasks/:id/move` moves a task to a column and position
- `DELETE /api/tasks/:id` deletes a task

## Telegram Notes

The frontend loads `telegram-web-app.js`, calls `ready()` and `expand()`, and is shaped for a mini app viewport. The next production step is validating `Telegram.WebApp.initData` on the backend and attaching boards/tasks to the Telegram user id.
