// ===== Kiosk renderer (Electron) — SiRO design + เลือกช่วงเวลา =====
let SERVER = 'http://localhost:8888';
let rooms = [];
let currentRoom = null;
let idleTimeout = 30;
let printConfig = { copies: 1, profile: null };
let countdownTimer = null, remaining = 30;

const $ = (s) => document.querySelector(s);
const pad2 = (n) => String(n).padStart(2, '0');
const minLabel = (min) => `${Math.floor(min / 60)}.${pad2(min % 60)}`;
const slotText = (s) => `${minLabel(s.start_min)} - ${minLabel(s.end_min)} น.`;

async function api(path, opts = {}) {
  const res = await fetch(SERVER + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) { let m = res.statusText; try { m = (await res.json()).error; } catch (e) {} throw new Error(m); }
  return res.json();
}

function showOffline(v) { $('#offline').classList.toggle('hidden', !v); }

async function loadConfig() {
  try { const c = await window.kioskAPI.getConfig(); if (c && c.serverUrl) SERVER = c.serverUrl; } catch (e) {}
  try {
    const cfg = await api('/api/kiosk/config');
    idleTimeout = cfg.idleTimeout || 30;
    printConfig.copies = cfg.printCopies || 1;
    printConfig.profile = cfg.profile || null;
    window.kioskAPI.applyServerConfig({ autostart: cfg.autostart, shutdownTime: cfg.shutdownTime });
    showOffline(false);
  } catch (e) { showOffline(true); }
}

