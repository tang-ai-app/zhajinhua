(function () {
  const Z = (window.ZJH = window.ZJH || {});
  const { UI, Sound: S, esc } = Z;

  const SEATS = 5;
  const AVATAR_COUNT = 16;
  const STAKE_MULTIPLIERS = [1, 2, 3, 5, 10];
  const SPEED = { slow: 1.4, normal: 1, fast: 0.55 };
  const LUCK_CHANCE = 0.25;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = Math.random;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (n) => Number(n).toLocaleString('zh-CN');
  const avatarSrc = (i) => `assets/avatars/a${i}.svg`;

  class Aborted extends Error {}

  class Game {
    constructor(app, room) {
      this.app = app;
      this.room = room;
      this.settings = app.settings;
      this.ante = room.ante;
      this.levels = STAKE_MULTIPLIERS.map((m) => m * room.ante);
      this.dealer = Math.floor(rand() * SEATS);
      this.handNo = 0;
      this.pot = 0;
      this.round = 0;
      this.stakeIdx = 0;
      this.current = -1;
      this.inHand = false;
      this.aborted = false;
      this.humanResolve = null;
      this.selecting = null;
      this.autoCall = false;
      this.timers = [];

      this.players = [{
        id: 0, seat: 0, isHuman: true,
        name: app.profile.name, avatar: app.profile.avatar, chips: app.profile.chips,
      }];
      for (let i = 1; i < SEATS; i++) this.players.push(this.newAI(i));
      this.players.forEach((p) => this.resetPlayer(p));
    }

    get speedF() { return SPEED[this.settings.speed] || 1; }
    get human() { return this.players[0]; }

    newAI(seat) {
      const taken = new Set(this.players.filter((p) => p && p.seat !== seat).map((p) => p.name));
      const takenAv = new Set(this.players.filter((p) => p && p.seat !== seat).map((p) => p.avatar));
      const persona = pick(Z.AI.PERSONAS.filter((p) => !taken.has(p.name)));
      const avatars = [...Array(AVATAR_COUNT).keys()].filter((i) => !takenAv.has(i));
      const jitter = () => (rand() - 0.5) * 0.15;
      const p = {
        id: seat, seat, isHuman: false,
        name: persona.name,
        avatar: pick(avatars),
        chips: Math.round((this.room.min * (2 + rand() * 6)) / this.ante) * this.ante,
        ai: {
          aggr: clamp(persona.aggr + jitter(), 0.05, 1),
          bluff: clamp(persona.bluff + jitter(), 0, 1),
          tight: clamp(persona.tight + jitter(), 0, 1),
        },
      };
      this.resetPlayer(p);
      return p;
    }

    resetPlayer(p) {
      Object.assign(p, {
        cards: [], hand: null, shown: 0, seen: false, folded: false, lostCompare: false,
        bet: 0, revealed: false, net: 0, winner: false, out: false,
      });
    }

    // ---------- lifecycle ----------

    async run() {
      this.build();
      this.render();
      try {
        while (true) {
          await this.playHand();
          const cont = await this.showResult();
          if (!cont) break;
          if (this.human.chips < this.ante * 10) {
            await UI.modal({
              title: '筹码不足',
              html: `<p class="center">你的筹码不足以继续在 <b>${this.room.name}</b> 游戏（至少需要 ${fmt(this.ante * 10)}）。</p>`,
              buttons: [{ label: '返回大厅', value: true, cls: 'primary' }],
            });
            break;
          }
        }
      } catch (e) {
        if (!(e instanceof Aborted)) { console.error(e); UI.toast('出现错误：' + e.message); }
      }
      this.cleanup();
      this.app.profile.chips = this.human.chips;
      this.app.save();
      this.app.leaveGame();
    }

    cleanup() {
      this.timers.forEach(clearTimeout);
      this.stopTimer();
      document.removeEventListener('keydown', this.onKey);
      UI.fx.innerHTML = '';
    }

    async requestLeave() {
      const midHand = this.inHand && !this.human.folded;
      if (midHand) {
        const ok = await UI.modal({
          title: '离开牌桌',
          html: '<p class="center">本局尚未结束，离开将视为<b>弃牌</b>，已下注的筹码不会退回。确定离开吗？</p>',
          buttons: [{ label: '再想想', value: false }, { label: '确定离开', value: true, cls: 'danger' }],
          dismissValue: false,
        });
        if (!ok) return;
      }
      this.aborted = true;
      if (this.humanResolve) this.humanResolve({ type: 'fold' });
      if (!this.inHand) this.cleanup();
    }

    checkAbort() { if (this.aborted) throw new Aborted(); }

    async wait(ms) {
      await sleep(ms * this.speedF);
      this.checkAbort();
    }

    later(fn, ms) { this.timers.push(setTimeout(fn, ms)); }

    // ---------- hand flow ----------

    active() { return this.players.filter((p) => !p.folded && !p.out); }

    nextActive(i) {
      for (let k = 1; k <= SEATS; k++) {
        const j = (i + k) % SEATS;
        const p = this.players[j];
        if (!p.folded && !p.out) return j;
      }
      return i;
    }

    relPos(i) { return (i - this.dealer - 1 + SEATS * 2) % SEATS; }

    cost(p, idx = this.stakeIdx) { return this.levels[idx] * (p.seen ? 2 : 1); }

    async playHand() {
      this.handNo++;
      for (let i = 1; i < SEATS; i++) {
        const p = this.players[i];
        if (p.chips < this.levels[this.levels.length - 1] * 2) {
          const np = this.newAI(i);
          this.log(`${p.name} 筹码耗尽离开了牌桌，${np.name} 入座`, 'sys');
          this.players[i] = np;
        }
      }
      this.players.forEach((p) => this.resetPlayer(p));
      this.dealer = (this.dealer + 1) % SEATS;
      this.round = 1;
      this.stakeIdx = 0;
      this.pot = 0;
      this.seenRaises = 0;
      this.current = -1;
      this.inHand = true;
      this.potChips.innerHTML = '';
      this.deckEl.classList.add('show');
      this.log(`—— 第 ${this.handNo} 局 · ${this.players[this.dealer].name} 坐庄 ——`, 'sys');
      this.render();
      await this.wait(500);

      this.players.forEach((p) => this.pay(p, this.ante));
      S.play('coins');
      this.log(`各家下底注 ${fmt(this.ante)}`);
      await this.wait(600);

      await this.deal(Z.shuffle(Z.makeDeck()));
      this.deckEl.classList.remove('show');

      let idx = this.nextActive(this.dealer);
      while (this.active().length > 1) {
        if (this.round > this.settings.maxRounds) { await this.showdown(); break; }
        this.current = idx;
        this.render();
        await this.takeTurn(this.players[idx]);
        if (this.active().length <= 1) break;
        const next = this.nextActive(idx);
        if (this.relPos(next) <= this.relPos(idx)) {
          this.round++;
          if (this.round <= this.settings.maxRounds) this.log(`第 ${this.round} 轮`, 'round');
        }
        idx = next;
      }
      this.current = -1;
      await this.settle(this.active());
      this.inHand = false;
    }

    async deal(deck) {
      const order = [];
      for (let k = 1; k <= SEATS; k++) order.push((this.dealer + k) % SEATS);
      const hands = this.players.map(() => []);
      for (let r = 0; r < 3; r++) for (const i of order) hands[i].push(deck.pop());
      if (this.settings.luck) this.applyLuck(hands);
      for (let r = 0; r < 3; r++) {
        for (const i of order) {
          const p = this.players[i];
          p.cards.push(hands[i][r]);
          this.flyCard(p, r);
          S.play('deal');
          await this.wait(90);
        }
      }
      await this.wait(450);
      this.players.forEach((p) => { p.hand = Z.evaluate(p.cards); p.shown = 3; });
      this.render();
    }

    applyLuck(hands) {
      const scores = hands.map((h) => Z.evaluate(h).score);
      const best = scores.indexOf(Math.max(...scores));
      if (best !== 0 && rand() < LUCK_CHANCE) [hands[0], hands[best]] = [hands[best], hands[0]];
    }

    flyCard(p, r) {
      const slot = this.seatEls[p.seat].querySelectorAll('.card')[r];
      const el = document.createElement('div');
      el.className = 'card fly-card' + (p.isHuman ? ' big' : '');
      el.innerHTML = '<div class="back"></div>';
      UI.fly(el, UI.point(this.deckEl), UI.point(slot), { duration: 320 * this.speedF, rotate: 360 }).then(() => {
        p.shown = Math.max(p.shown, r + 1);
        this.renderSeat(p);
      });
    }

    async takeTurn(p) {
      const act = p.isHuman ? await this.humanTurn(p) : await this.aiTurn(p);
      this.checkAbort();
      await this.execute(p, this.sanitize(p, act));
    }

    ctx(p) {
      const opponents = this.active().filter((o) => o !== p);
      const callCost = this.cost(p);
      return {
        round: this.round,
        maxRounds: this.settings.maxRounds,
        stakeIdx: this.stakeIdx,
        maxStakeIdx: this.levels.length - 1,
        callCost,
        pot: this.pot,
        opponents,
        canCompare: this.canCompare(p),
        raiseLevels: this.raiseOptions(p).map((o) => o.level),
        seenRaises: this.seenRaises,
        rule235: this.settings.rule235,
        skill: Z.AI.SKILL[this.settings.skill] ?? 0.6,
      };
    }

    canCompare(p) { return this.round >= 2 && p.chips >= this.cost(p) && this.active().length > 1; }

    raiseOptions(p) {
      const out = [];
      for (let i = this.stakeIdx + 1; i < this.levels.length; i++) {
        const c = this.cost(p, i);
        if (p.chips >= c) out.push({ idx: i, level: this.levels[i], cost: c });
      }
      return out;
    }

    sanitize(p, a) {
      const opponents = this.active().filter((o) => o !== p);
      const affordable = p.chips >= this.cost(p);
      const validTarget = (t) => opponents.some((o) => o.id === t);
      if (a.type === 'look') a = { type: 'call' };
      if (a.type === 'raise' && !this.raiseOptions(p).some((o) => o.level === a.level)) a = { type: 'call' };
      if (a.type === 'compare' && !this.canCompare(p)) a = { type: 'call' };
      if ((a.type === 'compare' || a.type === 'allin') && !validTarget(a.target)) a = { ...a, target: pick(opponents).id };
      if ((a.type === 'call' || a.type === 'raise') && !affordable) a = { type: 'allin', target: pick(opponents).id };
      if (a.type === 'allin' && affordable) a = { type: 'call' };
      return a;
    }

    async aiTurn(p) {
      const think = (650 + rand() * 900) * this.speedF;
      this.startTimer(p, think);
      await this.wait(think / this.speedF);
      let d = Z.AI.decide(p, this.ctx(p));
      if (d.type === 'look') {
        this.look(p);
        await this.wait(650);
        d = Z.AI.decide(p, this.ctx(p));
      }
      this.stopTimer();
      return d;
    }

    humanTurn(p) {
      return new Promise((resolve) => {
        this.humanResolve = (a) => {
          this.humanResolve = null;
          this.selecting = null;
          this.stopTimer();
          this.render();
          resolve(a);
        };
        S.play('turn');
        this.render();
        const total = this.settings.timer * 1000;
        this.startTimer(p, total, () => {
          if (!this.humanResolve) return;
          UI.toast('操作超时，自动弃牌');
          this.humanResolve({ type: 'fold' });
        }, true);
        if (this.autoCall) {
          this.later(() => {
            if (this.humanResolve && this.autoCall && p.chips >= this.cost(p)) this.humanResolve({ type: 'call' });
          }, 600);
        }
      });
    }

    look(p) {
      if (p.seen || p.folded || p.shown < 3) return;
      p.seen = true;
      S.play('flip');
      this.bubble(p, '看牌');
      this.log(`${p.name} 看了牌`);
      if (p.isHuman) {
        const best = this.app.profile.stats.bestType ?? -1;
        if (p.hand.type > best) this.app.profile.stats.bestType = p.hand.type;
        if (p.hand.type >= 3) this.later(() => UI.toast(`好牌！${p.hand.label}`), 400);
      }
      this.render();
    }

    async execute(p, a) {
      const voice = (t) => S.say(t);
      switch (a.type) {
        case 'fold':
          p.folded = true;
          S.play('fold');
          voice('弃牌');
          this.bubble(p, '弃牌');
          this.log(`${p.name} 弃牌`, 'fold');
          break;
        case 'call': {
          const c = this.cost(p);
          this.pay(p, c);
          const word = p.seen ? '跟注' : '闷跟';
          voice(word);
          this.bubble(p, `${word} ${fmt(c)}`);
          this.log(`${p.name} ${word} ${fmt(c)}`);
          break;
        }
        case 'raise': {
          this.stakeIdx = this.levels.indexOf(a.level);
          const c = this.cost(p);
          this.pay(p, c);
          if (p.seen) this.seenRaises++;
          const word = p.seen ? '加注' : '闷加';
          voice(word);
          this.bubble(p, `${word} ${fmt(c)}`, 'hot');
          this.log(`${p.name} ${word}到 ${fmt(this.levels[this.stakeIdx])}（付 ${fmt(c)}）`, 'raise');
          break;
        }
        case 'compare':
        case 'allin': {
          const c = a.type === 'allin' ? p.chips : this.cost(p);
          this.pay(p, c);
          const target = this.players[a.target];
          const word = a.type === 'allin' ? '孤注一掷' : '比牌';
          voice(word);
          this.bubble(p, word, 'hot');
          this.log(`${p.name} 花 ${fmt(c)} 与 ${target.name} ${word}`, 'raise');
          this.render();
          await this.compare(p, target);
          break;
        }
      }
      this.render();
      await this.wait(300);
    }

    pay(p, amount) {
      const amt = Math.min(amount, p.chips);
      if (amt <= 0) return;
      p.chips -= amt;
      p.bet += amt;
      this.pot += amt;
      this.flyChips(p, amt);
      S.play('chip');
      this.render();
    }

    chipClass(amt) {
      const r = amt / this.ante;
      if (r >= 10) return 'c-gold';
      if (r >= 5) return 'c-black';
      if (r >= 3) return 'c-purple';
      if (r >= 2) return 'c-red';
      return 'c-blue';
    }

    flyChips(p, amt) {
      const from = UI.point(this.seatEls[p.seat].querySelector('.avatar'));
      const potRect = UI.point(this.potChips);
      const n = clamp(Math.ceil(amt / this.ante / 3), 1, 4);
      for (let i = 0; i < n; i++) {
        const cls = this.chipClass(amt);
        const tx = (rand() - 0.5) * 200;
        const ty = (rand() - 0.5) * 70;
        const el = document.createElement('div');
        el.className = `chip ${cls}`;
        this.later(() => {
          UI.fly(el, from, { x: potRect.x + tx, y: potRect.y + ty }, { duration: 420 * this.speedF }).then(() => {
            const c = document.createElement('div');
            c.className = `chip ${cls} rest`;
            c.style.left = `calc(50% + ${tx}px)`;
            c.style.top = `calc(50% + ${ty}px)`;
            c.style.transform = `translate(-50%,-50%) rotate(${rand() * 360}deg)`;
            this.potChips.appendChild(c);
            while (this.potChips.children.length > 70) this.potChips.firstChild.remove();
          });
        }, i * 60);
      }
    }

    flyPotTo(p) {
      const to = UI.point(this.seatEls[p.seat].querySelector('.avatar'));
      const chips = [...this.potChips.children];
      chips.forEach((c, i) => {
        const from = UI.point(c);
        const el = document.createElement('div');
        el.className = c.className.replace(' rest', '');
        c.remove();
        this.later(() => UI.fly(el, from, to, { duration: 600, easing: 'cubic-bezier(.5,0,.3,1)' }), i * 18);
      });
    }

    async compare(a, b) {
      S.play('vs');
      const res = Z.compareHands(a.hand, b.hand, this.settings.rule235);
      const winner = res > 0 ? a : b;
      const loser = winner === a ? b : a;
      const humanIn = a.isHuman || b.isHuman;
      const showFaces = humanIn && this.human.seen;
      if (showFaces) { a.revealed = true; b.revealed = true; }

      const side = (p, dir) => `
        <div class="vs-side ${dir}" data-id="${p.id}">
          <img class="vs-avatar" src="${avatarSrc(p.avatar)}" alt="">
          <div class="vs-name">${esc(p.name)}</div>
          <div class="vs-cards">${p.cards.map((c) => this.cardHTML(c, showFaces || p.revealed, 'mid')).join('')}</div>
          <div class="vs-hand">${showFaces || p.revealed ? p.hand.label : '？？？'}</div>
          <div class="vs-stamp"></div>
        </div>`;
      const ov = document.createElement('div');
      ov.className = 'vs-overlay';
      ov.innerHTML = `${side(a, 'left')}<div class="vs-mark">VS</div>${side(b, 'right')}`;
      this.el.appendChild(ov);
      try {
        await this.wait(1300);
        ov.querySelector(`[data-id="${winner.id}"]`).classList.add('win');
        ov.querySelector(`[data-id="${loser.id}"]`).classList.add('lose');
        ov.querySelector(`[data-id="${winner.id}"] .vs-stamp`).textContent = '胜';
        ov.querySelector(`[data-id="${loser.id}"] .vs-stamp`).textContent = '败';
        if (humanIn) S.play(winner.isHuman ? 'win' : 'lose'); else S.play('fold');
        if (res === 0) UI.toast('牌面相同，发起比牌者判负');
        await this.wait(1500);
      } finally {
        ov.remove();
      }
      loser.folded = true;
      loser.lostCompare = true;
      this.log(`比牌结果：${winner.name}（胜） vs ${loser.name}（败）`, 'compare');
      this.render();
    }

    async showdown() {
      this.log(`已到封顶 ${this.settings.maxRounds} 轮，强制开牌`, 'sys');
      UI.toast('达到封顶轮数，所有玩家开牌比大小');
      S.play('vs');
      const act = this.active();
      let best = [act[0]];
      for (const p of act.slice(1)) {
        const r = Z.compareHands(p.hand, best[0].hand, this.settings.rule235);
        if (r > 0) best = [p];
        else if (r === 0) best.push(p);
      }
      act.forEach((p) => {
        p.revealed = true;
        if (!best.includes(p)) { p.folded = true; p.lostCompare = true; }
      });
      this.render();
      await this.wait(1600);
    }

    async settle(winners) {
      const pot = this.pot;
      const share = Math.floor(pot / winners.length);
      const rest = pot - share * winners.length;
      winners.forEach((w, i) => {
        const amt = share + (i === 0 ? rest : 0);
        w.chips += amt;
        w.winner = true;
        w.net = amt - w.bet;
        this.flyPotTo(w);
      });
      this.players.forEach((p) => { if (!p.winner) p.net = -p.bet; });
      if (this.settings.revealAll) this.players.forEach((p) => { p.revealed = true; });
      this.pot = 0;

      const h = this.human;
      const won = h.winner;
      const stats = this.app.profile.stats;
      if ((h.seen || h.revealed) && h.hand.type > (stats.bestType ?? -1)) stats.bestType = h.hand.type;
      S.play('coins');
      this.later(() => S.play(won ? 'win' : 'lose'), 350);
      if (won) S.say('恭喜，你赢了');
      this.log(`${winners.map((w) => w.name).join('、')} 赢得底池 ${fmt(pot)}`, 'win');
      this.lastPot = pot;
      this.app.recordHand({ won, net: h.net, chips: h.chips });
      this.render();
      await this.wait(1300);
    }

    showResult() {
      const h = this.human;
      const winners = this.players.filter((p) => p.winner);
      const title = h.winner
        ? (winners.length > 1 ? '平分底池' : '🎉 你赢了！')
        : `${winners.map((w) => esc(w.name)).join('、')} 赢了`;
      const rows = this.players.map((p) => {
        const face = p.isHuman ? p.seen || p.revealed : p.revealed;
        const state = p.winner ? '<span class="res-tag win">胜</span>'
          : p.lostCompare ? '<span class="res-tag lose">比牌输</span>'
          : '<span class="res-tag fold">弃牌</span>';
        return `<div class="res-row ${p.isHuman ? 'me' : ''} ${p.winner ? 'winner' : ''}">
          <img class="res-avatar" src="${avatarSrc(p.avatar)}" alt="">
          <div class="res-name">${esc(p.name)}${p.isHuman ? '（我）' : ''} ${state}</div>
          <div class="res-cards">${p.cards.map((c) => this.cardHTML(c, face, 'mini')).join('')}</div>
          <div class="res-hand">${face ? p.hand.label : '未亮牌'}</div>
          <div class="res-net ${p.net >= 0 ? 'pos' : 'neg'}">${p.net >= 0 ? '+' : ''}${fmt(p.net)}</div>
        </div>`;
      }).join('');
      return UI.modal({
        title,
        cls: h.winner ? 'result win' : 'result',
        html: `<div class="res-summary">底池 <b>${fmt(this.lastPot)}</b>　·　本局 <b class="${h.net >= 0 ? 'pos' : 'neg'}">${h.net >= 0 ? '+' : ''}${fmt(h.net)}</b>　·　余额 <b>${fmt(h.chips)}</b></div><div class="res-list">${rows}</div>`,
        buttons: [
          { label: '离开牌桌', value: false, cls: 'ghost' },
          { label: '继续下一局 ⏎', value: true, cls: 'primary' },
        ],
      });
    }

    // ---------- timer / bubbles / log ----------

    startTimer(p, ms, onDone, ticking) {
      this.stopTimer();
      const seat = this.seatEls[p.seat];
      const c = seat.querySelector('.timer circle');
      c.style.animation = 'none';
      void c.getBoundingClientRect();
      c.style.animation = `countdown ${ms}ms linear forwards`;
      seat.classList.add('timing');
      if (onDone) this.turnTimer = setTimeout(onDone, ms);
      if (ticking) {
        const end = Date.now() + ms;
        this.tickTimer = setInterval(() => {
          const left = end - Date.now();
          if (left <= 5000 && left > 0) { S.play('tick'); seat.classList.add('hurry'); }
        }, 1000);
      }
    }

    stopTimer() {
      clearTimeout(this.turnTimer);
      clearInterval(this.tickTimer);
      this.seatEls?.forEach((s) => s.classList.remove('timing', 'hurry'));
    }

    bubble(p, text, cls = '') {
      const b = this.seatEls[p.seat].querySelector('.bubble');
      b.textContent = text;
      b.className = `bubble show ${cls}`;
      clearTimeout(b._t);
      b._t = setTimeout(() => { b.className = 'bubble'; }, 1600);
    }

    log(text, cls = '') {
      const li = document.createElement('li');
      li.className = cls;
      li.textContent = text;
      this.logEl.appendChild(li);
      while (this.logEl.children.length > 80) this.logEl.firstChild.remove();
      this.logEl.scrollTop = this.logEl.scrollHeight;
    }

    // ---------- DOM ----------

    cardHTML(c, face, size = '') {
      return `<div class="card ${size} ${face ? 'up' : ''}"><div class="face" style="background-image:url('${Z.cardImage(c)}')"></div><div class="back"></div></div>`;
    }

    build() {
      this.el = document.getElementById('game');
      this.seatsEl = document.getElementById('seats');
      this.logEl = document.getElementById('logList');
      this.potChips = document.getElementById('potChips');
      this.deckEl = document.getElementById('deck');
      this.actionEl = document.getElementById('actionBar');
      this.logEl.innerHTML = '';
      this.potChips.innerHTML = '';
      document.getElementById('roomName').textContent = `${this.room.name} · 底注 ${fmt(this.ante)}`;

      this.seatsEl.innerHTML = '';
      this.seatEls = [];
      for (let i = 0; i < SEATS; i++) {
        const s = document.createElement('div');
        s.className = `seat seat-${i}` + (i === 0 ? ' me' : '');
        s.innerHTML = `
          <div class="avatar-wrap">
            <svg class="timer" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46"/></svg>
            <img class="avatar" alt="">
            <div class="dealer-chip">庄</div>
            <div class="bubble"></div>
          </div>
          <div class="info"><div class="name"></div><div class="chips"><i class="coin"></i><span class="chip-val"></span></div></div>
          <div class="hand-area">
            <div class="cards">${[0, 1, 2].map(() => `<div class="card${i === 0 ? ' big' : ''}"><div class="face"></div><div class="back"></div></div>`).join('')}
              <div class="look-hint">点击看牌</div><div class="stamp"></div></div>
            <div class="hand-label"></div>
          </div>
          <div class="tag"></div>
          <div class="bet"><i class="chip c-blue"></i><span></span></div>`;
        s.addEventListener('click', () => this.onSeatClick(i));
        this.seatsEl.appendChild(s);
        this.seatEls.push(s);
      }
      this.seatEls[0].querySelector('.cards').addEventListener('click', (e) => {
        e.stopPropagation();
        this.humanLook();
      });

      this.actionEl.innerHTML = `
        <div class="select-tip">请选择要比牌的玩家 <button class="btn small ghost" data-act="cancel">取消</button></div>
        <div class="actions">
          <button class="btn act-look" data-act="look">看牌<kbd>L</kbd></button>
          <button class="btn act-fold" data-act="fold">弃牌<kbd>F</kbd></button>
          <button class="btn act-compare" data-act="compare">比牌<small></small><kbd>B</kbd></button>
          <button class="btn act-allin" data-act="allin">孤注一掷<small></small></button>
          <button class="btn act-call" data-act="call">跟注<small></small><kbd>C</kbd></button>
          <div class="raise-wrap"><button class="btn act-raise" data-act="raise">加注<kbd>R</kbd></button><div class="raise-pop"></div></div>
        </div>
        <label class="auto-call"><input type="checkbox"> 自动跟注</label>`;
      this.actionEl.querySelectorAll('[data-act]').forEach((b) => {
        b.addEventListener('click', (e) => { e.stopPropagation(); this.onAction(b.dataset.act); });
      });
      const auto = this.actionEl.querySelector('.auto-call input');
      auto.checked = false;
      auto.addEventListener('change', () => {
        this.autoCall = auto.checked;
        if (this.autoCall && this.humanResolve && this.human.chips >= this.cost(this.human)) this.humanResolve({ type: 'call' });
      });

      this.onKey = (e) => {
        if (!document.getElementById('modal').classList.contains('hidden')) return;
        if (e.target.tagName === 'INPUT') return;
        const map = { l: 'look', f: 'fold', c: 'call', b: 'compare', r: 'raise-min', escape: 'cancel' };
        const act = map[e.key.toLowerCase()];
        if (act) { e.preventDefault(); this.onAction(act); }
      };
      document.addEventListener('keydown', this.onKey);
    }

    humanLook() {
      const h = this.human;
      if (!this.inHand || h.seen || h.folded || h.shown < 3) return;
      this.look(h);
    }

    onAction(act) {
      const h = this.human;
      if (act === 'look') return this.humanLook();
      if (act === 'cancel') {
        if (this.selecting) { this.selecting = null; this.render(); }
        this.actionEl.querySelector('.raise-wrap').classList.remove('open');
        return;
      }
      if (!this.humanResolve) return;
      S.play('click');
      const opponents = this.active().filter((o) => o !== h);
      switch (act) {
        case 'fold': return this.humanResolve({ type: 'fold' });
        case 'call':
          if (h.chips >= this.cost(h)) this.humanResolve({ type: 'call' });
          return;
        case 'raise': {
          const opts = this.raiseOptions(h);
          if (!opts.length) return;
          this.actionEl.querySelector('.raise-wrap').classList.toggle('open');
          return;
        }
        case 'raise-min': {
          const opts = this.raiseOptions(h);
          if (opts.length) this.humanResolve({ type: 'raise', level: opts[0].level });
          return;
        }
        case 'compare':
        case 'allin': {
          if (act === 'compare' && !this.canCompare(h)) {
            UI.toast(this.round < 2 ? '第 2 轮开始才能比牌' : '筹码不足');
            return;
          }
          if (act === 'allin' && h.chips >= this.cost(h)) return;
          if (opponents.length === 1) return this.humanResolve({ type: act, target: opponents[0].id });
          this.selecting = act;
          this.render();
          return;
        }
      }
    }

    onSeatClick(i) {
      if (!this.selecting || !this.humanResolve) return;
      const p = this.players[i];
      if (p.isHuman || p.folded) return;
      this.humanResolve({ type: this.selecting, target: p.id });
    }

    render() {
      this.players.forEach((p) => this.renderSeat(p));
      document.getElementById('potVal').textContent = fmt(this.pot);
      document.getElementById('roundInfo').textContent = this.inHand
        ? `第 ${Math.min(this.round, this.settings.maxRounds)} / ${this.settings.maxRounds} 轮`
        : '等待开局';
      const stake = this.levels[this.stakeIdx];
      document.getElementById('stakeInfo').innerHTML = `单注 <b>${fmt(stake)}</b>　<span>闷 ${fmt(stake)} / 明 ${fmt(stake * 2)}</span>`;
      document.getElementById('handNo').textContent = `第 ${this.handNo} 局`;
      document.getElementById('myChips').textContent = fmt(this.human.chips);
      this.renderActions();
    }

    renderSeat(p) {
      const s = this.seatEls[p.seat];
      s.querySelector('.avatar').src = avatarSrc(p.avatar);
      s.querySelector('.name').textContent = p.name;
      s.querySelector('.chip-val').textContent = fmt(p.chips);
      s.classList.toggle('dealer', p.seat === this.dealer);
      s.classList.toggle('active', p.seat === this.current);
      s.classList.toggle('folded', p.folded);
      s.classList.toggle('winner', !!p.winner);
      s.classList.toggle('selectable', !!this.selecting && !p.isHuman && !p.folded);

      const face = p.isHuman ? p.seen || p.revealed : p.revealed;
      const cards = s.querySelectorAll('.card');
      cards.forEach((el, i) => {
        const c = p.cards[i];
        el.classList.toggle('hidden', i >= p.shown);
        if (c) el.querySelector('.face').style.backgroundImage = `url('${Z.cardImage(c)}')`;
        el.classList.toggle('up', !!(c && face && i < p.shown));
      });
      s.classList.toggle('can-look', p.isHuman && this.inHand && !p.seen && !p.folded && p.shown >= 3);

      const label = s.querySelector('.hand-label');
      label.textContent = face && p.hand ? p.hand.label : '';
      label.className = 'hand-label' + (face && p.hand ? ` t${p.hand.type}` : '');

      const tag = s.querySelector('.tag');
      let t = '';
      if (p.winner) t = '赢家';
      else if (p.shown >= 3) t = p.folded ? (p.lostCompare ? '比牌输' : '已弃牌') : p.seen ? '已看牌' : '闷牌';
      tag.textContent = t;
      tag.className = 'tag' + (t ? ' show' : '') + (p.seen && !p.folded ? ' seen' : '') + (p.folded ? ' out' : '') + (p.winner ? ' win' : '');

      const stamp = s.querySelector('.stamp');
      stamp.textContent = p.winner ? '胜' : p.folded ? (p.lostCompare ? '败' : '弃') : '';

      const bet = s.querySelector('.bet');
      bet.classList.toggle('show', p.bet > 0);
      bet.querySelector('span').textContent = fmt(p.bet);
    }

    renderActions() {
      const h = this.human;
      const a = this.actionEl;
      const myTurn = !!this.humanResolve;
      const playing = this.inHand && !h.folded;
      a.classList.toggle('show', playing);
      a.classList.toggle('my-turn', myTurn);
      a.classList.toggle('selecting', !!this.selecting);
      const q = (sel) => a.querySelector(sel);
      const affordable = h.chips >= this.cost(h);
      const opts = this.raiseOptions(h);

      q('.act-look').disabled = !playing || h.seen || h.shown < 3;
      q('.act-look').classList.toggle('gone', h.seen);
      q('.act-fold').disabled = !myTurn;
      q('.act-call').disabled = !myTurn || !affordable;
      q('.act-call').firstChild.textContent = h.seen ? '跟注' : '闷跟';
      q('.act-call small').textContent = fmt(this.cost(h));
      q('.act-call').classList.toggle('gone', !affordable && playing);
      q('.act-raise').disabled = !myTurn || !opts.length;
      q('.act-raise').classList.toggle('gone', !affordable && playing);
      q('.act-compare').disabled = !myTurn || !this.canCompare(h);
      q('.act-compare small').textContent = this.round >= 2 ? fmt(this.cost(h)) : '第2轮起';
      q('.act-compare').classList.toggle('gone', !affordable && playing);
      q('.act-allin').classList.toggle('gone', affordable || !playing);
      q('.act-allin').disabled = !myTurn;
      q('.act-allin small').textContent = fmt(h.chips);

      const pop = q('.raise-pop');
      pop.innerHTML = opts.map((o) => `<button class="btn small" data-level="${o.level}">加到 ${fmt(o.level)}<small>付 ${fmt(o.cost)}</small></button>`).join('');
      pop.querySelectorAll('button').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          q('.raise-wrap').classList.remove('open');
          if (this.humanResolve) { S.play('click'); this.humanResolve({ type: 'raise', level: +b.dataset.level }); }
        });
      });
      if (!myTurn) q('.raise-wrap').classList.remove('open');
    }
  }

  Z.Game = Game;
  Z.avatarSrc = avatarSrc;
  Z.AVATAR_COUNT = AVATAR_COUNT;
})();
