/**
 * APQueue — ของที่ใช้ร่วมกันในงานดูแลระบบ (menu · run-server · setup · install-autostart)
 * Node อย่างเดียว ไม่มีไลบรารีเพิ่ม · Windows เท่านั้น
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const OPS = path.resolve(__dirname, '..');
const LOGS = path.join(ROOT, 'logs');
const PORT = Number(process.env.PORT) || 8888;
const TASK = 'APQueue';
const BACKUP_TASK = 'APQueue Backup';
const KIOSK_TASK = 'APQueue Kiosk';
const FIREWALL_RULE = 'Queue2026 Server 8888';   // ชื่อเดียวกับในคู่มือติดตั้ง ข้อ A4

const C = { rev: '\x1b[7m', dim: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', x: '\x1b[0m' };
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function get(url, ms = 3000) {
    return new Promise((resolve) => {
        const req = http.get(url, { timeout: ms }, (res) => {
            let body = '';
            res.on('data', (b) => { body += b; });
            res.on('end', () => resolve({ ok: res.statusCode === 200, body }));
        });
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, body: 'หมดเวลา' }); });
        req.on('error', (e) => resolve({ ok: false, body: e.code || e.message }));
    });
}
const health = () => get(`http://127.0.0.1:${PORT}/api/health`);

function lanIps() {
    const out = [];
    for (const [name, list] of Object.entries(os.networkInterfaces())) {
        if (/vEthernet|WSL|Hyper-V|VirtualBox|VMware|Loopback|docker|vmnet/i.test(name)) continue;
        for (const a of list || []) {
            if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) out.push({ name, ip: a.address });
        }
    }
    return out.sort((a, b) => (b.ip.startsWith('192.168.') ? 1 : 0) - (a.ip.startsWith('192.168.') ? 1 : 0));
}

const ps = (cmd) => spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd], { encoding: 'utf8', windowsHide: true });
const psQuote = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/* หยุด server ให้หยุดจริง: ตัวคุม (run-server.js / start-server.cmd) ก่อน — ไม่งั้นมันเปิด server ใหม่ทันที
 * แล้วค่อยปิดโปรเซสที่ฟังพอร์ต 8888 · $PID = ตัว powershell นี้เอง (คำสั่งมีคำว่า run-server.js อยู่ในตัว) */
function stopServer() {
    ps(`Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and ` +
       `($_.CommandLine -like '*run-server.js*' -or $_.CommandLine -like '*start-server.cmd*') } | ` +
       `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; ` +
       `Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | ` +
       `ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`);
    sleep(2000);
}

// เปิดผ่านงาน Task Scheduler ก่อน (รันเป็นผู้ใช้ปกติ ไม่ใช่ admin) · ไม่มีงาน → เปิดตัวคุมเองแบบซ่อนหน้าต่าง
async function startServer(waitMs = 30000) {
    if (spawnSync('schtasks', ['/Run', '/TN', TASK], { stdio: 'ignore' }).status !== 0) {
        spawn(process.execPath, [path.join(__dirname, 'run-server.js')], { cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true }).unref();
    }
    for (let t = Date.now() + waitMs; Date.now() < t;) {
        if ((await health()).ok) return true;
        sleep(1500);
    }
    return false;
}

// Electron ของ kiosk ล็อกไฟล์ใน node_modules — ต้องปิดก่อน npm ci
const kioskFilter = `Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like (${psQuote(ROOT)} + '*') }`;
const kioskRunning = () => (ps(`(${kioskFilter} | Measure-Object).Count`).stdout || '').trim() !== '0';
function stopKiosk() { ps(`${kioskFilter} | Stop-Process -Force -ErrorAction SilentlyContinue`); sleep(1500); }
// หน้าต่าง cmd ของ start-kiosk.cmd ย่อไว้ ตัวแอปเปิดปกติ · verbatim: cmd ไม่เข้าใจ \" แบบที่ Node ใส่ให้
function startKiosk() {
    spawn('cmd', [`/c start "APQueue Kiosk" /min "${path.join(ROOT, 'kiosk', 'start-kiosk.cmd')}"`],
        { cwd: path.join(ROOT, 'kiosk'), detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
}

const taskExists = (name) => spawnSync('schtasks', ['/Query', '/TN', name], { stdio: 'ignore' }).status === 0;

/* เครื่องหมายไลบรารี = node_modules\.apqueue-lock (sha256 ของ package-lock.json ตอนลงครั้งล่าสุด)
 * package-lock เปลี่ยน (อัปเดตโค้ด) หรือไลบรารีหลักหาย → ต้อง npm ci ใหม่ */
function libsState() {
    const nm = path.join(ROOT, 'node_modules');
    const hash = require('crypto').createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'package-lock.json'))).digest('hex');
    let old = '';
    try { old = fs.readFileSync(path.join(nm, '.apqueue-lock'), 'utf8').trim().toLowerCase(); } catch { /* ยังไม่เคยบันทึก */ }
    const missing = !fs.existsSync(path.join(nm, 'express', 'package.json')) || !fs.existsSync(path.join(nm, 'socket.io', 'package.json'));
    return { need: hash !== old || missing, hash };
}

// npm.cmd ต้องผ่าน shell · args คงที่ ไม่มีค่าจากผู้ใช้
const npm = (args) => spawnSync('npm ' + args.join(' '), { stdio: 'inherit', cwd: ROOT, shell: true });

function installLibs() {
    const libs = libsState();
    if (npm(['ci', '--no-audit', '--no-fund']).status !== 0) {
        console.log('    ลองใหม่อีกครั้งใน 5 วินาที — แอนตี้ไวรัสอาจยังสแกนไฟล์อยู่…');
        sleep(5000);
        npm(['ci', '--no-audit', '--no-fund']);
    }
    // exit code ของ npm บน Windows เชื่อไม่ได้ — ลองโหลดไลบรารีหลักจริง
    const load = spawnSync(process.execPath, ['-e', "require('express'); require('socket.io')"], { cwd: path.join(ROOT, 'server'), stdio: 'ignore' });
    if (load.status !== 0) return false;
    fs.writeFileSync(path.join(ROOT, 'node_modules', '.apqueue-lock'), libs.hash);
    return true;
}

module.exports = {
    ROOT, OPS, LOGS, PORT, TASK, BACKUP_TASK, KIOSK_TASK, FIREWALL_RULE, C,
    sleep, get, health, lanIps, ps, stopServer, startServer, kioskRunning, stopKiosk, startKiosk,
    taskExists, libsState, installLibs,
};
