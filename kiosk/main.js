'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { printTicket } = require('./printer/escpos');
const { saveTicketPdf } = require('./printer/pdf');

const CONFIG_PATH = path.join(__dirname, 'config.json');

// ---------- load config ----------
function loadConfig() {
  const p1 = path.join(__dirname, 'config.json');
  const p2 = path.join(__dirname, 'config.sample.json');
  const file = fs.existsSync(p1) ? p1 : p2;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return { serverUrl: 'http://localhost:8888', fullscreen: true, printer: {} }; }
}
const config = loadConfig();
if (!config.printer || typeof config.printer !== 'object') config.printer = {};

// คืนค่า config เครื่องพิมพ์พร้อม default โหมด:
// ถ้ายังไม่ตั้ง mode และไม่มี interface (= ยังไม่มีเครื่องพิมพ์) ให้ใช้โหมด pdf
function resolvePrinterCfg() {
  const p = config.printer || {};
  let mode = p.mode;
  if (!mode) mode = p.interface ? 'thermal' : 'pdf';
  return { ...p, mode, pdfDir: p.pdfDir || 'tickets-pdf' };
}

let win;
let shutdownTimer = null;

function createWindow() {
  const useFullscreen = config.fullscreen === true; // ค่าเริ่มต้น = หน้าต่างขนาดคงที่
  const W = config.width || 768;   // จอแนวตั้ง 768 x 1024
  const H = config.height || 1024;
  win = new BrowserWindow({
    width: W,
    height: H,
    useContentSize: true,          // ให้พื้นที่เนื้อหาเป็น 1024x768 พอดี
    resizable: false,
    fullscreen: useFullscreen,
    kiosk: useFullscreen,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // ออกจาก kiosk ด้วย Ctrl+Shift+Q (สำหรับผู้ดูแล)
  win.webContents.on('before-input-event', (e, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'q') app.quit();
  });
}

// ---------- ตั้งเวลาปิดเครื่อง ----------
function scheduleShutdown(hhmm) {
  if (shutdownTimer) { clearTimeout(shutdownTimer); shutdownTimer = null; }
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return;
  const [h, m] = hhmm.split(':').map(Number);
  const now = new Date();
  const target = new Date(now); target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const ms = target - now;
  shutdownTimer = setTimeout(() => {
    if (process.platform === 'win32') exec('shutdown /s /t 30 /c "ปิดเครื่องอัตโนมัติตามกำหนดเวลา"');
  }, ms);
}

// ---------- IPC ----------
ipcMain.handle('get-config', () => ({ serverUrl: config.serverUrl, kioskId: config.kioskId }));

ipcMain.handle('print-ticket', async (e, payload) => {
  const cfg = resolvePrinterCfg();
  try {
    if (cfg.mode === 'pdf') {
      const res = await saveTicketPdf(cfg, payload);
      return { ok: true, mode: 'pdf', file: res.file };
    }
    await printTicket(cfg, payload);
    return { ok: true, mode: 'thermal' };
  } catch (err) {
    return { ok: false, mode: cfg.mode, error: String(err && err.message || err) };
  }
});

// ---------- ตั้งค่าเครื่องพิมพ์ (ในแอป kiosk) ----------
ipcMain.handle('list-printers', async () => {
  try {
    const list = win ? await win.webContents.getPrintersAsync() : [];
    return list.map((p) => ({ name: p.name, displayName: p.displayName, isDefault: p.isDefault }));
  } catch (e) { return []; }
});

ipcMain.handle('get-printer-config', () => resolvePrinterCfg());

ipcMain.handle('save-printer-config', (e, patch) => {
  try {
    config.printer = { ...(config.printer || {}), ...(patch || {}) };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    return { ok: true, printer: resolvePrinterCfg() };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

// ---------- ตั้งค่าระบบ kiosk (หน้าแตะมุมซ้ายบน 5 ครั้ง): IP server / เครื่องพิมพ์ / เวลาปิดเครื่อง ----------
ipcMain.handle('get-app-config', () => ({
  serverUrl: config.serverUrl,
  kioskId: config.kioskId,
  shutdownTime: config.shutdownTime || '',
  printer: resolvePrinterCfg(),
}));

ipcMain.handle('save-app-config', (e, patch) => {
  try {
    patch = patch || {};
    if (typeof patch.serverUrl === 'string' && patch.serverUrl.trim()) config.serverUrl = patch.serverUrl.trim();
    if ('shutdownTime' in patch) config.shutdownTime = String(patch.shutdownTime || '').trim();
    if (patch.printer && typeof patch.printer === 'object') config.printer = { ...(config.printer || {}), ...patch.printer };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    scheduleShutdown(config.shutdownTime); // ใช้เวลาปิดเครื่องที่ตั้งในเครื่องทันที
    return { ok: true, config: { serverUrl: config.serverUrl, shutdownTime: config.shutdownTime || '', printer: resolvePrinterCfg() } };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

ipcMain.handle('open-pdf-folder', async () => {
  const cfg = resolvePrinterCfg();
  const dir = path.isAbsolute(cfg.pdfDir) ? cfg.pdfDir : path.join(__dirname, cfg.pdfDir);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  const err = await shell.openPath(dir);
  return { ok: !err, error: err || undefined, dir };
});

// อ่าน config ฝั่ง server เพื่อ apply autostart/shutdown
ipcMain.handle('apply-server-config', (e, serverCfg) => {
  if (serverCfg && typeof serverCfg.autostart === 'boolean') {
    app.setLoginItemSettings({ openAtLogin: serverCfg.autostart });
  }
  // เวลาปิดเครื่องที่ตั้งในเครื่อง (config.json) มาก่อน — ถ้าตั้งไว้แล้วไม่ให้ server override
  if (!config.shutdownTime && serverCfg && 'shutdownTime' in serverCfg) scheduleShutdown(serverCfg.shutdownTime);
  return { ok: true };
});

app.whenReady().then(() => {
  createWindow();
  scheduleShutdown(config.shutdownTime); // ใช้เวลาปิดเครื่องที่ตั้งในเครื่องตั้งแต่เปิดแอป
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
