'use strict';
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const compression = require('compression');

const { PORT, HOST, PUBLIC_DIR, ASSETS_DIR } = require('./config');
require('./db/connection'); // init db + schema
require('./db/seed').ensureSeed(); // seed defaults if empty

const { setup } = require('./realtime/io');

const app = express();
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '5mb' }));

const server = http.createServer(app);
const io = setup(server);

// ----- static assets (ไฟล์เสียง/รูป/วิดีโอ แคชได้) -----
app.use('/assets', express.static(ASSETS_DIR));

// หน้าเว็บ (html/js/css) ห้ามแคช — ให้เบราว์เซอร์โหลดเวอร์ชันล่าสุดเสมอ (กัน cache ค้าง)
const noCacheWeb = (res, p) => {
  if (/\.(html|js|css)$/i.test(p)) res.setHeader('Cache-Control', 'no-cache');
};

// ----- API -----
app.use('/api/queues', require('./routes/queues')());
app.use('/api/rooms', require('./routes/rooms')());
app.use('/api/slots', require('./routes/slots')());
app.use('/api/profiles', require('./routes/profiles')(io));
app.use('/api/playlist', require('./routes/playlist')(io));
app.use('/api/settings', require('./routes/settings')(io));
app.use('/api/kiosk', require('./routes/kiosk')());
app.use('/api/downloads', require('./routes/downloads')());
app.use('/api/reports', require('./routes/reports')());
app.use('/api/auth', require('./routes/auth')());

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ----- web clients (static) -----
app.use(express.static(PUBLIC_DIR, { setHeaders: noCacheWeb }));
// แต่ละแอปเป็นโฟลเดอร์ย่อย -> เสิร์ฟ index.html ของแต่ละแอป
for (const appName of ['hub', 'display', 'calling', 'settings', 'reports', 'kiosk-web']) {
  app.get('/' + appName, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(PUBLIC_DIR, appName, 'index.html'));
  });
}
// root = หน้า Dashboard รวม (จอแสดงผลสาธารณะให้เปิด /display โดยตรง)
app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(PUBLIC_DIR, 'hub', 'index.html'));
});

server.listen(PORT, HOST, () => {
  console.log(`\n✅ Queue 2026 server running`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   LAN:     http://<server-ip>:${PORT}`);
  console.log(`   แดชบอร์ด /  จอแสดงผล /display  เรียกคิว /calling  ตั้งค่า /settings  รายงาน /reports  ทดสอบ kiosk /kiosk-web\n`);
});
