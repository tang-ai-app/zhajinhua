(function () {
  const Z = (window.ZJH = window.ZJH || {});
  const STAGE_W = 1280;
  const STAGE_H = 720;

  const UI = {
    scale: 1,
    stage: null,

    init() {
      this.stage = document.getElementById('stage');
      this.fx = document.getElementById('fx');
      this.modalEl = document.getElementById('modal');
      this.modalBox = document.getElementById('modalBox');
      this.toastEl = document.getElementById('toast');
      this.fit();
      window.addEventListener('resize', () => this.fit());
    },

    fit() {
      const s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
      this.scale = s;
      this.stage.style.transform = `translate(-50%, -50%) scale(${s})`;
      document.body.classList.toggle('portrait', window.innerHeight > window.innerWidth * 1.1);
    },

    point(el) {
      const sr = this.stage.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return {
        x: (r.left + r.width / 2 - sr.left) / this.scale,
        y: (r.top + r.height / 2 - sr.top) / this.scale,
      };
    },

    fly(el, from, to, { duration = 400, easing = 'cubic-bezier(.3,.7,.4,1)', rotate = 0, keep = false } = {}) {
      el.classList.add('flying');
      this.fx.appendChild(el);
      const anim = el.animate(
        [
          { transform: `translate(${from.x}px, ${from.y}px) translate(-50%, -50%) rotate(0deg)` },
          { transform: `translate(${to.x}px, ${to.y}px) translate(-50%, -50%) rotate(${rotate}deg)` },
        ],
        { duration, easing, fill: 'forwards' }
      );
      return anim.finished.then(() => { if (!keep) el.remove(); return el; }).catch(() => el.remove());
    },

    modal({ title = '', html = '', buttons = [{ label: '确定', value: true, cls: 'primary' }], cls = '', dismissValue } = {}) {
      return new Promise((resolve) => {
        this.modalBox.className = 'modal-box ' + cls;
        this.modalBox.innerHTML =
          (title ? `<h2 class="modal-title">${title}</h2>` : '') +
          `<div class="modal-body">${html}</div>` +
          `<div class="modal-actions">${buttons
            .map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${b.label}</button>`)
            .join('')}</div>`;
        this.modalEl.classList.remove('hidden');

        const done = (value) => {
          this.modalEl.classList.add('hidden');
          this.modalBox.innerHTML = '';
          document.removeEventListener('keydown', onKey, true);
          this.modalEl.onclick = null;
          resolve(value);
        };
        const onKey = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault(); e.stopPropagation();
            const primary = buttons.findIndex((b) => (b.cls || '').includes('primary'));
            done(buttons[primary >= 0 ? primary : buttons.length - 1].value);
          } else if (e.key === 'Escape' && dismissValue !== undefined) {
            e.stopPropagation();
            done(dismissValue);
          }
        };
        document.addEventListener('keydown', onKey, true);
        this.modalBox.querySelectorAll('.modal-actions .btn').forEach((btn) => {
          btn.onclick = () => { Z.Sound.play('click'); done(buttons[+btn.dataset.i].value); };
        });
        this.modalEl.onclick = (e) => { if (e.target === this.modalEl && dismissValue !== undefined) done(dismissValue); };
      });
    },

    toast(text, ms = 1800) {
      const t = document.createElement('div');
      t.className = 'toast-item';
      t.textContent = text;
      this.toastEl.appendChild(t);
      setTimeout(() => t.classList.add('out'), ms);
      setTimeout(() => t.remove(), ms + 400);
    },
  };

  Z.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  Z.UI = UI;
})();
