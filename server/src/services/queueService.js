'use strict';
const { EventEmitter } = require('events');
const dayjs = require('dayjs');
const db = require('../db/connection');
const { nextSeq, currentContext, resetCounters } = require('./numberService');
const { buildQueueNumber, spellChars } = require('../shared/queueFormat');
const { slotLabel } = require('../shared/slotUtils');
const { STATUS, canTransition } = require('../shared/statuses');

// emitter กลาง -> realtime layer subscribe เพื่อ broadcast ผ่าน socket.io
const bus = new EventEmitter();

const now = () => dayjs().format('YYYY-MM-DD HH:mm:ss');

class QuotaFullError extends Error {
  constructor() { super('quota_full'); this.code = 'QUOTA_FULL'; }
}

// ---------- prepared statements ----------
const getRoom = db.prepare('SELECT * FROM rooms WHERE id = ?');
const getSlot = db.prepare('SELECT * FROM time_slots WHERE room_id = ? AND slot_code = ?');
const insertQueue = db.prepare(
  `INSERT INTO queues(queue_number, room_id, service_date, slot_code, seq, status, over_quota, issued_at)
   VALUES(@queue_number,@room_id,@service_date,@slot_code,@seq,'waiting',@over_quota,@issued_at)`
);
const insertEvent = db.prepare(
  'INSERT INTO queue_events(queue_id, event, station, at) VALUES(?,?,?,?)'
);
const getQueue = db.prepare('SELECT * FROM queues WHERE id = ?');
const updateStatus = db.prepare('UPDATE queues SET status=@status WHERE id=@id');

function logEvent(queueId, event, station) {
  insertEvent.run(queueId, event, station || null, now());
}

// ---------- ออกเลขคิว (atomic) ----------
const issueTxn = db.transaction((roomId, slotCodeOverride) => {
  const room = getRoom.get(roomId);
  if (!room || !room.active) throw new Error('room_not_found');
  const ctx = currentContext();
  const date = ctx.date;
  // ผู้ป่วยเลือกช่วงเวลานัด (slotCodeOverride) ถ้าไม่ส่งมาใช้ช่วงเวลาปัจจุบัน
  const slotCode = slotCodeOverride || ctx.slotCode;
  const slot = getSlot.get(roomId, slotCode);
  const quota = slot ? slot.quota : 0;
  const quotaMode = slot ? slot.quota_mode : 'allow';

  const seq = nextSeq(roomId, date, slotCode);
  const overQuota = quota > 0 && seq > quota ? 1 : 0;
  if (overQuota && quotaMode === 'block') {
    throw new QuotaFullError();
  }
  const queue_number = buildQueueNumber(room.code, slotCode, seq);
  const issued_at = now();
  const info = insertQueue.run({
    queue_number, room_id: roomId, service_date: date,
    slot_code: slotCode, seq, over_quota: overQuota, issued_at,
  });
  const id = info.lastInsertRowid;
  logEvent(id, 'issued');
  return { id, room, queue_number, seq, slotCode, date, issued_at, overQuota, quotaMode };
});

function issue(roomId, slotCode) {
  const r = issueTxn(roomId, slotCode);
  const payload = {
    id: r.id,
    queueNumber: r.queue_number,
    roomId: r.room.id,
    roomCode: r.room.code,
    roomName: r.room.name,
    slotCode: r.slotCode,
    slotLabel: slotLabel(r.slotCode),
    seq: r.seq,
    serviceDate: r.date,
    issuedAt: r.issued_at,
    overQuota: !!r.overQuota,
  };
  bus.emit('issued', payload);
  return payload;
}

// ---------- สร้างชุดเสียงเรียก ----------
// "เชิญหมายเลข" + สะกดเลขคิว(L 6 0 8 0 1) + ไฟล์ห้อง("ที่ห้องฉายรังสี L6 ค่ะ")
// = "เชิญหมายเลข L60801 ที่ห้องฉายรังสี L6 ค่ะ"
function buildVoicePayload(q, room) {
  const seq = ['please_number', ...spellChars(q.queue_number)];
  if (room.voice_room_key) seq.push(room.voice_room_key);
  return seq;
}

function decorate(q) {
  const room = getRoom.get(q.room_id);
  return {
    ...q,
    roomId: q.room_id,            // ให้ฝั่ง client ใช้ชื่อ roomId ได้ตรงกับ event อื่น
    queueNumber: q.queue_number,  // สำหรับ TTS fallback
    roomCode: room.code,
    roomName: room.name,
    slotLabel: slotLabel(q.slot_code),
    voicePayload: buildVoicePayload(q, room),
  };
}

// ---------- เปลี่ยนสถานะทั่วไป ----------
function transition(id, to, { station, event, stamp } = {}) {
  const q = getQueue.get(id);
  if (!q) throw new Error('queue_not_found');
  if (q.status === to && to !== STATUS.CALLED) {
    // ไม่เปลี่ยนอะไร (ยกเว้น call ซ้ำ จัดการแยก)
  } else if (!canTransition(q.status, to)) {
    const e = new Error(`invalid_transition_${q.status}_to_${to}`);
    e.code = 'INVALID_TRANSITION';
    throw e;
  }
  const tnow = now();
  const sets = ['status=@status'];
  const params = { id, status: to };
  if (stamp) { sets.push(`${stamp}=@stamp`); params.stamp = tnow; }
  if (station !== undefined) { sets.push('station=@station'); params.station = station || null; }
  db.prepare(`UPDATE queues SET ${sets.join(', ')} WHERE id=@id`).run(params);
  logEvent(id, event || to, station);
  return getQueue.get(id);
}

