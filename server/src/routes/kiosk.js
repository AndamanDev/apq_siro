'use strict';
const express = require('express');
const dayjs = require('dayjs');
const db = require('../db/connection');
const settings = require('../services/settingsService');

module.exports = function kioskRouter() {
  const router = express.Router();

  // config ที่ kiosk ต้องใช้
  router.get('/config', (req, res) => {
    const profile = db.prepare('SELECT * FROM ticket_profiles WHERE is_default=1').get()
      || db.prepare('SELECT * FROM ticket_profiles ORDER BY id LIMIT 1').get();
    res.json({
      serverTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      idleTimeout: settings.getNumber('kiosk_idle_timeout'),
      printCopies: settings.getNumber('print_copies'),
      autostart: settings.get('kiosk_autostart') === '1',
      shutdownTime: settings.get('kiosk_shutdown_time') || '',
      profile: profile || null,
    });
  });

  // QR บนบัตรคิว (kiosk-web พิมพ์ผ่านเบราว์เซอร์ — ไม่มีไลบรารี QR ฝั่งหน้าเว็บ)
  router.get('/qr', async (req, res) => {
    const text = String(req.query.text || '').slice(0, 200);
    if (!text) return res.status(400).json({ error: 'text required' });
    try {
      const svg = await require('qrcode').toString(text, { type: 'svg', margin: 1 });
      res.type('image/svg+xml').send(svg);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
