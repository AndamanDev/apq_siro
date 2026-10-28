'use strict';
const db = require('../db/connection');
const { serviceDate, currentSlotCode } = require('../shared/slotUtils');

const insertCounter = db.prepare(
  `INSERT INTO queue_counters(room_id, service_date, slot_code, last_seq)
   VALUES(?,?,?,0) ON CONFLICT(room_id, service_date, slot_code) DO NOTHING`
);
const bumpCounter = db.prepare(
  `UPDATE queue_counters SET last_seq = last_seq + 1
   WHERE room_id=? AND service_date=? AND slot_code=? RETURNING last_seq`
);

// เพิ่มและคืนค่า running number ถัดไป (ต้องเรียกภายใน transaction)
function nextSeq(roomId, date, slotCode) {
  insertCounter.run(roomId, date, slotCode);
  const row = bumpCounter.get(roomId, date, slotCode);
  return row.last_seq;
}

// บริบทช่วงเวลาปัจจุบันตามเวลาเครื่อง server
function currentContext(d = new Date()) {
  return { date: serviceDate(d), slotCode: currentSlotCode(d) };
}

// reset counters ของวันปัจจุบัน (ทั้งหมด หรือเฉพาะห้อง)
const resetAll = db.prepare('DELETE FROM queue_counters WHERE service_date = ?');
const resetRoom = db.prepare('DELETE FROM queue_counters WHERE service_date = ? AND room_id = ?');

function resetCounters(date, roomId) {
  if (roomId) resetRoom.run(date, roomId);
  else resetAll.run(date);
}

module.exports = { nextSeq, currentContext, resetCounters };
