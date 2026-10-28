// ===== Kiosk (browser version) — SiRO design + เลือกช่วงเวลา =====
// ปกติ = โหมดทดสอบ (ออกคิวจริง ไม่พิมพ์)
// ?print=1 = ตู้จริงแบบไม่ต้องลงโปรแกรม: พิมพ์บัตรผ่านเบราว์เซอร์ (เปิดด้วย ops\kiosk-edge.bat ที่ใส่ --kiosk-printing
//            → ออกเครื่องพิมพ์ default ของ Windows ทันทีไม่มีหน้าต่างถาม) · Ctrl+Shift+P = พิมพ์บัตรทดสอบ
// ?sample=1 = แสดงบัตรตัวอย่างบนจอ (ไว้ดูหน้าตาบัตร)
let rooms = [];
let currentRoom = null;
let idleTimeout = 30;
let countdownTimer = null, remaining = 30;
const params = new URLSearchParams(location.search);
const PRINT_MODE = params.get('print') === '1';
let printConfig = { copies: 1, profile: null };

const pad2 = (n) => String(n).padStart(2, '0');
const minLabel = (min) => `${Math.floor(min / 60)}.${pad2(min % 60)}`;
const slotText = (s) => `${minLabel(s.start_min)} - ${minLabel(s.end_min)} น.`;

async function loadConfig() {
  try {
    const cfg = await api('/api/kiosk/config');
    idleTimeout = cfg.idleTimeout || 30;
    printConfig.copies = cfg.printCopies || 1;
    printConfig.profile = cfg.profile || null;
  } catch (e) {}
}

