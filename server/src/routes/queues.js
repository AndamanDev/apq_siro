'use strict';
const express = require('express');
const queueService = require('../services/queueService');

module.exports = function queuesRouter() {
  const router = express.Router();

  // ออกเลขคิว (kiosk)
  router.post('/', (req, res) => {
    const roomId = Number(req.body.roomId);
    if (!roomId) return res.status(400).json({ error: 'roomId required' });
    try {
      const q = queueService.issue(roomId, req.body.slotCode);
      res.json(q);
    } catch (e) {
      if (e.code === 'QUOTA_FULL') return res.status(409).json({ error: 'quota_full' });
      res.status(400).json({ error: e.message });
    }
  });

  // รายการคิว
  router.get('/', (req, res) => {
    res.json(queueService.list({
      roomId: req.query.roomId,
      status: req.query.status,
      date: req.query.date,
    }));
  });

  // สรุปคิวต่อห้องของวันนี้ (Dashboard)
  router.get('/summary', (req, res) => {
    res.json(queueService.summaryToday());
  });

  // เลขล่าสุดต่อห้อง (จอแสดงผล)
  router.get('/recent', (req, res) => {
    const roomId = Number(req.query.roomId);
    const limit = Number(req.query.limit) || 4;
    res.json(queueService.recentCalled(roomId, limit));
  });

  // รีเซ็ตคิววันปัจจุบัน
  router.post('/reset', (req, res) => {
    res.json(queueService.resetToday(req.body.roomId));
  });

  // การกระทำต่อคิว
  const actions = {
    call: queueService.call,
    recall: queueService.recall,
    park: queueService.park,
    resume: queueService.resume,
    serving: queueService.serving,
    complete: queueService.complete,
    skip: queueService.skip,
    cancel: queueService.cancel,
  };
  router.post('/:id/:action', (req, res) => {
    const fn = actions[req.params.action];
    if (!fn) return res.status(404).json({ error: 'unknown action' });
    try {
      const q = fn(Number(req.params.id), req.body.station);
      res.json(q || { ok: false, message: 'no queue' });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return router;
};
