'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db/connection');
const { LOGO_DIR } = require('../config');

fs.mkdirSync(LOGO_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, LOGO_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname.replace(/[^\w.\-]/g, '_')),
});
const upload = multer({ storage });

module.exports = function profilesRouter(io) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM ticket_profiles ORDER BY id').all());
  });

  router.post('/', (req, res) => {
    const { name, header_text = '', footer_text = '', show_qr = 0, copies = 1, layout_json = '{}', is_default = 0 } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    if (is_default) db.prepare('UPDATE ticket_profiles SET is_default=0').run();
    const info = db.prepare(
      `INSERT INTO ticket_profiles(name,is_default,header_text,footer_text,show_qr,copies,layout_json)
       VALUES(?,?,?,?,?,?,?)`
    ).run(name, is_default ? 1 : 0, header_text, footer_text, show_qr ? 1 : 0, copies, layout_json);
    res.json(db.prepare('SELECT * FROM ticket_profiles WHERE id=?').get(info.lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const cur = db.prepare('SELECT * FROM ticket_profiles WHERE id=?').get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'not found' });
    const m = { ...cur, ...req.body };
    if (m.is_default) db.prepare('UPDATE ticket_profiles SET is_default=0').run();
    db.prepare(
      `UPDATE ticket_profiles SET name=?,is_default=?,header_text=?,footer_text=?,show_qr=?,copies=?,layout_json=? WHERE id=?`
    ).run(m.name, m.is_default ? 1 : 0, m.header_text, m.footer_text, m.show_qr ? 1 : 0, m.copies, m.layout_json, cur.id);
    if (io) io.notifySettings(['ticket_profile']);
    res.json(db.prepare('SELECT * FROM ticket_profiles WHERE id=?').get(cur.id));
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM ticket_profiles WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  // อัปโหลดโลโก้
  router.post('/:id/logo', upload.single('logo'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const rel = '/assets/logos/' + path.basename(req.file.path);
    db.prepare('UPDATE ticket_profiles SET logo_path=? WHERE id=?').run(rel, req.params.id);
    res.json({ ok: true, logo_path: rel });
  });

  return router;
};