function call(id, station) {
  const q = getQueue.get(id);
  if (!q) throw new Error('queue_not_found');
  const tnow = now();
  // ตั้ง called_at ครั้งแรกเท่านั้น
  db.prepare(
    `UPDATE queues SET status='called', station=@station,
       called_at = COALESCE(called_at, @t), last_call_at=@t
     WHERE id=@id`
  ).run({ id, station: station || null, t: tnow });
  logEvent(id, q.called_at ? 'recalled' : 'called', station);
  const full = decorate(getQueue.get(id));
  bus.emit('called', full);
  return full;
}

function recall(id, station) {
  const q = getQueue.get(id);
  if (!q) throw new Error('queue_not_found');
  const tnow = now();
  db.prepare(
    `UPDATE queues SET status='called', last_call_at=@t,
       recall_count=recall_count+1, station=COALESCE(@station, station)
     WHERE id=@id`
  ).run({ id, t: tnow, station: station || null });
  logEvent(id, 'recalled', station);
  const full = decorate(getQueue.get(id));
  bus.emit('recalled', full);
  return full;
}

// broadcast 'updated' พร้อมข้อมูลพอให้ฝั่ง dashboard แสดง feed ได้ (เลขคิว/ชื่อห้อง)
function emitUpdated(q, station) {
  const room = getRoom.get(q.room_id);
  bus.emit('updated', {
    id: q.id,
    status: q.status,
    roomId: q.room_id,
    roomCode: room ? room.code : null,
    roomName: room ? room.name : null,
    queueNumber: q.queue_number,
    slotCode: q.slot_code,
    slotLabel: slotLabel(q.slot_code),
    station: station || q.station || null,
  });
}

function park(id, station) {
  const q = transition(id, STATUS.PARKED, { station, event: 'parked', stamp: 'parked_at' });
  emitUpdated(q, station);
  return q;
}

function resume(id, station) {
  // ดึงคิวที่พักกลับมาเรียก
  return call(id, station);
}

function serving(id, station) {
  const q = transition(id, STATUS.SERVING, { station, event: 'serving', stamp: 'serving_at' });
  emitUpdated(q, station);
  return q;
}

function complete(id, station) {
  const q = transition(id, STATUS.DONE, { station, event: 'done', stamp: 'done_at' });
  emitUpdated(q, station);
  return q;
}

function skip(id, station) {
  const q = transition(id, STATUS.SKIPPED, { station, event: 'skipped' });
  emitUpdated(q, station);
  return q;
}

function cancel(id, station) {
  const q = transition(id, STATUS.CANCELLED, { station, event: 'cancelled' });
  emitUpdated(q, station);
  return q;
}

// เรียกคิวถัดไป (waiting ลำดับน้อยสุดของวันนี้ในห้อง)
const nextWaiting = db.prepare(
  `SELECT * FROM queues
   WHERE room_id=? AND service_date=? AND status='waiting'
   ORDER BY slot_code ASC, seq ASC LIMIT 1`
);
function callNext(roomId, station) {
  const { date } = currentContext();
  const q = nextWaiting.get(roomId, date);
  if (!q) return null;
  return call(q.id, station);
}

// ---------- รายการคิว ----------
function list({ roomId, status, date } = {}) {
  const d = date || currentContext().date;
  let sql = 'SELECT * FROM queues WHERE service_date=@date';
  const params = { date: d };
  if (roomId) { sql += ' AND room_id=@roomId'; params.roomId = Number(roomId); }
  if (status) {
    const arr = String(status).split(',');
    sql += ` AND status IN (${arr.map((_, i) => '@s' + i).join(',')})`;
    arr.forEach((s, i) => (params['s' + i] = s));
  }
  sql += ' ORDER BY slot_code ASC, seq ASC';
  return db.prepare(sql).all(params);
}

// เลขที่เรียกล่าสุด N รายการ ต่อห้อง (สำหรับจอแสดงผล)
function recentCalled(roomId, limit = 4) {
  const { date } = currentContext();
  return db.prepare(
    `SELECT * FROM queues
     WHERE room_id=? AND service_date=? AND called_at IS NOT NULL
       AND status IN ('called','serving','done')
     ORDER BY last_call_at DESC LIMIT ?`
  ).all(roomId, date, limit);
}

function resetToday(roomId) {
  const { date } = currentContext();
  resetCounters(date, roomId ? Number(roomId) : undefined);
  bus.emit('reset', { roomId: roomId ? Number(roomId) : null, date });
  return { ok: true, date };
}

// ---------- สรุปคิวต่อห้องของวันนี้ (สำหรับ Dashboard) ----------
// LEFT JOIN จาก rooms เพื่อให้ห้องที่ยังไม่มีคิวก็ปรากฏด้วยค่า 0
const summaryStmt = db.prepare(`
  SELECT r.id AS room_id, r.code, r.name,
    COALESCE(SUM(q.status='waiting'),0)               AS waiting,
    COALESCE(SUM(q.status IN ('called','serving')),0) AS active,
    COALESCE(SUM(q.status='done'),0)                  AS done,
    COALESCE(SUM(q.status='skipped'),0)               AS skipped,
    COALESCE(SUM(q.status='cancelled'),0)             AS cancelled,
    COALESCE(SUM(q.id IS NOT NULL),0)                 AS issued
  FROM rooms r
  LEFT JOIN queues q ON q.room_id=r.id AND q.service_date=@date
  WHERE r.active=1
  GROUP BY r.id ORDER BY r.id
`);
function summaryToday() {
  const { date } = currentContext();
  return { date, rooms: summaryStmt.all({ date }) };
}

module.exports = {
  bus, issue, call, recall, park, resume, serving, complete, skip, cancel,
  callNext, list, recentCalled, resetToday, summaryToday, decorate, QuotaFullError, getQueue,
};
