/**
 * APQueue — ตั้งให้ระบบเปิดเองทุกครั้งที่ login เข้า Windows (ทำครั้งเดียว)
 *
 *   node ops\tools\install-autostart.js                 ตั้ง server + สำรองทุกคืน
 *   node ops\tools\install-autostart.js --kiosk         เพิ่ม: เปิด Kiosk (พิมพ์บัตรคิว) เองด้วย
 *   node ops\tools\install-autostart.js --remove-kiosk  ถอนเฉพาะ Kiosk
 *   node ops\tools\install-autostart.js --remove        ถอนทั้งหมด
 *
 * Task Scheduler:
 *   "APQueue"        เมื่อ login (หน่วง 15 วิ) → run-server.js --background
 *   "APQueue Backup" ทุกคืน 23:30 → ops\backup.js (เครื่องปิดตอนนั้น = ทำตอนเปิดครั้งถัดไป)
 *   "APQueue Kiosk"  เมื่อ login (หน่วง 45 วิ ให้ server ขึ้นก่อน) → kiosk\start-kiosk.cmd
 * แทนวิธีเดิมในคู่มือ (shortcut ของ start-server.cmd ใน shell:startup) — ลบ shortcut เดิมทิ้ง กันเปิดซ้อน
 * ทำไม Task Scheduler ไม่ใช่ Startup folder: แอนตี้ไวรัสลบ shortcut ใน Startup ทิ้งเงียบ ๆ (เจอที่ CafeFlow)
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT, TASK, BACKUP_TASK, KIOSK_TASK } = require('./lib');

const STARTUP = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const user = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;

function schtasks(args) {
    const r = spawnSync('schtasks', args, { encoding: 'utf8', windowsHide: true });
    return { code: r.status, out: ((r.stdout || '') + (r.stderr || '')).trim() };
}

function fail(msg, out) {
    console.error('!! ' + msg);
    if (out) console.error('   ' + out);
    if (/access|denied|ปฏิเสธ/i.test(out || '')) console.error('   เปิด Command Prompt แบบ Run as administrator แล้วสั่งใหม่');
    process.exit(1);
}

function task(name, desc, trigger, cmd, args, extra = '') {
    const xml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>${xmlEsc(desc)}</Description></RegistrationInfo>
  <Triggers>${trigger}</Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${xmlEsc(user)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>${extra}
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${xmlEsc(cmd)}</Command>
      <Arguments>${xmlEsc(args)}</Arguments>
      <WorkingDirectory>${xmlEsc(ROOT)}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
`;
    // schtasks อ่าน XML ที่ประกาศ UTF-16 ต้องเป็น UTF-16 LE มี BOM
    const file = path.join(os.tmpdir(), `apqueue-task-${process.pid}.xml`);
    fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]));
    const r = schtasks(['/Create', '/TN', name, '/XML', file, '/F']);
    fs.rmSync(file, { force: true });
    if (r.code !== 0) fail(`ลงทะเบียนงาน "${name}" ไม่สำเร็จ`, r.out);
}

const logon = (delay) => `<LogonTrigger><Enabled>true</Enabled><UserId>${xmlEsc(user)}</UserId><Delay>${delay}</Delay></LogonTrigger>`;
const remove = (name) => schtasks(['/Delete', '/TN', name, '/F']).code === 0;

if (process.platform !== 'win32') fail('ใช้ได้บน Windows เท่านั้น');

if (process.argv.includes('--remove')) {
    const any = [TASK, BACKUP_TASK, KIOSK_TASK].map(remove).some(Boolean);
    console.log(any ? 'ถอนการเปิดอัตโนมัติ (server · Kiosk · สำรองทุกคืน) แล้ว' : 'ไม่มีการตั้งเปิดอัตโนมัติอยู่แล้ว');
    process.exit(0);
}
if (process.argv.includes('--remove-kiosk')) {
    console.log(remove(KIOSK_TASK) ? 'ถอนการเปิด Kiosk อัตโนมัติแล้ว' : 'ไม่ได้ตั้ง Kiosk ให้เปิดเองอยู่แล้ว');
    process.exit(0);
}

// shortcut ของวิธีเดิม ("start-server.cmd - Shortcut.lnk" ฯลฯ)
try {
    for (const f of fs.readdirSync(STARTUP)) {
        if (/start-server.*\.lnk$/i.test(f)) {
            fs.rmSync(path.join(STARTUP, f), { force: true });
            console.log(`ลบ shortcut เดิมใน Startup: ${f} (ใช้ Task Scheduler แทน)`);
        }
    }
} catch { /* ไม่มีโฟลเดอร์ / แอนตี้ไวรัสล็อกไว้ — ไม่เป็นไร */ }

task(TASK, 'APQueue — เปิด server ระบบคิว (พอร์ต 8888) เบื้องหลัง เปิดใหม่เองถ้าดับ', logon('PT15S'),
    process.execPath, `"${path.join(__dirname, 'run-server.js')}" --background`);
console.log(`ตั้งแล้ว: Task Scheduler → ${TASK} (เปิด server ทุกครั้งที่ ${user} login)`);

task(BACKUP_TASK, 'APQueue — สำรองฐานข้อมูลคิวทุกคืน (เก็บ 30 วัน ที่ backup\\)',
    '<CalendarTrigger><StartBoundary>2026-01-01T23:30:00</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger>',
    process.execPath, `--no-warnings=ExperimentalWarning "${path.join(ROOT, 'ops', 'backup.js')}" --reason=nightly`,
    '\n    <StartWhenAvailable>true</StartWhenAvailable>\n    <Hidden>true</Hidden>');
console.log(`ตั้งแล้ว: Task Scheduler → ${BACKUP_TASK} (ทุกคืน 23:30 · เก็บที่ backup\\)`);

if (process.argv.includes('--kiosk')) {
    task(KIOSK_TASK, 'APQueue — เปิด Kiosk พิมพ์บัตรคิว', logon('PT45S'),
        process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe', `/c "${path.join(ROOT, 'kiosk', 'start-kiosk.cmd')}"`);
    console.log(`ตั้งแล้ว: Task Scheduler → ${KIOSK_TASK} (เปิด Kiosk หลัง login 45 วิ)`);
}
