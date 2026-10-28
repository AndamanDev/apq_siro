/**
 * APQueue — สำรองฐานข้อมูลคิว + ไฟล์ที่อัปโหลด (วิดีโอ/โลโก้)
 *
 *   node --no-warnings=ExperimentalWarning ops\backup.js [--reason=manual]
 *
 * - ฐานข้อมูล: VACUUM INTO → backup\queue-<วันเวลา>-<reason>.db  (ทำตอน server รันอยู่ได้ ไม่ต้องหยุดระบบ)
 *   คัดลอกไฟล์ .db ตรง ๆ ไม่ได้ — ข้อมูลล่าสุดยังค้างใน queue.db-wal จะได้ไฟล์ไม่ครบ
 * - ตรวจไฟล์ที่ได้ด้วย integrity_check ทุกครั้ง
 * - server\assets\media, logos → backup\assets\ (คัดลอกเฉพาะไฟล์ใหม่/ที่เปลี่ยน)
 * - เก็บย้อนหลัง 30 วัน แต่ไม่ต่ำกว่า 7 ไฟล์ล่าสุด
 * - log: logs\backup.log · exit 1 เมื่อไม่สำเร็จ
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const { DB_PATH, MEDIA_DIR, LOGO_DIR } = require(path.join(ROOT, 'server', 'src', 'config.js'));
const BACKUP = path.join(ROOT, 'backup');
const LOG = path.join(ROOT, 'logs', 'backup.log');
const KEEP_DAYS = 30;
const KEEP_MIN = 7;

const reason = ((process.argv.find((a) => a.startsWith('--reason=')) || '').split('=')[1] || 'manual').replace(/[^\w-]/g, '');
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

function log(msg) {
    console.log(msg);
    try {
        fs.mkdirSync(path.dirname(LOG), { recursive: true });
        fs.appendFileSync(LOG, `[${now.toLocaleString('th-TH', { hour12: false })}] ${msg}\n`);
    } catch { /* เขียน log ไม่ได้ก็ยังสำรองต่อ */ }
}

function mirror(src, dst) {
    if (!fs.existsSync(src)) return 0;
    fs.mkdirSync(dst, { recursive: true });
    let n = 0;
    for (const f of fs.readdirSync(src)) {
        const a = path.join(src, f);
        const b = path.join(dst, f);
        const s = fs.statSync(a);
        if (!s.isFile()) continue;
        if (fs.existsSync(b) && fs.statSync(b).size === s.size) continue;
        fs.copyFileSync(a, b);
        n++;
    }
    return n;
}

function prune() {
    const files = fs.readdirSync(BACKUP).filter((f) => /^queue-.*\.db$/.test(f)).sort().reverse();
    const cutoff = Date.now() - KEEP_DAYS * 86400000;
    let removed = 0;
    files.slice(KEEP_MIN).forEach((f) => {
        const p = path.join(BACKUP, f);
        if (fs.statSync(p).mtimeMs < cutoff) { fs.rmSync(p, { force: true }); removed++; }
    });
    return removed;
}

try {
    if (!fs.existsSync(DB_PATH)) throw new Error('ไม่พบฐานข้อมูล ' + DB_PATH);
    fs.mkdirSync(BACKUP, { recursive: true });
    const dest = path.join(BACKUP, `queue-${stamp}-${reason}.db`);

    const db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA busy_timeout = 10000');
    db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    db.close();

    const check = new DatabaseSync(dest, { readOnly: true });
    const ok = check.prepare('PRAGMA integrity_check').get();
    const queues = check.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'queues'").get().n
        ? check.prepare('SELECT count(*) AS n FROM queues').get().n : '-';
    check.close();
    if (Object.values(ok)[0] !== 'ok') throw new Error('ไฟล์สำรองเสีย (integrity_check) — ' + dest);

    const media = mirror(MEDIA_DIR, path.join(BACKUP, 'assets', 'media')) + mirror(LOGO_DIR, path.join(BACKUP, 'assets', 'logos'));
    const removed = prune();
    const kb = Math.round(fs.statSync(dest).size / 1024);
    log(`✓ สำรองแล้ว (${reason}) ${path.relative(ROOT, dest)} · ${kb} KB · คิว ${queues} รายการ · ไฟล์สื่อใหม่ ${media} · ลบไฟล์เก่า ${removed}`);
} catch (e) {
    log(`✗ สำรองไม่สำเร็จ (${reason}) — ${e.message}`);
    process.exit(1);
}
