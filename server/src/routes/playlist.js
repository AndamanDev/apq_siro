'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db/connection');
const { MEDIA_DIR } = require('../config');

fs.mkdirSync(MEDIA_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MEDIA_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname.replace(/[^\w.\-]/g, '_')),
});
const upload = multer({ storage });

module.exports = function playlistRouter(io) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const onlyActive = req.query.all ? '' : 'WHERE active=1';
    res.json(db.prepare(`SELECT * FROM playlist_items ${onlyActive} ORDER BY sort_order, id`).all());
  });

  // อัปโหลดไฟล์มีเดีย (รูป/วิดีโอ)
  router.post('/upload', upload.single('media'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const ext = path.extname(req.file.originalname).toLowerCase();
    const type = ['.mp4', '.webm', '.mov', '.ogg'].includes(ext) ? 'video' : 'image';
    const rel = '/assets/media/' + path.basename(req.file.path);
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM playlist_items').get().m;
    const info = db.prepare(
      `INSERT INTO playlist_items(type,path,title,duration_sec,sort_order,volume,muted,active)
       VALUES(?,?,?,?,?,?,?,1)`
    ).run(type, rel, req.file.originalname, type === 'image' ? 10 : null, maxOrder + 1, 0, 1);
    if (io) io.notifyPlaylist();
    res.json(db.prepare('SELECT * FROM playlist_items WHERE id=?').get(info.lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const cur = db.prepare('SELECT * FROM playlist_items WHERE id=?').get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'not found' });
    const m = { ...cur, ...req.body };
    const fit = m.fit === 'contain' ? 'contain' : 'cover';
    db.prepare(
      `UPDATE playlist_items SET title=?,duration_sec=?,sort_order=?,volume=?,muted=?,active=?,fit=? WHERE id=?`
    ).run(m.title, m.duration_sec, m.sort_order, m.volume, m.muted ? 1 : 0, m.active ? 1 : 0, fit, cur.id);
    if (io) io.notifyPlaylist();
    res.json(db.prepare('SELECT * FROM playlist_items WHERE id=?').get(cur.id));
  });

  router.delete('/:id', (req, res) => {
    const cur = db.prepare('SELECT * FROM playlist_items WHERE id=?').get(req.params.id);
    if (cur && cur.path) {
      const abs = path.join(MEDIA_DIR, path.basename(cur.path));
      fs.promises.unlink(abs).catch(() => {});
    }
    db.prepare('DELETE FROM playlist_items WHERE id=?').run(req.params.id);
    if (io) io.notifyPlaylist();
    res.json({ ok: true });
  });

  return router;
};
