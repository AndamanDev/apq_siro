'use strict';
const express = require('express');
const db = require('../db/connection');

module.exports = function slotsRouter() {
  const router = express.Router();

  router.get('/', (req, res) => {
    let sql = 'SELECT * FROM time_slots';
    const params = [];
    if (req.query.roomId) { sql += ' WHERE room_id=?'; params.push(req.query.roomId); }
    sql += ' ORDER BY room_id, start_min';
    res.json(db.prepare(sql).all(...params));
  });

  router.post('/', (req, res) => {
    const { room_id, slot_code, start_min, end_min, quota = 0, quota_mode = 'warn', active = 1 } = req.body;
    if (!room_id || !slot_code) return res.status(400).json({ error: 'room_id & slot_code required' });
    try {
      const info = db.prepare(
        `INSERT INTO time_slots(room_id,slot_code,start_min,end_min,quota,quota_mode,active)
         VALUES(?,?,?,?,?,?,?)`
      ).run(room_id, slot_code, start_min, end_min, quota, quota_mode, active ? 1 : 0);
      res.json(db.prepare('SELECT * FROM time_slots WHERE id=?').get(info.lastInsertRowid));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.put('/:id', (req, res) => {
    const cur = db.prepare('SELECT * FROM time_slots WHERE id=?').get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'not found' });
    const m = { ...cur, ...req.body };
    db.prepare(
      `UPDATE time_slots SET slot_code=?,start_min=?,end_min=?,quota=?,quota_mode=?,active=? WHERE id=?`
    ).run(m.slot_code, m.start_min, m.end_min, m.quota, m.quota_mode, m.active ? 1 : 0, cur.id);
    res.json(db.prepare('SELECT * FROM time_slots WHERE id=?').get(cur.id));
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM time_slots WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
