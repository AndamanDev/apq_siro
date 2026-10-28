'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

module.exports = {
  PORT: Number(process.env.PORT) || 8888,
  HOST: process.env.HOST || '0.0.0.0',
  DB_PATH: process.env.DB_PATH || path.join(ROOT, 'data', 'queue.db'),
  PUBLIC_DIR: path.join(ROOT, 'public'),
  ASSETS_DIR: path.join(ROOT, 'assets'),
  LOGO_DIR: path.join(ROOT, 'assets', 'logos'),
  MEDIA_DIR: path.join(ROOT, 'assets', 'media'),
  AUDIO_DIR: path.join(ROOT, 'assets', 'audio'),
  ROOT,
};
