// ===== Reports =====
const today = new Date().toISOString().slice(0, 10);
$('#from').value = today;
$('#to').value = today;

const n1 = (x) => (x == null ? '-' : Number(x).toFixed(1));

async function run() {
  const from = $('#from').value, to = $('#to').value;
  $('#rhRange').textContent = `ระหว่างวันที่ ${from} ถึง ${to}`;
  const content = $('#content');
  content.innerHTML = '';

  // wait times (ใช้ from เป็น date)
  const wait = await api('/api/reports/wait-times?date=' + from);
  content.append(section('เวลารอคอย (นาที) — วันที่ ' + from,
    ['ห้อง', 'ช่วงเวลา', 'จำนวน', 'เฉลี่ย', 'สูงสุด'],
    wait.map((r) => [`${r.room_name} (${r.room_code})`, r.slot_code + '.00', r.n, n1(r.avg_wait_min), n1(r.max_wait_min)])));

  // volume
  const vol = await api(`/api/reports/volume?from=${from}&to=${to}`);
  content.append(section('ปริมาณการให้บริการ',
    ['วันที่', 'ห้อง', 'ออกบัตร', 'เสร็จ', 'ข้าม', 'ยกเลิก'],
    vol.map((r) => [r.service_date, `${r.room_name} (${r.room_code})`, r.issued, r.done, r.skipped, r.cancelled])));

  // quota
  const quota = await api('/api/reports/quota?date=' + from);
  content.append(section('โควต้า vs ออกจริง — วันที่ ' + from,
    ['ห้อง', 'ช่วงเวลา', 'โควต้า', 'ออกจริง', 'เกินโควต้า'],
    quota.map((r) => [r.room_code, r.slot_code + '.00', r.quota, r.issued, r.over_quota || 0])));
}

function section(title, headers, rows) {
  const tbl = el('table', {}, el('tr', {}, ...headers.map((h) => el('th', {}, h))));
  if (!rows.length) tbl.append(el('tr', {}, el('td', { colspan: headers.length }, 'ไม่มีข้อมูล')));
  rows.forEach((r) => tbl.append(el('tr', {}, ...r.map((c) => el('td', {}, String(c))))));
  return el('div', { class: 'card' }, el('h2', { class: 'section' }, title), tbl);
}

$('#run').onclick = run;
$('#print').onclick = () => window.print();
run();
