const Database = require('better-sqlite3')

const db = new Database('chat.db')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT    NOT NULL UNIQUE,
    password TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    created_at TEXT    DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id    INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    text       TEXT    NOT NULL,
    created_at TEXT    DEFAULT CURRENT_TIMESTAMP
  );
`)

const insertRoom = db.prepare('INSERT OR IGNORE INTO rooms (name, created_by) VALUES (?, ?)');
['general', 'random', 'tech'].forEach(name => insertRoom.run(name, null))

module.exports = db
