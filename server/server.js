const http = require('http')
const url = require('url')
const WebSocket = require('ws')
const bcrypt = require('bcrypt')
const db = require('./database')
const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'

const rooms = {}
const connectedUsers = new Set()

// ── HTTP Server ──────────────────────────────────────────────────────────────

const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const { pathname, query } = url.parse(req.url, true)

  if (pathname === '/health') {
    res.writeHead(200)
    res.end('ok')
    return
  }

  if (pathname === '/check-username') {
    const taken = isUsernameTaken(query.name)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ taken }))
    return
  }

  if (pathname === '/register' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', async () => {
      const { username, password } = JSON.parse(body)

      const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
      if (existing) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Username already taken' }))
        return
      }

      const hash = await bcrypt.hash(password, 10)
      db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hash)

      res.writeHead(201, { 'Content-Type': 'application/json' })
      const token = jwt.sign({ username }, JWT_SECRET)
      res.end(JSON.stringify({ token }))
    })
    return
  }

  if (pathname === '/rooms' && req.method === 'GET') {
    const authHeader = req.headers.authorization
    if (!authHeader) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end()
      return
    }

    const token = authHeader.slice(7)

    try {
      jwt.verify(token, JWT_SECRET)
    } catch {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end()
      return
    }

    const allRooms = db.prepare('SELECT id, name FROM rooms ORDER BY created_at').all()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ rooms: allRooms }))
    return
  }

  if (pathname === '/login' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', async () => {
      const { username, password } = JSON.parse(body)

      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
      if (!user) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid username or password' }))
        return
      }

      const match = await bcrypt.compare(password, user.password)
      if (match) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        const token = jwt.sign({ username: user.username }, JWT_SECRET)
        res.end(JSON.stringify({ token }))

      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid username or password' }))
      }
    })
    return
  }

  res.writeHead(404)
  res.end()
})

