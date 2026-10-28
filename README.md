# ระบบคิวศูนย์การแพทย์ – รังสีรักษา (Queue 2026)

ระบบเรียกคิวผู้ป่วยสำหรับศูนย์การแพทย์ รองรับห้องบริการหลายห้อง (เริ่มต้น L6, L8)
นัดตามช่วงเวลา + โควต้าต่อช่วงเวลา ทำงานบน LAN ฐานข้อมูล SQLite (ไม่ต้องใช้ Docker/MySQL)

## องค์ประกอบ
| ส่วน | ที่อยู่ | หน้าที่ |
|------|--------|---------|
| **Server** | `server/` | Express + `node:sqlite` + Socket.io เสิร์ฟ API + เว็บทั้งหมด |
| **จอแสดงผล** | `http://<ip>:8888/display` | 2 ห้อง + มีเดียกลาง + ข้อความวิ่ง + เสียงเรียกไทย |
| **เรียกคิว** | `http://<ip>:8888/calling` | เจ้าหน้าที่เรียก/เรียกซ้ำ/พัก/ยกเลิก + waiting list |
| **ตั้งค่า** | `http://<ip>:8888/settings` | ห้อง/ช่วงเวลา/โควต้า/หน้าบัตร/เพลย์ลิสต์/เสียง/ผู้ใช้/รีเซ็ต |
| **รายงาน** | `http://<ip>:8888/reports` | เวลารอคอย/ปริมาณบริการ/โควต้า + พิมพ์ |
| **ทดสอบ Kiosk** | `http://<ip>:8888/kiosk-web` | จำลอง kiosk บนเบราว์เซอร์ (ไม่พิมพ์จริง) |
| **Kiosk (Electron)** | `kiosk/` | โปรแกรม Windows รับคิว + พิมพ์บัตร ESC/POS |

## เทคโนโลยี
- **ไม่ต้องคอมไพล์ native / ไม่ต้องมี Visual Studio** — ใช้ `node:sqlite` ที่มากับ Node.js 22+ (เครื่องนี้ Node 24)
- Realtime ด้วย Socket.io, เสียงเรียกด้วยไฟล์เสียงอัดต่อกัน (มี fallback เป็น TTS เบราว์เซอร์)

---

## ไฟล์ที่ไม่อยู่ใน Git (ดาวน์โหลดจาก Google Drive)
repo นี้มี **โค้ด + `kiosk/config.json` + ฐานข้อมูลตั้งต้น `server/data/queue.db` + มีเดีย/โลโก้** มาให้ครบแล้ว
→ dev แค่ `git clone` + `npm install` ก็รันได้ทันที **ไม่ต้องโหลดอะไรเพิ่มจาก Drive สำหรับการพัฒนา**

ไฟล์ที่อยู่ใน `.gitignore` (ไม่ติดมากับ repo) และวิธีได้มา:
| ไฟล์ | จำเป็นต่อ dev? | วิธีได้มา |
|------|---------------|-----------|
| `node_modules/` | ❌ | `npm install` (ไม่ต้องมี Visual Studio — ใช้ `node:sqlite`) |
| `kiosk/dist/Queue2026Kiosk Setup 1.0.0.exe` (~79 MB) | ✅ สำหรับเครื่อง kiosk | `npm run build` **หรือ** ดาวน์โหลดจาก Drive |
| `kiosk/dist/` (win-unpacked / blockmap / builder-debug.yml) | ❌ | สร้างจาก `npm run build` |
| `kiosk/tickets-pdf/*.pdf` | ❌ | สร้างอัตโนมัติตอนพิมพ์บัตร |

**Google Drive (ตัวติดตั้ง Kiosk):**
<https://drive.google.com/drive/folders/1C35ZLC73_SgC7rBp_cOAAEUpYNCAOq9O?usp=sharing>
ในโฟลเดอร์มีไฟล์ **`Queue2026Kiosk Setup 1.0.0.exe`** สำหรับติดตั้งบนเครื่อง kiosk ที่ไม่มี dev tools

