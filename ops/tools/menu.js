#!/usr/bin/env node
/**
 * APQueue — เมนูรวมงานดูแลระบบ (เปิดผ่าน ops\apqueue.bat ที่เครื่องแม่ข่าย)
 * ══════════════════════════════════════════════════════════════════
 * แบบเดียวกับเมนูของ CafeFlow: ไฟล์เดียว กดลูกศรขึ้น/ลงเลือกหัวข้อ แล้ว Enter
 *
 *   ↑ ↓ เลือก · Enter ทำ · กดตัวเลขเลือกตรง · Esc / q ออก
 * ไม่มีไลบรารีเพิ่ม (Node อย่างเดียว) · ทำงานได้แม้ไม่มีเน็ต (ยกเว้นข้อ "อัปเดตระบบ" ที่ต้องดึงโค้ด)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');
const {
    ROOT, OPS, LOGS, PORT, TASK, KIOSK_TASK, FIREWALL_RULE, C, health, lanIps,
    stopServer, startServer, kioskRunning, stopKiosk, startKiosk, taskExists, libsState, installLibs,
} = require('./lib');

const BACKUP = path.join(ROOT, 'backup');
const DB_PATH = path.join(ROOT, 'server', 'data', 'queue.db');
let reloadAfter = false;   // อัปเดตสำเร็จ → กลับเมนูแล้วเปิดเมนูรุ่นใหม่แทน

/* ── งานแต่ละข้อ ─────────────────────────────────────────── */
const runCmd = (f, args = []) => spawnSync('cmd', ['/c', path.join(ROOT, f), ...args], { stdio: 'inherit', cwd: ROOT });
const runNode = (f, args = []) => spawnSync(process.execPath, [f, ...args], { stdio: 'inherit', cwd: ROOT });
const backupNow = (reason) => spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', path.join(OPS, 'backup.js'), `--reason=${reason}`], { stdio: 'inherit', cwd: ROOT }).status === 0;

const ITEMS = [
    { group: 'ใช้ประจำ' },
    { label: 'ตรวจสถานะระบบ', desc: 'server · ฐานข้อมูล · สำรองล่าสุด · Kiosk · ไฟร์วอลล์ · IP — ดูก่อนเมื่อจอ/เครื่องห้องมีปัญหา', run: status },
    { label: 'เปิดหน้าแดชบอร์ด', desc: `เปิดหน้าหลักในเบราว์เซอร์ (http://localhost:${PORT}) — เครื่องอื่นใช้ http://<IP เครื่องนี้>:${PORT}`, run: openDashboard },
    { label: 'รีสตาร์ท server', desc: 'หน้าเว็บค้าง / จอไม่อัปเดตเลขคิว / เพิ่งแก้ค่าในเครื่อง — ระบบหยุด ~5 วินาที', run: restart },
    { label: 'ดูที่อยู่เครื่องแม่ข่าย (IP)', desc: 'ใช้ตั้งเครื่องจอแสดงผล (start-display.cmd) และเครื่องประจำห้อง (/calling)', run: showIp },
    { label: 'เปิดจอแสดงผลบนเครื่องนี้', desc: 'Chrome เต็มจอพร้อมเสียงเรียกคิว — เครื่องอื่นใช้ไฟล์ start-display.cmd', run: () => runCmd('start-display.cmd') },
    { label: 'เปิด Kiosk (พิมพ์บัตรคิว)', desc: 'Ctrl+Shift+P = ตั้งค่า/ทดสอบเครื่องพิมพ์ · Ctrl+Shift+Q = ออก', run: openKiosk },
    { label: 'สำรองข้อมูลตอนนี้', desc: 'ปกติสำรองเองทุกคืน 23:30 — กดเองก่อนทำอะไรเสี่ยง ๆ (ไม่ต้องหยุดระบบ)', run: () => backupNow('manual') },
    { label: 'ดู log ล่าสุด', desc: 'บรรทัดท้าย ๆ ของ log server · การเปิดระบบ · สำรองข้อมูล — ถ่ายรูปส่งช่างได้', run: showLogs },
    { group: 'นาน ๆ ครั้ง' },
    { label: 'อัปเดตระบบเป็นรุ่นใหม่', desc: 'สำรอง → ดึงโค้ดใหม่จาก GitHub (ต้องมีเน็ต) → ไลบรารี → รีสตาร์ท · ระบบหยุด ~10 วินาที', run: update },
    { label: 'กู้คืนข้อมูลจากไฟล์สำรอง', desc: '⚠ ข้อมูลปัจจุบันถูกเขียนทับ (สำรองตัวปัจจุบันไว้ให้ก่อน) — ใช้ตอนข้อมูลเสีย/ย้ายเครื่อง', run: restore },
    { label: 'ตั้งให้ระบบเปิดเองตอนเปิดเครื่อง', desc: 'Task Scheduler: เปิด server ตอน login + สำรองทุกคืน 23:30', run: () => runNode(path.join(__dirname, 'install-autostart.js')) },
    { label: 'ตั้ง/ถอน Kiosk ให้เปิดเองตอนเปิดเครื่อง', desc: 'เฉพาะเครื่องที่ต่อเครื่องพิมพ์บัตรคิว', run: kioskAutostart },
    { label: 'ติดตั้งซ้ำ / ซ่อมระบบ', desc: 'ตรวจ Git · Node · ไลบรารี · config Kiosk · ไฟร์วอลล์ · เปิดเอง ทำเฉพาะส่วนที่ขาด — เปิดหน้าต่างใหม่ (กด Yes)', run: () => runCmd('ops\\apqueue.bat', ['install']) },
    { group: '' },
    { label: 'ออก', desc: '', run: null },
];
const PICKABLE = ITEMS.map((x, i) => (x.label ? i : -1)).filter((i) => i >= 0);

