// ===== Center media playlist player =====
class MediaPlayer {
  constructor(container) {
    this.container = container;
    this.items = [];
    this.idx = 0;
    this.timer = null;
    this.globalMuted = true;
    this.globalVolume = 0.6;
  }

  setGlobal({ muted, volume }) {
    if (muted !== undefined) this.globalMuted = muted;
    if (volume !== undefined) this.globalVolume = volume;
  }

  async load() {
    try {
      this.items = await api('/api/playlist');
    } catch (e) { this.items = []; }
    this.idx = 0;
    this._render();
  }

  _clearTimer() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }

  _next() { this.idx = (this.idx + 1) % Math.max(this.items.length, 1); this._render(); }

  _render() {
    this._clearTimer();
    this.container.innerHTML = '';
    if (!this.items.length) {
      this.container.append(el('div', { class: 'no-media', style: 'color:#9db4d6;font-size:1.2rem' }, 'ยังไม่มีสื่อในเพลย์ลิสต์'));
      return;
    }
    const item = this.items[this.idx];
    const fit = item.fit === 'contain' ? 'contain' : 'cover';
    if (item.type === 'video') {
      const v = el('video', { src: item.path, autoplay: true, playsinline: true });
      v.style.objectFit = fit;
      v.muted = this.globalMuted || !!item.muted;
      v.volume = Math.min(1, (item.volume ? item.volume / 100 : this.globalVolume));
      v.onended = () => this._next();
      v.onerror = () => this.timer = setTimeout(() => this._next(), 3000);
      this.container.append(v);
      v.play().catch(() => {});
    } else {
      const img = el('img', { src: item.path });
      img.style.objectFit = fit;
      img.onerror = () => this.timer = setTimeout(() => this._next(), 3000);
      this.container.append(img);
      const dur = (item.duration_sec || 10) * 1000;
      this.timer = setTimeout(() => this._next(), dur);
    }
  }
}

window.MediaPlayer = MediaPlayer;
