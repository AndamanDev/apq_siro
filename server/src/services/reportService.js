'use strict';
const db = require('../db/connection');

// เวลารอคอย (issued -> called) เป็นนาที จัดกลุ่มตามห้อง/ช่วงเวลา
function waitTimes(date, roomId) {
  let sql = `
    SELECT q.room_id, r.code AS room_code, r.name AS room_name, q.slot_code,
           COUNT(*) AS n,
           AVG((julianday(q.called_at)-julianday(q.issued_at))*1440.0) AS avg_wait_min,
           MAX((julianday(q.called_at)-julianday(q.issued_at))*1440.0) AS max_wait_min
    FROM queues q JOIN rooms r ON r.id=q.room_id
    WHERE q.service_date=@date AND q.called_at IS NOT NULL`;
  const params = { date };
  if (roomId) { sql += ' AND q.room_id=@roomId'; params.roomId = Number(roomId); }
  sql += ' GROUP BY q.room_id, q.slot_code ORDER BY q.room_id, q.slot_code';
  return db.prepare(sql).all(params);
}

// ปริมาณการให้บริการ จัดกลุ่มตามห้อง/วัน
function volume(from, to, roomId) {
  let sql = `
    SELECT q.service_date, q.room_id, r.code AS room_code, r.name AS room_name,
           COUNT(*) AS issued,
           SUM(CASE WHEN q.status='done' THEN 1 ELSE 0 END) AS done,
           SUM(CASE WHEN q.status='skipped' THEN 1 ELSE 0 END) AS skipped,
           SUM(CASE WHEN q.status='cancelled' THEN 1 ELSE 0 END) AS cancelled
    FROM queues q JOIN rooms r ON r.id=q.room_id
    WHERE q.service_date BETWEEN @from AND @to`;
  const params = { from, to };
  if (roomId) { sql += ' AND q.room_id=@roomId'; params.roomId = Number(roomId); }
  sql += ' GROUP BY q.service_date, q.room_id ORDER BY q.service_date, q.room_id';
  return db.prepare(sql).all(params);
}

// โควต้า: ออกจริง vs โควต้าที่ตั้งไว้ ต่อช่วงเวลา
function quota(date) {
  return db.prepare(`
    SELECT q.room_id, r.code AS room_code, q.slot_code,
           COUNT(*) AS issued,
           COALESCE(ts.quota,0) AS quota,
           SUM(q.over_quota) AS over_quota
    FROM queues q
    JOIN rooms r ON r.id=q.room_id
    LEFT JOIN time_slots ts ON ts.room_id=q.room_id AND ts.slot_code=q.slot_code
    WHERE q.service_date=@date
    GROUP BY q.room_id, q.slot_code ORDER BY q.room_id, q.slot_code
  `).all({ date });
}

function satisfaction(from, to) {
  return db.prepare(`
    SELECT s.room_id, r.code AS room_code, COUNT(*) AS n, AVG(s.score) AS avg_score
    FROM satisfaction s JOIN rooms r ON r.id=s.room_id
    WHERE date(s.at) BETWEEN @from AND @to
    GROUP BY s.room_id ORDER BY s.room_id
  `).all({ from, to });
}

module.exports = { waitTimes, volume, quota, satisfaction };
