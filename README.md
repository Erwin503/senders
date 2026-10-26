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

The backend container uses `MYSQL_DOCKER_HOST` and `MYSQL_DOCKER_PORT` for its database connection. They default to `mysql:3306` for the Compose MySQL service. If the database runs elsewhere, set these variables in the Docker/hosting environment to the database host and port supplied by the provider.

Frontend in Docker Compose: http://localhost:83

Frontend with the local Vite dev server: http://localhost:5173

Backend API: http://localhost:3000/api

## Telegram Bot Setup

1. Create a bot with `@BotFather` and put its token in `TELEGRAM_BOT_TOKEN`.
2. Restart the backend and add the bot to the order group.
3. In the target group, an administrator sends `/setchatid@bot_username`. The bot saves that group as the intake group in MySQL. Use `/chatid@bot_username` to display its ID.
4. Mention the bot in a message, then put the delivery address on the first line and the comment on the next line.

The bot stores the sender and original message, then creates a card in `создан`. Stage reactions are 📝 created, 📦 assembled, 🚚 shipped, and ✅ ready. The bot needs permission to react to messages in the group.

Telegram polling diagnostics are written to `backend/logs/telegram-bot.log` (or `TELEGRAM_LOG_FILE`). In Docker, read them with `docker compose exec backend tail -f logs/telegram-bot.log`. The same structured events are also sent to the backend console log.

## Accounts and Roles

Register the first account after the authentication migration; it becomes the administrator. Later registrations receive the manager role. The administrator can assign manager, driver, warehouse-keeper, or administrator roles from the Users dialog. Passwords are stored as salted scrypt hashes and login sessions use HttpOnly cookies.

Configure `INTEGRATION_API_KEY` in the backend environment for trusted 1C requests. Send it as the `X-Api-Key` header when creating orders or changing a stage by 1C number. All other website endpoints require a logged-in session.

## API

- `GET /api/board` returns columns, tasks, and role-specific pending counts (authenticated)
- `POST /api/tasks` creates a task (authenticated, or `X-Api-Key` for 1C)
- `PATCH /api/tasks/move-by-external-number` moves a task by its 1C number (authenticated, or `X-Api-Key` for 1C)
- `PATCH /api/tasks/:id` updates a task (authenticated)
- `PATCH /api/tasks/:id/move` moves a task to a column and position (authenticated)
- `DELETE /api/tasks/:id` deletes a task (authenticated)
- `GET/POST/PATCH/DELETE /api/templates` manages order templates (admin/manager)
- `POST /api/route/import` imports a tab-separated list of counterparties and returns a route sheet grouped by district
- `GET /api/route/clients` returns the client directory and district order
- `POST /api/route/districts` creates a district
- `PATCH /api/route/districts/reorder` saves district order
- `PATCH /api/route/clients/:id` changes the client's district and circle type
- `PATCH /api/route/clients/reorder` saves client order within a district

