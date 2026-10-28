// ===== Settings app =====
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1800); }
const content = $('#content');

$$('.tab').forEach((t) => t.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.remove('active'));
  t.classList.add('active');
  render(t.dataset.tab);
}));

function render(tab) {
  const fn = TABS[tab];
  if (fn) fn();
}

const TABS = {};

// ---------------- General ----------------
TABS.general = async () => {
  const s = await api('/api/settings');
  content.innerHTML = '';
  const card = el('div', { class: 'card' });
  const f = (key, label, type = 'text', extra = {}) => {
    const input = el(type === 'textarea' ? 'textarea' : 'select' in extra ? 'select' : 'input',
      { id: 'g_' + key, type, value: type !== 'textarea' ? (s[key] ?? '') : null });
    if (type === 'textarea') input.value = s[key] ?? '';
    return el('label', { class: 'field' }, el('span', {}, label), input);
  };
  const sel = (key, label, opts) => {
    const select = el('select', { id: 'g_' + key });
    opts.forEach(([v, t]) => { const o = el('option', { value: v }, t); if (String(s[key]) === String(v)) o.selected = true; select.append(o); });
    return el('label', { class: 'field' }, el('span', {}, label), select);
  };
  card.append(
    el('h2', { class: 'section' }, 'ตั้งค่าทั่วไป / จอแสดงผล'),
    f('scrolling_text', 'ข้อความวิ่ง (Scrolling Text)', 'textarea'),
    el('div', { class: 'row' }, f('recent_count', 'จำนวนเลขล่าสุดต่อห้อง', 'number'), f('audio_gap_ms', 'เว้นช่วงเสียง (ms)', 'number')),
    sel('voice_enabled', 'เปิดเสียงเรียก', [['1', 'เปิด'], ['0', 'ปิด']]),
    el('div', { class: 'row' },
      sel('media_global_muted', 'ปิดเสียงวิดีโอ (รวม)', [['1', 'ปิดเสียง'], ['0', 'เปิดเสียง']]),
      f('media_global_volume', 'ระดับเสียงวิดีโอรวม (0-100)', 'number')),
    el('button', { class: 'btn', onclick: save }, 'บันทึก'));
  content.append(card);

  async function save() {
    const body = {};
    ['scrolling_text', 'recent_count', 'audio_gap_ms', 'voice_enabled', 'media_global_muted', 'media_global_volume']
      .forEach((k) => body[k] = $('#g_' + k).value);
    await api('/api/settings', { method: 'PUT', body });
    toast('บันทึกแล้ว');
  }
};

// ---------------- Display text (สี/ขนาดตัวอักษรบนจอ) ----------------
TABS.displaytext = async () => {
  const s = await api('/api/settings');
  content.innerHTML = '';

  // รายการข้อความบนจอที่ปรับได้: [key, ป้ายชื่อ, คำอธิบายสีเริ่มต้น]
  const ITEMS = [
    ['disp_queue', 'เลขคิว', 'ใช้สีประจำห้อง'],
    ['disp_roomname', 'ชื่อห้อง', 'ใช้สีประจำห้อง'],
    ['disp_ticker', 'ข้อความวิ่ง (ด้านล่าง)', 'สีเทา'],
    ['disp_datetime', 'วันที่/เวลา (มุมบน)', 'สีขาว'],
  ];

  const card = el('div', { class: 'card' });
  card.append(el('h2', { class: 'section' }, 'สี & ขนาดตัวอักษรบนจอแสดงผล'),
    el('p', { class: 'muted', style: 'margin-bottom:14px' },
      'ติ๊ก "ใช้สีเริ่มต้น" เพื่อคงสีเดิมของระบบ · ขนาดเป็นเปอร์เซ็นต์ (100 = ปกติ) ปรับ 60–200 ได้'));

  ITEMS.forEach(([key, label, hint]) => {
    const useDefault = !(s[key + '_color'] || '').trim();
    const colorInput = el('input', { id: 'dt_' + key + '_color', type: 'color', value: (s[key + '_color'] || '#1c50b5') });
    colorInput.disabled = useDefault;
    const defChk = el('input', { id: 'dt_' + key + '_default', type: 'checkbox' });
    defChk.checked = useDefault;
    defChk.onchange = () => { colorInput.disabled = defChk.checked; };
    const scaleInput = el('input', { id: 'dt_' + key + '_scale', type: 'number', min: '40', max: '300', value: (s[key + '_scale'] || '100') });

    card.append(el('div', { class: 'row', style: 'align-items:flex-end' },
      el('label', { class: 'field' }, el('span', {}, label + ' — สี'),
        el('div', { class: 'inline' }, colorInput,
          el('label', { class: 'inline', style: 'gap:6px;font-size:13px' }, defChk, el('span', {}, 'ใช้สีเริ่มต้น (' + hint + ')')))),
      el('label', { class: 'field' }, el('span', {}, label + ' — ขนาด (%)'), scaleInput)));
  });

  card.append(el('button', { class: 'btn', onclick: save }, 'บันทึก'), ' ',
    el('a', { class: 'btn sec', href: '/display', target: '_blank' }, 'เปิดจอแสดงผล'));
  content.append(card);

  async function save() {
    const body = {};
    ITEMS.forEach(([key]) => {
      const useDefault = $('#dt_' + key + '_default').checked;
      body[key + '_color'] = useDefault ? '' : $('#dt_' + key + '_color').value;
      body[key + '_scale'] = $('#dt_' + key + '_scale').value || '100';
    });
    await api('/api/settings', { method: 'PUT', body });
    toast('บันทึกแล้ว — จอจะอัปเดตอัตโนมัติ');
  }
};

