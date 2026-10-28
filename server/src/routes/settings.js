'use strict';
const express = require('express');
const settings = require('../services/settingsService');

module.exports = function settingsRouter(io) {
  const router = express.Router();

  router.get('/', (req, res) => res.json(settings.all()));

  router.get('/:key', (req, res) => res.json({ key: req.params.key, value: settings.get(req.params.key) }));

  router.put('/:key', (req, res) => {
    const value = settings.set(req.params.key, req.body.value);
    if (io) io.notifySettings([req.params.key]);
    res.json({ key: req.params.key, value });
  });

  // อัปเดตหลายค่าในครั้งเดียว
  router.put('/', (req, res) => {
    const keys = Object.keys(req.body || {});
    for (const k of keys) settings.set(k, req.body[k]);
    if (io) io.notifySettings(keys);
    res.json(settings.all());
  });

  return router;
};
