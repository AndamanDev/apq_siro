// ===== Calling station =====
let user = JSON.parse(localStorage.getItem('cs_user') || 'null');
let rooms = [];
let roomId = Number(localStorage.getItem('cs_room')) || null;
let currentId = null;
let activeTab = 'waiting';
let sortMode = 'slot';   // 'slot' = ตามช่วงเวลา+ลำดับที่กด, 'issued' = ตามเวลาออกบัตร
let slotFilter = '';     // '' = ทุกช่วงเวลา, หรือ slot_code เช่น '09'

// ---------- pagination & new-queue tracking ----------
const PAGE_SIZE = 8;     // จำนวนบัตรต่อหน้า
let page = 1;            // หน้าปัจจุบันของแท็บที่กำลังดู
let knownIds = new Set();// id ที่เคยเห็นแล้ว (ไว้ตรวจว่าคิวไหนเพิ่งมาใหม่)
let newIds = new Set();  // id ที่เพิ่งมาใหม่ -> กระพริบ
let firstLoadDone = false;
const NEW_BLINK_MS = 15000; // กระพริบ "ใหม่" นานเท่าไรก่อนหยุด

const station = () => {
  const r = rooms.find((x) => x.id === roomId);
  return r ? r.code : 'station';
};

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}

// ---------- login ----------
function showLogin(show) { $('#loginOverlay').classList.toggle('hidden', !show); }
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    user = await api('/api/auth/login', { method: 'POST', body: { username: $('#username').value, password: $('#password').value } });
    localStorage.setItem('cs_user', JSON.stringify(user));
    $('#loginErr').textContent = '';
    showLogin(false);
    boot();
  } catch (err) { $('#loginErr').textContent = 'เข้าสู่ระบบไม่สำเร็จ'; }
});
$('#logout').addEventListener('click', () => { localStorage.removeItem('cs_user'); location.reload(); });

// ---------- rooms ----------
async function loadRooms() {
  rooms = await api('/api/rooms');
  const sel = $('#roomSelect');
  sel.innerHTML = '';
  rooms.forEach((r) => sel.append(el('option', { value: r.id }, r.name)));
  if (!roomId || !rooms.find((r) => r.id === roomId)) roomId = rooms[0]?.id || null;
  sel.value = roomId;
  sel.onchange = () => { roomId = Number(sel.value); localStorage.setItem('cs_room', roomId); currentId = null; $('#nowNumber').textContent = '—'; page = 1; knownIds = new Set(); newIds = new Set(); firstLoadDone = false; subscribeRoom(); refresh(); };
}

// ---------- actions ----------
async function act(action, id) {
  if (!id) { toast('ยังไม่มีคิวที่เลือก'); return; }
  try {
    const q = await api(`/api/queues/${id}/${action}`, { method: 'POST', body: { station: station() } });
    return q;
  } catch (e) { toast('ทำรายการไม่สำเร็จ: ' + e.message); }
}

$('#btnNext').onclick = async () => {
  try {
    const q = await api(`/api/rooms/${roomId}/call-next`, { method: 'POST', body: { station: station() } });
    if (q && q.queue_number) { currentId = q.id; $('#nowNumber').textContent = q.queue_number; }
    else toast('ไม่มีคิวที่รอเรียก');
  } catch (e) { toast(e.message); }
};
$('#btnRecall').onclick = async () => { const q = await act('recall', currentId); if (q) $('#nowNumber').textContent = q.queue_number; };
$('#btnPark').onclick = async () => { await act('park', currentId); currentId = null; $('#nowNumber').textContent = '—'; };
$('#btnDone').onclick = async () => { await act('complete', currentId); currentId = null; $('#nowNumber').textContent = '—'; };
$('#btnSkip').onclick = async () => { await act('skip', currentId); currentId = null; $('#nowNumber').textContent = '—'; };
$('#btnCancel').onclick = async () => {
  if (!currentId) { toast('ยังไม่มีคิวที่เลือก'); return; }
  if (!confirm('ยืนยันยกเลิกคิวนี้?')) return;
  await act('cancel', currentId); currentId = null; $('#nowNumber').textContent = '—';
};

