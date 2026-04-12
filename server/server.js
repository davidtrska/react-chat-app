const WebSocket = require('ws')
const rooms = {} // { roomId: { users: {}, history: [] } }

const http = require('http')
const url = require('url')
const connectedUsers = new Set()

const httpServer = http.createServer((req, res) => {
  // allow the browser to call this from React (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*')

  const { pathname, query } = url.parse(req.url, true)

 if (pathname === '/check-username') {
  const username = query.name
  const taken = isUsernameTaken(username)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ taken }))
  return
}

  if (pathname === '/health') {
    res.writeHead(200)
    res.end('ok')
    return
  }

  res.writeHead(404)
  res.end()
})

// attach websocket server to http server
const wss = new WebSocket.Server({ server: httpServer })

const PORT = process.env.PORT || 8080
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

wss.on('connection', (socket) => {
  console.log('Someone connected')

  socket.on('message', (data) => {
    const event = JSON.parse(data)
    
    if (event.type === 'join') {
      handleJoin(socket, event)
    }

  if (event.type === 'reaction') {
  handleReaction(socket, event)
}

    
    
    if (event.type === 'message') {
      handleMessage(socket, event)
    }

    if (event.type === 'typing') {
      handleTyping(socket, event)
    }
  })
  

  socket.on('close', () => {
    if (socket.username) {
    connectedUsers.delete(socket.username)
  }
    if (socket.roomId && rooms[socket.roomId]) {
    delete rooms[socket.roomId].users[socket.username]
    broadcastPresence(socket.roomId)
  }
      console.log(`${socket.username} disconnected from ${socket.roomId}`)
  })
})

function isUsernameTaken(username) {
  return connectedUsers.has(username)
}


function handleReaction(socket, event) {
  const { messageId, emoji, roomId } = event
  const username = socket.username

  // find the message in room history
  const message = rooms[roomId].history.find(m => m.id === messageId)
  if (!message) return

  // create emoji array if it doesn't exist
  if (!message.reactions[emoji]) {
    message.reactions[emoji] = []
  }

  const index = message.reactions[emoji].indexOf(username)

  if (index === -1) {
    // user hasn't reacted — add them
    message.reactions[emoji].push(username)
  } else {
    // user already reacted — remove them (toggle off)
    message.reactions[emoji].splice(index, 1)
  }

  // remove emoji entirely if nobody reacted
  if (message.reactions[emoji].length === 0) {
    delete message.reactions[emoji]
  }

  // broadcast updated message to everyone in room
  Object.values(rooms[roomId].users).forEach((userSocket) => {
    userSocket.send(JSON.stringify({
      type: 'reaction',
      messageId,
      reactions: message.reactions
    }))
  })
}

function handleJoin(socket, event) {
  const { username, roomId } = event

  // create room if it doesn't exist
  if (!rooms[roomId]) {
    rooms[roomId] = { users: {}, history: [] }
  }

  // check if username is taken BEFORE adding anything
  if (connectedUsers.has(username)) {
    socket.send(JSON.stringify({
      type: 'error',
      message: `Username "${username}" is already taken`
    }))
    return
  }

  // only reach here if username is free
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
  const username = socket.username

  console.log(`${username} in ${roomId}: ${text}`) // add this

  
  
  const message = {
  id: Date.now(),
  username,
  text,
  ts: new Date().toISOString(),
  reactions: {}  // add this
}
  
  // save to history
  rooms[roomId].history.push(message)
  
  // broadcast to everyone in the room
  const room = rooms[roomId]
  Object.values(room.users).forEach((userSocket) => {
    userSocket.send(JSON.stringify({
      type: 'message',
      ...message
    }))
  })
}

function broadcastPresence(roomId) {
  if (!rooms[roomId]) return
  const users = Object.keys(rooms[roomId].users)
  
  Object.values(rooms[roomId].users).forEach((userSocket) => {
    userSocket.send(JSON.stringify({
      type: 'presence',
      users
    }))
  })
}

function handleTyping(socket, event) {
  const { roomId, isTyping } = event
  const username = socket.username

  Object.values(rooms[roomId].users).forEach((userSocket) => {
    if (userSocket !== socket) {
      userSocket.send(JSON.stringify({
        type: 'typing',
        username,
        isTyping
      }))
    }
  })
}
