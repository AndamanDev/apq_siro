'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');

// โฟลเดอร์เก็บไฟล์โปรแกรม/ตัวติดตั้งสำหรับให้ดาวน์โหลด
// วางไฟล์ที่ build แล้วไว้ที่ server/public/downloads/
const DOWNLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'downloads');

// รายการไฟล์ที่เปิดให้ดาวน์โหลด (key -> ชื่อไฟล์จริงในโฟลเดอร์ downloads)
const ITEMS = [
  { key: 'display', file: 'display-queue.zip' },
  { key: 'kiosk', file: 'Queue2026Kiosk-Setup.exe' },
];

function stat(file) {
  try {
    const st = fs.statSync(path.join(DOWNLOAD_DIR, file));
    if (st.isFile()) return { exists: true, size: st.size, mtime: st.mtime.toISOString() };
  } catch (e) { /* ไม่มีไฟล์ */ }
  return { exists: false, size: 0, mtime: null };
}

module.exports = function downloadsRouter() {
  const router = express.Router();

  // manifest: บอกว่าแต่ละไฟล์มีอยู่จริงไหม + ขนาด/วันที่ (ให้ UI แสดงสถานะ)
  router.get('/', (req, res) => {
    res.json(ITEMS.map((it) => ({ key: it.key, file: it.file, ...stat(it.file) })));
  });

  // ดาวน์โหลดไฟล์ (บังคับให้ save แทนเปิดในเบราว์เซอร์)
  router.get('/file/:key', (req, res) => {
    const it = ITEMS.find((x) => x.key === req.params.key);
    if (!it) return res.status(404).json({ error: 'ไม่พบรายการดาวน์โหลด' });
    const full = path.join(DOWNLOAD_DIR, it.file);
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'ยังไม่ได้เตรียมไฟล์นี้บนเซิร์ฟเวอร์' });
    res.download(full, it.file);
  });

  return router;
};
