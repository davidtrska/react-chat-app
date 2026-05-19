const WebSocket = require('ws')
const httpServer = require('./http-routes')
const { verifyToken } = require('./auth')
const handlers = require('./handlers')

// ── WebSocket Server ─────────────────────────────────────────────────────────

const wss = new WebSocket.Server({ server: httpServer })
handlers.setWss(wss)

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

  const decoded = verifyToken(token)
  if (!decoded) {
    socket.close(1008, 'Invalid token')
    return
  }
  socket.username = decoded.username

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

    if (event.type === 'join')               handlers.handleJoin(socket, event)
    if (event.type === 'message')            handlers.handleMessage(socket, event)
    if (event.type === 'reaction')           handlers.handleReaction(socket, event)
    if (event.type === 'typing')             handlers.handleTyping(socket, event)
    if (event.type === 'create-room')        handlers.handleCreateRoom(socket, event)
    if (event.type === 'load-more-messages') handlers.handleLoadMore(socket, event)
  })

  socket.on('close', () => {
    handlers.handleDisconnect(socket)
  })
})