const fail = (msg) => { console.log(`\n${C.r}!! ${msg}${C.x}`); return false; };
const ask = (q) => new Promise((r) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); r(a.trim()); });
});

async function restart() {
    console.log('  หยุด server…');
    stopServer();
    console.log('  เปิดใหม่…');
    if (!(await startServer())) return fail('server ไม่กลับมา — เลือก "ดู log ล่าสุด" ถ่ายรูปส่งช่าง');
    console.log(`\n${C.g}  ✓ server ทำงานแล้ว${C.x} ${C.dim}— จอ/เครื่องห้องต่อกลับเอง ไม่ต้องรีเฟรช${C.x}`);
    return true;
}

async function openDashboard() {
    if (!(await health()).ok) console.log(`  ${C.y}server ยังไม่ตอบ — หน้าเว็บอาจว่าง ลอง "รีสตาร์ท server"${C.x}`);
    spawnSync('cmd', ['/c', 'start', '', `http://localhost:${PORT}/`], { stdio: 'ignore' });
    console.log('  เปิดในเบราว์เซอร์แล้ว');
    return true;
}

async function openKiosk() {
    if (!fs.existsSync(path.join(ROOT, 'kiosk', 'config.json'))) {
        return fail('ยังไม่มี kiosk\\config.json — เลือก "ติดตั้งซ้ำ / ซ่อมระบบ" แล้วแก้ชื่อเครื่องพิมพ์ (คู่มือ ข้อ A7)');
    }
    if (kioskRunning()) { console.log('  Kiosk เปิดอยู่แล้ว'); return true; }
    if (!(await health()).ok) console.log(`  ${C.y}server ยังไม่ตอบ — Kiosk จะลองต่อใหม่เอง${C.x}`);
    startKiosk();
    console.log('  เปิดแล้ว');
    return true;
}

async function kioskAutostart() {
    const on = taskExists(KIOSK_TASK);
    console.log(`  ตอนนี้: ${on ? C.g + 'เปิดเองอยู่' : 'ไม่ได้ตั้ง'}${C.x}`);
    const a = await ask(on ? '  ถอนออก? พิมพ์ y แล้ว Enter: ' : '  ตั้งให้ Kiosk เปิดเองตอน login? พิมพ์ y แล้ว Enter: ');
    if (a.toLowerCase() !== 'y') { console.log('  ไม่เปลี่ยน'); return true; }
    runNode(path.join(__dirname, 'install-autostart.js'), [on ? '--remove-kiosk' : '--kiosk']);
    return true;
}

