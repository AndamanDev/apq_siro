'use strict';
const express = require('express');
const db = require('../db/connection');
const queueService = require('../services/queueService');

module.exports = function roomsRouter() {
  const router = express.Router();

  router.get('/', (req, res) => {
    const onlyActive = req.query.all ? '' : 'WHERE active=1';
    res.json(db.prepare(`SELECT * FROM rooms ${onlyActive} ORDER BY display_order, sort_order, id`).all());
  });

  router.post('/', (req, res) => {
    const { code, name, display_order = 0, voice_room_key, color = null, active = 1, sort_order = 0 } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'code & name required' });
    try {
      const info = db.prepare(
        `INSERT INTO rooms(code,name,display_order,voice_room_key,color,active,sort_order)
         VALUES(?,?,?,?,?,?,?)`
      ).run(code, name, display_order, voice_room_key || code, color, active ? 1 : 0, sort_order);
      res.json(db.prepare('SELECT * FROM rooms WHERE id=?').get(info.lastInsertRowid));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.put('/:id', (req, res) => {
    const cur = db.prepare('SELECT * FROM rooms WHERE id=?').get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'not found' });
    const m = { ...cur, ...req.body };
    db.prepare(
      `UPDATE rooms SET code=?,name=?,display_order=?,voice_room_key=?,color=?,active=?,sort_order=? WHERE id=?`
    ).run(m.code, m.name, m.display_order, m.voice_room_key, m.color, m.active ? 1 : 0, m.sort_order, cur.id);
    res.json(db.prepare('SELECT * FROM rooms WHERE id=?').get(cur.id));
  });

  router.delete('/:id', (req, res) => {
    db.prepare('UPDATE rooms SET active=0 WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  // เรียกคิวถัดไปของห้อง
  router.post('/:id/call-next', (req, res) => {
    const q = queueService.callNext(Number(req.params.id), req.body.station);
    res.json(q || { ok: false, message: 'no waiting queue' });
  });

  return router;
};
