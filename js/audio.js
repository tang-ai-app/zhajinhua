(function () {
  const Z = (window.ZJH = window.ZJH || {});

  const Sound = {
    ctx: null,
    enabled: true,
    voice: true,

    ensure() {
      try {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { this.ctx = null; }
      return this.ctx;
    },

    tone(freq, dur, { type = 'sine', vol = 0.12, when = 0, slide = null } = {}) {
      const ctx = this.ctx;
      const t = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    },

    noise(dur, { vol = 0.2, freq = 2500, when = 0 } = {}) {
      const ctx = this.ctx;
      const t = ctx.currentTime + when;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(filter).connect(g).connect(ctx.destination);
      src.start(t);
    },

    play(name) {
      if (!this.enabled || !this.ensure()) return;
      switch (name) {
        case 'deal': this.noise(0.07, { vol: 0.35, freq: 3200 }); break;
        case 'flip': this.noise(0.09, { vol: 0.3, freq: 1800 }); break;
        case 'chip':
          this.tone(2600, 0.05, { type: 'square', vol: 0.04 });
          this.tone(3400, 0.05, { type: 'square', vol: 0.03, when: 0.05 });
          break;
        case 'click': this.tone(900, 0.06, { type: 'triangle', vol: 0.08 }); break;
        case 'turn':
          this.tone(880, 0.15, { vol: 0.1 });
          this.tone(1320, 0.25, { vol: 0.08, when: 0.12 });
          break;
        case 'tick': this.tone(1500, 0.04, { type: 'square', vol: 0.05 }); break;
        case 'fold': this.tone(220, 0.25, { type: 'triangle', vol: 0.12, slide: 110 }); break;
        case 'vs':
          this.tone(150, 0.5, { type: 'sawtooth', vol: 0.08, slide: 600 });
          this.noise(0.4, { vol: 0.2, freq: 600, when: 0.35 });
          break;
        case 'win':
          [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.12, when: i * 0.09 }));
          break;
        case 'lose':
          [392, 330, 262].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.1, when: i * 0.15 }));
          break;
        case 'coins':
          for (let i = 0; i < 8; i++) this.tone(2000 + Math.random() * 1800, 0.06, { type: 'square', vol: 0.03, when: i * 0.06 });
          break;
      }
    },

    say(text) {
      if (!this.voice || !('speechSynthesis' in window)) return;
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN';
        u.rate = 1.15;
        u.volume = 0.9;
        window.speechSynthesis.speak(u);
      } catch (e) { /* speech unsupported */ }
    },
  };

  Z.Sound = Sound;
})();
