'use strict';
const express = require('express');
const reports = require('../services/reportService');
const { serviceDate } = require('../shared/slotUtils');

module.exports = function reportsRouter() {
  const router = express.Router();

  router.get('/wait-times', (req, res) => {
    res.json(reports.waitTimes(req.query.date || serviceDate(), req.query.roomId));
  });

  router.get('/volume', (req, res) => {
    const from = req.query.from || serviceDate();
    const to = req.query.to || serviceDate();
    res.json(reports.volume(from, to, req.query.roomId));
  });

  router.get('/quota', (req, res) => {
    res.json(reports.quota(req.query.date || serviceDate()));
  });

  router.get('/satisfaction', (req, res) => {
    const from = req.query.from || serviceDate();
    const to = req.query.to || serviceDate();
    res.json(reports.satisfaction(from, to));
  });

  return router;
};
