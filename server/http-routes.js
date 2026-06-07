const jwt = require('jsonwebtoken')
const http = require('http')
const url = require('url')
const bcrypt = require('bcrypt')
const db = require('./database')

const { JWT_SECRET, verifyToken } = require('./auth')
const { isUsernameTaken } = require('./state')

const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
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

  if (pathname === '/users/me' && req.method === 'PATCH') {
    const authHeader = req.headers.authorization
    if (!authHeader) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end()
      return
    }

    const token = authHeader.slice(7)
    const decoded = verifyToken(token)
    if (!decoded) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end()
      return
    }

    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const { username: newUsername } = JSON.parse(body)
      const trimmed = newUsername?.trim()

      if (!trimmed || trimmed.length > 50) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid username' }))
        return
      }

      // no change — return the existing token
      if (trimmed === decoded.username) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ token }))
        return
      }

      try {
        const result = db
          .prepare('UPDATE users SET username = ? WHERE username = ?')
          .run(trimmed, decoded.username)

        if (result.changes === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'User not found' }))
          return
        }
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Username already taken' }))
        return
      }

      const newToken = jwt.sign({ username: trimmed }, JWT_SECRET, { expiresIn: '7d' })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ token: newToken }))
    })
    return
  }

  if (pathname === '/register' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
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
      const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' })
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
    req.on('data', (chunk) => (body += chunk))
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
        const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '7d' })
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

module.exports = httpServer
