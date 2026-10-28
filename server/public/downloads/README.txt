โฟลเดอร์นี้เก็บไฟล์โปรแกรมสำหรับให้ดาวน์โหลดจากหน้า "ตั้งค่า > ดาวน์โหลด"
(/settings แท็บ "ดาวน์โหลด")

ไฟล์ที่ระบบมองหา (ชื่อไฟล์ต้องตรงเป๊ะ):

1) display-queue.zip
   - โปรแกรมจอแสดงผล (Display) — ระบบสร้างให้อัตโนมัติแล้ว
   - ภายในมี: start-display.cmd, pick-monitor.ps1, วิธีตั้งค่าเครื่องจอแสดงผล.md
   - ถ้าแก้ไฟล์ต้นทาง (start-display.cmd / pick-monitor.ps1) แล้วอยาก
     อัปเดต zip ใหม่ ให้สั่ง (รันจากโฟลเดอร์ราก queue_2026):
       Compress-Archive -Path start-display.cmd,pick-monitor.ps1,"วิธีตั้งค่าเครื่องจอแสดงผล.md" -DestinationPath server\public\downloads\display-queue.zip -Force

2) Queue2026Kiosk-Setup.exe
   - ตัวติดตั้งโปรแกรม Kiosk สำหรับ Windows (ต้อง build เอง)
   - วิธี build (รันบนเครื่องที่ติดตั้ง toolchain ของ electron-builder ได้):
       npm --workspace kiosk install
       npm --workspace kiosk run build
   - electron-builder จะสร้างตัวติดตั้ง NSIS ไว้ในโฟลเดอร์ kiosk\dist\
     ให้คัดลอกไฟล์ตัวติดตั้งมาวางที่โฟลเดอร์นี้ แล้วเปลี่ยนชื่อเป็น
     Queue2026Kiosk-Setup.exe
   - ตราบใดที่ยังไม่มีไฟล์นี้ หน้าดาวน์โหลดจะแสดงสถานะ "ยังไม่ได้เตรียมไฟล์"
     ส่วนปุ่มดาวน์โหลดจอแสดงผลยังใช้งานได้ตามปกติ
