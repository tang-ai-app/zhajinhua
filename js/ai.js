(function () {
  const Z = (window.ZJH = window.ZJH || {});

  const PERSONAS = [
    { name: '赌侠小刀', aggr: 0.8, bluff: 0.5, tight: 0.3 },
    { name: '稳健老王', aggr: 0.3, bluff: 0.1, tight: 0.85 },
    { name: '翠花', aggr: 0.5, bluff: 0.3, tight: 0.5 },
    { name: '钱多多', aggr: 0.9, bluff: 0.7, tight: 0.2 },
    { name: '算盘张', aggr: 0.4, bluff: 0.15, tight: 0.7 },
    { name: '小龙女', aggr: 0.6, bluff: 0.4, tight: 0.5 },
    { name: '铁头娃', aggr: 0.95, bluff: 0.6, tight: 0.1 },
    { name: '佛系青年', aggr: 0.2, bluff: 0.2, tight: 0.4 },
    { name: '东北虎哥', aggr: 0.75, bluff: 0.45, tight: 0.4 },
    { name: '慕容雪', aggr: 0.5, bluff: 0.25, tight: 0.6 },
    { name: '隔壁老李', aggr: 0.6, bluff: 0.35, tight: 0.45 },
    { name: '幸运星', aggr: 0.45, bluff: 0.5, tight: 0.35 },
    { name: '深海鲨鱼', aggr: 0.7, bluff: 0.3, tight: 0.75 },
    { name: '包租婆', aggr: 0.65, bluff: 0.4, tight: 0.55 },
    { name: '豆豆', aggr: 0.35, bluff: 0.3, tight: 0.3 },
  ];

  const SKILL = { easy: 0.2, normal: 0.6, hard: 0.95 };

  const rand = Math.random;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function strength(p, c) {
    const pct = Z.percentile(p.hand);
    const k = Math.max(1, c.opponents.length);
    let w = Math.pow(pct, Math.max(1, k * 0.75));
    if (c.rule235 && p.hand.special235) w = Math.max(w, 0.15);
    w *= Math.pow(0.88, c.seenRaises);
    w += (rand() - 0.5) * (1 - c.skill) * 0.35;
    return clamp(w, 0, 1);
  }

  function chooseTarget(p, c, s) {
    const opp = c.opponents;
    if (c.skill > 0.5 && s !== undefined) {
      const blind = opp.filter((o) => !o.seen);
      if (s < 0.6 && blind.length && rand() < 0.6) return pick(blind).id;
    }
    return pick(opp).id;
  }

  function raiseLevel(p, c, big) {
    const lv = c.raiseLevels;
    if (!lv.length) return null;
    if (big) return lv[Math.min(lv.length - 1, Math.floor(rand() * lv.length * p.ai.aggr) + 1)] || lv[lv.length - 1];
    return lv[0];
  }

  function decide(p, c) {
    const per = p.ai;
    const affordable = p.chips >= c.callCost;

    if (!affordable) {
      if (!p.seen) return { type: 'look' };
      const s = strength(p, c);
      return s > 0.4 - per.aggr * 0.15 ? { type: 'allin', target: chooseTarget(p, c, s) } : { type: 'fold' };
    }

    if (!p.seen) {
      const lookP = 0.1 + (c.round - 1) * 0.18 + c.stakeIdx * 0.08 + c.seenRaises * 0.1 - per.aggr * 0.12;
      if (rand() < lookP || c.round >= c.maxRounds - 1) return { type: 'look' };
      if (c.canCompare && c.round >= 4 && rand() < 0.12 + per.aggr * 0.1) return { type: 'compare', target: chooseTarget(p, c) };
      if (c.raiseLevels.length && rand() < per.aggr * 0.14) return { type: 'raise', level: c.raiseLevels[0] };
      return { type: 'call' };
    }

    const s = strength(p, c);
    const potOdds = c.callCost / (c.pot + c.callCost);
    const bluff = rand() < per.bluff * 0.22;
    const late = c.round >= c.maxRounds - 2;

    if (s > 0.8) {
      if (c.raiseLevels.length && rand() < 0.3 + per.aggr * 0.5) return { type: 'raise', level: raiseLevel(p, c, true) };
      if (c.canCompare && (late || (c.opponents.length === 1 && c.stakeIdx >= c.maxStakeIdx && rand() < 0.3)))
        return { type: 'compare', target: chooseTarget(p, c, s) };
      return { type: 'call' };
    }
    if (s > 0.5 || bluff) {
      if (c.raiseLevels.length && rand() < per.aggr * (bluff ? 0.5 : 0.3)) return { type: 'raise', level: raiseLevel(p, c, false) };
      if (c.canCompare && (late || rand() < 0.1 + c.round * 0.05)) return { type: 'compare', target: chooseTarget(p, c, s) };
      return { type: 'call' };
    }
    if (s > potOdds * 1.3 && s > 0.22) {
      if (c.canCompare && rand() < 0.45) return { type: 'compare', target: chooseTarget(p, c, s) };
      if (rand() < 1 - per.tight * 0.6) return { type: 'call' };
    }
    if (c.canCompare && s > 0.28 && rand() < 0.3) return { type: 'compare', target: chooseTarget(p, c, s) };
    return { type: 'fold' };
  }

  Z.AI = { PERSONAS, SKILL, decide };
})();
