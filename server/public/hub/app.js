// ===== Dashboard รวม (หน้าแรกหลัง login) =====
let user = JSON.parse(localStorage.getItem('cs_user') || 'null');

// ---------- login ----------
function showLogin(show) { $('#loginOverlay').classList.toggle('hidden', !show); }
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    user = await api('/api/auth/login', { method: 'POST', body: { username: $('#username').value, password: $('#password').value } });
    localStorage.setItem('cs_user', JSON.stringify(user));
    $('#loginErr').textContent = '';
    showLogin(false);
    $('#whoami').textContent = user.displayName || user.username;
    applyRoleMenu();
    boot();
  } catch (err) { $('#loginErr').textContent = 'เข้าสู่ระบบไม่สำเร็จ'; }
});
$('#logout').addEventListener('click', () => { localStorage.removeItem('cs_user'); location.reload(); });

// ---------- จำกัดเมนูตามสิทธิ์ ----------
// role 'caller' (เจ้าหน้าที่ห้องเรียกคิว) เห็นเฉพาะ ภาพรวม + เรียกคิว
const CALLER_MENUS = ['/', '/calling'];
function applyRoleMenu() {
  if (!user || user.role !== 'caller') return;
  document.body.classList.add('role-caller');
  $$('.side-nav .nav-item').forEach((a) => {
    if (!CALLER_MENUS.includes(a.getAttribute('href'))) a.style.display = 'none';
  });
  // ซ่อนหัวข้อกลุ่มที่ไม่มีเมนูเหลือให้แสดง
  $$('.side-nav .nav-group').forEach((g) => {
    let visible = false;
    for (let n = g.nextElementSibling; n && !n.classList.contains('nav-group'); n = n.nextElementSibling) {
      if (n.classList.contains('nav-item') && n.style.display !== 'none') { visible = true; break; }
    }
    if (!visible) g.style.display = 'none';
  });
}

// ---------- icons ----------
function renderIcons() { if (window.lucide) window.lucide.createIcons(); }

// ---------- clock ----------
function tickClock() {
  $('#clockText').textContent = fmtTime();
  $('#todayDate').textContent = fmtDateThai();
}

// ---------- summary ต่อห้อง + ยอดรวม ----------
async function loadSummary() {
  let data;
  try { data = await api('/api/queues/summary'); }
  catch (e) { return; }
  const rooms = data.rooms || [];

  const tot = { issued: 0, waiting: 0, active: 0, done: 0 };
  rooms.forEach((r) => {
    tot.issued += r.issued; tot.waiting += r.waiting; tot.active += r.active; tot.done += r.done;
  });
  $('#totIssued').textContent = tot.issued;
  $('#totWaiting').textContent = tot.waiting;
  $('#totActive').textContent = tot.active;
  $('#totDone').textContent = tot.done;

  const body = $('#roomsBody');
  body.innerHTML = '';
  if (!rooms.length) {
    body.append(el('tr', {}, el('td', { colspan: 6, class: 'empty' },
      el('i', { 'data-lucide': 'inbox' }),
      el('div', {}, 'ยังไม่มีห้องที่เปิดใช้งาน'))));
  } else {
    const badge = (cls, n) => el('span', { class: 'mc-badge ' + cls }, String(n));
    rooms.forEach((r) => {
      body.append(el('tr', {},
        el('td', { class: 'room-name' }, el('b', {}, r.name), el('span', { class: 'rcode' }, r.code)),
        el('td', { class: 'ta-c' }, badge('mc-badge-attention', r.waiting)),
        el('td', { class: 'ta-c' }, badge('mc-badge-active', r.active)),
        el('td', { class: 'ta-c' }, badge('mc-badge-completed', r.done)),
        el('td', { class: 'ta-c cell-muted' }, String(r.skipped + r.cancelled)),
        el('td', { class: 'ta-c cell-muted' }, String(r.issued))));
    });
  }
  renderIcons();
  $('#lastUpdate').textContent = fmtTime();
}

// ---------- server health ----------
async function checkHealth() {
  try {
    await api('/api/health');
    $('#serverDot').className = 'dot ok';
    $('#serverState').textContent = 'ออนไลน์';
  } catch (e) {
    $('#serverDot').className = 'dot bad';
    $('#serverState').textContent = 'ขาดการเชื่อมต่อ';
  }
}