/* ── อัปเดตระบบ ─────────────────────────────────────────────
 * 1 สำรองก่อน · 2 git pull · 3 ไลบรารี (เฉพาะเมื่อ package-lock เปลี่ยน/ของหาย) · 4 รีสตาร์ท แล้วรอ health
 * ขั้น 3–4 รันจาก "ไฟล์นี้ตัวใหม่" ที่เพิ่งดึงมา (spawn ตัวเองด้วย --update-finish) — โค้ดในหน่วยความจำเป็นรุ่นเก่า
 * ฐานข้อมูลไม่ต้อง migrate แยก — server\src\db\connection.js ปรับโครงตารางเองตอนเปิด
 * ไลบรารี: หยุด server + Kiosk ก่อน npm ci เสมอ — Electron ที่เปิดอยู่ล็อกไฟล์ใน node_modules npm ci จะล้มกลางทาง */
async function update() {
    if (!fs.existsSync(path.join(ROOT, '.git'))) {
        return fail('โฟลเดอร์นี้ไม่ได้ติดตั้งด้วย Git (คัดลอกมา) — อัปเดตด้วย Git ไม่ได้\n' +
            '   ทางเลือก: คัดลอกโฟลเดอร์รุ่นใหม่มาทับ (ยกเว้น server\\data · kiosk\\config.json · backup)\n' +
            '   หรือดาวน์โหลด ops\\apqueue.bat จาก GitHub ไปติดตั้งใหม่ แล้วย้าย server\\data\\queue.db มาวาง');
    }
    console.log(`${C.dim}ทำตอนไม่มีผู้ป่วยรอคิว — ระบบหยุดราว 10 วินาที${C.x}\n`);
    console.log(`${C.b}[1/4] สำรองฐานข้อมูล…${C.x}`);
    if (!backupNow('update')) return fail('สำรองไม่สำเร็จ — หยุดอัปเดต (ยังไม่ได้เปลี่ยนอะไร) · ดู logs\\backup.log');

    console.log(`\n${C.b}[2/4] ดึงโค้ดใหม่ (git pull)…${C.x}`);
    const before = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
    if (spawnSync('git', ['pull', '--ff-only'], { stdio: 'inherit', cwd: ROOT }).status !== 0) {
        return fail('git pull ไม่สำเร็จ — หยุดอัปเดต · เน็ตหลุด หรือมีคนแก้ไฟล์ในเครื่องนี้เอง (git status)\n   ถ่ายรูปข้อความด้านบนส่งช่าง');
    }
    const after = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
    if (before === after && !libsState().need) {
        console.log(`\n${C.g}  ✓ เป็นรุ่นล่าสุดอยู่แล้ว — ไม่ต้องรีสตาร์ท${C.x}`);
        return true;
    }
    spawnSync('git', ['log', '--oneline', '--no-decorate', `${before}..${after}`], { stdio: 'inherit', cwd: ROOT });

    const self = path.join(__dirname, 'menu.js');
    const ok = fs.existsSync(self)
        ? spawnSync(process.execPath, [self, '--update-finish'], { stdio: 'inherit', cwd: ROOT }).status === 0
        : await updateFinish();
    if (ok) reloadAfter = true;
    return ok;
}

async function updateFinish() {
    const kiosk = kioskRunning();
    console.log(`\n${C.b}[3/4] ไลบรารี…${C.x}`);
    if (!libsState().need) {
        console.log('    ไม่มีไลบรารีเปลี่ยน — ข้าม');
    } else {
        console.log('    หยุด server และ Kiosk ก่อน (ล็อกไฟล์ไลบรารีไว้ระหว่างทำงาน)…');
        stopServer();
        if (kiosk) stopKiosk();
        if (!installLibs()) {
            return fail('ลงไลบรารีไม่สำเร็จ — ตอนนี้ server หยุดอยู่\n   1. เช็กเน็ต  2. ปิดโปรแกรมที่เปิดอยู่ในโฟลเดอร์นี้  3. กดอัปเดตอีกครั้ง\n   ยังไม่ได้: ปิดแอนตี้ไวรัส 10 นาทีแล้วกดใหม่');
        }
    }

    console.log(`\n${C.b}[4/4] รีสตาร์ทด้วยโค้ดใหม่…${C.x}`);
    stopServer();
    if (!(await startServer())) return fail('server ไม่กลับมา — เปิด logs\\server.log ถ่ายรูปบรรทัดท้าย ๆ ส่งช่าง');
    if (kiosk) {
        stopKiosk();
        startKiosk();
        console.log('    เปิด Kiosk ใหม่แล้ว');
    }
    console.log(`\n${C.g}${C.b}  ✓ อัปเดตเสร็จ — ระบบทำงานด้วยรุ่นใหม่แล้ว${C.x}`);
    console.log(`${C.dim}  จอแสดงผล/เครื่องห้องที่เปิดค้างไว้: กด F5 (หรือปิด-เปิด) เพื่อโหลดหน้าเว็บรุ่นใหม่${C.x}`);
    return true;
}

