// ===== Serial audio announcer (Web Audio API) =====
// เล่นเสียงเรียกทีละชุด ไม่ทับกัน ตั้งเวลาทุกคำต่อกันบน clock เดียว -> ต่อเนื่องไม่มีช่องว่างจาก JS
// โหลดไฟล์เสียงครั้งแรกแล้ว cache เป็น AudioBuffer ครั้งถัดไปเล่นทันที ถ้าหาไฟล์ไม่เจอ fallback เป็น TTS
class Announcer {
  constructor() {
    this.queue = [];
    this.playing = false;
    this.enabled = true;
    this.gapMs = 250;        // เว้นช่วงระหว่าง "ประโยค" (คนละคิว)
    this.segGapMs = 0;       // เว้นระหว่างหลักของเลข (0 = ต่อกันสนิท)
    this.preNumberMs = 400;     // เว้นหลัง "เชิญหมายเลข" ก่อนอ่านเลข
    this.preRoomMs = 500;       // เว้นหลังอ่านเลขจบ ก่อนบอกห้อง
    this.roomCodeLen = 2;       // จำนวนตัวอักษรรหัสห้อง (เช่น L8 = 2)
    this.afterRoomCodeMs = 500; // เว้นหลังรหัสห้อง (L8) ก่อนเลขวิ่ง
    this.audioBase = '/assets/audio/th/';
    this.buffers = new Map(); // key -> AudioBuffer (cache)
    this.ctx = null;
    this.unlocked = false;
  }

  setEnabled(v) { this.enabled = v; }
  setGap(ms) { this.gapMs = ms || 250; }
  setSegGap(ms) { this.segGapMs = ms != null ? ms : 60; }

  _ctxObj() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    return this.ctx;
  }

  // ปลดล็อกการเล่นเสียง (ต้องเกิดจาก user gesture ครั้งแรก หรือเปิดด้วย start-display.cmd)
  unlock() {
    this.unlocked = true;
    const ctx = this._ctxObj();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  // คืน Promise ที่ resolve เมื่อ "เสียงของคิวนี้" พูดจบ (ใช้สั่งหยุดกระพริบ)
  announce(evt) {
    if (!this.enabled) return this._wait(1800); // ปิดเสียง: กระพริบสั้น ๆ แล้วหยุด
    return new Promise((resolve) => {
      this.queue.push({ evt, resolve });
      if (!this.playing) this._drain();
    });
  }

  async _drain() {
    this.playing = true;
    while (this.queue.length) {
      const { evt, resolve } = this.queue.shift();
      try {
        await this._playSegments(evt.voicePayload);
      } catch (e) {
        this._tts(evt);
        await this._wait(2500);
      }
      resolve(); // เสียงคิวนี้จบ -> ให้จอหยุดกระพริบ
      await this._wait(this.gapMs);
    }
    this.playing = false;
  }

  _wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // โหลด + decode ไฟล์เสียงเป็น AudioBuffer (ลอง .wav ก่อน แล้วค่อย .mp3) พร้อม cache
  async _loadBuffer(key) {
    if (this.buffers.has(key)) return this.buffers.get(key);
    const ctx = this._ctxObj();
    if (!ctx) throw new Error('no audiocontext');
    for (const ext of ['.wav', '.mp3']) {
      try {
        const res = await fetch(this.audioBase + encodeURIComponent(key) + ext);
        if (!res.ok) continue;
        const arr = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr);
        this.buffers.set(key, buf);
        return buf;
      } catch (e) { /* ลองนามสกุลถัดไป */ }
    }
    throw new Error('missing ' + key);
  }

  async _playSegments(payload) {
    if (!payload || !payload.length) throw new Error('no payload');
    const ctx = this._ctxObj();
    if (!ctx) throw new Error('no audiocontext');
    if (ctx.state === 'suspended') await ctx.resume();

    // โหลดทุกคำให้พร้อมก่อน (ขนานกัน) — ถ้าคำใดขาด จะ throw ไป fallback TTS ทั้งประโยค
    const buffers = await Promise.all(payload.map((k) => this._loadBuffer(k)));

    // ตั้งเวลาเล่นต่อกันบน clock เดียว + เว้นจังหวะเฉพาะจุด
    // payload = [เชิญหมายเลข, ...หลักเลข, ห้อง]
    const last = buffers.length - 1;
    let when = ctx.currentTime + 0.06; // เผื่อเวลาตั้งคิวเล็กน้อย
    let lastSrc = null;
    for (let i = 0; i < buffers.length; i++) {
      const buf = buffers[i];
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(when);
      when += buf.duration;
      if (i === last) { /* คำสุดท้าย ไม่ต้องเว้นท้าย */ }
      else if (i === 0) when += this.preNumberMs / 1000;            // หลัง "เชิญหมายเลข"
      else if (i === last - 1) when += this.preRoomMs / 1000;       // หลังเลขตัวสุดท้าย ก่อนห้อง
      else if (i === this.roomCodeLen) when += this.afterRoomCodeMs / 1000; // หลังรหัสห้อง (L8) ก่อนเลขวิ่ง
      else when += this.segGapMs / 1000;                            // ระหว่างหลักเลข
      lastSrc = src;
    }
    // รอจนคำสุดท้ายเล่นจบ
    await new Promise((resolve) => { lastSrc.onended = resolve; });
  }

  // fallback: ใช้เสียงสังเคราะห์ภาษาไทยทั้งประโยค
  _tts(evt) {
    if (!('speechSynthesis' in window)) return;
    const spell = (s) => String(s).split('').join(' ');
    const text = `เชิญหมายเลข ${spell(evt.queueNumber)} ที่ห้อง${evt.roomName || ''} ${spell(evt.roomCode)} ค่ะ`;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'th-TH';
    u.rate = 0.95;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
}

window.announcer = new Announcer();
