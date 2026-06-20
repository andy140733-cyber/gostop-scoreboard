/* stats.js — 통계 지표 산출 (레코드 목록 → 지표) */
(function (global) {
  'use strict';
  const GS = (global.GS = global.GS || {});
  const cfg = GS.config;

  function emptyPlayer() {
    return { net: 0, gained: 0, lost: 0, wins: 0, winRate: 0, correction: 0 };
  }

  /**
   * 주어진 레코드 목록(game/correction; settlement은 무시)에서 통계 산출.
   * @returns {{games, perPlayer, biggestWin, specials}}
   */
  function compute(records) {
    const ids = cfg.PLAYER_IDS;
    const perPlayer = {};
    for (const id of ids) perPlayer[id] = emptyPlayer();

    const specials = {
      bomb: 0, threeGo: 0, daepan: 0,
      dokbak: { me: 0, mom: 0, dad: 0 },
      pibakSuffered: { me: 0, mom: 0, dad: 0 },
    };

    let games = 0;
    let biggestWin = null; // {record, amount}

    for (const r of records) {
      if (r.type === 'settlement') continue;

      if (r.type === 'correction') {
        for (const id of ids) {
          const v = (r.deltas && r.deltas[id]) | 0;
          perPlayer[id].correction += v;
          perPlayer[id].net += v;
        }
        continue;
      }

      if (r.type !== 'game') continue;
      games++;

      // 득실
      for (const id of ids) {
        const v = (r.deltas && r.deltas[id]) | 0;
        perPlayer[id].net += v;
        if (v > 0) perPlayer[id].gained += v;
        else if (v < 0) perPlayer[id].lost += -v;
      }
      // 승수
      if (perPlayer[r.winner]) perPlayer[r.winner].wins++;

      // 최고 점수 판 (승자 델타 기준)
      const winAmt = (r.deltas && r.deltas[r.winner]) | 0;
      if (!biggestWin || winAmt > biggestWin.amount) biggestWin = { record: r, amount: winAmt };

      // 특수조건 빈도
      if (r.bomb) specials.bomb++;
      if (r.threeGo) specials.threeGo++;
      if (r.daepan) specials.daepan++;
      if (r.dokbak && specials.dokbak[r.dokbak] !== undefined) specials.dokbak[r.dokbak]++;
      if (r.pibak) for (const id of ids) if (r.pibak[id]) specials.pibakSuffered[id]++;
    }

    for (const id of ids) {
      perPlayer[id].winRate = games > 0 ? perPlayer[id].wins / games : 0;
    }

    return { games, perPlayer, biggestWin, specials };
  }

  GS.stats = { compute };
})(typeof window !== 'undefined' ? window : globalThis);