/* ── กู้คืน ───────────────────────────────────────────────
 * สำรองตัวปัจจุบันก่อน (reason=before-restore) → หยุด server → วางไฟล์สำรองทับ + ลบ -wal/-shm → คืนไฟล์สื่อที่หาย → เปิด */
async function restore() {
    const files = fs.existsSync(BACKUP) ? fs.readdirSync(BACKUP).filter((f) => /^queue-.*\.db$/.test(f)).sort().reverse().slice(0, 15) : [];
    if (!files.length) return fail('ยังไม่มีไฟล์สำรองใน backup\\ — ย้ายเครื่อง: เอาโฟลเดอร์ backup จากเครื่องเดิมมาวางก่อน');
    console.log('  ไฟล์สำรอง (ใหม่สุดอยู่บน):\n');
    files.forEach((f, i) => {
        const kb = Math.round(fs.statSync(path.join(BACKUP, f)).size / 1024);
        console.log(`   ${String(i + 1).padStart(2)}  ${f}  ${C.dim}${kb} KB${C.x}`);
    });
    const n = Number(await ask('\n  เลือกหมายเลข (Enter = ยกเลิก): '));
    const pick = files[n - 1];
    if (!pick) { console.log('  ยกเลิก — ไม่ได้เปลี่ยนอะไร'); return true; }
    console.log(`\n  ${C.r}${C.b}ข้อมูลคิวปัจจุบันจะถูกแทนด้วย ${pick}${C.x}`);
    if ((await ask('  พิมพ์ YES (ตัวใหญ่) เพื่อยืนยัน: ')) !== 'YES') { console.log('  ยกเลิก — ไม่ได้เปลี่ยนอะไร'); return true; }

    if (fs.existsSync(DB_PATH) && !backupNow('before-restore')) {
        return fail('สำรองข้อมูลปัจจุบันไม่สำเร็จ — หยุดกู้คืน (ยังไม่ได้เปลี่ยนอะไร)');
    }
    console.log('  หยุด server…');
    stopServer();
    for (const ext of ['-wal', '-shm']) fs.rmSync(DB_PATH + ext, { force: true });
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.copyFileSync(path.join(BACKUP, pick), DB_PATH);
    for (const dir of ['media', 'logos']) {
        const src = path.join(BACKUP, 'assets', dir);
        const dst = path.join(ROOT, 'server', 'assets', dir);
        if (!fs.existsSync(src)) continue;
        fs.mkdirSync(dst, { recursive: true });
        for (const f of fs.readdirSync(src)) if (!fs.existsSync(path.join(dst, f))) fs.copyFileSync(path.join(src, f), path.join(dst, f));
    }
    console.log('  เปิด server…');
    if (!(await startServer())) return fail('server ไม่กลับมา — ดู logs\\server.log');
    console.log(`\n${C.g}${C.b}  ✓ กู้คืนจาก ${pick} แล้ว${C.x} ${C.dim}(ข้อมูลก่อนกู้อยู่ในไฟล์ *-before-restore.db)${C.x}`);
    return true;
}

