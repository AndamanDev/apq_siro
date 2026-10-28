'use strict';
const express = require('express');
const crypto = require('crypto');
const db = require('../db/connection');

// hash อย่างง่าย (sha256) — เพียงพอสำหรับระบบภายใน LAN
function hash(pw) {
  return crypto.createHash('sha256').update(String(pw)).digest('hex');
}

module.exports = function authRouter() {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    const u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
    if (!u || u.password_hash !== hash(password)) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    res.json({ id: u.id, username: u.username, role: u.role, displayName: u.display_name });
  });

  // รายชื่อผู้ใช้ (admin)
  router.get('/users', (req, res) => {
    res.json(db.prepare('SELECT id,username,role,display_name FROM users ORDER BY id').all());
  });

  router.post('/users', (req, res) => {
    const { username, password, role = 'staff', display_name } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username & password required' });
    try {
      const info = db.prepare(
        'INSERT INTO users(username,password_hash,role,display_name) VALUES(?,?,?,?)'
      ).run(username, hash(password), role, display_name || username);
      res.json({ id: info.lastInsertRowid, username, role });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.put('/users/:id', (req, res) => {
    const { password, role, display_name } = req.body || {};
    const cur = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'not found' });
    db.prepare('UPDATE users SET password_hash=?, role=?, display_name=? WHERE id=?').run(
      password ? hash(password) : cur.password_hash,
      role || cur.role,
      display_name !== undefined ? display_name : cur.display_name,
      cur.id
    );
    res.json({ ok: true });
  });

  router.delete('/users/:id', (req, res) => {
    db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};

module.exports.hash = hash;