// ---------------- Rooms ----------------
TABS.rooms = async () => {
  const rooms = await api('/api/rooms?all=1');
  content.innerHTML = '';
  const tbl = el('table', {},
    el('tr', {}, ...['รหัส', 'ชื่อห้อง', 'ลำดับจอ', 'คีย์เสียง', 'ใช้งาน', ''].map((h) => el('th', {}, h))));
  rooms.forEach((r) => {
    tbl.append(el('tr', {},
      el('td', {}, r.code), el('td', {}, r.name), el('td', {}, String(r.display_order)),
      el('td', {}, r.voice_room_key || ''), el('td', {}, r.active ? 'ใช่' : 'ไม่'),
      el('td', {}, el('div', { class: 'inline' },
        el('button', { class: 'mini edit', onclick: () => editRoom(r) }, 'แก้ไข'),
        el('button', { class: 'mini del', onclick: async () => { await api('/api/rooms/' + r.id, { method: 'DELETE' }); TABS.rooms(); } }, 'ปิด')))));
  });
  content.append(el('h2', { class: 'section' }, 'ห้องบริการ'), el('div', { class: 'card' }, tbl),
    el('button', { class: 'btn', onclick: () => editRoom() }, '+ เพิ่มห้อง'));

  function editRoom(r = {}) {
    const wrap = el('div', { class: 'card' },
      el('div', { class: 'row' },
        field('rc', 'รหัสห้อง (เช่น L6)', r.code),
        field('rn', 'ชื่อห้อง', r.name)),
      el('div', { class: 'row' },
        field('ro', 'ลำดับบนจอ', r.display_order ?? 0, 'number'),
        field('rv', 'คีย์ไฟล์เสียง (เช่น room_L6)', r.voice_room_key || '')),
      el('button', { class: 'btn', onclick: save }, 'บันทึก'),
      ' ', el('button', { class: 'btn sec', onclick: () => TABS.rooms() }, 'ยกเลิก'));
    content.innerHTML = ''; content.append(el('h2', { class: 'section' }, r.id ? 'แก้ไขห้อง' : 'เพิ่มห้อง'), wrap);
    async function save() {
      const body = { code: $('#rc').value, name: $('#rn').value, display_order: Number($('#ro').value), voice_room_key: $('#rv').value, active: 1 };
      if (r.id) await api('/api/rooms/' + r.id, { method: 'PUT', body });
      else await api('/api/rooms', { method: 'POST', body });
      toast('บันทึกแล้ว'); TABS.rooms();
    }
  }
};

// ---------------- Slots ----------------
TABS.slots = async () => {
  const rooms = await api('/api/rooms?all=1');
  content.innerHTML = '';
  const roomSel = el('select', { id: 'slotRoom' });
  rooms.forEach((r) => roomSel.append(el('option', { value: r.id }, `${r.name} (${r.code})`)));
  roomSel.onchange = loadSlots;
  content.append(el('h2', { class: 'section' }, 'ช่วงเวลา & โควต้า'),
    el('label', { class: 'field' }, el('span', {}, 'เลือกห้อง'), roomSel),
    el('div', { id: 'slotBox' }));
  loadSlots();

  async function loadSlots() {
    const roomId = Number(roomSel.value);
    const slots = await api('/api/slots?roomId=' + roomId);
    const tbl = el('table', {}, el('tr', {}, ...['ช่วง', 'เริ่ม(min)', 'สิ้นสุด(min)', 'โควต้า', 'โหมด', ''].map((h) => el('th', {}, h))));
    slots.forEach((sl) => {
      const quota = el('input', { type: 'number', value: sl.quota, style: 'width:80px' });
      const mode = el('select', {}, ...[['warn', 'เตือน'], ['allow', 'ออกได้'], ['block', 'ห้ามกด']].map(([v, t]) => { const o = el('option', { value: v }, t); if (sl.quota_mode === v) o.selected = true; return o; }));
      tbl.append(el('tr', {},
        el('td', {}, sl.slot_code + '.00'), el('td', {}, String(sl.start_min)), el('td', {}, String(sl.end_min)),
        el('td', {}, quota), el('td', {}, mode),
        el('td', {}, el('div', { class: 'inline' },
          el('button', { class: 'mini edit', onclick: async () => { await api('/api/slots/' + sl.id, { method: 'PUT', body: { quota: Number(quota.value), quota_mode: mode.value } }); toast('บันทึก'); } }, 'บันทึก'),
          el('button', { class: 'mini del', onclick: async () => { await api('/api/slots/' + sl.id, { method: 'DELETE' }); loadSlots(); } }, 'ลบ')))));
    });
    const box = $('#slotBox'); box.innerHTML = '';
    box.append(el('div', { class: 'card' }, tbl), addForm(roomId));
  }
  function addForm(roomId) {
    return el('div', { class: 'card' },
      el('h2', { class: 'section' }, 'เพิ่มช่วงเวลา'),
      el('div', { class: 'row' },
        field('ns', 'รหัสช่วง (เช่น 08)', ''),
        field('nq', 'โควต้า', 20, 'number')),
      el('button', { class: 'btn', onclick: async () => {
        const code = $('#ns').value.padStart(2, '0'); const h = Number(code);
        await api('/api/slots', { method: 'POST', body: { room_id: roomId, slot_code: code, start_min: h * 60, end_min: (h + 1) * 60, quota: Number($('#nq').value), quota_mode: 'warn' } });
        toast('เพิ่มแล้ว'); loadSlots();
      } }, '+ เพิ่ม'));
  }
};