/* ── งานที่ทำในตัวเมนูเอง ──────────────────────────────────── */
async function status() {
    const line = (ok, name, info) => console.log(`  ${ok === null ? C.y + '•' : ok ? C.g + '✓' : C.r + '✗'}${C.x} ${name.padEnd(20)} ${C.dim}${info}${C.x}`);
    console.log('\n  กำลังตรวจ…\n');
    const h = await health();
    line(h.ok, 'server', h.ok ? `http://127.0.0.1:${PORT}` : 'ไม่ตอบ — ' + h.body + ' → ลอง "รีสตาร์ท server"');

    if (fs.existsSync(DB_PATH)) {
        const s = fs.statSync(DB_PATH);
        line(true, 'ฐานข้อมูล', `server\\data\\queue.db · ${Math.round(s.size / 1024)} KB`);
    } else {
        line(false, 'ฐานข้อมูล', 'ยังไม่มีไฟล์ — จะสร้างเองตอนเปิด server ครั้งแรก');
    }

    const last = fs.existsSync(BACKUP) ? fs.readdirSync(BACKUP).filter((f) => /^queue-.*\.db$/.test(f)).sort().pop() : null;
    if (!last) line(false, 'สำรองล่าสุด', 'ยังไม่เคยสำรอง → "สำรองข้อมูลตอนนี้" และ "ตั้งให้ระบบเปิดเอง"');
    else {
        const days = (Date.now() - fs.statSync(path.join(BACKUP, last)).mtimeMs) / 86400000;
        line(days < 2, 'สำรองล่าสุด', `${last} · ${days < 1 ? 'ภายในวันนี้' : Math.floor(days) + ' วันก่อน'}`);
    }

    line(taskExists(TASK) ? true : null, 'เปิดเองตอนเปิดเครื่อง', taskExists(TASK) ? 'ตั้งแล้ว (Task Scheduler)' : 'ยังไม่ได้ตั้ง → "ตั้งให้ระบบเปิดเองตอนเปิดเครื่อง"');
    const kOn = kioskRunning();
    line(kOn ? true : null, 'Kiosk', `${kOn ? 'เปิดอยู่' : 'ไม่ได้เปิดบนเครื่องนี้'}${taskExists(KIOSK_TASK) ? ' · เปิดเองตอน login' : ''}`);
    const fw = spawnSync('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${FIREWALL_RULE}`], { stdio: 'ignore' }).status === 0;
    line(fw, 'ไฟร์วอลล์', fw ? `เปิดพอร์ต ${PORT} แล้ว` : `ยังไม่เปิดพอร์ต ${PORT} — เครื่องอื่นต่อไม่ติด → "ติดตั้งซ้ำ / ซ่อมระบบ"`);
    const ver = spawnSync('git', ['log', '-1', '--format=%h · %cd', '--date=format:%d/%m/%Y %H:%M'], { cwd: ROOT, encoding: 'utf8' });
    line(ver.status === 0 ? true : null, 'รุ่นโปรแกรม', ver.status === 0 ? ver.stdout.trim() : 'ไม่ได้ติดตั้งด้วย Git (อัปเดตอัตโนมัติไม่ได้)');
    const ips = lanIps();
    line(ips.length > 0, 'เครือข่าย (LAN)', ips.length ? ips.map((x) => x.ip).join(', ') : 'ยังไม่ได้ต่อสายแลน/Wi-Fi');
}

function showIp() {
    const ips = lanIps();
    if (!ips.length) { console.log(`\n  ${C.r}เครื่องนี้ยังไม่ได้ต่อสายแลน/Wi-Fi${C.x}`); return; }
    const ip = ips[0].ip;
    console.log('\n  ที่อยู่เครื่องแม่ข่าย:\n');
    ips.forEach((x, i) => console.log(`  ${i === 0 ? C.b + C.g : ''}http://${x.ip}:${PORT}${C.x}   ${C.dim}(${x.name})${C.x}`));
    console.log(`\n  เครื่องจอแสดงผล  แก้ใน start-display.cmd:  ${C.b}set "URL=http://${ip}:${PORT}/display/"${C.x}`);
    console.log(`  เครื่องประจำห้อง เปิดเบราว์เซอร์ไปที่:        ${C.b}http://${ip}:${PORT}/calling${C.x}`);
    console.log(`\n  ${C.dim}IP เปลี่ยนได้ถ้ายังไม่ได้ล็อกที่เราเตอร์ (คู่มือ ข้อ A3) — เครื่องที่ตั้งไว้แล้วจะต่อไม่ติด${C.x}`);
}

function showLogs() {
    const tail = (f, n) => {
        const p = path.join(LOGS, f);
        if (!fs.existsSync(p)) { console.log(`  ${C.dim}(ยังไม่มี ${f})${C.x}`); return; }
        fs.readFileSync(p, 'utf8').trimEnd().split(/\r?\n/).slice(-n).forEach((l) => console.log('  ' + l.slice(0, 200)));
    };
    for (const [f, n, title] of [['start.log', 8, 'การเปิดระบบ'], ['backup.log', 6, 'สำรองข้อมูล'], ['server.log', 15, 'server']]) {
        console.log(`\n${C.b}── ${title} (logs\\${f}) ──${C.x}`);
        tail(f, n);
    }
}

/* ── หน้าจอเมนู ─────────────────────────────────────────── */
let sel = PICKABLE[0];
let busy = false;

function draw() {
    console.clear();
    console.log(`${C.b}${C.g}  🏥 APQueue — เมนูดูแลระบบคิว${C.x}   ${C.dim}↑ ↓ เลือก · Enter ทำ · Esc ออก${C.x}\n`);
    let n = 0;
    ITEMS.forEach((it, i) => {
        if (!it.label) { if (it.group) console.log(`\n  ${C.dim}${it.group}${C.x}`); return; }
        n++;
        const num = it.run ? String(n).padStart(2) : ' 0';
        const text = ` ${num}  ${it.label} `;
        console.log(i === sel ? `  ${C.rev}${C.b}▶${text}${C.x}` : `   ${text}`);
    });
    console.log(`\n  ${C.y}${ITEMS[sel].desc || ''}${C.x}`);
}

function move(d) {
    const k = PICKABLE.indexOf(sel);
    sel = PICKABLE[(k + d + PICKABLE.length) % PICKABLE.length];
    draw();
}

async function choose() {
    const it = ITEMS[sel];
    if (!it.run) return quit();
    busy = true;
    // หยุดอ่านก่อน แล้วค่อยออกจากโหมดดิบ — สลับกันบน Windows บรรทัดแรกที่พิมพ์ในงานลูกถูกเมนูแย่งไป
    process.stdin.pause();
    process.stdin.setRawMode(false);
    await new Promise((r) => setTimeout(r, 50));
    console.clear();
    console.log(`${C.b}${C.g}▶ ${it.label}${C.x}\n`);
    try { await it.run(); } catch (e) { console.log(`\n${C.r}ทำไม่สำเร็จ: ${e.message}${C.x}`); }
    process.stdin.resume();
    await ask(`\n${C.dim}กด Enter เพื่อกลับเมนู…${C.x}`);
    if (reloadAfter) {
        // เพิ่งอัปเดต — เมนูที่รันอยู่เป็นรุ่นเก่าในหน่วยความจำ เปิดตัวใหม่จากไฟล์แทน
        process.stdin.pause();
        const r = spawnSync(process.execPath, [path.join(__dirname, 'menu.js')], { stdio: 'inherit', cwd: ROOT });
        process.exit(r.status || 0);
    }
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    busy = false;
    draw();
}

function quit() { console.clear(); process.exit(0); }

// ขั้นหลัง git pull ของการอัปเดต — update() ของเมนูรุ่นก่อนเรียกไฟล์นี้ (รุ่นใหม่) ด้วย flag นี้
if (process.argv.includes('--update-finish')) {
    updateFinish().then((ok) => process.exit(ok ? 0 : 1), (e) => { console.error(e); process.exit(1); });
    return;
}
if (!process.stdin.isTTY) {
    console.error('เปิดเมนูนี้ในหน้าต่างคำสั่ง — ดับเบิลคลิก ops\\apqueue.bat');
    process.exit(1);
}
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.on('keypress', (str, key) => {
    if (busy || !key) return;
    if (key.name === 'up') move(-1);
    else if (key.name === 'down') move(1);
    else if (key.name === 'return') choose();
    else if (key.name === 'escape' || key.name === 'q' || (key.ctrl && key.name === 'c')) quit();
    else if (/^[0-9]$/.test(str || '')) {
        const n = Number(str);
        const target = n === 0 ? PICKABLE[PICKABLE.length - 1] : PICKABLE[n - 1];
        if (target != null) { sel = target; draw(); choose(); }
    }
});
draw();
