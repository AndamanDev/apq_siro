// ===== Display app orchestrator =====
let rooms = [];
let recentCount = 4;
const panelByRoom = new Map();

// ===== โหมดจำลองเลขคิวเต็มทุกบรรทัด (ดูเลย์เอาต์) — ตั้ง false เมื่อใช้งานจริง =====
const DEMO_FULL = false;
function demoQueues(room, n) {
  const prefix = (room.code || (room.name || '').match(/L\d+/)?.[0] || 'A');
  const start = 40 + (String(room.id).charCodeAt(String(room.id).length - 1) % 9); // ให้ต่างกันต่อห้อง
  const out = [];
  for (let i = 0; i < n; i++) out.push({ queue_number: prefix + '-' + String(start - i).padStart(3, '0') });
  return out;
}

const media = new MediaPlayer($('#media'));

async function loadSettings() {
  const s = await api('/api/settings');
  $('#ticker').textContent = s.scrolling_text || '';
  recentCount = Number(s.recent_count) || 4;
  announcer.setEnabled(s.voice_enabled !== '0');
  announcer.setGap(Number(s.audio_gap_ms) || 250);
  media.setGlobal({ muted: s.media_global_muted !== '0', volume: (Number(s.media_global_volume) || 60) / 100 });
  applyTextStyle(s);
}

// ใช้สี/ขนาดตัวอักษรบนจอตามที่ตั้งค่าไว้ในหน้า Settings
// สีว่าง = ใช้สีเริ่มต้น/สีประจำห้อง · scale เป็นเปอร์เซ็นต์ (100 = ปกติ)
function applyTextStyle(s) {
  const root = document.documentElement.style;
  const apply = (prefix, key) => {
    const color = (s[key + '_color'] || '').trim();
    const scale = Number(s[key + '_scale']);
    if (color) root.setProperty('--' + prefix + '-color', color);
    else root.removeProperty('--' + prefix + '-color');
    root.setProperty('--' + prefix + '-scale', scale > 0 ? scale / 100 : 1);
  };
  apply('roomname', 'disp_roomname');
  apply('queue', 'disp_queue');
  apply('ticker', 'disp_ticker');
  apply('datetime', 'disp_datetime');
}

function buildRoomPanel(room) {
  const head = el('div', { class: 'room-head' }, room.name);
  const list = el('div', { class: 'queue-list', id: 'list-' + room.id });
  const panel = el('div', { class: 'room-panel' }, head, list);
  if (room.color) panel.style.setProperty('--c', room.color); // สีประจำห้อง (L6 เขียว / L8 น้ำเงิน)
  panelByRoom.set(room.id, { list });
  return panel;
}

async function loadRooms() {
  try { rooms = await api('/api/rooms'); } catch (e) { rooms = []; }
  if (DEMO_FULL && !rooms.length) rooms = [
    { id: 'L6', name: 'เครื่องฉายรังสี L6', color: '#1aa54e', display_order: 1 },
    { id: 'L8', name: 'เครื่องฉายรังสี L8', color: '#1c50b5', display_order: 2 },
  ];
  rooms.sort((a, b) => a.display_order - b.display_order);
  const cont = $('#rooms');
  cont.innerHTML = '';
  panelByRoom.clear();
  rooms.forEach((r) => cont.append(buildRoomPanel(r)));
  for (const r of rooms) refreshRecent(r.id);
}

// เติม/ตัดแถวว่างให้ลิสต์มี recentCount แถวพอดี (กระจายเต็มความสูงเท่า ๆ กัน)
function padEmpties(listEl) {
  while (listEl.children.length < recentCount) listEl.append(el('div', { class: 'q-item empty' }, ''));
  while (listEl.children.length > recentCount) listEl.lastElementChild.remove();
}

function renderList(roomId, list) {
  const p = panelByRoom.get(roomId);
  if (!p) return;
  p.list.innerHTML = '';
  // list[0] = คิวที่เรียกล่าสุด -> แสดงบนสุด
  (list || []).slice(0, recentCount).forEach((q, i) => {
    p.list.append(el('div', { class: 'q-item' + (i === 0 ? ' current' : '') }, q.queue_number));
  });
  padEmpties(p.list); // เติมแถวว่างด้านล่างให้ครบ recentCount
}