// ---------------- Profiles (หน้าบัตรคิว) ----------------
const ALIGN_OPTS = [['center', 'กึ่งกลาง'], ['left', 'ชิดซ้าย'], ['right', 'ชิดขวา']];
const POS_OPTS = [['top', 'เหนือเลขคิว'], ['bottom', 'ใต้ข้อความท้าย']];

// ค่าตั้งต้นของสไตล์บัตร — ออกแบบให้ตรงกับบัตรตัวอย่าง SiRO
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

function parseLayoutLines(layout_json) {
  try { const o = JSON.parse(layout_json || '{}'); return Array.isArray(o.lines) ? o.lines : []; }
  catch (e) { return []; }
}
function parseStyles(layout_json) {
  let raw = {};
  try { raw = (JSON.parse(layout_json || '{}') || {}).styles || {}; } catch (e) { raw = {}; }
  const m = (k) => Object.assign({}, STYLE_DEFAULTS[k], raw[k] || {});
  const num = (v, def) => (Number.isFinite(Number(v)) ? Number(v) : def); // ยอมรับค่า 0
  return {
    logoWidth: Number(raw.logoWidth) || STYLE_DEFAULTS.logoWidth,
    logoGap: num(raw.logoGap, STYLE_DEFAULTS.logoGap),
    hrGap: num(raw.hrGap, STYLE_DEFAULTS.hrGap),
    lineGap: num(raw.lineGap, STYLE_DEFAULTS.lineGap),
    header: m('header'), roomName: m('roomName'), slotTime: m('slotTime'),
    queueLabel: m('queueLabel'), queueNumber: m('queueNumber'),
    footer: m('footer'), dateTime: m('dateTime'),
  };
}

