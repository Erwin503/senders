# Kanban Orders

Order kanban website with a Nest.js API, Knex migrations, MySQL storage, a Vue/Vite frontend, and a Telegram group bot.

## Stack

- Backend: Nest.js, Knex, MySQL
- Frontend: Vue 3, Vite
- Telegram bot: Bot API long polling
- Local DB: Docker Compose with MySQL 8.4

## Setup

```bash
npm install
copy example.env .env
docker compose up -d
npm run start:frontend
```

Compose starts MySQL, the backend, and the frontend. The backend waits for MySQL, runs `npm run migrate`, then starts Nest.js. Migrations are safe to run again on container restarts.

Frontend: http://localhost:5173

Backend API: http://localhost:3000/api

## Telegram Bot Setup

1. Create a bot with `@BotFather` and put its token in `TELEGRAM_BOT_TOKEN`.
2. Restart the backend and add the bot to the order group.
3. Send `/chatid@bot_username` in that group and copy the returned ID into `TELEGRAM_GROUP_ID` in `.env`.
4. Restart the backend again. Mention the bot, then put the delivery address on the first line and the comment on the next line.

The bot stores the sender and original message, then creates a card in `создан`. Stage reactions are 📝 created, 📦 assembled, 🚚 shipped, and ✅ ready. The bot needs permission to react to messages in the group.

Each website browser has a display name stored locally. It is used for operator, warehouse, and driver attribution; this is a display name, not a user account.

## API

- `GET /api/board` returns columns with tasks
- `POST /api/columns` creates a column
- `PATCH /api/columns/:id` updates a column
- `POST /api/tasks` creates a task
- `PATCH /api/tasks/:id` updates a task
- `PATCH /api/tasks/:id/move` moves a task to a column and position
- `DELETE /api/tasks/:id` deletes a task

