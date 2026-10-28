'use strict';
// ========================================================================
// seed-history.js — จำลองข้อมูลคิวย้อนหลังเพื่อทดสอบรายงาน
// สร้างคิวย้อนหลัง ~3 เดือน ทั้ง 2 ห้อง (L6, L8) ทุกช่วงเวลา
// ครอบคลุม: เวลารอคอย / ปริมาณบริการ / โควต้า(เกินโควต้า) / ความพึงพอใจ
//
// รันด้วย:  node src/db/seed-history.js            (ค่าเริ่มต้น 90 วัน)
//           node src/db/seed-history.js 120        (กำหนดจำนวนวันเอง)
//
// ปลอดภัย/รันซ้ำได้: ข้ามวันที่ที่มีข้อมูลคิวอยู่แล้ว (ไม่ทับของเดิม)
// ========================================================================
const db = require('./connection');
const dayjs = require('dayjs');
const { ensureSeed } = require('./seed');

// ให้แน่ใจว่ามีห้อง/ช่วงเวลา/โปรไฟล์/แอดมิน ก่อน (กรณี db ว่าง)
ensureSeed();

const DAYS = Number(process.argv[2]) || 90;   // ย้อนหลังกี่วัน (~3 เดือน)

const pad2 = (n) => String(n).padStart(2, '0');
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const chance = (p) => Math.random() < p;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- โหลดข้อมูลอ้างอิง ----------
const rooms = db.prepare('SELECT id, code FROM rooms ORDER BY sort_order, id').all();
// quota ต่อ (room_id, slot_code)
const slotRows = db.prepare('SELECT room_id, slot_code, quota FROM time_slots').all();
const quotaOf = new Map();
const slotCodes = [...new Set(slotRows.map((s) => s.slot_code))].sort();
for (const s of slotRows) quotaOf.set(`${s.room_id}:${s.slot_code}`, s.quota || 20);

// ---------- prepared statements ----------
const insQueue = db.prepare(`
  INSERT INTO queues
    (queue_number, room_id, service_date, slot_code, seq, status, station,
     over_quota, issued_at, called_at, last_call_at, recall_count, parked_at, serving_at, done_at)
  VALUES
    (@queue_number,@room_id,@service_date,@slot_code,@seq,@status,@station,
     @over_quota,@issued_at,@called_at,@last_call_at,@recall_count,NULL,@serving_at,@done_at)
`);
const insEvent = db.prepare('INSERT INTO queue_events(queue_id,event,station,at) VALUES(?,?,?,?)');
const insSat = db.prepare('INSERT INTO satisfaction(queue_id,room_id,score,at) VALUES(?,?,?,?)');
const upsertCounter = db.prepare(`
  INSERT INTO queue_counters(room_id, service_date, slot_code, last_seq)
  VALUES(?,?,?,?)
  ON CONFLICT(room_id, service_date, slot_code) DO UPDATE SET last_seq=excluded.last_seq
`);
const dateHasData = db.prepare('SELECT 1 FROM queues WHERE service_date=? LIMIT 1');

