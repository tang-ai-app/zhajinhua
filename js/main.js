(function () {
  const Z = window.ZJH;
  const { UI, Sound: S } = Z;

  const PROFILE_KEY = 'zjh_profile_v1';
  const SETTINGS_KEY = 'zjh_settings_v1';
  const RELIEF_AMOUNT = 2000;
  const RELIEF_LIMIT = 3;
  const fmt = (n) => Number(n).toLocaleString('zh-CN');
  const today = () => new Date().toISOString().slice(0, 10);

  const ROOMS = [
    { id: 'novice', name: '新手场', ante: 10, min: 200, color: 'green', desc: '练手首选，输赢随意' },
    { id: 'normal', name: '平民场', ante: 50, min: 1000, color: 'blue', desc: '有来有回，小赌怡情' },
    { id: 'pro', name: '高手场', ante: 200, min: 5000, color: 'purple', desc: '高手云集，步步惊心' },
    { id: 'rich', name: '富豪场', ante: 1000, min: 30000, color: 'gold', desc: '一掷千金，豪气冲天' },
  ];

  const DEFAULT_SETTINGS = {
    luck: true, rule235: true, maxRounds: 15, revealAll: true, speed: 'normal', skill: 'normal', sound: true, voice: true, timer: 30,
  };

  function load(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v && typeof v === 'object' ? { ...fallback, ...v } : { ...fallback };
    } catch (e) { return { ...fallback }; }
  }

  const App = {
    game: null,

    init() {
      UI.init();
      this.profile = load(PROFILE_KEY, {
        name: '玩家' + Math.floor(1000 + Math.random() * 9000),
        avatar: Math.floor(Math.random() * Z.AVATAR_COUNT),
        chips: 5000,
        relief: { date: '', count: 0 },
      });
      this.profile.stats = { hands: 0, wins: 0, biggestWin: 0, bestType: -1, maxChips: this.profile.chips, ...(this.profile.stats || {}) };
      this.settings = load(SETTINGS_KEY, DEFAULT_SETTINGS);
      S.enabled = this.settings.sound;
      S.voice = this.settings.voice;
      this.bindLobby();
      this.bindTopbar();
      this.renderLobby();
      document.addEventListener('pointerdown', () => S.ensure(), { once: true });
    },

    save() {
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(this.profile));
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
      } catch (e) { /* storage unavailable */ }
    },

    recordHand({ won, net, chips }) {
      const st = this.profile.stats;
      st.hands++;
      if (won) st.wins++;
      if (net > st.biggestWin) st.biggestWin = net;
      if (chips > st.maxChips) st.maxChips = chips;
      this.profile.chips = chips;
      this.save();
    },

    show(id) {
      document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
    },

    // ---------- lobby ----------

    bindLobby() {
      const nick = document.getElementById('nickname');
      nick.addEventListener('change', () => {
        const v = nick.value.trim().slice(0, 10);
        this.profile.name = v || this.profile.name;
        nick.value = this.profile.name;
        this.save();
      });
      document.getElementById('lobbyAvatar').addEventListener('click', () => this.pickAvatar());
      document.getElementById('btnRelief').addEventListener('click', () => this.claimRelief());
      document.getElementById('btnRulesLobby').addEventListener('click', () => this.showRules());
      document.getElementById('btnReset').addEventListener('click', () => this.resetProfile());

      const form = document.getElementById('settingsForm');
      form.addEventListener('change', (e) => {
        const el = e.target;
        const k = el.name;
        if (!k) return;
        let v = el.type === 'checkbox' ? el.checked : el.value;
        if (k === 'maxRounds' || k === 'timer') v = +v;
        this.settings[k] = v;
        S.enabled = this.settings.sound;
        S.voice = this.settings.voice;
        this.save();
        this.renderTopToggles();
      });
    },

    renderLobby() {
      const p = this.profile;
      document.getElementById('nickname').value = p.name;
      document.getElementById('lobbyAvatar').src = Z.avatarSrc(p.avatar);
      document.getElementById('lobbyChips').textContent = fmt(p.chips);

      const relief = document.getElementById('btnRelief');
      const left = this.reliefLeft();
      relief.hidden = !(p.chips < ROOMS[0].min);
      relief.disabled = left <= 0;
      relief.textContent = left > 0 ? `领取救济金 +${fmt(RELIEF_AMOUNT)}（今日剩 ${left} 次）` : '今日救济金已领完';

      const rooms = document.getElementById('rooms');
      rooms.innerHTML = ROOMS.map((r) => {
        const locked = p.chips < r.min;
        return `<div class="room room-${r.color} ${locked ? 'locked' : ''}" data-id="${r.id}">
          <div class="room-name">${r.name}</div>
          <div class="room-desc">${r.desc}</div>
          <div class="room-meta"><span>底注 <b>${fmt(r.ante)}</b></span><span>入场 <b>${fmt(r.min)}</b></span></div>
          <button class="btn ${locked ? 'ghost' : 'primary'}" ${locked ? 'disabled' : ''}>${locked ? '筹码不足' : '进入房间'}</button>
        </div>`;
      }).join('');
      rooms.querySelectorAll('.room').forEach((el) => {
        el.addEventListener('click', () => {
          const r = ROOMS.find((x) => x.id === el.dataset.id);
          if (this.profile.chips < r.min) { UI.toast(`进入${r.name}至少需要 ${fmt(r.min)} 筹码`); return; }
          this.enterRoom(r);
        });
      });

      const st = p.stats;
      const rate = st.hands ? Math.round((st.wins / st.hands) * 100) : 0;
      document.getElementById('stats').innerHTML = `
        <div><span>总局数</span><b>${fmt(st.hands)}</b></div>
        <div><span>胜局</span><b>${fmt(st.wins)}</b></div>
        <div><span>胜率</span><b>${rate}%</b></div>
        <div><span>单局最多赢</span><b>${fmt(st.biggestWin)}</b></div>
        <div><span>最高筹码</span><b>${fmt(st.maxChips)}</b></div>
        <div><span>拿过最大牌</span><b>${st.bestType >= 0 ? Z.HAND_TYPES[st.bestType] : '—'}</b></div>`;

      const form = document.getElementById('settingsForm');
      for (const [k, v] of Object.entries(this.settings)) {
        const el = form.elements[k];
        if (!el) continue;
        if (el.type === 'checkbox') el.checked = !!v; else el.value = String(v);
      }
    },

    reliefLeft() {
      const r = this.profile.relief || { date: '', count: 0 };
      return r.date === today() ? RELIEF_LIMIT - r.count : RELIEF_LIMIT;
    },

    claimRelief() {
      if (this.reliefLeft() <= 0) return;
      const r = this.profile.relief?.date === today() ? this.profile.relief : { date: today(), count: 0 };
      r.count++;
      this.profile.relief = r;
      this.profile.chips += RELIEF_AMOUNT;
      this.save();
      S.play('coins');
      UI.toast(`领取救济金 ${fmt(RELIEF_AMOUNT)} 筹码`);
      this.renderLobby();
    },

    async resetProfile() {
      const ok = await UI.modal({
        title: '重置存档',
        html: '<p class="center">将清空战绩，并把筹码重置为 5,000。确定吗？</p>',
        buttons: [{ label: '取消', value: false }, { label: '确定重置', value: true, cls: 'danger' }],
        dismissValue: false,
      });
      if (!ok) return;
      this.profile.chips = 5000;
      this.profile.stats = { hands: 0, wins: 0, biggestWin: 0, bestType: -1, maxChips: 5000 };
      this.profile.relief = { date: '', count: 0 };
      this.save();
      this.renderLobby();
    },

    async pickAvatar() {
      const html = `<div class="avatar-grid">${[...Array(Z.AVATAR_COUNT).keys()]
        .map((i) => `<button class="avatar-opt ${i === this.profile.avatar ? 'sel' : ''}" data-i="${i}"><img src="${Z.avatarSrc(i)}" alt=""></button>`)
        .join('')}</div>`;
      const pending = UI.modal({ title: '选择头像', html, buttons: [{ label: '关闭', value: null }], dismissValue: null });
      document.querySelectorAll('.avatar-opt').forEach((b) => {
        b.addEventListener('click', () => {
          this.profile.avatar = +b.dataset.i;
          this.save();
          this.renderLobby();
          document.querySelectorAll('.avatar-opt').forEach((x) => x.classList.toggle('sel', x === b));
        });
      });
      await pending;
    },

    showRules() {
      const c = (r, s) => ({ r, s });
      const examples = [
        ['豹子', '三张点数相同', [c(14, 'spades'), c(14, 'hearts'), c(14, 'clubs')]],
        ['同花顺', '花色相同的顺子', [c(12, 'hearts'), c(13, 'hearts'), c(14, 'hearts')]],
        ['金花', '三张花色相同', [c(2, 'spades'), c(9, 'spades'), c(13, 'spades')]],
        ['顺子', '点数相连，A23 最小，QKA 最大', [c(4, 'clubs'), c(5, 'diamonds'), c(6, 'hearts')]],
        ['对子', '两张点数相同', [c(10, 'diamonds'), c(10, 'clubs'), c(7, 'spades')]],
        ['单张', '以上都不是，比最大的单张', [c(14, 'clubs'), c(9, 'diamonds'), c(4, 'hearts')]],
      ];
      const img = (cd) => `<img class="rule-card" src="${Z.cardImage(cd)}" alt="">`;
      const html = `
        <div class="rules">
          <div class="rules-col">
            <h3>牌型大小（从大到小）</h3>
            ${examples.map(([n, d, cs], i) => `<div class="rule-row"><b class="rule-rank">${i + 1}</b><div class="rule-cards">${cs.map(img).join('')}</div><div><div class="rule-name">${n}</div><div class="rule-desc">${d}</div></div></div>`).join('')}
            <p class="rule-note">特殊：开启「235 吃豹子」时，花色不同的 2、3、5 可以赢豹子，但输给其他所有牌。</p>
          </div>
          <div class="rules-col">
            <h3>玩法</h3>
            <ol>
              <li>每局 5 人，每人先下<b>底注</b>，再发 3 张暗牌，庄家下家先说话，按顺时针轮流操作。</li>
              <li><b>闷牌</b>：不看牌直接下注，只需付当前单注。<b>看牌</b>后成为明牌，跟注要付<b>双倍</b>单注。看牌不占用回合，任何时候都能看。</li>
              <li><b>跟注</b>：按当前单注跟上。<b>加注</b>：把单注提高到更高档位（1/2/3/5/10 倍底注）。</li>
              <li><b>比牌</b>：从第 2 轮起，付一次跟注的钱，与任意一位在场玩家比大小，输的出局。牌面完全相同时，<b>发起者判负</b>。</li>
              <li><b>弃牌</b>：放弃本局，已下注的筹码归底池。</li>
              <li>筹码不够跟注时，只能<b>孤注一掷</b>（押上全部筹码，直接比牌）或弃牌。</li>
              <li>场上只剩一人时，他赢得全部底池；达到<b>封顶轮数</b>后，所有人强制开牌比大小。</li>
            </ol>
            <h3>快捷键</h3>
            <p class="keys"><kbd>L</kbd> 看牌 <kbd>C</kbd> 跟注 <kbd>R</kbd> 最小加注 <kbd>B</kbd> 比牌 <kbd>F</kbd> 弃牌 <kbd>Esc</kbd> 取消</p>
          </div>
        </div>`;
      return UI.modal({ title: '游戏规则', html, cls: 'wide', buttons: [{ label: '我知道了', value: true, cls: 'primary' }], dismissValue: true });
    },

    // ---------- game ----------

    bindTopbar() {
      document.getElementById('btnLeave').addEventListener('click', () => this.game && this.game.requestLeave());
      document.getElementById('btnRules').addEventListener('click', () => this.showRules());
      document.getElementById('btnSound').addEventListener('click', () => {
        this.settings.sound = !this.settings.sound;
        S.enabled = this.settings.sound;
        this.save();
        this.renderTopToggles();
      });
      document.getElementById('btnVoice').addEventListener('click', () => {
        this.settings.voice = !this.settings.voice;
        S.voice = this.settings.voice;
        this.save();
        this.renderTopToggles();
      });
      document.getElementById('btnLog').addEventListener('click', () => document.getElementById('log').classList.toggle('collapsed'));
      this.renderTopToggles();
    },

    renderTopToggles() {
      const sb = document.getElementById('btnSound');
      const vb = document.getElementById('btnVoice');
      sb.textContent = this.settings.sound ? '🔊 音效' : '🔇 音效';
      vb.textContent = this.settings.voice ? '🗣 语音' : '🤐 语音';
      sb.classList.toggle('off', !this.settings.sound);
      vb.classList.toggle('off', !this.settings.voice);
    },

    enterRoom(room) {
      S.ensure();
      S.play('click');
      this.show('game');
      this.game = new Z.Game(this, room);
      this.game.run();
    },

    leaveGame() {
      this.game = null;
      this.show('lobby');
      this.renderLobby();
    },
  };

  Z.App = App;
  document.addEventListener('DOMContentLoaded', () => App.init());
})();
