/**
 * APQueue — ตัวคุม server เบื้องหลัง (งาน Task Scheduler "APQueue" เรียกตอน login)
 *
 *   node ops\tools\run-server.js               รันในหน้าต่างนี้
 *   node ops\tools\run-server.js --background  เปิดตัวเองใหม่แบบซ่อนหน้าต่าง แล้วออก
 *
 * - server ตอบอยู่แล้ว (เปิดซ้ำ / มี start-server.cmd เปิดค้าง) → ออกทันที ไม่เปิดซ้อน
 * - server ตาย → เปิดใหม่เอง รอ 3 → 6 → … สูงสุด 60 วิ (รันได้นานเกิน 1 นาทีแล้วนับใหม่)
 * - log: logs\server.log (รอบก่อนหน้า logs\server.prev.log) · การเปิด/ตาย: logs\start.log
 * --background มีไว้เพราะ Task Scheduler เปิด node.exe พร้อมหน้าต่างดำค้างบนจอ — ปิดหน้าต่างนั้นแล้ว server ดับ
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { ROOT, LOGS, health } = require('./lib');

if (process.argv.includes('--background')) {
    spawn(process.execPath, [__filename], { cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true }).unref();
    process.exit(0);
}

fs.mkdirSync(LOGS, { recursive: true });
const SERVER_LOG = path.join(LOGS, 'server.log');
const START_LOG = path.join(LOGS, 'start.log');
const stamp = () => new Date().toLocaleString('th-TH', { hour12: false });
const note = (msg) => { try { fs.appendFileSync(START_LOG, `[${stamp()}] ${msg}\n`); } catch { /* ดิสก์เต็ม — ไม่ให้ตัวคุมตาย */ } };

function rotate() {
    try {
        if (fs.statSync(SERVER_LOG).size > 5 * 1024 * 1024) fs.renameSync(SERVER_LOG, path.join(LOGS, 'server.prev.log'));
    } catch { /* ยังไม่มี log */ }
}

let wait = 3000;
function run() {
    rotate();
    const out = fs.openSync(SERVER_LOG, 'a');
    const began = Date.now();
    note('เปิด server');
    const child = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', path.join(ROOT, 'server', 'src', 'index.js')],
        { cwd: path.join(ROOT, 'server'), stdio: ['ignore', out, out], windowsHide: true });
    child.on('exit', (code) => {
        fs.closeSync(out);
        wait = Date.now() - began > 60000 ? 3000 : Math.min(wait * 2, 60000);
        note(`server หยุด (exit ${code}) — เปิดใหม่ใน ${wait / 1000} วิ`);
        setTimeout(run, wait);
    });
}

health().then((h) => {
    if (h.ok) { note('server ทำงานอยู่แล้ว — ไม่เปิดซ้ำ'); process.exit(0); }
    run();
});
