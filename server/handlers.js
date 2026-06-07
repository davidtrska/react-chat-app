const db = require('./database')
const { rooms, connectedUsers } = require('./state')
const WebSocket = require('ws')
let wss = null

function setWss(w) {
  wss = w
}

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
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload)
    }
  })
}

function handleJoin(socket, event) {
  const { roomId } = event
  const username = socket.username

  const room = db.prepare('SELECT id FROM rooms WHERE name = ?').get(roomId)
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(socket.username)

  if (!room || !user) {
    socket.send(JSON.stringify({ type: 'error', message: 'Invalid room or user' }))
    return
  }
  const rows = db
    .prepare(
      'SELECT messages.id, messages.text, users.username, messages.created_at AS ts FROM messages JOIN users ON messages.user_id = users.id WHERE messages.room_id = ? ORDER BY messages.id DESC LIMIT 20'
    )
    .all(room.id)
  const history = rows.reverse().map((m) => ({ ...m, reactions: getReactionsForMessage(m.id) }))

  if (!rooms[roomId]) rooms[roomId] = { users: {}, history: [] }

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

  socket.send(
    JSON.stringify({
      type: 'joined',
      history,
      users: Object.keys(rooms[roomId].users)
    })
  )

  broadcastPresence(roomId)
}

function handleMessage(socket, event) {
  const { roomId, text } = event

  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(socket.username)
  const room = db.prepare('SELECT id FROM rooms WHERE name = ?').get(roomId)

  if (!room || !user) {
    socket.send(JSON.stringify({ type: 'error', message: 'Invalid room or user' }))
    return
  }

  const result = db
    .prepare('INSERT INTO messages (user_id, room_id, text) VALUES (?, ?, ?)')
    .run(user.id, room.id, text)

  const message = {
    id: result.lastInsertRowid,
    username: socket.username,
    text,
    ts: new Date().toISOString(),
    reactions: {}
  }

  Object.values(rooms[roomId].users).forEach((userSocket) =>
    userSocket.send(JSON.stringify({ type: 'message', ...message }))
  )
}

function handleLoadMore(socket, event) {
  const { roomId, before } = event
  const room = db.prepare('SELECT id FROM rooms WHERE name = ?').get(roomId)
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(socket.username)

  if (!room || !user) {
    socket.send(JSON.stringify({ type: 'error', message: 'Invalid room or user' }))
    return
  }

  const rows = db
    .prepare(
      'SELECT messages.id, messages.text, users.username, messages.created_at AS ts FROM messages JOIN users ON messages.user_id = users.id WHERE messages.room_id = ? AND messages.id < ? ORDER BY messages.id DESC LIMIT 20'
    )
    .all(room.id, before)
  const history = rows.reverse().map((m) => ({ ...m, reactions: getReactionsForMessage(m.id) }))

  socket.send(JSON.stringify({ type: 'more-messages', messages: history }))
}

function handleUserRename(oldUsername, newUsername) {
  if (!wss) return

  wss.clients.forEach((client) => {
    if (client.username === oldUsername) {
      client.username = newUsername
    }
  })

  if (connectedUsers.has(oldUsername)) {
    connectedUsers.delete(oldUsername)
    connectedUsers.add(newUsername)
  }

  const affectedRoomIds = []
  for (const roomId in rooms) {
    if (rooms[roomId].users[oldUsername]) {
      rooms[roomId].users[newUsername] = rooms[roomId].users[oldUsername]
      delete rooms[roomId].users[oldUsername]
      affectedRoomIds.push(roomId)
    }
  }

  const payload = JSON.stringify({ type: 'user-renamed', oldUsername, newUsername })
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload)
    }
  })

  affectedRoomIds.forEach((roomId) => broadcastPresence(roomId))
}

function handleReaction(socket, event) {
  const { messageId, emoji, roomId } = event
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(socket.username)
  const room = db.prepare('SELECT id FROM rooms WHERE name = ?').get(roomId)

  if (!room || !user) {
    socket.send(JSON.stringify({ type: 'error', message: 'Invalid room or user' }))
    return
  }

  const result = db
    .prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
    .run(messageId, user.id, emoji)

  if (result.changes === 0) {
    db.prepare('INSERT INTO reactions (user_id, emoji, message_id) VALUES (?, ?, ?)').run(
      user.id,
      emoji,
      messageId
    )
  }

  Object.values(rooms[roomId].users).forEach((userSocket) =>
    userSocket.send(
      JSON.stringify({ type: 'reaction', messageId, reactions: getReactionsForMessage(messageId) })
    )
  )
}

function handleTyping(socket, event) {
  const { roomId, isTyping } = event
  Object.values(rooms[roomId].users).forEach((userSocket) => {
    if (userSocket !== socket) {
      userSocket.send(JSON.stringify({ type: 'typing', username: socket.username, isTyping }))
    }
  })
}

function broadcastPresence(roomId) {
  if (!rooms[roomId]) return
  const users = Object.keys(rooms[roomId].users)
  Object.values(rooms[roomId].users).forEach((userSocket) =>
    userSocket.send(JSON.stringify({ type: 'presence', users }))
  )
}

function handleDisconnect(socket) {
  if (socket.username) connectedUsers.delete(socket.username)
  if (socket.roomId && rooms[socket.roomId]) {
    delete rooms[socket.roomId].users[socket.username]
    broadcastPresence(socket.roomId)
  }
  console.log(`${socket.username} disconnected from ${socket.roomId}`)
}

function getReactionsForMessage(messageId) {
  const reactions = db
    .prepare(
      'SELECT reactions.emoji, users.username FROM reactions JOIN users ON users.id = reactions.user_id WHERE reactions.message_id = ?'
    )
    .all(messageId)

  const result = {}
  for (const row of reactions) {
    if (!result[row.emoji]) {
      result[row.emoji] = []
    }
    result[row.emoji].push(row.username)
  }
  return result
}

module.exports = {
  handleJoin,
  handleMessage,
  handleReaction,
  handleTyping,
  handleCreateRoom,
  handleLoadMore,
  handleDisconnect,
  setWss,
  handleUserRename
}
