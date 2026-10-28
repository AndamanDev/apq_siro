'use strict';
const path = require('path');
const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');

const TYPE_MAP = {
  epson: PrinterTypes.EPSON,
  star: PrinterTypes.STAR,
  tanca: PrinterTypes.TANCA,
  daruma: PrinterTypes.DARUMA,
  brother: PrinterTypes.BROTHER,
};

// ค่าตั้งต้นของสไตล์บัตร (ต้องตรงกับ settings/app.js -> STYLE_DEFAULTS)
const STYLE_DEFAULTS = {
  logoWidth: 150,
  logoGap: 8,   // ระยะใต้โลโก้ (px)
  hrGap: 10,    // ระยะรอบเส้นประ (px)
  header:      { size: 16, bold: true,  show: true },
  roomName:    { size: 22, bold: true,  show: true },
  slotTime:    { size: 18, bold: false, show: true },
  queueLabel:  { text: 'หมายเลขคิว', size: 17, bold: false, show: true },
  queueNumber: { size: 72, bold: true },
  footer:      { size: 15, bold: false, show: true },
  dateTime:    { size: 14, show: true },
};
function readStyles(layout_json) {
  let raw = {};
  try { raw = (JSON.parse(layout_json || '{}') || {}).styles || {}; } catch (e) { raw = {}; }
  const m = (k) => Object.assign({}, STYLE_DEFAULTS[k], raw[k] || {});
  const num = (v, def) => (Number.isFinite(Number(v)) ? Number(v) : def); // ยอมรับค่า 0
  return {
    logoGap: num(raw.logoGap, STYLE_DEFAULTS.logoGap),
    hrGap: num(raw.hrGap, STYLE_DEFAULTS.hrGap),
    header: m('header'), roomName: m('roomName'), slotTime: m('slotTime'),
    queueLabel: m('queueLabel'), queueNumber: m('queueNumber'),
    footer: m('footer'), dateTime: m('dateTime'),
  };
}
// แปลงระยะ px -> จำนวนบรรทัดเว้นว่างของเครื่องพิมพ์ความร้อน (ค่า default = 0 บรรทัด คงพฤติกรรมเดิม)
function gapLines(px) { return Math.max(0, Math.round((Number(px) || 0) / 24)); }
// แปลงขนาด px -> ระดับขยายของเครื่องพิมพ์ความร้อน (0-3)
function sizeStep(px) {
  const n = Number(px) || 16;
  if (n >= 56) return 3;
  if (n >= 36) return 2;
  if (n >= 24) return 1;
  return 0;
}
// วันที่แบบไทย: '2026-05-05' -> '5 พ.ค. 2569'
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function thaiDate(d) {
  const m = String(d || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(d || '');
  return `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1] || m[2]} ${Number(m[1]) + 543}`;
}
// เวลา 'HH:mm' -> 'HH:mm น.'
function thaiTime(t) { return t ? `${t} น.` : ''; }

// payload: { queueNumber, roomName, roomCode, slotLabel, serviceDate, issuedAt, profile, copies }
async function printTicket(printerCfg, payload) {
  const printer = new ThermalPrinter({
    type: TYPE_MAP[(printerCfg.type || 'epson').toLowerCase()] || PrinterTypes.EPSON,
    interface: printerCfg.interface || 'printer:auto',
    characterSet: CharacterSet[printerCfg.characterSet] || CharacterSet.THAI || CharacterSet.PC437_USA,
    width: printerCfg.width || 48,
    removeSpecialCharacters: false,
    options: { timeout: 5000 },
  });

  const profile = payload.profile || {};
  const copies = Number(payload.copies || profile.copies || 1) || 1;
  const s = readStyles(profile.layout_json);

  // ข้อความเพิ่มเติมจากหน้า Print Face (layout_json)
  let extraLines = [];
  try {
    const lay = JSON.parse(profile.layout_json || '{}');
    if (Array.isArray(lay.lines)) extraLines = lay.lines;
  } catch (e) { /* ข้าม */ }
  const printExtra = (pos) => {
    extraLines
      .filter((l) => l && l.text && (l.pos === 'bottom' ? 'bottom' : 'top') === pos)
      .forEach((l) => {
        if (l.align === 'left') printer.alignLeft();
        else if (l.align === 'right') printer.alignRight();
        else printer.alignCenter();
        if (l.bold) printer.bold(true);
        if ((Number(l.size) || 16) >= 28) printer.setTextSize(1, 1);
        printer.println(l.text);
        printer.setTextSize(0, 0);
        printer.bold(false);
        printer.alignCenter();
      });
  };

  for (let i = 0; i < copies; i++) {
    printer.clear();
    printer.alignCenter();

    // โลโก้ (ถ้ามีไฟล์ในเครื่อง)
    if (profile.localLogoPath) {
      try { await printer.printImage(profile.localLogoPath); } catch (e) {}
      for (let g = 0; g < gapLines(s.logoGap); g++) printer.newLine();
    }

    // หัวบัตร (เลือกพิมพ์ได้)
    if (s.header.show !== false && profile.header_text) {
      const hs = sizeStep(s.header.size);
      if (hs) printer.setTextSize(hs, hs);
      if (s.header.bold) printer.bold(true);
      printer.println(profile.header_text);
      printer.bold(false); printer.setTextSize(0, 0);
    }
    printExtra('top');
    for (let g = 0; g < gapLines(s.hrGap); g++) printer.newLine();
    printer.drawLine();
    for (let g = 0; g < gapLines(s.hrGap); g++) printer.newLine();

    // ชื่อห้อง
    if (s.roomName.show !== false && payload.roomName) {
      const rs = sizeStep(s.roomName.size);
      if (rs) printer.setTextSize(rs, rs);
      if (s.roomName.bold) printer.bold(true);
      printer.println(String(payload.roomName));
      printer.bold(false); printer.setTextSize(0, 0);
    }
    // ช่วงเวลา
    if (s.slotTime.show !== false && payload.slotLabel) {
      const ss = sizeStep(s.slotTime.size);
      if (ss) printer.setTextSize(ss, ss);
      if (s.slotTime.bold) printer.bold(true);
      printer.println(String(payload.slotLabel));
      printer.bold(false); printer.setTextSize(0, 0);
    }
    // หัวข้อ "หมายเลขคิว"
    if (s.queueLabel.show !== false && (s.queueLabel.text || '').trim()) {
      printer.newLine();
      const qls = sizeStep(s.queueLabel.size);
      if (qls) printer.setTextSize(qls, qls);
      if (s.queueLabel.bold) printer.bold(true);
      printer.println(String(s.queueLabel.text));
      printer.bold(false); printer.setTextSize(0, 0);
    }

    // เลขคิวตัวใหญ่
    const qns = sizeStep(s.queueNumber.size);
    printer.setTextSize(qns, qns);
    if (s.queueNumber.bold !== false) printer.bold(true);
    printer.println(payload.queueNumber);
    printer.bold(false);
    printer.setTextSize(0, 0);
    printer.newLine();

    // ข้อความท้ายบัตร (รองรับหลายบรรทัด)
    if (s.footer.show !== false && profile.footer_text) {
      const fs = sizeStep(s.footer.size);
      if (fs) printer.setTextSize(fs, fs);
      if (s.footer.bold) printer.bold(true);
      String(profile.footer_text).split('\n').filter((x) => x.trim()).forEach((line) => printer.println(line));
      printer.bold(false); printer.setTextSize(0, 0);
    }
    printExtra('bottom');

    // วันที่ (ซ้าย) / เวลา (ขวา) — รูปแบบไทย
    if (s.dateTime.show !== false) {
      for (let g = 0; g < gapLines(s.hrGap); g++) printer.newLine();
      printer.drawLine();
      for (let g = 0; g < gapLines(s.hrGap); g++) printer.newLine();
      const dStr = thaiDate(payload.serviceDate);
      const tStr = thaiTime(formatTime(payload.issuedAt));
      try { printer.leftRight(dStr, tStr); }
      catch (e) { printer.println(`${dStr}   ${tStr}`); }
    }

    if (profile.show_qr) {
      try { printer.printQR(payload.queueNumber, { cellSize: 6 }); } catch (e) {}
    }

    printer.newLine();
    printer.cut();
  }

  const ok = await printer.execute();
  return ok;
}

function formatTime(iso) {
  if (!iso) return '';
  // iso 'YYYY-MM-DD HH:mm:ss'
  const t = String(iso).split(' ')[1] || '';
  return t.slice(0, 5);
}

module.exports = { printTicket, formatTime };