const PORT = process.env.PORT || 8080
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`))

// ── WebSocket Server ─────────────────────────────────────────────────────────

const wss = new WebSocket.Server({ server: httpServer })

const HEARTBEAT_INTERVAL_MS = 30000

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach(client => {
    if (client.isAlive === false) {
      return client.terminate()
    }
    client.isAlive = false
    client.ping()
  })
}, HEARTBEAT_INTERVAL_MS)

wss.on('close', () => {
  clearInterval(heartbeatInterval)
})

wss.on('connection', (socket, req) => {
  const url = new URL(req.url, 'http://localhost')
  const token = url.searchParams.get('token')

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    socket.username = decoded.username
  } catch {
    socket.close(1008, 'Invalid token')
    return
  }

  socket.isAlive = true
  socket.on('pong', () => { socket.isAlive = true })

  console.log(`${socket.username} connected`)

  socket.on('message', (data) => {
    let event
    try {
      event = JSON.parse(data)
    } catch {
      console.error('Invalid message received')
      return
    }

    if (event.type === 'join')              handleJoin(socket, event)
    if (event.type === 'message')           handleMessage(socket, event)
    if (event.type === 'reaction')          handleReaction(socket, event)
    if (event.type === 'typing')            handleTyping(socket, event)
    if (event.type === 'create-room')       handleCreateRoom(socket, event)
    if (event.type === 'load-more-messages') handleLoadMore(socket, event)
  })

  socket.on('close', () => {
    if (socket.username) connectedUsers.delete(socket.username)
    if (socket.roomId && rooms[socket.roomId]) {
      delete rooms[socket.roomId].users[socket.username]
      broadcastPresence(socket.roomId)
    }
    console.log(`${socket.username} disconnected from ${socket.roomId}`)
  })
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function isUsernameTaken(username) {
  return connectedUsers.has(username)
}

function getReactionsForMessage(messageId) {
  const reactions = db.prepare(
    'SELECT reactions.emoji, users.username FROM reactions JOIN users ON users.id = reactions.user_id WHERE reactions.message_id = ?'
  ).all(messageId)

  const result = {}
  for (const row of reactions) {
    if (!result[row.emoji]) {
      result[row.emoji] = []
    }
    result[row.emoji].push(row.username)
  }
  return result
}

// ── WebSocket Handlers ───────────────────────────────────────────────────────

function handleCreateRoom(socket, event) {
  if (!socket.username) {
    socket.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }))
    return
  }

  const roomName = event.name
  if (!roomName || roomName.trim().length === 0 || roomName.length > 50) {
    socket.send(JSON.stringify({ type: 'error', message: 'Invalid room name' }))
    return
  }

  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(socket.username)

  try {
    db.prepare('INSERT INTO rooms (name, created_by) VALUES (?, ?)').run(roomName.trim(), user.id)
  } catch (error) {
    socket.send(JSON.stringify({ type: 'error', message: 'Room name already taken' }))
    return
  }

  const allRooms = db.prepare('SELECT id, name FROM rooms ORDER BY created_at').all()
  const payload = JSON.stringify({ type: 'rooms-updated', rooms: allRooms })
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload)
    }
  })
}


function handleJoin(socket, event) {
  const { roomId } = event

  const username = socket.username
  
  const room = db.prepare('SELECT id FROM rooms WHERE name = ?').get(roomId)
  const rows = db.prepare(
    'SELECT messages.id, messages.text, users.username, messages.created_at AS ts FROM messages JOIN users ON messages.user_id = users.id WHERE messages.room_id = ? ORDER BY messages.id DESC LIMIT 20'
  ).all(room.id)
  const history = rows.reverse().map(m => ({ ...m, reactions: getReactionsForMessage(m.id) }))

  if (!rooms[roomId]) rooms[roomId] = { users: {}, history: [] }

  // if user is already connected (e.g. after refresh), clean up the old session
  if (connectedUsers.has(username)) {
    connectedUsers.delete(username)
    if (rooms[roomId]?.users[username]) {
      delete rooms[roomId].users[username]
    }
  }

  connectedUsers.add(username)
  socket.roomId = roomId
  rooms[roomId].users[username] = socket

  console.log(`${username} joined room: ${roomId}`)

  socket.send(JSON.stringify({
    type: 'joined',
    history,
    users: Object.keys(rooms[roomId].users)
  }))

  broadcastPresence(roomId)
}

function handleMessage(socket, event) {
  const { roomId, text } = event

  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(socket.username)
  const room = db.prepare('SELECT id FROM rooms WHERE name = ?').get(roomId)

  const result = db.prepare(
    'INSERT INTO messages (user_id, room_id, text) VALUES (?, ?, ?)'
  ).run(user.id, room.id, text)

  const message = {
    id: result.lastInsertRowid,
    username: socket.username,
    text,
    ts: new Date().toISOString(),
    reactions: {}
  }

  Object.values(rooms[roomId].users).forEach(userSocket =>
    userSocket.send(JSON.stringify({ type: 'message', ...message }))
  )
}

function handleLoadMore(socket, event) {
  const { roomId, before } = event
  const room = db.prepare('SELECT id FROM rooms WHERE name = ?').get(roomId)
  const rows = db.prepare(
    'SELECT messages.id, messages.text, users.username, messages.created_at AS ts FROM messages JOIN users ON messages.user_id = users.id WHERE messages.room_id = ? AND messages.id < ? ORDER BY messages.id DESC LIMIT 20'
  ).all(room.id, before)
  const history = rows.reverse().map(m => ({ ...m, reactions: getReactionsForMessage(m.id) }))

  socket.send(JSON.stringify({ type: 'more-messages', messages: history }))
}

function handleReaction(socket, event) {
  const { messageId, emoji, roomId } = event
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(socket.username)

  const result = db.prepare(
    'DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?'
  ).run(messageId, user.id, emoji)

  if (result.changes === 0) {
    db.prepare(
      'INSERT INTO reactions (user_id, emoji, message_id) VALUES (?, ?, ?)'
    ).run(user.id, emoji, messageId)
  }

  Object.values(rooms[roomId].users).forEach(userSocket =>
    userSocket.send(JSON.stringify({ type: 'reaction', messageId, reactions: getReactionsForMessage(messageId) }))
  )
}

function handleTyping(socket, event) {
  const { roomId, isTyping } = event
  Object.values(rooms[roomId].users).forEach(userSocket => {
    if (userSocket !== socket) {
      userSocket.send(JSON.stringify({ type: 'typing', username: socket.username, isTyping }))
    }
  })
}

function broadcastPresence(roomId) {
  if (!rooms[roomId]) return
  const users = Object.keys(rooms[roomId].users)
  Object.values(rooms[roomId].users).forEach(userSocket =>
    userSocket.send(JSON.stringify({ type: 'presence', users }))
  )
}