TABS.profiles = async () => {
  const profiles = await api('/api/profiles');
  content.innerHTML = '';
  content.append(el('h2', { class: 'section' }, 'ออกแบบหน้าบัตรคิว'));
  profiles.forEach((p) => content.append(profileCard(p)));
  content.append(el('button', { class: 'btn', onclick: async () => { await api('/api/profiles', { method: 'POST', body: { name: 'โปรไฟล์ใหม่', copies: 1, layout_json: '{}' } }); TABS.profiles(); } }, '+ เพิ่มโปรไฟล์'));

  function profileCard(p) {
    // สถานะที่แก้ไขได้ของบัตรนี้ (อัปเดต preview แบบสด)
    const state = {
      header: p.header_text || '',
      footer: p.footer_text || '',
      show_qr: !!p.show_qr,
      styles: parseStyles(p.layout_json),
      lines: parseLayoutLines(p.layout_json).map((l) => ({
        text: l.text || '', size: Number(l.size) || 16, bold: !!l.bold,
        align: l.align || 'center', pos: l.pos === 'bottom' ? 'bottom' : 'top',
      })),
    };

    const preview = el('div', { class: 'ticket-wrap' });
    const linesBox = el('div', { class: 'lines-box' });

    function update() {
      preview.innerHTML = '';
      preview.append(buildTicketPreview(state, p.logo_path));
    }

    function renderLines() {
      linesBox.innerHTML = '';
      if (!state.lines.length) linesBox.append(el('p', { class: 'muted' }, 'ยังไม่มีข้อความเพิ่มเติม'));
      state.lines.forEach((line, i) => linesBox.append(lineRow(line, i)));
    }

    function lineRow(line, i) {
      const text = el('input', { type: 'text', placeholder: 'ข้อความ' });
      text.value = line.text;
      text.oninput = () => { line.text = text.value; update(); };
      const size = sizeStepper(line, 'size', { min: 8, max: 80, update });
      const bold = el('input', { type: 'checkbox', title: 'ตัวหนา' });
      bold.checked = line.bold;
      bold.onchange = () => { line.bold = bold.checked; update(); };
      const align = selectFrom(ALIGN_OPTS, line.align, (v) => { line.align = v; update(); });
      const pos = selectFrom(POS_OPTS, line.pos, (v) => { line.pos = v; update(); });
      const up = el('button', { class: 'mini', title: 'เลื่อนขึ้น', disabled: i === 0, onclick: () => moveLine(i, -1) }, '↑');
      const down = el('button', { class: 'mini', title: 'เลื่อนลง', disabled: i === state.lines.length - 1, onclick: () => moveLine(i, 1) }, '↓');
      const rm = el('button', { class: 'mini del', onclick: () => { state.lines.splice(i, 1); renderLines(); update(); } }, 'ลบ');
      return el('div', { class: 'line-row' },
        text, size,
        el('label', { class: 'chk' }, bold, el('span', {}, 'หนา')),
        align, pos, up, down, rm);
    }

    function moveLine(i, dir) {
      const j = i + dir;
      if (j < 0 || j >= state.lines.length) return;
      [state.lines[i], state.lines[j]] = [state.lines[j], state.lines[i]];
      renderLines(); update();
    }

    const qrSel = selectFrom([['1', 'แสดง'], ['0', 'ไม่แสดง']], state.show_qr ? '1' : '0', (v) => { state.show_qr = v === '1'; update(); });

    // แถวปรับสไตล์/ขนาดตัวอักษรของแต่ละองค์ประกอบบนบัตร (เรียงจากบนลงล่างตามบัตรจริง)
    const st = state.styles;
    const styleBox = el('div', { class: 'style-box' },
      styleRow('ข้อความหัวบัตร', st.header, { show: true, bold: true, update,
        text: { get: () => state.header, set: (v) => { state.header = v; }, placeholder: 'เหนือชื่อห้อง (เว้นว่างได้)' } }),
      styleRow('ชื่อห้อง', st.roomName, { show: true, bold: true, update }),
      styleRow('ช่วงเวลา', st.slotTime, { show: true, bold: true, update }),
      styleRow('หัวข้อเลขคิว', st.queueLabel, { show: true, bold: true, text: 'หมายเลขคิว', update }),
      styleRow('เลขคิว (ตัวใหญ่)', st.queueNumber, { update }),
      styleRow('ข้อความท้ายบัตร', st.footer, { show: true, bold: true, update,
        text: { get: () => state.footer, set: (v) => { state.footer = v; }, placeholder: 'ขึ้นบรรทัดใหม่ได้', multiline: true } }),
      styleRow('วันที่ / เวลา (ล่างสุด)', st.dateTime, { show: true, update }));

    const logoSizeRow = el('div', { class: 'line-row' },
      el('span', { style: 'min-width:120px' }, 'ความกว้างโลโก้ (px)'),
      sizeStepper(st, 'logoWidth', { min: 40, max: 280, step: 10, update }));

    // ระยะห่าง (ปรับได้เผื่อบางบัตรไม่มีข้อความหัวบัตร — ติดลบได้เพื่อดึงให้ชิดขึ้น)
    const spacingRow = el('div', { class: 'line-row' },
      el('span', { style: 'min-width:120px' }, 'ระยะใต้โลโก้ (px)'),
      sizeStepper(st, 'logoGap', { min: -60, max: 80, step: 2, update }),
      el('span', { style: 'min-width:120px;margin-left:12px' }, 'ระยะรอบเส้นประ (px)'),
      sizeStepper(st, 'hrGap', { min: -40, max: 60, step: 2, update }));

    const lineGapRow = el('div', { class: 'line-row' },
      el('span', { style: 'min-width:120px' }, 'ระยะระหว่างบรรทัด (px)'),
      sizeStepper(st, 'lineGap', { min: -10, max: 40, step: 1, update }));

    const form = el('div', { class: 'profile-form' },
      el('div', { class: 'row' }, field('p_name_' + p.id, 'ชื่อโปรไฟล์', p.name), field('p_copies_' + p.id, 'จำนวนสำเนา', p.copies, 'number')),
      el('div', { class: 'row' },
        el('label', { class: 'field' }, el('span', {}, 'ตั้งเป็นค่าเริ่มต้น'),
          (() => { const s = el('select', { id: 'p_def_' + p.id }, el('option', { value: '1' }, 'ใช่'), el('option', { value: '0' }, 'ไม่')); s.value = String(p.is_default); return s; })()),
        el('label', { class: 'field' }, el('span', {}, 'QR Code'), qrSel)),
      el('label', { class: 'field' }, el('span', {}, 'โลโก้'),
        el('div', { class: 'inline' },
          p.logo_path ? el('img', { class: 'thumb', src: p.logo_path }) : el('span', { class: 'muted' }, 'ยังไม่มีโลโก้'),
          (() => { const fi = el('input', { type: 'file', accept: 'image/*' }); fi.onchange = async () => { const fd = new FormData(); fd.append('logo', fi.files[0]); await fetch('/api/profiles/' + p.id + '/logo', { method: 'POST', body: fd }); toast('อัปโหลดโลโก้แล้ว'); TABS.profiles(); }; return fi; })())),
      logoSizeRow,
      spacingRow,
      lineGapRow,
      el('div', { class: 'field' },
        el('span', {}, 'ปรับข้อความ & ขนาดตัวอักษรบนบัตร'),
        styleBox),
      el('div', { class: 'field' },
        el('span', {}, 'ข้อความเพิ่มเติม (เพิ่ม/ลบได้)'),
        linesBox,
        el('button', { class: 'btn sec', style: 'margin-top:8px', onclick: () => { state.lines.push({ text: 'ข้อความใหม่', size: 16, bold: false, align: 'center', pos: 'bottom' }); renderLines(); update(); } }, '+ เพิ่มข้อความ')),
      el('div', { style: 'margin-top:12px' },
        el('button', { class: 'btn', onclick: save }, 'บันทึก'), ' ',
        el('button', { class: 'btn danger', onclick: async () => { if (confirm('ลบโปรไฟล์?')) { await api('/api/profiles/' + p.id, { method: 'DELETE' }); TABS.profiles(); } } }, 'ลบ')));

    const card = el('div', { class: 'card profile-grid' }, form,
      el('div', { class: 'preview-col' }, el('span', { class: 'muted' }, 'ตัวอย่างบัตร'), preview));

    renderLines();
    update();
    return card;

    async function save() {
      await api('/api/profiles/' + p.id, { method: 'PUT', body: {
        name: $('#p_name_' + p.id).value, copies: Number($('#p_copies_' + p.id).value),
        header_text: state.header, footer_text: state.footer,
        is_default: Number($('#p_def_' + p.id).value), show_qr: state.show_qr ? 1 : 0,
        layout_json: JSON.stringify({ lines: state.lines, styles: state.styles }) } });
      toast('บันทึกแล้ว');
    }
  }
};

