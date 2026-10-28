'use strict';
const path = require('path');
const fs = require('fs');
const { BrowserWindow } = require('electron');
const QRCode = require('qrcode');
const { formatTime } = require('./escpos');

// โฟลเดอร์ฟอนต์ไทย Sarabun ที่มีอยู่แล้วใน renderer
const FONT_DIR = path.join(__dirname, '..', 'renderer', 'fonts');
function fontUrl(file) {
  return 'file:///' + path.join(FONT_DIR, file).replace(/\\/g, '/');
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// แปลง issued_at 'YYYY-MM-DD HH:mm:ss' -> 'YYYYMMDD-HHmmss' สำหรับชื่อไฟล์
function stampForFilename(iso) {
  const s = String(iso || '').trim();
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return s.replace(/[^\d]/g, '').slice(0, 14) || 'ticket';
  return `${m[1]}${m[2]}${m[3]}-${m[4]}${m[5]}${m[6]}`;
}

function safeName(s) {
  return String(s || 'ticket').replace(/[\\/:*?"<>|]/g, '_');
}

// ค่าตั้งต้นของสไตล์บัตร (ต้องตรงกับ settings/app.js -> STYLE_DEFAULTS)
const STYLE_DEFAULTS = {
  logoWidth: 150,
  logoGap: 8,   // ระยะใต้โลโก้ (px)
  hrGap: 10,    // ระยะรอบเส้นประ (px)
  lineGap: 2,   // ระยะห่างระหว่างบรรทัดข้อความ (px)
  header:      { size: 16, bold: true,  show: true },
  roomName:    { size: 22, bold: true,  show: true },
  slotTime:    { size: 18, bold: false, show: true },
  queueLabel:  { text: 'หมายเลขคิว', size: 17, bold: false, show: true },
  queueNumber: { size: 72, bold: true },
  footer:      { size: 15, bold: false, show: true },
  dateTime:    { size: 14, show: true },
};
function readLayout(layout_json) {
  let o = {};
  try { o = JSON.parse(layout_json || '{}') || {}; } catch (e) { o = {}; }
  const raw = o.styles || {};
  const m = (k) => Object.assign({}, STYLE_DEFAULTS[k], raw[k] || {});
  const num = (v, def) => (Number.isFinite(Number(v)) ? Number(v) : def); // ยอมรับค่า 0
  return {
    lines: Array.isArray(o.lines) ? o.lines : [],
    styles: {
      logoWidth: Number(raw.logoWidth) || STYLE_DEFAULTS.logoWidth,
      logoGap: num(raw.logoGap, STYLE_DEFAULTS.logoGap),
      hrGap: num(raw.hrGap, STYLE_DEFAULTS.hrGap),
      lineGap: num(raw.lineGap, STYLE_DEFAULTS.lineGap),
      header: m('header'), roomName: m('roomName'), slotTime: m('slotTime'),
      queueLabel: m('queueLabel'), queueNumber: m('queueNumber'),
      footer: m('footer'), dateTime: m('dateTime'),
    },
  };
}
// วันที่แบบไทย: '2026-05-05' -> '5 พ.ค. 2569'
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function thaiDate(d) {
  const m = String(d || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return esc(d || '');
  return `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1] || m[2]} ${Number(m[1]) + 543}`;
}
// เวลา 'HH:mm' -> 'HH:mm น.'
function thaiTime(t) { return t ? `${esc(t)} น.` : ''; }
function styleAttr(o) { return `font-size:${Number(o.size) || 16}px;font-weight:${o.bold ? 700 : 400};`; }

// สร้าง HTML ของบัตรคิว (ขนาด ~80mm) ให้ตรง layout กับ escpos และพรีวิวในหน้า Print Face
async function buildTicketHtml(payload) {
  const profile = payload.profile || {};
  const { lines: extraLines, styles: s } = readLayout(profile.layout_json);

  let qrTag = '';
  if (profile.show_qr) {
    try {
      const dataUrl = await QRCode.toDataURL(String(payload.queueNumber || ''), { margin: 1, width: 180 });
      qrTag = `<img class="qr" src="${dataUrl}" alt="qr" />`;
    } catch (e) { /* ข้าม QR ถ้าสร้างไม่ได้ */ }
  }
  const logoTag = profile.logoUrl
    ? `<img class="logo" style="max-width:${Number(s.logoWidth) || 150}px" src="${esc(profile.logoUrl)}" alt="logo" />`
    : '';
  const header = (s.header.show !== false && profile.header_text)
    ? `<div class="header" style="${styleAttr(s.header)}">${esc(profile.header_text)}</div>` : '';
  const roomLine = (s.roomName.show !== false)
    ? `<div class="room" style="${styleAttr(s.roomName)}">${esc(payload.roomName || '')}</div>` : '';
  const slotLine = (s.slotTime.show !== false && payload.slotLabel)
    ? `<div class="slot" style="${styleAttr(s.slotTime)}">${esc(payload.slotLabel)}</div>` : '';
  const qLabel = (s.queueLabel.show !== false && (s.queueLabel.text || '').trim())
    ? `<div class="qlabel" style="${styleAttr(s.queueLabel)}">${esc(s.queueLabel.text)}</div>` : '';
  const footer = (s.footer.show !== false)
    ? (profile.footer_text || '').split('\n').filter((x) => x.trim())
      .map((line) => `<div class="footer" style="${styleAttr(s.footer)}">${esc(line)}</div>`).join('')
    : '';
  const dateTimeRow = (s.dateTime.show !== false)
    ? `<hr class="hr" /><div class="datetime" style="font-size:${Number(s.dateTime.size) || 14}px">`
      + `<span>${thaiDate(payload.serviceDate)}</span><span>${thaiTime(formatTime(payload.issuedAt))}</span></div>`
    : '';

  const renderExtra = (pos) => extraLines
    .filter((l) => (l && l.text && (l.pos === 'bottom' ? 'bottom' : 'top') === pos))
    .map((l) => `<div style="font-size:${Number(l.size) || 16}px;font-weight:${l.bold ? 700 : 400};text-align:${l.align || 'center'};line-height:1.3;margin:${Number(s.lineGap)}px 0;">${esc(l.text)}</div>`)
    .join('');

  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8" />
<style>
  @font-face{ font-family:'Sarabun'; font-weight:400; src:url('${fontUrl('Sarabun-Regular.ttf')}') format('truetype'); }
  @font-face{ font-family:'Sarabun'; font-weight:600; src:url('${fontUrl('Sarabun-SemiBold.ttf')}') format('truetype'); }
  @font-face{ font-family:'Sarabun'; font-weight:700; src:url('${fontUrl('Sarabun-Bold.ttf')}') format('truetype'); }
  *{ margin:0; padding:0; box-sizing:border-box; }
  html,body{ background:#fff; }
  body{ width:302px; font-family:'Sarabun','Tahoma',sans-serif; color:#000; padding:16px 14px 14px; text-align:center; }
  .logo{ max-width:160px; max-height:130px; object-fit:contain; margin:0 auto ${Number(s.logoGap)}px; display:block; }
  .header{ line-height:1.25; margin-bottom:6px; }
  .hr{ border:0; border-top:1px dashed #000; margin:${Number(s.hrGap)}px 0; }
  .room{ line-height:1.25; margin-top:${Number(s.lineGap)}px; }
  .slot{ line-height:1.3; margin-top:${Number(s.lineGap)}px; }
  .qlabel{ line-height:1.3; margin-top:14px; }
  .qnum{ line-height:1.0; letter-spacing:2px; margin:6px 0 14px; }
  .footer{ line-height:1.35; margin-top:${Number(s.lineGap)}px; }
  .datetime{ display:flex; justify-content:space-between; align-items:center; line-height:1.4; }
  .qr{ width:140px; height:140px; margin:10px auto 0; display:block; }
</style></head><body>
  ${logoTag}
  ${header}
  ${renderExtra('top')}
  <hr class="hr" />
  ${roomLine}
  ${slotLine}
  ${qLabel}
  <div class="qnum" style="${styleAttr(s.queueNumber)}">${esc(payload.queueNumber || '')}</div>
  ${footer}
  ${renderExtra('bottom')}
  ${dateTimeRow}
  ${qrTag}
</body></html>`;
}

// pdfCfg: { pdfDir }  (pdfDir relative ต่อโฟลเดอร์ kiosk หรือ absolute)
async function saveTicketPdf(pdfCfg, payload) {
  const html = await buildTicketHtml(payload);

  const win = new BrowserWindow({
    show: false,
    width: 320,
    height: 1000,
    webPreferences: { offscreen: true, sandbox: false },
  });

  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    // เผื่อเวลาให้ฟอนต์/รูป/โลโก้โหลดเสร็จ
    await new Promise((r) => setTimeout(r, 350));

    // วัดความสูงเนื้อหาจริงแล้วตั้งขนาดหน้าให้พอดี (กว้าง 80mm)
    let contentPx = 800;
    try {
      contentPx = await win.webContents.executeJavaScript(
        'Math.ceil(document.body.getBoundingClientRect().height)'
      );
    } catch (e) { /* ใช้ค่า default */ }
    const MICRON_PER_PX = 25400 / 96; // 96dpi
    const widthMicron = 80 * 1000;    // 80mm
    const heightMicron = Math.max(Math.round((Number(contentPx) || 800) * MICRON_PER_PX), 60 * 1000);

    const data = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: { width: widthMicron, height: heightMicron },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });

    const baseDir = path.join(__dirname, '..');
    const dir = path.isAbsolute(pdfCfg.pdfDir || '')
      ? pdfCfg.pdfDir
      : path.join(baseDir, pdfCfg.pdfDir || 'tickets-pdf');
    fs.mkdirSync(dir, { recursive: true });

    const filename = `${safeName(payload.queueNumber)}_${stampForFilename(payload.issuedAt)}.pdf`;
    const file = path.join(dir, filename);
    fs.writeFileSync(file, data);
    return { ok: true, file };
  } finally {
    win.destroy();
  }
}

module.exports = { saveTicketPdf, buildTicketHtml };