async function loadRooms() {
  try { rooms = await api('/api/rooms'); showOffline(false); }
  catch (e) { showOffline(true); rooms = []; }
  if (DEMO_FULL && !rooms.length) rooms = [
    { id: 'L6', name: 'เครื่องฉายรังสี L6', color: '#1aa54e' },
    { id: 'L8', name: 'เครื่องฉายรังสี L8', color: '#1c50b5' },
  ];
  const box = $('#kRooms'); box.innerHTML = '';
  rooms.forEach((r) => {
    const b = document.createElement('button');
    b.className = 'room-btn';
    b.style.background = r.color || '#1c50b5';
    b.textContent = r.name;
    b.onclick = () => openRoom(r);
    box.append(b);
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

// ===== โหมดจำลองคิวเต็มทุกช่อง (ดูเลย์เอาต์) — ตั้ง false เมื่อใช้งานจริง =====
const DEMO_FULL = true;
function demoFullSlots() {
  const mk = (a, b, c, d) => ({ active: 1, start_min: a * 60 + b, end_min: c * 60 + d });
  return [
    mk(8, 0, 9, 0), mk(9, 0, 10, 0), mk(10, 0, 11, 0), mk(11, 0, 12, 0),       // ในเวลา เช้า
    mk(12, 0, 13, 0), mk(13, 0, 14, 0), mk(14, 0, 15, 0), mk(15, 0, 16, 0),    // ในเวลา บ่าย
    mk(16, 0, 17, 0), mk(17, 0, 18, 0), mk(18, 0, 19, 0), mk(19, 0, 20, 0),    // คลินิกนอกเวลา
  ];
}

async function renderSlots(room) {
  let slots = [];
  try { slots = await api('/api/slots?roomId=' + room.id); } catch (e) {}
  if (DEMO_FULL) slots = demoFullSlots();
  slots = slots.filter((s) => s.active).sort((a, b) => a.start_min - b.start_min);
  const morning = slots.filter((s) => s.start_min < 12 * 60);
  const afternoon = slots.filter((s) => s.start_min >= 12 * 60 && s.start_min < 16 * 60);
  const after = slots.filter((s) => s.start_min >= 16 * 60);
  const fill = (box, list) => {
    box.innerHTML = '';
    if (!list.length) { box.innerHTML = '<div style="color:#9aa7bd;text-align:center;padding:8px">—</div>'; return; }
    list.forEach((s) => {
      const b = document.createElement('button');
      b.className = 'slot-btn'; b.textContent = slotText(s);
      b.onclick = () => takeQueue(s);
      box.append(b);
    });
  };
  fill($('#slotMorning'), morning);
  fill($('#slotAfternoon'), afternoon);
  fill($('#slotAfter'), after);
}

function gotoMenu() { currentRoom = null; stopIdle(); showScreen('menu'); }
function startIdle() { stopIdle(); remaining = idleTimeout; countdownTimer = setInterval(() => { remaining -= 1; if (remaining <= 0) gotoMenu(); }, 1000); }
function stopIdle() { clearInterval(countdownTimer); }
$('#roomScreen').addEventListener('click', () => { if (currentRoom) startIdle(); });
$('#kBack').onclick = gotoMenu;

async function takeQueue(slot) {
  if (!currentRoom) return;
  stopIdle();
  $('#ptxt').textContent = 'กำลังพิมพ์บัตรคิว...';
  $('#pNum').textContent = '';
  $('#printing').classList.remove('hidden');
  try {
    const q = await api('/api/queues', { method: 'POST', body: { roomId: currentRoom.id, slotCode: slot.slot_code } });
    $('#pNum').textContent = q.queueNumber;
    await loadConfig(); // ดึงแบบบัตร/จำนวนสำเนาล่าสุดก่อนพิมพ์ทุกครั้ง — ไม่ต้องรอ refresh
    const prof = printConfig.profile ? { ...printConfig.profile } : {};
    if (prof.logo_path) prof.logoUrl = SERVER + prof.logo_path; // ให้ PDF โหลดโลโก้จาก server ได้
    const result = await window.kioskAPI.printTicket({ ...q, copies: printConfig.copies, profile: prof });
    if (result.ok) $('#ptxt').textContent = result.mode === 'pdf' ? 'บันทึก PDF แล้ว' : 'พิมพ์บัตรคิวแล้ว';
    else $('#ptxt').textContent = result.mode === 'pdf' ? 'บันทึก PDF ไม่สำเร็จ' : 'พิมพ์ไม่สำเร็จ (ตรวจเครื่องพิมพ์)';
    setTimeout(() => { $('#printing').classList.add('hidden'); gotoMenu(); }, result.ok ? 1800 : 3000);
  } catch (e) {
    $('#ptxt').textContent = e.message === 'quota_full' ? 'ช่วงเวลานี้คิวเต็มแล้ว' : 'ระบบไม่พร้อม กรุณาลองใหม่';
    setTimeout(() => { $('#printing').classList.add('hidden'); startIdle(); }, 2500);
  }
}

// ===== หน้าตั้งค่าการพิมพ์ (Ctrl+Shift+P) =====
const ap = {
  panel: $('#adminPanel'), mode: $('#apMode'), printer: $('#apPrinter'),
  type: $('#apType'), width: $('#apWidth'), iface: $('#apInterface'),
  pdfDir: $('#apPdfDir'), msg: $('#apMsg'),
  thermalBox: $('#apThermalBox'), pdfBox: $('#apPdfBox'),
};

function apSetMsg(text, isErr) { ap.msg.textContent = text || ''; ap.msg.classList.toggle('err', !!isErr); }
function apSyncMode() {
  const pdf = ap.mode.value === 'pdf';
  ap.pdfBox.classList.toggle('hidden', !pdf);
  ap.thermalBox.classList.toggle('hidden', pdf);
}
ap.mode.onchange = apSyncMode;
ap.printer.onchange = () => { if (ap.printer.value) ap.iface.value = ap.printer.value; };

async function openAdmin() {
  stopIdle();
  apSetMsg('');
  let cfg = {};
  try { cfg = await window.kioskAPI.getPrinterConfig() || {}; } catch (e) {}
  ap.mode.value = cfg.mode || 'thermal';
  ap.type.value = cfg.type || 'epson';
  ap.width.value = cfg.width || 48;
  ap.iface.value = cfg.interface || '';
  ap.pdfDir.value = cfg.pdfDir || 'tickets-pdf';
  apSyncMode();
  ap.printer.innerHTML = '<option value="">— ไม่ระบุ —</option>';
  try {
    const printers = await window.kioskAPI.listPrinters();
    printers.forEach((p) => {
      const o = document.createElement('option');
      o.value = 'printer:' + p.name;
      o.textContent = (p.displayName || p.name) + (p.isDefault ? ' (ค่าเริ่มต้น)' : '');
      if (cfg.interface === o.value) o.selected = true;
      ap.printer.append(o);
    });
  } catch (e) {}
  ap.panel.classList.remove('hidden');
}
function closeAdmin() { ap.panel.classList.add('hidden'); }

$('#apSave').onclick = async () => {
  const patch = {
    mode: ap.mode.value,
    type: ap.type.value,
    width: Number(ap.width.value) || 48,
    interface: ap.iface.value.trim(),
    pdfDir: ap.pdfDir.value.trim() || 'tickets-pdf',
  };
  try {
    const r = await window.kioskAPI.savePrinterConfig(patch);
    apSetMsg(r.ok ? 'บันทึกแล้ว ✓' : ('บันทึกไม่สำเร็จ: ' + (r.error || '')), !r.ok);
  } catch (e) { apSetMsg('บันทึกไม่สำเร็จ: ' + e.message, true); }
};

$('#apTest').onclick = async () => {
  apSetMsg('กำลังทดสอบ...');
  const sample = {
    queueNumber: 'TEST01', roomName: 'ทดสอบระบบ', roomCode: '', slotLabel: '08.00 - 09.00 น.',
    serviceDate: '2026-05-31', issuedAt: '2026-05-31 09:00:00', copies: 1,
    profile: { header_text: 'ทดสอบการพิมพ์บัตรคิว', footer_text: 'ตัวอย่างบัตรคิว', show_qr: 1 },
  };
  try {
    const r = await window.kioskAPI.printTicket(sample);
    if (r.ok) apSetMsg(r.mode === 'pdf' ? ('บันทึก PDF แล้ว: ' + (r.file || '')) : 'ส่งพิมพ์แล้ว ✓');
    else apSetMsg('ไม่สำเร็จ: ' + (r.error || ''), true);
  } catch (e) { apSetMsg('ไม่สำเร็จ: ' + e.message, true); }
};

$('#apOpenPdf').onclick = async () => {
  try {
    const r = await window.kioskAPI.openPdfFolder();
    if (!r.ok) apSetMsg('เปิดโฟลเดอร์ไม่ได้: ' + (r.error || ''), true);
  } catch (e) { apSetMsg('เปิดโฟลเดอร์ไม่ได้: ' + e.message, true); }
};

$('#apClose').onclick = closeAdmin;

// ===== หน้าตั้งค่าระบบ (แตะมุมซ้ายบน 5 ครั้ง) — IP server / เครื่องพิมพ์ / เวลาปิดเครื่อง =====
const sys = {
  panel: $('#sysPanel'), server: $('#sysServer'), printer: $('#sysPrinter'),
  shutdown: $('#sysShutdown'), msg: $('#sysMsg'),
};
function sysSetMsg(text, isErr) { sys.msg.textContent = text || ''; sys.msg.classList.toggle('err', !!isErr); }

async function openSys() {
  stopIdle();
  sysSetMsg('');
  let cfg = {};
  try { cfg = await window.kioskAPI.getAppConfig() || {}; } catch (e) {}
  sys.server.value = cfg.serverUrl || SERVER;
  sys.shutdown.value = cfg.shutdownTime || '';
  // เติม dropdown เครื่องพิมพ์: ตัวเลือก PDF + เครื่องพิมพ์ใน Windows
  const curIface = (cfg.printer && cfg.printer.interface) || '';
  const curMode = (cfg.printer && cfg.printer.mode) || '';
  sys.printer.innerHTML = '';
  const pdfOpt = document.createElement('option');
  pdfOpt.value = 'pdf';
  pdfOpt.textContent = 'บันทึกเป็น PDF (ทดสอบ / ยังไม่มีเครื่องพิมพ์)';
  if (curMode === 'pdf') pdfOpt.selected = true;
  sys.printer.append(pdfOpt);
  try {
    const printers = await window.kioskAPI.listPrinters();
    printers.forEach((p) => {
      const o = document.createElement('option');
      o.value = 'printer:' + p.name;
      o.textContent = (p.displayName || p.name) + (p.isDefault ? ' (ค่าเริ่มต้น)' : '');
      if (curMode !== 'pdf' && curIface === o.value) o.selected = true;
      sys.printer.append(o);
    });
  } catch (e) {}
  sys.panel.classList.remove('hidden');
}
function closeSys() { sys.panel.classList.add('hidden'); startIdle(); }

$('#sysSave').onclick = async () => {
  sysSetMsg('กำลังบันทึก...');
  const val = sys.printer.value;
  const printer = val === 'pdf' ? { mode: 'pdf' } : { mode: 'thermal', interface: val };
  const patch = { serverUrl: sys.server.value.trim(), shutdownTime: sys.shutdown.value.trim(), printer };
  const oldServer = SERVER;
  try {
    const r = await window.kioskAPI.saveAppConfig(patch);
    if (!r.ok) { sysSetMsg('บันทึกไม่สำเร็จ: ' + (r.error || ''), true); return; }
    // ถ้าเปลี่ยน IP server -> โหลดหน้าใหม่เพื่อใช้ค่าใหม่ทั้งหมด
    if (patch.serverUrl && patch.serverUrl !== oldServer) {
      sysSetMsg('เปลี่ยนเซิร์ฟเวอร์แล้ว — กำลังโหลดใหม่...');
      setTimeout(() => location.reload(), 800);
      return;
    }
    sysSetMsg('บันทึกแล้ว ✓');
    await loadConfig();
    if (!currentRoom) await loadRooms();
    setTimeout(closeSys, 700);
  } catch (e) { sysSetMsg('บันทึกไม่สำเร็จ: ' + e.message, true); }
};

$('#sysTest').onclick = async () => {
  sysSetMsg('กำลังทดสอบพิมพ์... (ใช้ค่าที่บันทึกล่าสุด)');
  const sample = {
    queueNumber: 'TEST01', roomName: 'ทดสอบระบบ', roomCode: '', slotLabel: '08.00 - 09.00 น.',
    serviceDate: '2026-05-31', issuedAt: '2026-05-31 09:00:00', copies: 1,
    profile: { header_text: 'ทดสอบการพิมพ์บัตรคิว', footer_text: 'ตัวอย่างบัตรคิว', show_qr: 1 },
  };
  try {
    const r = await window.kioskAPI.printTicket(sample);
    if (r.ok) sysSetMsg(r.mode === 'pdf' ? ('บันทึก PDF แล้ว ✓ ' + (r.file || '')) : 'ส่งพิมพ์แล้ว ✓');
    else sysSetMsg('ไม่สำเร็จ: ' + (r.error || ''), true);
  } catch (e) { sysSetMsg('ไม่สำเร็จ: ' + e.message, true); }
};

$('#sysClose').onclick = closeSys;

// แตะมุมซ้ายบน 5 ครั้งภายใน 2 วินาที -> เปิดหน้าตั้งค่าระบบ
(function cornerTrigger() {
  const zone = $('#cornerTap');
  if (!zone) return;
  let count = 0, timer = null;
  const reset = () => { count = 0; if (timer) { clearTimeout(timer); timer = null; } };
  const hit = () => {
    count += 1;
    if (timer) clearTimeout(timer);
    timer = setTimeout(reset, 2000);
    if (count >= 5) { reset(); if (sys.panel.classList.contains('hidden')) openSys(); }
  };
  zone.addEventListener('click', hit);
  zone.addEventListener('touchstart', (e) => { e.preventDefault(); hit(); }, { passive: false });
})();

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
    e.preventDefault();
    if (ap.panel.classList.contains('hidden')) openAdmin(); else closeAdmin();
  }
});

// ===== realtime: ฟัง settings:changed จาก server -> reload config ทันทีที่กดบันทึก =====
function setupRealtime() {
  const start = () => {
    try {
      const socket = window.io(SERVER, { transports: ['websocket', 'polling'] });
      socket.on('connect', () => socket.emit('kiosk:subscribe'));
      socket.on('settings:changed', () => loadConfig());   // แบบบัตร/สำเนา/idle เปลี่ยนทันที
      socket.on('queue:reset', () => { if (!currentRoom) loadRooms(); });
    } catch (e) { /* เงียบไว้ — ยังมี polling + refetch ก่อนพิมพ์ */ }
  };
  if (window.io) return start();
  const s = document.createElement('script');
  s.src = SERVER + '/socket.io/socket.io.js';
  s.onload = start;
  s.onerror = () => { /* โหลด client ไม่ได้ — fallback เป็น polling 60 วิ + refetch ก่อนพิมพ์ */ };
  document.head.append(s);
}

(async function init() {
  await loadConfig();
  await loadRooms();
  showScreen('menu');
  setupRealtime();
  setInterval(async () => { await loadConfig(); if (!currentRoom) await loadRooms(); }, 60000);
})();