// ปุ่ม − [number] + สำหรับเพิ่ม/ลดขนาดตัวอักษร (แก้ค่าใน obj[key] ตรง ๆ)
function sizeStepper(obj, key, opts = {}) {
  const min = opts.min ?? 8, max = opts.max ?? 120, step = opts.step ?? 2;
  const inp = el('input', { type: 'number', min: String(min), max: String(max), title: 'ขนาด (px)', style: 'width:64px;text-align:center' });
  inp.value = String(obj[key] ?? min);
  const clamp = (v) => Math.max(min, Math.min(max, v));
  const set = (v) => { obj[key] = clamp(v); inp.value = String(obj[key]); if (opts.update) opts.update(); };
  inp.oninput = () => { const v = Number(inp.value); if (!Number.isNaN(v)) { obj[key] = v; if (opts.update) opts.update(); } };
  const minus = el('button', { class: 'mini', type: 'button', title: 'เล็กลง', onclick: () => set((Number(inp.value) || obj[key]) - step) }, '−');
  const plus = el('button', { class: 'mini', type: 'button', title: 'ใหญ่ขึ้น', onclick: () => set((Number(inp.value) || obj[key]) + step) }, '+');
  return el('span', { class: 'size-step' }, minus, inp, plus);
}

// แถวตั้งค่าหนึ่งองค์ประกอบ: [ป้าย] [แสดง] [− ขนาด +] [หนา] [ข้อความ]
function styleRow(label, obj, opts = {}) {
  const children = [el('span', { class: 'sr-label' }, label)];
  if (opts.show) {
    const c = el('input', { type: 'checkbox', title: 'แสดงบนบัตร' }); c.checked = obj.show !== false;
    c.onchange = () => { obj.show = c.checked; if (opts.update) opts.update(); };
    children.push(el('label', { class: 'chk' }, c, el('span', {}, 'แสดง')));
  }
  children.push(sizeStepper(obj, 'size', { min: 8, max: 120, update: opts.update }));
  if (opts.bold) {
    const b = el('input', { type: 'checkbox', title: 'ตัวหนา' }); b.checked = !!obj.bold;
    b.onchange = () => { obj.bold = b.checked; if (opts.update) opts.update(); };
    children.push(el('label', { class: 'chk' }, b, el('span', {}, 'หนา')));
  }
  if (opts.text) {
    // ข้อความผูกกับ obj.text (string = placeholder) หรือผูกภายนอกผ่าน { get,set,placeholder,multiline }
    const tc = (typeof opts.text === 'string')
      ? { get: () => obj.text ?? '', set: (v) => { obj.text = v; }, placeholder: opts.text }
      : opts.text;
    const t = tc.multiline
      ? el('textarea', { rows: '2', placeholder: tc.placeholder || '', style: 'flex:1;min-width:140px;min-height:0' })
      : el('input', { type: 'text', placeholder: tc.placeholder || 'ข้อความ', style: 'flex:1;min-width:110px' });
    t.value = tc.get() ?? '';
    t.oninput = () => { tc.set(t.value); if (opts.update) opts.update(); };
    children.push(t);
  }
  return el('div', { class: 'line-row' }, ...children);
}