// ---------- tabs & list ----------
$$('.tab').forEach((t) => t.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.remove('active'));
  t.classList.add('active');
  activeTab = t.dataset.tab;
  page = 1;
  renderList();
}));

// ---------- sort & filter controls ----------
$$('#sortSeg .seg-btn').forEach((b) => b.addEventListener('click', () => {
  $$('#sortSeg .seg-btn').forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
  sortMode = b.dataset.sort;
  page = 1;
  renderList();
}));
$('#slotFilter').addEventListener('change', (e) => { slotFilter = e.target.value; page = 1; renderList(); });

const pad2 = (n) => String(n).padStart(2, '0');
const slotLabelClient = (s) => `${pad2(Number(s))}.00 - ${pad2(Number(s) + 1)}.00 น.`;
// "2026-05-31 08:05:12" -> "08.05 น."
function fmtIssued(s) {
  if (!s) return '-';
  const t = String(s).split(' ')[1] || String(s);
  const [h, m] = t.split(':');
  return `${h}.${m} น.`;
}

// สร้างตัวเลือกช่วงเวลาจากข้อมูลที่มีอยู่ (รวมทุกแท็บ) เพื่อให้กรองได้คงที่
function refreshSlotOptions() {
  const set = new Set();
  [...cache.waiting, ...cache.parked, ...cache.doneList, ...cache.skippedList].forEach((q) => set.add(q.slot_code));
  const slots = [...set].sort();
  const sel = $('#slotFilter');
  sel.innerHTML = '';
  sel.append(el('option', { value: '' }, 'ทุกช่วงเวลา'));
  slots.forEach((s) => sel.append(el('option', { value: s }, slotLabelClient(s))));
  if (slots.includes(slotFilter)) sel.value = slotFilter;
  else { slotFilter = ''; sel.value = ''; }
}

// ใช้ตัวกรอง + เรียงลำดับกับข้อมูลของแท็บปัจจุบัน
function viewData() {
  const src = activeTab === 'waiting' ? cache.waiting
            : activeTab === 'parked' ? cache.parked
            : activeTab === 'skipped' ? cache.skippedList
            : cache.doneList;
  let data = slotFilter ? src.filter((q) => q.slot_code === slotFilter) : src.slice();
  if (sortMode === 'issued') {
    data.sort((a, b) => String(a.issued_at).localeCompare(String(b.issued_at)));
  } else {
    data.sort((a, b) => (a.slot_code === b.slot_code ? a.seq - b.seq : String(a.slot_code).localeCompare(String(b.slot_code))));
  }
  return data;
}

let cache = { waiting: [], parked: [], doneList: [], skippedList: [] };
async function refresh() {
  if (!roomId) return;
  const [waiting, parked, done, skipped] = await Promise.all([
    api(`/api/queues?roomId=${roomId}&status=waiting`),
    api(`/api/queues?roomId=${roomId}&status=parked`),
    api(`/api/queues?roomId=${roomId}&status=called,serving,done`),
    api(`/api/queues?roomId=${roomId}&status=skipped`),
  ]);
  cache = { waiting, parked, doneList: done, skippedList: skipped };
  $('#cntWaiting').textContent = waiting.length;
  $('#cntParked').textContent = parked.length;
  $('#cntDone').textContent = done.length;
  $('#cntSkipped').textContent = skipped.length;

  // ตรวจหาคิวที่เพิ่งมาใหม่ (เฉพาะหลังโหลดครั้งแรก เพื่อไม่ให้กระพริบทั้งหมดตอนเปิดหน้า)
  const allIds = [...waiting, ...parked, ...done, ...skipped].map((q) => q.id);
  if (firstLoadDone) {
    waiting.forEach((q) => {
      if (!knownIds.has(q.id)) {
        newIds.add(q.id);
        setTimeout(() => { newIds.delete(q.id); renderList(); }, NEW_BLINK_MS);
      }
    });
  }
  knownIds = new Set(allIds);
  firstLoadDone = true;

  refreshSlotOptions();
  renderList();
}

