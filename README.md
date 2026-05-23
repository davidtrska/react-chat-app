# react-chat-app

A real-time chat application built with React, Node.js, and WebSockets. Built as a learning project to go from a static React UI to a production-shaped real-time app with user accounts, persistent storage, and connection resilience.

**Live demo:** [https://dave-react-chat-app.up.railway.app/](https://dave-react-chat-app.up.railway.app/)

## Features

- **User accounts** — registration and login with bcrypt-hashed passwords and JWT-based sessions
- **Authenticated WebSockets** — token verified at connection handshake, no message-level auth dance
- **Persistent data** — SQLite database for users, rooms, messages, and reactions
- **Multiple rooms** — pre-seeded defaults plus user-created rooms broadcast in real time
- **Reactions** — emoji reactions on any message, toggling on/off
- **Pagination** — last 20 messages loaded on join, older messages fetched on scroll
- **Connection resilience** — server heartbeat detects dead connections, client auto-reconnects with exponential backoff, UI shows connection status
- **Modular architecture** — server split into focused modules; React networking logic isolated in a custom hook

## Tech stack

- **Frontend:** React, Vite, React Router, Lucide icons, jwt-decode
- **Backend:** Node.js, `ws` (WebSocket), `better-sqlite3`, `bcrypt`, `jsonwebtoken`
- **Database:** SQLite (single-file, no server)
- **Deployment:** Railway

## Project structure

```
chat-app/
  client/                React frontend (Vite)
    src/
      hooks/useChat.js   custom hook owning WebSocket + chat state
      pages/             Login, Register, Rooms, Chat, Settings
      App.jsx            router + ProtectedRoute
      index.css          all styles
  server/
    server.js            entry point (WS server, heartbeat, dispatch)
    http-routes.js       HTTP endpoints (register, login, GET /rooms, health)
    handlers.js          WebSocket event handlers (join, message, reaction, …)
    auth.js              JWT secret + verify helper
    state.js             shared in-memory state (live connections, room presence)
    database.js          SQLite setup + seed rooms
    chat.db              SQLite file (not committed)
  package.json           root — single `npm run dev` for both sides
```

## Prerequisites

- Node.js 18+
- npm 9+

## Quick start

```bash
git clone https://github.com/davidtrska/react-chat-app.git
cd react-chat-app

# install dependencies for root, client, and server
npm install
cd client && npm install && cd ..
cd server && npm install && cd ..

# copy env templates
cp client/.env.example client/.env.local
cp server/.env.example server/.env

# start both server and client with one command
npm run dev
```

Server runs on `http://localhost:8080`. Client runs on `http://localhost:5173`.

## Running each side separately

```bash
# backend only
cd server && npm start

# frontend only
cd client && npm run dev
```

## Environment variables

### `client/.env.local`
| Var | Purpose | Example |
|---|---|---|
| `VITE_BACKEND_URL` | URL the frontend uses for HTTP + WebSocket | `http://localhost:8080` |

### `server/.env`
| Var | Purpose | Example |
|---|---|---|
| `JWT_SECRET` | Secret used to sign and verify JWTs (set a real value in production) | `dev-secret` |
| `PORT` | Port the server listens on | `8080` |

## License

MIT
