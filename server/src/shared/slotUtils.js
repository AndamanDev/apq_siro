'use strict';
const dayjs = require('dayjs');

const pad2 = (n) => String(n).padStart(2, '0');

// คืนวันที่บริการตามเวลาเครื่อง server (YYYY-MM-DD)
function serviceDate(d = new Date()) {
  return dayjs(d).format('YYYY-MM-DD');
}

// ช่วงเวลา (slot) แบบรายชั่วโมงจากเวลาปัจจุบัน เช่น 08:xx -> '08'
function currentSlotCode(d = new Date()) {
  return pad2(dayjs(d).hour());
}

function minutesNow(d = new Date()) {
  const m = dayjs(d);
  return m.hour() * 60 + m.minute();
}

// ข้อความช่วงเวลาแบบอ่านง่าย '08.00 - 09.00 น.'
function slotLabel(slotCode) {
  const h = Number(slotCode);
  return `${pad2(h)}.00 - ${pad2(h + 1)}.00 น.`;
}

module.exports = { pad2, serviceDate, currentSlotCode, minutesNow, slotLabel };
