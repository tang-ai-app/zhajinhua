(function () {
  const Z = (window.ZJH = window.ZJH || {});

  const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
  const SUIT_SYMBOL = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' };
  const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const RANK_FILE = { 11: 'jack', 12: 'queen', 13: 'king', 14: 'ace' };
  const HAND_TYPES = ['单张', '对子', '顺子', '金花', '同花顺', '豹子'];

  const rankLabel = (r) => RANK_LABEL[r] || String(r);

  function makeDeck() {
    const deck = [];
    for (const s of SUITS) for (let r = 2; r <= 14; r++) deck.push({ r, s });
    return deck;
  }

  function shuffle(arr) {
    const a = arr.slice();
    const rnd = new Uint32Array(a.length);
    crypto.getRandomValues(rnd);
    for (let i = a.length - 1; i > 0; i--) {
      const j = rnd[i] % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const seq = (high) => (high === 3 ? [14, 2, 3] : [high - 2, high - 1, high]).map(rankLabel).join('');

  const cardImage = (c) => `assets/cards/${RANK_FILE[c.r] || c.r}_of_${c.s}.png`;
  const cardText = (c) => SUIT_SYMBOL[c.s] + rankLabel(c.r);

  function evaluate(cards) {
    const rs = cards.map((c) => c.r).sort((a, b) => b - a);
    const flush = cards.every((c) => c.s === cards[0].s);
    let straightHigh = 0;
    if (rs[0] - rs[1] === 1 && rs[1] - rs[2] === 1) straightHigh = rs[0];
    else if (rs[0] === 14 && rs[1] === 3 && rs[2] === 2) straightHigh = 3;

    let type, key, label;
    const highKey = rs[0] * 225 + rs[1] * 15 + rs[2];
    if (rs[0] === rs[2]) {
      type = 5; key = rs[0]; label = `豹子 ${rankLabel(rs[0])}`;
    } else if (straightHigh && flush) {
      type = 4; key = straightHigh; label = `同花顺 ${seq(straightHigh)}`;
    } else if (flush) {
      type = 3; key = highKey; label = `金花 ${rankLabel(rs[0])}`;
    } else if (straightHigh) {
      type = 2; key = straightHigh; label = `顺子 ${seq(straightHigh)}`;
    } else if (rs[0] === rs[1] || rs[1] === rs[2]) {
      const pair = rs[1];
      const kicker = rs[0] === rs[1] ? rs[2] : rs[0];
      type = 1; key = pair * 15 + kicker; label = `对子 ${rankLabel(pair)}`;
    } else {
      type = 0; key = highKey; label = `单张 ${rankLabel(rs[0])}`;
    }
    const special235 = !flush && rs[0] === 5 && rs[1] === 3 && rs[2] === 2;
    return { type, name: HAND_TYPES[type], label, score: type * 10000 + key, special235 };
  }

  // >0: a wins, <0: b wins, 0: exact tie
  function compareHands(a, b, rule235) {
    if (rule235) {
      if (a.type === 5 && b.special235) return -1;
      if (b.type === 5 && a.special235) return 1;
    }
    return a.score - b.score;
  }

  let sortedScores = null;
  function buildTable() {
    const deck = makeDeck();
    const scores = [];
    for (let i = 0; i < 52; i++)
      for (let j = i + 1; j < 52; j++)
        for (let k = j + 1; k < 52; k++) scores.push(evaluate([deck[i], deck[j], deck[k]]).score);
    sortedScores = Float64Array.from(scores).sort();
  }

  function lowerBound(arr, v) {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; }
    return lo;
  }

  function percentile(hand) {
    if (!sortedScores) buildTable();
    const below = lowerBound(sortedScores, hand.score);
    const upto = lowerBound(sortedScores, hand.score + 1);
    return (below + (upto - below) / 2) / sortedScores.length;
  }

  Object.assign(Z, {
    SUITS, SUIT_SYMBOL, HAND_TYPES, rankLabel, makeDeck, shuffle,
    cardImage, cardText, evaluate, compareHands, percentile,
  });
})();
