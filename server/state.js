const rooms = {}
const connectedUsers = new Set()

function isUsernameTaken(username) {
  return connectedUsers.has(username)
}

module.exports = { rooms, connectedUsers, isUsernameTaken }