// วันที่แบบไทย: '2026-05-05' -> '5 พ.ค. 2569'
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function thaiDate(d) {
  const m = String(d || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d || '';
  return `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1] || m[2]} ${Number(m[1]) + 543}`;
}
// เวลา 'HH:mm' -> 'HH:mm น.'
function thaiTime(t) { return t ? `${t} น.` : ''; }

// สร้าง DOM ตัวอย่างบัตรคิว ให้ตรง layout กับ kiosk/printer (pdf.js + escpos.js)
function buildTicketPreview(state, logoPath) {
  const s = state.styles;
  const t = el('div', { class: 'ticket' });
  if (logoPath) t.append(el('img', { class: 't-logo', src: logoPath, style: `max-width:${s.logoWidth}px;margin-bottom:${s.logoGap}px` }));
  if (s.header.show !== false && state.header) t.append(el('div', { class: 't-header', style: styleStr(s.header) }, state.header));
  state.lines.filter((l) => l.pos === 'top' && l.text).forEach((l) => t.append(previewLine(l, s.lineGap)));
  t.append(el('hr', { class: 't-hr', style: `margin:${s.hrGap}px 0` }));
  if (s.roomName.show !== false) t.append(el('div', { class: 't-room', style: styleStr(s.roomName) + `margin-top:${s.lineGap}px` }, 'เครื่องฉายรังสี L6'));
  if (s.slotTime.show !== false) t.append(el('div', { class: 't-slot', style: styleStr(s.slotTime) + `margin-top:${s.lineGap}px` }, '08.00 - 09.00 น.'));
  if (s.queueLabel.show !== false && (s.queueLabel.text || '').trim())
    t.append(el('div', { class: 't-qlabel', style: styleStr(s.queueLabel) }, s.queueLabel.text));
  t.append(el('div', { class: 't-qnum', style: styleStr(s.queueNumber) }, 'L60801'));
  if (s.footer.show !== false) (state.footer || '').split('\n').filter((x) => x.trim()).forEach((line) =>
    t.append(el('div', { class: 't-footer', style: styleStr(s.footer) + `margin-top:${s.lineGap}px` }, line)));
  state.lines.filter((l) => l.pos === 'bottom' && l.text).forEach((l) => t.append(previewLine(l, s.lineGap)));
  if (s.dateTime.show !== false) {
    t.append(el('hr', { class: 't-hr', style: `margin:${s.hrGap}px 0` }));
    t.append(el('div', { class: 't-datetime', style: `font-size:${s.dateTime.size}px` },
      el('span', {}, thaiDate('2026-05-05')), el('span', {}, thaiTime('12:00'))));
  }
  if (state.show_qr) t.append(el('div', { class: 't-qr' }, 'QR'));
  return t;
}
function styleStr(o) {
  return `font-size:${o.size || 16}px;font-weight:${o.bold ? 700 : 400};`;
}
function previewLine(l, lineGap) {
  const gap = Number.isFinite(Number(lineGap)) ? Number(lineGap) : 2;
  return el('div', { class: 't-line', style: `font-size:${l.size || 16}px;font-weight:${l.bold ? 700 : 400};text-align:${l.align || 'center'};margin:${gap}px 0;` }, l.text);
}
function selectFrom(opts, value, onchange) {
  const s = el('select', {}, ...opts.map(([v, t]) => el('option', { value: v }, t)));
  s.value = String(value);
  s.onchange = () => onchange(s.value);
  return s;
}

// ---------------- Playlist ----------------
TABS.playlist = async () => {
  const items = await api('/api/playlist?all=1');
  content.innerHTML = '';
  content.append(el('h2', { class: 'section' }, 'เพลย์ลิสต์มีเดีย (รูป/วิดีโอ 16:9)'));
  const up = el('div', { class: 'card' },
    el('label', { class: 'field' }, el('span', {}, 'อัปโหลดไฟล์ (รูป/วิดีโอ)'),
      (() => { const fi = el('input', { type: 'file', accept: 'image/*,video/*' }); fi.onchange = async () => { const fd = new FormData(); fd.append('media', fi.files[0]); await fetch('/api/playlist/upload', { method: 'POST', body: fd }); toast('อัปโหลดแล้ว'); TABS.playlist(); }; return fi; })()));
  content.append(up);
  const tbl = el('table', {}, el('tr', {}, ...['ชนิด', 'พรีวิว', 'ชื่อ', 'แสดง(วิ)', 'ลำดับ', 'เสียง', 'ปิดเสียง', 'แสดงผล', 'ใช้งาน', ''].map((h) => el('th', {}, h))));
  items.forEach((it) => {
    const dur = el('input', { type: 'number', value: it.duration_sec ?? '', style: 'width:70px', disabled: it.type === 'video' });
    const ord = el('input', { type: 'number', value: it.sort_order, style: 'width:60px' });
    const vol = el('input', { type: 'number', value: it.volume, style: 'width:70px' });
    const mut = el('select', {}, el('option', { value: '1' }, 'ปิด'), el('option', { value: '0' }, 'เปิด')); mut.value = String(it.muted);
    const act = el('select', {}, el('option', { value: '1' }, 'ใช่'), el('option', { value: '0' }, 'ไม่')); act.value = String(it.active);
    const fit = el('select', {}, el('option', { value: 'cover' }, 'เต็มกรอบ'), el('option', { value: 'contain' }, 'ตามขนาดจริง')); fit.value = it.fit === 'contain' ? 'contain' : 'cover';
    const prev = it.type === 'video' ? el('video', { class: 'thumb', src: it.path, muted: true }) : el('img', { class: 'thumb', src: it.path });
    tbl.append(el('tr', {},
      el('td', {}, it.type), el('td', {}, prev), el('td', {}, it.title || ''),
      el('td', {}, dur), el('td', {}, ord), el('td', {}, vol), el('td', {}, mut), el('td', {}, fit), el('td', {}, act),
      el('td', {}, el('div', { class: 'inline' },
        el('button', { class: 'mini edit', onclick: async () => { await api('/api/playlist/' + it.id, { method: 'PUT', body: { title: it.title, duration_sec: dur.value ? Number(dur.value) : null, sort_order: Number(ord.value), volume: Number(vol.value), muted: Number(mut.value), active: Number(act.value), fit: fit.value } }); toast('บันทึก'); } }, 'บันทึก'),
        el('button', { class: 'mini del', onclick: async () => { if (confirm('ลบไฟล์นี้?')) { await api('/api/playlist/' + it.id, { method: 'DELETE' }); TABS.playlist(); } } }, 'ลบ')))));
  });
  content.append(el('div', { class: 'card' }, tbl));
};

// ---------------- Kiosk ----------------
TABS.kiosk = async () => {
  const s = await api('/api/settings');
  content.innerHTML = '';
  content.append(el('h2', { class: 'section' }, 'ตั้งค่าเครื่อง Kiosk'),
    el('div', { class: 'card' },
      field('k_idle', 'เวลากลับหน้าหลักอัตโนมัติ (วินาที)', s.kiosk_idle_timeout, 'number'),
      field('k_copies', 'จำนวนสำเนาบัตรต่อครั้ง', s.print_copies, 'number'),
      (() => { const w = el('label', { class: 'field' }, el('span', {}, 'เปิดโปรแกรมพร้อม Windows'),
        (() => { const sel = el('select', { id: 'k_auto' }, el('option', { value: '1' }, 'เปิด'), el('option', { value: '0' }, 'ปิด')); sel.value = s.kiosk_autostart; return sel; })()); return w; })(),
      field('k_shutdown', 'เวลาปิดเครื่องอัตโนมัติ (HH:mm หรือเว้นว่าง)', s.kiosk_shutdown_time || ''),
      el('p', { class: 'muted', style: 'margin-bottom:12px' }, 'ค่าเหล่านี้ถูกอ่านโดยโปรแกรม Kiosk (Electron) ผ่าน /api/kiosk/config'),
      el('button', { class: 'btn', onclick: async () => {
        await api('/api/settings', { method: 'PUT', body: { kiosk_idle_timeout: $('#k_idle').value, print_copies: $('#k_copies').value, kiosk_autostart: $('#k_auto').value, kiosk_shutdown_time: $('#k_shutdown').value } });
        toast('บันทึกแล้ว');
      } }, 'บันทึก')));
};

// ---------------- Downloads ----------------
function fmtBytes(n) {
  if (!n) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let v = n; let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)) + ' ' + u[i];
}