// ---------- feed กิจกรรมเรียลไทม์ ----------
const FEED_MAX = 40;  // เก็บไว้สูงสุด 40 รายการ
// แต่ละชนิดเหตุการณ์: ป้าย, ไอคอน, สี (class)
const FEED_TYPES = {
  issued:    { label: 'ออกคิวใหม่', icon: 'ticket',          cls: 'fd-issued' },
  called:    { label: 'เรียกคิว',    icon: 'megaphone',       cls: 'fd-called' },
  recalled:  { label: 'เรียกซ้ำ',    icon: 'refresh-cw',      cls: 'fd-recalled' },
  skipped:   { label: 'เรียกข้าม',   icon: 'skip-forward',    cls: 'fd-skipped' },
  cancelled: { label: 'ยกเลิก',      icon: 'x-circle',        cls: 'fd-cancelled' },
  done:      { label: 'เสร็จสิ้น',   icon: 'circle-check-big', cls: 'fd-done' },
};

function pushFeed(typeKey, p) {
  const t = FEED_TYPES[typeKey];
  if (!t) return;
  const list = $('#feedList');
  const empty = $('#feedEmpty');
  if (empty) empty.remove();

  const qno = p.queueNumber || p.queue_number || '—';
  const room = p.roomName || p.roomCode || '';
  const station = p.station ? ('ช่อง ' + p.station) : '';

  const li = el('li', { class: 'feed-item ' + t.cls },
    el('span', { class: 'fd-ic' }, el('i', { 'data-lucide': t.icon })),
    el('div', { class: 'fd-body' },
      el('div', { class: 'fd-top' },
        el('span', { class: 'fd-type' }, t.label),
        el('b', { class: 'fd-qno' }, qno)),
      el('div', { class: 'fd-meta' },
        room ? el('span', { class: 'fd-room' }, room) : null,
        station ? el('span', { class: 'fd-station' }, station) : null)),
    el('time', { class: 'fd-time' }, fmtTime()));

  list.prepend(li);
  // จำกัดจำนวนรายการ
  while (list.children.length > FEED_MAX) list.lastElementChild.remove();
  renderIcons();
}

// ---------- socket (realtime) ----------
let socket;
let refreshTimer = null;
function debouncedRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(loadSummary, 300);
}
function setSocketState(connected) {
  $('#socketDot').className = 'dot ' + (connected ? 'ok' : 'bad');
  $('#socketState').textContent = connected ? 'เชื่อมต่อแล้ว' : 'หลุดการเชื่อมต่อ';
}
function setupSocket() {
  socket = connectSocket();
  socket.on('connect', () => setSocketState(true));
  socket.on('disconnect', () => setSocketState(false));

  // อัปเดตตัวเลขสรุป (debounce กันยิงถี่)
  ['queue:issued', 'queue:called', 'queue:recalled', 'queue:updated', 'queue:reset'].forEach((ev) =>
    socket.on(ev, debouncedRefresh));

  // เพิ่มลง feed กิจกรรม
  socket.on('queue:issued',   (p) => pushFeed('issued', p));
  socket.on('queue:called',   (p) => pushFeed('called', p));
  socket.on('queue:recalled', (p) => pushFeed('recalled', p));
  socket.on('queue:updated',  (p) => {
    // เฉพาะสถานะที่อยากเห็นใน feed: ข้าม / ยกเลิก / เสร็จสิ้น
    if (FEED_TYPES[p.status]) pushFeed(p.status, p);
  });
  socket.on('queue:reset', () => {
    const list = $('#feedList');
    if (list) list.innerHTML = '';
  });
}

// ---------- boot ----------
async function boot() {
  await loadSummary();
  setupSocket();
  await checkHealth();
  setInterval(checkHealth, 15000);  // ตรวจสถานะเซิร์ฟเวอร์ทุก 15 วิ
  setInterval(loadSummary, 30000);  // กันหลุด event: รีเฟรชสรุปทุก 30 วิ
}

(function init() {
  renderIcons();
  tickClock();
  setInterval(tickClock, 1000);
  if (!user) { showLogin(true); }
  else { showLogin(false); $('#whoami').textContent = user.displayName || user.username; applyRoleMenu(); boot(); }
})();
