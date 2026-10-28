'use strict';
const db = require('../db/connection');

// ค่าตั้งต้นของระบบ
const DEFAULTS = {
  scrolling_text: 'ยินดีต้อนรับสู่ศูนย์รังสีรักษา · กรุณารอเรียกคิวตามหมายเลขบนจอ',
  kiosk_idle_timeout: '30', // วินาที
  audio_gap_ms: '250',
  recent_count: '4', // จำนวนเลขคิวล่าสุดที่โชว์ต่อห้อง
  print_copies: '1',
  media_global_muted: '1',
  media_global_volume: '60',
  kiosk_autostart: '0',
  kiosk_shutdown_time: '', // 'HH:mm' หรือว่าง = ไม่ปิดอัตโนมัติ
  voice_enabled: '1',

  // ===== สี/ขนาดตัวอักษรบนจอแสดงผล =====
  // สี: ค่าว่าง = ใช้สีเริ่มต้น/สีประจำห้อง  ·  ขนาด: เปอร์เซ็นต์ (100 = ปกติ)
  disp_roomname_color: '',  disp_roomname_scale: '100', // ชื่อห้อง
  disp_queue_color: '',     disp_queue_scale: '100',    // เลขคิว
  disp_ticker_color: '',    disp_ticker_scale: '100',   // ข้อความวิ่ง
  disp_datetime_color: '',  disp_datetime_scale: '100', // วันที่/เวลา
};

const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const upsertStmt = db.prepare(
  'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
);
const allStmt = db.prepare('SELECT key, value FROM settings');

function get(key) {
  const row = getStmt.get(key);
  return row ? row.value : DEFAULTS[key];
}

function getNumber(key) {
  const v = get(key);
  return v === undefined || v === null || v === '' ? 0 : Number(v);
}

function set(key, value) {
  upsertStmt.run(key, String(value));
  return get(key);
}

function all() {
  const out = { ...DEFAULTS };
  for (const row of allStmt.all()) out[row.key] = row.value;
  return out;
}

module.exports = { get, getNumber, set, all, DEFAULTS };
