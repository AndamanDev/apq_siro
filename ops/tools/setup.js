/**
 * APQueue — ติดตั้ง/ซ่อมเครื่องแม่ข่าย (ops\apqueue.bat เรียกหลังลง Git + Node และดึงโค้ดแล้ว)
 * รันซ้ำได้ทุกเมื่อ: ทุกขั้นตรวจก่อน ทำเฉพาะส่วนที่ขาด · ต้องรันแบบ administrator (ไฟร์วอลล์)
 *
 *   1 Node 24 ขึ้นไป   2 ไลบรารี (npm ci)   3 kiosk\config.json   4 ไฟร์วอลล์พอร์ต 8888
 *   5 เปิดเองตอน login + สำรองทุกคืน   6 เปิด server แล้วตรวจว่าตอบ
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT, PORT, FIREWALL_RULE, C, health, lanIps, stopServer, startServer, kioskRunning, stopKiosk, libsState, installLibs } = require('./lib');

const step = (n, msg) => console.log(`\n${C.b}[${n}/6] ${msg}${C.x}`);
const fail = (msg) => { console.log(`\n${C.r}!! ${msg}${C.x}`); process.exit(1); };

(async () => {
    step(1, 'Node.js');
    const major = Number(process.versions.node.split('.')[0]);
    if (major < 24) fail(`Node ${process.versions.node} เก่าเกินไป — ระบบต้องใช้ Node 24 ขึ้นไป (ฐานข้อมูลในตัวของ Node)\n   ติดตั้งใหม่: winget upgrade -e --id OpenJS.NodeJS.LTS`);
    console.log(`    Node ${process.versions.node} — ใช้ได้`);

    step(2, 'ไลบรารี (node_modules)');
    if (!libsState().need) {
        console.log('    ครบแล้ว — ข้าม');
    } else {
        console.log('    หยุด server/Kiosk ก่อน (ล็อกไฟล์ไลบรารีไว้ระหว่างทำงาน) แล้วติดตั้ง — ต้องมีเน็ต ใช้เวลาสักครู่');
        stopServer();
        if (kioskRunning()) stopKiosk();
        if (!installLibs()) fail('ลงไลบรารีไม่สำเร็จ — เช็กเน็ต แล้วรันใหม่ · ยังไม่ได้: ปิดแอนตี้ไวรัส 10 นาทีแล้วลองอีกครั้ง');
    }

    step(3, 'ตั้งค่า Kiosk (kiosk\\config.json)');
    const cfg = path.join(ROOT, 'kiosk', 'config.json');
    if (fs.existsSync(cfg)) {
        console.log('    มีอยู่แล้ว — ไม่แตะ');
    } else {
        fs.copyFileSync(path.join(ROOT, 'kiosk', 'config.sample.json'), cfg);
        console.log(`    สร้างจาก config.sample.json แล้ว — ${C.y}แก้ "interface" ให้เป็นชื่อเครื่องพิมพ์จริง${C.x} (คู่มือ ข้อ A7)`);
    }

    step(4, `ไฟร์วอลล์ (เปิดพอร์ต ${PORT} ให้เครื่องอื่นใน LAN)`);
    if (spawnSync('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${FIREWALL_RULE}`], { stdio: 'ignore' }).status === 0) {
        console.log('    เปิดอยู่แล้ว');
    } else {
        const r = spawnSync('netsh', ['advfirewall', 'firewall', 'add', 'rule', `name=${FIREWALL_RULE}`, 'dir=in', 'action=allow', 'protocol=TCP', `localport=${PORT}`], { encoding: 'utf8' });
        if (r.status !== 0) console.log(`    ${C.r}เปิดไม่สำเร็จ — ต้องรันแบบ administrator${C.x} ${(r.stdout || '').trim()}`);
        else console.log('    เปิดแล้ว');
    }

    step(5, 'เปิดเองตอนเปิดเครื่อง + สำรองทุกคืน');
    if (spawnSync(process.execPath, [path.join(__dirname, 'install-autostart.js')], { stdio: 'inherit' }).status !== 0) {
        console.log(`    ${C.y}ตั้งไม่สำเร็จ — ยังใช้ระบบได้ ตั้งใหม่ได้จากเมนู${C.x}`);
    }

    step(6, 'เปิด server');
    if ((await health()).ok) {
        console.log('    ทำงานอยู่แล้ว');
    } else if (!(await startServer())) {
        fail('server ไม่ตอบ — ดู logs\\server.log บรรทัดท้าย ๆ');
    }
    console.log(`\n${C.g}${C.b}  ✓ ติดตั้งเสร็จ${C.x}\n`);
    console.log('  เครื่องจอแสดงผล / เครื่องประจำห้อง ใช้ที่อยู่นี้:');
    lanIps().forEach((x, i) => console.log(`    ${i === 0 ? C.b + C.g : ''}http://${x.ip}:${PORT}${C.x}  ${C.dim}(${x.name})${C.x}`));
    console.log(`\n  ${C.dim}ควรล็อก IP เครื่องนี้ที่เราเตอร์ (คู่มือ ข้อ A3) · เปลี่ยนรหัส admin ที่ /settings${C.x}`);
})();