async function refreshRecent(roomId) {
  let list = [];
  if (DEMO_FULL) {
    const room = rooms.find((r) => r.id === roomId) || { id: roomId };
    list = demoQueues(room, recentCount);
  } else {
    try { list = await api('/api/queues/recent?roomId=' + roomId + '&limit=' + recentCount); } catch (e) {}
  }
  renderList(roomId, list);
}

// แทรกเลขที่เพิ่งถูกเรียกขึ้นบนสุด "ทันที" จากข้อมูลใน event (ไม่ต้องรอ network)
// - ถ้าเลขนี้มีอยู่แล้ว (เรียกซ้ำ) ย้ายขึ้นบนสุดแทนการซ้ำ
// - กระพริบ 3 ครั้ง (กำหนดจำนวนครั้งใน style.css)
function prependCalled(roomId, number) {
  const p = panelByRoom.get(roomId);
  if (!p || !number) return;
  // เอาตัวเดิมที่เป็นเลขเดียวกันออกก่อน (กรณีเรียกซ้ำ) — ข้ามแถวว่าง
  for (const node of [...p.list.children]) {
    if (!node.classList.contains('empty') && node.textContent === number) node.remove();
  }
  const prevTop = p.list.firstElementChild;
  if (prevTop) prevTop.classList.remove('current');
  const item = el('div', { class: 'q-item current' }, number);
  p.list.prepend(item);
  padEmpties(p.list);           // คงไว้ recentCount แถว (ดันแถวว่าง/ตัวเก่าสุดออกล่างสุด)
  void item.offsetWidth;        // reflow เพื่อ restart animation
  item.classList.add('blink');  // เริ่มกระพริบ (วนไปจนเสียงจบ)
  return item;
}

function onCalled(evt) {
  const roomId = evt.roomId != null ? evt.roomId : evt.room_id;
  const item = prependCalled(roomId, evt.queue_number); // แสดง + เริ่มกระพริบทันที (ไม่รอเสียง/network)
  // เสียงเรียกเข้าคิวเล่นต่อกัน — พอเสียงของคิวนี้พูดจบ ค่อยหยุดกระพริบ
  announcer.announce(evt).then(() => { if (item) item.classList.remove('blink'); });
}

function fmtHeaderDateTime(d = new Date()) {
  const date = d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time} น.`;
}

function startClock() {
  const tick = () => { $('#datetime').textContent = fmtHeaderDateTime(); };
  tick();
  setInterval(tick, 1000);
}

function setupSocket() {
  const socket = connectSocket();
  socket.on('connect', () => socket.emit('display:subscribe'));
  socket.on('queue:called', onCalled);
  socket.on('queue:recalled', onCalled);
  socket.on('queue:updated', (e) => refreshRecent(e.roomId));
  socket.on('queue:issued', (e) => {});
  socket.on('queue:reset', () => loadRooms());
  socket.on('playlist:changed', () => media.load());
  socket.on('settings:changed', () => loadSettings());
}

// เปิดเสียงอัตโนมัติ ไม่ต้องกดปุ่ม
// - เปิด Chrome ด้วย start-display.cmd (flag --autoplay-policy=no-user-gesture-required) เสียงจะเล่นได้ทันที
// - กรณีเบราว์เซอร์ทั่วไปที่ยังบล็อก autoplay จะปลดล็อกเองเมื่อมีการแตะ/กด/ขยับเมาส์ครั้งแรก
announcer.unlock();
const _unlockEvents = ['pointerdown', 'keydown', 'touchstart', 'mousemove'];
const _unlockOnce = () => {
  announcer.unlock();
  _unlockEvents.forEach((ev) => document.removeEventListener(ev, _unlockOnce));
};
_unlockEvents.forEach((ev) => document.addEventListener(ev, _unlockOnce, { once: true, passive: true }));

// กันจอดับ/สกรีนเซฟเวอร์ ขณะเปิดหน้า display (Screen Wake Lock)
let _wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator) _wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) { /* ไม่รองรับ/ถูกปฏิเสธ */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') keepAwake();
});

(async function init() {
  await loadSettings();
  await loadRooms();
  await media.load();
  startClock();
  setupSocket();
  keepAwake();
})();