TABS.downloads = async () => {
  content.innerHTML = '';
  let manifest = [];
  try { manifest = await api('/api/downloads'); } catch (e) { manifest = []; }
  const info = Object.fromEntries(manifest.map((m) => [m.key, m]));

  content.append(el('h2', { class: 'section' }, 'ดาวน์โหลดโปรแกรม'),
    el('p', { class: 'muted', style: 'margin-bottom:18px' },
      'ดาวน์โหลดโปรแกรมไปติดตั้ง/เปิดใช้งานบนเครื่องปลายทาง (เครื่องจอแสดงผล และเครื่อง Kiosk)'));

  const dlCard = (opt) => {
    const it = info[opt.key] || { exists: false };
    const meta = it.exists
      ? el('span', { class: 'muted', style: 'font-size:.95rem' }, 'ไฟล์: ' + it.file + (it.size ? ' · ' + fmtBytes(it.size) : ''))
      : el('span', { style: 'font-size:.95rem;color:#f4a04a' }, 'ยังไม่ได้เตรียมไฟล์บนเซิร์ฟเวอร์');
    const btn = it.exists
      ? el('a', { class: 'btn', href: '/api/downloads/file/' + opt.key, download: '' }, el('i', { 'data-lucide': 'download' }), opt.btnLabel)
      : el('button', { class: 'btn', disabled: '', style: 'opacity:.5;cursor:not-allowed' }, el('i', { 'data-lucide': 'download' }), opt.btnLabel);

    const steps = el('ol', { class: 'dl-steps' });
    opt.steps.forEach((s) => steps.append(el('li', {}, s)));

    return el('div', { class: 'card dl-card' },
      el('div', { class: 'dl-head' },
        el('i', { 'data-lucide': opt.icon }),
        el('div', {},
          el('div', { class: 'dl-title' }, opt.title),
          el('div', { class: 'dl-desc muted' }, opt.desc))),
      steps,
      opt.note ? el('p', { class: 'muted', style: 'margin-top:10px;font-size:.95rem' }, opt.note) : null,
      el('div', { class: 'dl-foot' }, btn, meta));
  };

  content.append(
    dlCard({
      key: 'display', icon: 'monitor', title: 'โปรแกรมจอแสดงผล (Display)',
      btnLabel: 'ดาวน์โหลด (.zip)',
      desc: 'สำหรับเครื่องที่ต่อทีวี/มอนิเตอร์แสดงคิว — เปิดเต็มจอพร้อมเสียงเรียกอัตโนมัติ ไม่ต้องติดตั้ง',
      steps: [
        'แตกไฟล์ .zip แล้ววางทั้งโฟลเดอร์ไว้ที่เครื่องจอ (เช่น Desktop)',
        'ถ้าเครื่องจอเป็นคนละเครื่องกับ server: เปิด start-display.cmd ด้วย Notepad แล้วแก้ URL เป็น IP ของ server เช่น http://192.168.1.50:8888/display/',
        'ดับเบิลคลิก start-display.cmd เพื่อเปิดจอแสดงผล (ออกจากเต็มจอด้วย Alt+F4)',
        'ต้องมี Google Chrome หรือ Microsoft Edge ติดตั้งบนเครื่องจอ',
      ],
      note: 'ในไฟล์ zip มีคู่มือ “วิธีตั้งค่าเครื่องจอแสดงผล.md” และสคริปต์ pick-monitor.ps1 สำหรับกรณีต่อหลายจอ',
    }),
    dlCard({
      key: 'kiosk', icon: 'printer', title: 'โปรแกรม Kiosk สำหรับ Windows',
      btnLabel: 'ดาวน์โหลดตัวติดตั้ง (.exe)',
      desc: 'สำหรับเครื่อง Kiosk ที่ให้ผู้ป่วยกดรับบัตรคิว และพิมพ์บัตรผ่านเครื่องพิมพ์ความร้อน',
      steps: [
        'ดาวน์โหลดตัวติดตั้ง แล้วดับเบิลคลิกเพื่อติดตั้งบนเครื่อง Kiosk',
        'เปิดโปรแกรม Queue2026Kiosk แล้วตั้งค่า URL ของ server และเครื่องพิมพ์',
        'ปรับค่าเวลา/จำนวนสำเนา/ปิดเครื่องอัตโนมัติ ได้ที่แท็บ “เครื่อง Kiosk”',
      ],
      note: 'อยากทดสอบบนเบราว์เซอร์ก่อนติดตั้ง? เปิดที่หน้า /kiosk-web',
    }),
  );

  if (window.lucide) lucide.createIcons();
};

