// ===== Kiosk (browser test version) — SiRO design + เลือกช่วงเวลา =====
let rooms = [];
let currentRoom = null;
let idleTimeout = 30;
let countdownTimer = null, remaining = 30;

const pad2 = (n) => String(n).padStart(2, '0');
const minLabel = (min) => `${Math.floor(min / 60)}.${pad2(min % 60)}`;
const slotText = (s) => `${minLabel(s.start_min)} - ${minLabel(s.end_min)} น.`;

async function loadConfig() {
  try { const cfg = await api('/api/kiosk/config'); idleTimeout = cfg.idleTimeout || 30; } catch (e) {}
}

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
    setTimeout(() => { $('#printing').classList.add('hidden'); gotoMenu(); }, 2200);
  } catch (e) {
    $('#ptxt').textContent = e.message === 'quota_full' ? 'ช่วงเวลานี้คิวเต็มแล้ว' : 'ระบบไม่พร้อม';
    setTimeout(() => { $('#printing').classList.add('hidden'); $('#ptxt').textContent = 'กำลังพิมพ์บัตรคิว...'; startIdle(); }, 2200);
  }
}

(async function init() {
  await loadConfig();
  await loadRooms();
  showScreen('menu');
})();
