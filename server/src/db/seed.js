'use strict';
const db = require('./connection');
const { hash } = require('../routes/auth');

// สีประจำห้อง (ตามดีไซน์ SiRO)
const GREEN = '#1aa54e';
const BLUE = '#1c50b5';

// ช่วงเวลาที่เปิดบริการ (ข้าม 12:00 = พักเที่ยง)
const SLOT_HOURS = [8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21];

function seedRooms() {
  const count = db.prepare('SELECT COUNT(*) c FROM rooms').get().c;
  if (count > 0) return;
  const ins = db.prepare(
    `INSERT INTO rooms(code,name,display_order,voice_room_key,color,active,sort_order) VALUES(?,?,?,?,?,1,?)`
  );
  ins.run('L6', 'เครื่องฉายรังสี L6', 1, 'L6_room', GREEN, 1);
  ins.run('L8', 'เครื่องฉายรังสี L8', 2, 'L8_room', BLUE, 2);
  console.log('   seeded rooms: L6 (เขียว), L8 (น้ำเงิน)');
}

function seedSlots() {
  const count = db.prepare('SELECT COUNT(*) c FROM time_slots').get().c;
  if (count > 0) return;
  const rooms = db.prepare('SELECT id FROM rooms').all();
  const ins = db.prepare(
    `INSERT INTO time_slots(room_id,slot_code,start_min,end_min,quota,quota_mode,active)
     VALUES(?,?,?,?,?,?,1)`
  );
  for (const r of rooms) {
    for (const h of SLOT_HOURS) {
      const code = String(h).padStart(2, '0');
      ins.run(r.id, code, h * 60, (h + 1) * 60, 20, 'warn');
    }
  }
  console.log('   seeded time slots (08-11, 13-15 ในเวลา + 16-21 นอกเวลา, quota 20)');
}

function seedProfile() {
  const count = db.prepare('SELECT COUNT(*) c FROM ticket_profiles').get().c;
  if (count > 0) return;
  // ดีไซน์ตามบัตรตัวอย่าง SiRO: โลโก้ → ชื่อห้อง → ช่วงเวลา → "หมายเลขคิว" → เลขคิวใหญ่ → ข้อความท้าย → วันที่/เวลา
  const layout = JSON.stringify({
    lines: [],
    styles: {
      logoWidth: 150,
      roomName: { size: 22, bold: true, show: true },
      slotTime: { size: 18, bold: false, show: true },
      queueLabel: { text: 'หมายเลขคิว', size: 17, bold: false, show: true },
      queueNumber: { size: 72, bold: true },
      footer: { size: 15, bold: false },
      dateTime: { size: 14, show: true },
    },
  });
  const footer = 'กรุณารอเรียกรับบริการตามลำดับคิว\nยินดีให้บริการ';
  db.prepare(
    `INSERT INTO ticket_profiles(name,is_default,header_text,footer_text,show_qr,copies,layout_json)
     VALUES(?,?,?,?,?,?,?)`
  ).run('ค่าเริ่มต้น', 1, '', footer, 0, 1, layout);
  console.log('   seeded default ticket profile');
}

function seedAdmin() {
  const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (count > 0) return;
  db.prepare('INSERT INTO users(username,password_hash,role,display_name) VALUES(?,?,?,?)').run(
    'admin', hash('123456'), 'admin', 'ผู้ดูแลระบบ'
  );
  console.log('   seeded admin user (admin / 123456)');
}

// backfill สี/ชื่อ สำหรับฐานข้อมูลเดิมที่ยังไม่มี
function backfill() {
  db.prepare(`UPDATE rooms SET color=? WHERE code='L6' AND (color IS NULL OR color='')`).run(GREEN);
  db.prepare(`UPDATE rooms SET color=? WHERE code='L8' AND (color IS NULL OR color='')`).run(BLUE);
  // ย้ายคีย์เสียงห้องจากสคีมเก่า (room_L6) มาเป็นไฟล์เสียงชุดใหม่ (L6_room)
  db.prepare(`UPDATE rooms SET voice_room_key='L6_room' WHERE code='L6' AND voice_room_key='room_L6'`).run();
  db.prepare(`UPDATE rooms SET voice_room_key='L8_room' WHERE code='L8' AND voice_room_key='room_L8'`).run();
}

function ensureSeed() {
  seedRooms();
  seedSlots();
  seedProfile();
  seedAdmin();
  backfill();
}

if (require.main === module) {
  ensureSeed();
  console.log('Seed complete.');
  process.exit(0);
}

module.exports = { ensureSeed };
