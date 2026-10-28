'use strict';
const { Server } = require('socket.io');
const queueService = require('../services/queueService');

function setup(httpServer) {
  const io = new Server(httpServer, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    socket.on('display:subscribe', () => socket.join('display'));
    socket.on('calling:subscribe', (roomId) => {
      socket.join('calling');
      if (roomId) socket.join('room:' + roomId);
    });
    socket.on('kiosk:subscribe', () => socket.join('kiosk'));
  });

  // ----- broadcast queue events -----
  queueService.bus.on('issued', (p) => {
    io.emit('queue:issued', p);
  });
  queueService.bus.on('called', (p) => {
    io.emit('queue:called', p);
  });
  queueService.bus.on('recalled', (p) => {
    io.emit('queue:recalled', p);
  });
  queueService.bus.on('updated', (p) => {
    io.emit('queue:updated', p);
  });
  queueService.bus.on('reset', (p) => {
    io.emit('queue:reset', p);
  });

  // settings / playlist changes broadcast (เรียกจาก routes)
  io.notifySettings = (keys) => io.emit('settings:changed', { keys });
  io.notifyPlaylist = () => io.emit('playlist:changed', {});

  return io;
}

module.exports = { setup };
