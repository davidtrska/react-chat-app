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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

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

wss.on('connection', (socket) => {
  console.log('Someone connected')

  socket.on('message', (data) => {
    let event
    try {
      event = JSON.parse(data)
    } catch {
      console.error('Invalid message received')
      return
    }

    if (event.type === 'join')     handleJoin(socket, event)
    if (event.type === 'message')  handleMessage(socket, event)
    if (event.type === 'reaction') handleReaction(socket, event)
    if (event.type === 'typing')   handleTyping(socket, event)
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

// ── WebSocket Handlers ───────────────────────────────────────────────────────

function handleJoin(socket, event) {
    const { roomId, token } = event

   let username
    try {
      const decoded = jwt.verify(token, JWT_SECRET)
      username = decoded.username
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid token' }))
      return
    }

  if (!rooms[roomId]) rooms[roomId] = { users: {}, history: [] }

  // if user is already connected (e.g. after refresh), clean up the old session
  if (connectedUsers.has(username)) {
    connectedUsers.delete(username)
    if (rooms[roomId]?.users[username]) {
      delete rooms[roomId].users[username]
    }
  }

  connectedUsers.add(username)
  socket.username = username
  socket.roomId = roomId
  rooms[roomId].users[username] = socket

  console.log(`${username} joined room: ${roomId}`)

  socket.send(JSON.stringify({
    type: 'joined',
    history: rooms[roomId].history,
    users: Object.keys(rooms[roomId].users)
  }))

  broadcastPresence(roomId)
}

function handleMessage(socket, event) {
  const { roomId, text } = event
  const message = {
    id: Date.now(),
    username: socket.username,
    text,
    ts: new Date().toISOString(),
    reactions: {}
  }

  rooms[roomId].history.push(message)

  Object.values(rooms[roomId].users).forEach(userSocket =>
    userSocket.send(JSON.stringify({ type: 'message', ...message }))
  )
}

function handleReaction(socket, event) {
  const { messageId, emoji, roomId } = event
  const message = rooms[roomId].history.find(m => m.id === messageId)
  if (!message) return

  if (!message.reactions[emoji]) message.reactions[emoji] = []

  const index = message.reactions[emoji].indexOf(socket.username)
  if (index === -1) {
    message.reactions[emoji].push(socket.username)
  } else {
    message.reactions[emoji].splice(index, 1)
  }

  if (message.reactions[emoji].length === 0) delete message.reactions[emoji]

  Object.values(rooms[roomId].users).forEach(userSocket =>
    userSocket.send(JSON.stringify({ type: 'reaction', messageId, reactions: message.reactions }))
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