function rowActions(q) {
  if (activeTab === 'waiting') {
    return el('div', { class: 'acts' },
      el('button', { class: 'c', onclick: async () => { const r = await act('call', q.id); if (r) { currentId = r.id; $('#nowNumber').textContent = r.queue_number; } } }, 'เรียก'),
      el('button', { class: 'x', onclick: async () => { if (confirm('ยกเลิกคิว ' + q.queue_number + '?')) act('cancel', q.id); } }, 'ยกเลิก'));
  }
  if (activeTab === 'parked') {
    return el('div', { class: 'acts' },
      el('button', { class: 'c', onclick: async () => { const r = await act('resume', q.id); if (r) { currentId = r.id; $('#nowNumber').textContent = r.queue_number; } } }, 'เรียกอีกครั้ง'),
      el('button', { class: 'x', onclick: () => { if (confirm('ยกเลิกคิว ' + q.queue_number + '?')) act('cancel', q.id); } }, 'ยกเลิก'));
  }
  if (activeTab === 'skipped') {
    return el('div', { class: 'acts' },
      el('button', { class: 'c', onclick: async () => { const r = await act('call', q.id); if (r) { currentId = r.id; $('#nowNumber').textContent = r.queue_number; } } }, 'เรียกกลับ'),
      el('button', { class: 'x', onclick: () => { if (confirm('ยกเลิกคิว ' + q.queue_number + '?')) act('cancel', q.id); } }, 'ยกเลิก'));
  }
  // done tab
  return el('div', { class: 'acts' },
    el('button', { class: 'p', onclick: async () => { const r = await act('recall', q.id); if (r) { currentId = r.id; $('#nowNumber').textContent = r.queue_number; } } }, 'เรียกซ้ำ'));
}

function renderPager(totalPages) {
  const box = $('#pager'); box.innerHTML = '';
  if (totalPages <= 1) return;
  box.append(
    el('button', { class: 'pg', disabled: page <= 1 ? '' : null, onclick: () => { if (page > 1) { page--; renderList(); } } }, '‹ ก่อนหน้า'),
    el('span', { class: 'pg-info' }, `หน้า ${page} / ${totalPages}`),
    el('button', { class: 'pg', disabled: page >= totalPages ? '' : null, onclick: () => { if (page < totalPages) { page++; renderList(); } } }, 'ถัดไป ›'));
}

function renderList() {
  const data = viewData();
  const box = $('#list'); box.innerHTML = '';
  if (!data.length) { box.append(el('div', { class: 'meta', style: 'padding:16px;color:#90a6c8' }, 'ไม่มีรายการ')); renderPager(1); return; }

  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  if (page > totalPages) page = totalPages;
  const pageData = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  pageData.forEach((q) => {
    const isNew = newIds.has(q.id);
    box.append(el('div', { class: 'qrow' + (isNew ? ' new' : '') },
      el('div', {},
        el('div', { class: 'qn' },
          q.queue_number,
          isNew ? el('span', { class: 'badge-new' }, 'ใหม่') : null),
        el('div', { class: 'meta' }, `${slotLabelClient(q.slot_code)} · ออกบัตร ${fmtIssued(q.issued_at)}`),
        q.over_quota ? el('div', { class: 'over' }, '⚠ เกินโควต้า') : null),
      rowActions(q)));
  });
  renderPager(totalPages);
}

// ---------- socket ----------
let socket;
function subscribeRoom() { if (socket && roomId) socket.emit('calling:subscribe', roomId); }
function setupSocket() {
  socket = connectSocket();
  socket.on('connect', subscribeRoom);
  ['queue:issued', 'queue:called', 'queue:recalled', 'queue:updated', 'queue:reset'].forEach((ev) =>
    socket.on(ev, () => refresh()));
}

async function boot() {
  await loadRooms();
  setupSocket();
  subscribeRoom();
  await refresh();
}

(function init() {
  if (window.lucide) window.lucide.createIcons();
  if (!user) { showLogin(true); }
  else { showLogin(false); $('#whoami').textContent = user.displayName || user.username; boot(); }
})();
