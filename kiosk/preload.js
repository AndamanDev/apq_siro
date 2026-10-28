'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kioskAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  printTicket: (payload) => ipcRenderer.invoke('print-ticket', payload),
  applyServerConfig: (cfg) => ipcRenderer.invoke('apply-server-config', cfg),
  // ตั้งค่าเครื่องพิมพ์
  listPrinters: () => ipcRenderer.invoke('list-printers'),
  getPrinterConfig: () => ipcRenderer.invoke('get-printer-config'),
  savePrinterConfig: (patch) => ipcRenderer.invoke('save-printer-config', patch),
  openPdfFolder: () => ipcRenderer.invoke('open-pdf-folder'),
  // ตั้งค่าระบบ kiosk (IP server / เครื่องพิมพ์ / เวลาปิดเครื่อง)
  getAppConfig: () => ipcRenderer.invoke('get-app-config'),
  saveAppConfig: (patch) => ipcRenderer.invoke('save-app-config', patch),
});