// ---------- บัตรคิว (layout เดียวกับ kiosk/printer/pdf.js ของโปรแกรม Electron) ----------
// ค่าตั้งต้นของสไตล์บัตร (ต้องตรงกับ settings/app.js -> STYLE_DEFAULTS)
const STYLE_DEFAULTS = {
  logoWidth: 150, logoGap: 8, hrGap: 10, lineGap: 2,
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
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function thaiDate(d) {
  const m = String(d || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return esc(d || '');
  return `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1] || m[2]} ${Number(m[1]) + 543}`;
}
const issuedTime = (iso) => (String(iso || '').split(' ')[1] || '').slice(0, 5);
const styleAttr = (o) => `font-size:${Number(o.size) || 16}px;font-weight:${o.bold ? 700 : 400};`;

// q: { queueNumber, roomName, slotLabel, serviceDate, issuedAt }
function ticketHtml(q, profile) {
  profile = profile || {};
  const { lines, styles: s } = readLayout(profile.layout_json);
  const extra = (pos) => lines
    .filter((l) => l && l.text && (l.pos === 'bottom' ? 'bottom' : 'top') === pos)
    .map((l) => `<div style="font-size:${Number(l.size) || 16}px;font-weight:${l.bold ? 700 : 400};text-align:${esc(l.align || 'center')};line-height:1.3;margin:${Number(s.lineGap)}px 0;">${esc(l.text)}</div>`)
    .join('');
  const hr = `<hr class="t-hr" style="margin:${Number(s.hrGap)}px 0" />`;
  const gap = `margin-top:${Number(s.lineGap)}px;`;
  return [
    profile.logo_path ? `<img class="t-logo" style="max-width:${Number(s.logoWidth) || 150}px;margin-bottom:${Number(s.logoGap)}px" src="${esc(profile.logo_path)}" alt="" />` : '',
    s.header.show !== false && profile.header_text ? `<div class="t-header" style="${styleAttr(s.header)}">${esc(profile.header_text)}</div>` : '',
    extra('top'),
    hr,
    s.roomName.show !== false ? `<div class="t-room" style="${styleAttr(s.roomName)}${gap}">${esc(q.roomName || '')}</div>` : '',
    s.slotTime.show !== false && q.slotLabel ? `<div class="t-slot" style="${styleAttr(s.slotTime)}${gap}">${esc(q.slotLabel)}</div>` : '',
    s.queueLabel.show !== false && (s.queueLabel.text || '').trim() ? `<div class="t-qlabel" style="${styleAttr(s.queueLabel)}">${esc(s.queueLabel.text)}</div>` : '',
    `<div class="t-qnum" style="${styleAttr(s.queueNumber)}">${esc(q.queueNumber || '')}</div>`,
    s.footer.show !== false ? (profile.footer_text || '').split('\n').filter((x) => x.trim())
      .map((line) => `<div class="t-footer" style="${styleAttr(s.footer)}${gap}">${esc(line)}</div>`).join('') : '',
    extra('bottom'),
    s.dateTime.show !== false ? `${hr}<div class="t-datetime" style="font-size:${Number(s.dateTime.size) || 14}px">`
      + `<span>${thaiDate(q.serviceDate)}</span><span>${issuedTime(q.issuedAt) ? esc(issuedTime(q.issuedAt)) + ' น.' : ''}</span></div>` : '',
    profile.show_qr ? `<img class="t-qr" src="/api/kiosk/qr?text=${encodeURIComponent(q.queueNumber || '')}" alt="" />` : '',
  ].join('');
}

// ใส่บัตร (ตามจำนวนสำเนา) ลง #ticketPrint แล้วรอรูป/ฟอนต์ให้ครบก่อนพิมพ์ — ไม่งั้นโลโก้หาย
async function renderTicket(q) {
  const box = $('#ticketPrint');
  const copies = Math.max(1, Number(printConfig.copies) || 1);
  box.innerHTML = Array.from({ length: copies }, () => `<div class="ticket">${ticketHtml(q, printConfig.profile)}</div>`).join('');
  await Promise.all([...box.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
}

async function printTicket(q) {
  await renderTicket(q);
  window.print();   // --kiosk-printing: ส่งเข้าเครื่องพิมพ์ default ทันที ไม่มีหน้าต่าง
}

const sampleQueue = () => {
  const now = new Date();
  const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  return { queueNumber: 'L6001', roomName: (rooms[0] && rooms[0].name) || 'ทดสอบ', slotLabel: '8.00 - 9.00 น.', serviceDate: date, issuedAt: `${date} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:00` };
};

async function loadRooms() {
  rooms = await api('/api/rooms');
  const box = $('#kRooms'); box.innerHTML = '';
  rooms.forEach((r) => {
    box.append(el('button', { class: 'room-btn', style: `background:${r.color || '#1c50b5'}`, onclick: () => openRoom(r) }, r.name));
  });
}

function showScreen(which) {
  $('#menuScreen').classList.toggle('hidden', which !== 'menu');
  $('#roomScreen').classList.toggle('hidden', which !== 'room');
}

async function openRoom(room) {
  currentRoom = room;
  document.documentElement.style.setProperty('--room', room.color || '#1c50b5');
  $('#kRoomTitle').textContent = room.name;
  $('#kRoomTitle').style.color = room.color || '#1c50b5';
  await renderSlots(room);
  showScreen('room');
  startIdle();
}

async function renderSlots(room) {
  let slots = [];
  try { slots = await api('/api/slots?roomId=' + room.id); } catch (e) {}
  slots = slots.filter((s) => s.active).sort((a, b) => a.start_min - b.start_min);
  const morning = slots.filter((s) => s.start_min < 12 * 60);
  const afternoon = slots.filter((s) => s.start_min >= 12 * 60 && s.start_min < 16 * 60);
  const after = slots.filter((s) => s.start_min >= 16 * 60);

  const fill = (box, list) => {
    box.innerHTML = '';
    list.forEach((s) => box.append(el('button', { class: 'slot-btn', onclick: () => takeQueue(s) }, slotText(s))));
    if (!list.length) box.append(el('div', { style: 'color:#9aa7bd;text-align:center;padding:8px' }, '—'));
  };
  fill($('#slotMorning'), morning);
  fill($('#slotAfternoon'), afternoon);
  fill($('#slotAfter'), after);
}

function gotoMenu() { currentRoom = null; stopIdle(); showScreen('menu'); }

// ---------- idle auto-return ----------
function startIdle() {
  stopIdle(); remaining = idleTimeout;
  countdownTimer = setInterval(() => { remaining -= 1; if (remaining <= 0) gotoMenu(); }, 1000);
}
function stopIdle() { clearInterval(countdownTimer); }
$('#roomScreen').addEventListener('click', () => { if (currentRoom) startIdle(); });
$('#kBack').onclick = gotoMenu;

// ---------- take queue (ตามช่วงเวลาที่เลือก) ----------
async function takeQueue(slot) {
  if (!currentRoom) return;
  stopIdle();
  $('#ptxt').textContent = 'กำลังพิมพ์บัตรคิว...';
  $('#pNum').textContent = '';
  $('#printing').classList.remove('hidden');
  try {
    const q = await api('/api/queues', { method: 'POST', body: { roomId: currentRoom.id, slotCode: slot.slot_code } });
    $('#pNum').textContent = q.queueNumber;
    if (PRINT_MODE) {
      await loadConfig(); // ดึงแบบบัตร/จำนวนสำเนาล่าสุดก่อนพิมพ์ทุกครั้ง — ไม่ต้องรอ refresh
      await printTicket(q);
      $('#ptxt').textContent = 'รับบัตรคิวด้านล่าง';
    }
    setTimeout(() => { $('#printing').classList.add('hidden'); gotoMenu(); }, 2200);
  } catch (e) {
    $('#ptxt').textContent = e.message === 'quota_full' ? 'ช่วงเวลานี้คิวเต็มแล้ว' : 'ระบบไม่พร้อม';
    setTimeout(() => { $('#printing').classList.add('hidden'); $('#ptxt').textContent = 'กำลังพิมพ์บัตรคิว...'; startIdle(); }, 2200);
  }
}

// Ctrl+Shift+P = พิมพ์บัตรทดสอบ (ไม่ออกคิวจริง) — ใช้ตอนตั้งเครื่องพิมพ์
document.addEventListener('keydown', (e) => {
  if (PRINT_MODE && e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    loadConfig().then(() => printTicket(sampleQueue()));
  }
});

(async function init() {
  await loadConfig();
  await loadRooms();
  showScreen('menu');
  document.body.classList.toggle('print-mode', PRINT_MODE);
  if (params.get('sample') === '1') {
    await renderTicket(sampleQueue());
    document.body.classList.add('show-ticket');
  }
})();
