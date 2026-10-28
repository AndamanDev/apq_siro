'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { DB_PATH } = require('../config');

// ensure data dir exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');
db.exec('PRAGMA synchronous = NORMAL');

// apply schema (idempotent)
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// lightweight migrations for existing databases (ignore if column already exists)
try { db.exec("ALTER TABLE rooms ADD COLUMN color TEXT"); } catch (e) { /* exists */ }
try { db.exec("ALTER TABLE playlist_items ADD COLUMN fit TEXT NOT NULL DEFAULT 'cover'"); } catch (e) { /* exists */ }

// helper: รัน function ภายใน transaction (BEGIN IMMEDIATE)
function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      throw e;
    }
  };
}

db.transaction = transaction; // ให้ใช้รูปแบบเดียวกับ better-sqlite3

module.exports = db;