### ตั้งค่าเครื่อง dev
```powershell
git clone <repo-url>
cd queue_2026
npm install                # ติดตั้ง dependency ทั้ง server + kiosk (ไม่ต้องคอมไพล์ native)
npm start                  # รัน server — queue.db + มีเดีย มากับ repo แล้ว
```

### ตั้งค่าเครื่อง Kiosk (ไม่ใช่ dev)
1. ดาวน์โหลด `Queue2026Kiosk Setup 1.0.0.exe` จาก Google Drive แล้วติดตั้ง
2. แก้ `config.json` ของ kiosk (`serverUrl` + `printer`) ตามหัวข้อ [Kiosk](#kiosk-โปรแกรม-windows--พิมพ์บัตร) ด้านล่าง

> **สำหรับผู้ดูแล:** เมื่อ build kiosk ใหม่ด้วย `npm run build` ให้นำไฟล์ `.exe` ตัวใหม่ใน `kiosk/dist/`
> ขึ้นไปแทนที่ในโฟลเดอร์ Google Drive ข้างต้น (ตั้งสิทธิ์แชร์เป็น "ผู้มีลิงก์ดูได้")

---

## เริ่มใช้งาน (Server)
```powershell
# ที่โฟลเดอร์โปรเจกต์
npm install -w server      # ติดตั้ง dependency ของ server
npm start                  # หรือ:  node server/src/index.js
```
ครั้งแรกระบบจะสร้างฐานข้อมูล `server/data/queue.db` พร้อมข้อมูลตั้งต้น:
- ห้อง **L6, L8** (ห้องฉายรังสี)
- ช่วงเวลา 08:00–17:00 รายชั่วโมง โควต้า 20/ช่วง โหมด `warn`
- โปรไฟล์บัตรเริ่มต้น
- ผู้ใช้ผู้ดูแล **admin / 123456**

เปิดเบราว์เซอร์ไปที่ `http://localhost:8888/display` (หรือ IP เครื่อง server จากอุปกรณ์อื่นใน LAN)

### รันบน LAN
1. ตั้ง IP คงที่ให้เครื่อง server (เช่น 192.168.1.100)
2. เปิด Windows Firewall ให้ TCP **8888** (WebSocket ใช้พอร์ตเดียวกัน)
3. อุปกรณ์อื่นเปิด `http://192.168.1.100:8888/display` `/calling` `/settings` `/reports`
4. เปลี่ยนพอร์ตได้ด้วย env `PORT` เช่น `set PORT=9000 && npm start`

---

## เลขคิว
รูปแบบ `L6` + `08` + `01` = **L60801**
- `L6` = รหัสห้อง
- `08` = ช่วงเวลา 08:00–09:00 (อิงชั่วโมงตามเวลาเครื่อง server)
- `01` = ลำดับวิ่ง (reset เริ่มที่ 01 อัตโนมัติเมื่อขึ้นวันใหม่ หรือรีเซ็ตด้วยมือในหน้า Settings)

การออกเลขเป็น atomic (BEGIN IMMEDIATE) จึงปลอดภัยแม้มี kiosk หลายเครื่องกดพร้อมกัน

## โควต้าต่อช่วงเวลา (ตั้งค่าได้)
แต่ละช่วงเวลามีโหมด:
- `warn` — เกินโควต้ายังออกได้ แต่ติดธง ⚠ (ค่าเริ่มต้น)
- `allow` — ออกได้ ไม่เตือน
- `block` — ห้ามกดเมื่อเต็ม (kiosk แสดง "คิวเต็มแล้ว")

---

## เสียงเรียกภาษาไทย
วางไฟล์ `.mp3` ใน `server/assets/audio/th/` ตามรายละเอียดใน
[`server/assets/audio/th/README.md`](server/assets/audio/th/README.md)
ตัวอย่างประโยค: **"เชิญหมายเลข L60801 ที่ห้องฉายรังสี L6 ค่ะ"**
> ถ้าไม่มีไฟล์เสียง ระบบใช้เสียงสังเคราะห์ (TTS) ภาษาไทยของเบราว์เซอร์อัตโนมัติ
> จอแสดงผลต้องคลิก/แตะ 1 ครั้งเพื่อปลดล็อกการเล่นเสียง (นโยบายเบราว์เซอร์)

---

## Kiosk (โปรแกรม Windows + พิมพ์บัตร)
```powershell
cd kiosk
copy config.sample.json config.json   # แล้วแก้ serverUrl และ printer
npm install                            # ดาวน์โหลด Electron (ใช้เวลาสักครู่)
npm start                              # ทดสอบ (เรียกผ่าน start-kiosk.cmd)
npm run build                          # สร้างไฟล์ติดตั้ง .exe (electron-builder)
```
> **หมายเหตุ VS Code:** terminal ของ VS Code ตั้ง `ELECTRON_RUN_AS_NODE=1` ทำให้ Electron เปิดเป็น Node แทนแอป
> จึงใช้ `start-kiosk.cmd` (npm start ชี้มาที่ไฟล์นี้แล้ว) ซึ่งล้าง env ตัวนี้ก่อนเปิด — ดับเบิลคลิกไฟล์ก็ได้

**ขั้นตอนรับคิวที่ kiosk:** หน้าหลัก → เลือกเครื่อง (L6 เขียว / L8 น้ำเงิน) → เลือก**ช่วงเวลา**
(ในเวลาทำการ / คลินิกนอกเวลา) → ระบบออกเลขคิวตามช่วงเวลานั้น (เช่น L60801) แล้วพิมพ์บัตร
แก้ `kiosk/config.json`:
```json
{
  "serverUrl": "http://192.168.1.100:8888",
  "printer": { "type": "epson", "interface": "tcp://192.168.1.50:9100", "characterSet": "THAI", "width": 48 }
}
```
- `interface`: `tcp://<ip>:9100` (เครื่องพิมพ์เครือข่าย) | `printer:ชื่อเครื่องพิมพ์ใน Windows` | `//localhost/ชื่อแชร์`
- ออกจากโหมด kiosk: **Ctrl+Shift+Q**
- เปิดพร้อม Windows / ตั้งเวลาปิดเครื่อง: ตั้งในหน้า Settings → "เครื่อง Kiosk" (โปรแกรมจะอ่านค่าจาก server)
- จำนวนสำเนาบัตรต่อครั้ง: ตั้งในหน้า Settings (`print_copies`) หรือต่อโปรไฟล์บัตร

> ตัวอักษรไทยบนบัตรขึ้นกับเครื่องพิมพ์ว่ารองรับ codepage ไทย (TIS-620) หรือไม่
> เลขคิว (เช่น L60801) เป็น ASCII พิมพ์ได้ทุกเครื่อง หากไทยไม่ออกให้ปรับ `characterSet` หรือใช้โลโก้เป็นรูปภาพ

---

## โครงสร้าง API (สรุป)
- `POST /api/queues {roomId}` ออกคิว · `GET /api/queues?roomId&status` รายการ · `GET /api/queues/recent?roomId&limit`
- `POST /api/queues/:id/{call|recall|park|resume|serving|complete|skip|cancel}`
- `POST /api/rooms/:id/call-next` · `POST /api/queues/reset {roomId?}`
- CRUD: `/api/rooms /api/slots /api/profiles /api/playlist` · `/api/settings` · `/api/auth`
- `GET /api/reports/{wait-times|volume|quota|satisfaction}` · `GET /api/kiosk/config`
- Socket.io events: `queue:issued|called|recalled|updated|reset`, `playlist:changed`, `settings:changed`

## หมายเหตุการพัฒนา
- ฐานข้อมูลเป็นไฟล์เดียว `server/data/queue.db` — สำรองด้วยการคัดลอกไฟล์ (รวม `-wal`, `-shm`)
- ลบไฟล์ `queue.db*` แล้วสตาร์ทใหม่ = เริ่มต้นข้อมูลตั้งต้นใหม่
