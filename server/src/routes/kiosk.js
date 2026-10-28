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

  return router;
};