// ---------------- Users ----------------
const ROLE_LABEL = { admin: 'ผู้ดูแล', staff: 'เจ้าหน้าที่', caller: 'เจ้าหน้าที่เรียกคิว' };
TABS.users = async () => {
  const users = await api('/api/auth/users');
  content.innerHTML = '';
  const tbl = el('table', {}, el('tr', {}, ...['ผู้ใช้', 'ชื่อแสดง', 'สิทธิ์', ''].map((h) => el('th', {}, h))));
  users.forEach((u) => tbl.append(el('tr', {},
    el('td', {}, u.username), el('td', {}, u.display_name || ''), el('td', {}, ROLE_LABEL[u.role] || u.role),
    el('td', {}, el('button', { class: 'mini del', onclick: async () => { if (confirm('ลบผู้ใช้?')) { await api('/api/auth/users/' + u.id, { method: 'DELETE' }); TABS.users(); } } }, 'ลบ')))));
  content.append(el('h2', { class: 'section' }, 'ผู้ใช้งาน'), el('div', { class: 'card' }, tbl),
    el('div', { class: 'card' }, el('h2', { class: 'section' }, 'เพิ่มผู้ใช้'),
      el('div', { class: 'row' }, field('u_name', 'ชื่อผู้ใช้', ''), field('u_pass', 'รหัสผ่าน', '')),
      el('div', { class: 'row' }, field('u_disp', 'ชื่อแสดง', ''),
        (() => { const w = el('label', { class: 'field' }, el('span', {}, 'สิทธิ์'), el('select', { id: 'u_role' }, el('option', { value: 'staff' }, 'เจ้าหน้าที่'), el('option', { value: 'caller' }, 'เจ้าหน้าที่เรียกคิว (เห็นเฉพาะภาพรวม+เรียกคิว)'), el('option', { value: 'admin' }, 'ผู้ดูแล'))); return w; })()),
      el('button', { class: 'btn', onclick: async () => { await api('/api/auth/users', { method: 'POST', body: { username: $('#u_name').value, password: $('#u_pass').value, display_name: $('#u_disp').value, role: $('#u_role').value } }); toast('เพิ่มแล้ว'); TABS.users(); } }, '+ เพิ่ม')));
};

// ---------------- Reset ----------------
TABS.reset = async () => {
  const rooms = await api('/api/rooms?all=1');
  content.innerHTML = '';
  const sel = el('select', { id: 'resetRoom' }, el('option', { value: '' }, 'ทุกห้อง'));
  rooms.forEach((r) => sel.append(el('option', { value: r.id }, `${r.name} (${r.code})`)));
  content.append(el('h2', { class: 'section' }, 'รีเซ็ตคิว (วันปัจจุบัน)'),
    el('div', { class: 'card' },
      el('p', { class: 'muted', style: 'margin-bottom:12px' }, 'เริ่มนับเลขคิวใหม่ที่ 01 สำหรับวันนี้ (ปกติระบบรีเซ็ตอัตโนมัติเมื่อขึ้นวันใหม่)'),
      el('label', { class: 'field' }, el('span', {}, 'เลือกห้อง'), sel),
      el('button', { class: 'btn danger', onclick: async () => {
        if (!confirm('ยืนยันรีเซ็ตคิว?')) return;
        await api('/api/queues/reset', { method: 'POST', body: { roomId: sel.value || undefined } });
        toast('รีเซ็ตแล้ว');
      } }, 'รีเซ็ตคิว')));
};

// helper
function field(id, label, value = '', type = 'text') {
  const input = el('input', { id, type });
  input.value = value ?? '';
  return el('label', { class: 'field' }, el('span', {}, label), input);
}

render('general');