// ---------- ตรรกะจำลอง 1 วัน ----------
function genDay(date, dow) {
  // dow: 0=อา ... 6=ส  | ปิดวันอาทิตย์
  if (dow === 0) return { q: 0, days: 0 };
  if (dateHasData.get(date)) return { q: 0, days: 0 }; // มีข้อมูลแล้ว ข้าม

  const satFactor = dow === 6 ? 0.55 : 1; // เสาร์คนน้อยกว่า
  let made = 0;

  for (const room of rooms) {
    for (const code of slotCodes) {
      const hour = Number(code);
      const quota = quotaOf.get(`${room.id}:${code}`) || 20;

      // จำนวนผู้รับบริการต่อช่วง: กลางวัน(08-15) แน่นกว่า, เย็น(16-21) เบากว่า
      const daytime = hour <= 15;
      let count;
      if (daytime) {
        count = chance(0.18) ? randInt(quota + 1, quota + 6) // บางช่วงเกินโควต้า
                             : randInt(Math.round(quota * 0.5), quota);
      } else {
        count = randInt(3, Math.round(quota * 0.6));
      }
      count = Math.max(0, Math.round(count * satFactor));
      if (count === 0) continue;

      for (let seq = 1; seq <= count; seq++) {
        const overQuota = seq > quota ? 1 : 0;
        const issued = dayjs(`${date} ${pad2(hour)}:00:00`)
          .add(randInt(0, 57), 'minute')
          .add(randInt(0, 59), 'second');

        // กระจายสถานะ: ~6% ยกเลิก, ~6% ข้าม(เรียกแล้วไม่มา), ที่เหลือเสร็จ
        const roll = Math.random();
        let status, called = null, serving = null, done = null, recalls = 0;

        if (roll < 0.06) {
          status = 'cancelled'; // ยกเลิกก่อนเรียก
        } else {
          // มีการเรียก
          let wait = randInt(2, 28);
          if (chance(0.15)) wait += randInt(10, 30); // บางคิวรอนาน
          called = issued.add(wait, 'minute').add(randInt(0, 59), 'second');
          recalls = chance(0.28) ? randInt(1, 2) : 0;

          if (roll < 0.12) {
            status = 'skipped'; // เรียกแล้วไม่มา
          } else {
            status = 'done';
            serving = called.add(randInt(0, 3), 'minute').add(randInt(0, 59), 'second');
            done = serving.add(randInt(6, 18), 'minute').add(randInt(0, 59), 'second');
          }
        }

        const FMT = 'YYYY-MM-DD HH:mm:ss';
        const r = insQueue.run({
          queue_number: `${room.code}${code}${pad2(seq)}`,
          room_id: room.id,
          service_date: date,
          slot_code: code,
          seq,
          status,
          station: room.code,
          over_quota: overQuota,
          issued_at: issued.format(FMT),
          called_at: called ? called.format(FMT) : null,
          last_call_at: called ? called.add(recalls * randInt(1, 3), 'minute').format(FMT) : null,
          recall_count: recalls,
          serving_at: serving ? serving.format(FMT) : null,
          done_at: done ? done.format(FMT) : null,
        });
        const qid = Number(r.lastInsertRowid);

        // เหตุการณ์ (audit trail)
        insEvent.run(qid, 'issued', room.code, issued.format(FMT));
        if (called) {
          insEvent.run(qid, 'called', room.code, called.format(FMT));
          for (let k = 1; k <= recalls; k++)
            insEvent.run(qid, 'recalled', room.code, called.add(k * randInt(1, 3), 'minute').format(FMT));
        }
        if (serving) insEvent.run(qid, 'serving', room.code, serving.format(FMT));
        if (done) insEvent.run(qid, 'done', room.code, done.format(FMT));
        if (status === 'skipped') insEvent.run(qid, 'skipped', room.code, called.format(FMT));
        if (status === 'cancelled') insEvent.run(qid, 'cancelled', room.code, issued.add(randInt(1, 8), 'minute').format(FMT));

        // ความพึงพอใจ: ~45% ของคิวที่เสร็จ ให้คะแนน (เอนไปทางสูง)
        if (done && chance(0.45)) {
          insSat.run(qid, room.id, pick([5, 5, 5, 4, 4, 4, 3, 5, 4, 2]), done.format(FMT));
        }

        made++;
      }

      upsertCounter.run(room.id, date, code, count);
    }
  }
  return { q: made, days: 1 };
}

// ---------- รันทั้งช่วง ใน transaction เดียว ----------
const today = dayjs().startOf('day');
let totalQ = 0, totalDays = 0;

const run = db.transaction(() => {
  for (let i = DAYS; i >= 1; i--) {
    const d = today.subtract(i, 'day');
    const res = genDay(d.format('YYYY-MM-DD'), d.day());
    totalQ += res.q;
    totalDays += res.days;
  }
});
run();

// ---------- สรุปผล ----------
const span = db.prepare('SELECT MIN(service_date) a, MAX(service_date) b, COUNT(*) n FROM queues').get();
const satN = db.prepare('SELECT COUNT(*) n FROM satisfaction').get().n;
console.log('────────────────────────────────────────');
console.log(`✓ จำลองข้อมูลย้อนหลังเสร็จ`);
console.log(`  วันที่สร้างใหม่ : ${totalDays} วัน  (ข้ามวันอาทิตย์ + วันที่มีข้อมูลอยู่แล้ว)`);
console.log(`  คิวที่สร้างใหม่ : ${totalQ.toLocaleString()} คิว`);
console.log(`  รวมในฐานข้อมูล : ${span.n.toLocaleString()} คิว (${span.a} → ${span.b})`);
console.log(`  ความพึงพอใจ    : ${satN.toLocaleString()} รายการ`);
console.log('────────────────────────────────────────');
process.exit(0);
