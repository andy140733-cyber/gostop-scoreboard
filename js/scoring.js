/* scoring.js — 점수 계산 단일 정본 (순수 함수, 부수효과 0) */
(function (global) {
  'use strict';
  const GS = (global.GS = global.GS || {});
  const cfg = GS.config;

  /**
   * 라운드 배수 R = (폭탄?2:1) × (쓰리고?2:1) × (대판?2:1). 곱연산 중첩(최대 ×8).
   */
  function roundMultiplier(round) {
    return (round.bomb ? 2 : 1) * (round.threeGo ? 2 : 1) * (round.daepan ? 2 : 1);
  }

  /**
   * 한 판을 평가해 상세 결과를 반환.
   * @returns {{deltas:Object, total:number, R:number, naturalLoss:Object, losers:string[], winner:string}}
   */
  function evaluate(round) {
    const ids = cfg.PLAYER_IDS;
    const winner = round.winner;
    const losers = ids.filter((id) => id !== winner);
    const base = Number(round.base) || 0;
    const R = roundMultiplier(round);

    // 패자별 자연 손실 = base × R × (피박?2:1). 피박은 패자별 독립.
    const naturalLoss = {};
    for (const L of losers) {
      const pibak = !!(round.pibak && round.pibak[L]);
      naturalLoss[L] = base * R * (pibak ? 2 : 1);
    }
    const total = losers.reduce((s, L) => s + naturalLoss[L], 0);

    const deltas = {};
    for (const id of ids) deltas[id] = 0;
    deltas[winner] = total;

    if (round.dokbak && losers.indexOf(round.dokbak) !== -1) {
      // 독박: 고를 외친 패자 한 명이 전부 부담, 다른 패자는 0.
      deltas[round.dokbak] = -total;
    } else {
      for (const L of losers) deltas[L] = -naturalLoss[L];
    }

    return { deltas, total, R, naturalLoss, losers, winner };
  }

  /** 델타만 필요할 때. */
  function computeDeltas(round) {
    return evaluate(round).deltas;
  }

  /**
   * 게임 입력 유효성 검증.
   * @returns {{ok:boolean, errors:string[]}}
   */
  function validateGameInput(round) {
    const ids = cfg.PLAYER_IDS;
    const errors = [];

    if (!round || typeof round !== 'object') {
      return { ok: false, errors: ['입력이 없습니다.'] };
    }

    // 승자
    if (ids.indexOf(round.winner) === -1) {
      errors.push('승자를 한 명 선택하세요.');
    }

    // 점수(base): 정수, 범위
    const base = round.base;
    if (typeof base !== 'number' || !isFinite(base) || Math.floor(base) !== base) {
      errors.push('점수는 정수여야 합니다.');
    } else if (base < cfg.MIN_BASE || base > cfg.MAX_BASE) {
      errors.push(`점수는 ${cfg.MIN_BASE}~${cfg.MAX_BASE} 사이여야 합니다.`);
    }

    // 배수 플래그는 boolean 강제(자동 변환되지만 명시)
    for (const m of ['bomb', 'threeGo', 'daepan']) {
      if (round[m] !== undefined && typeof round[m] !== 'boolean') {
        errors.push(`${m} 값이 올바르지 않습니다.`);
      }
    }

    // 독박: null 또는 패자 중 1명 (승자는 불가)
    if (round.dokbak != null) {
      if (round.dokbak === round.winner) {
        errors.push('독박은 승자가 될 수 없습니다.');
      } else if (ids.indexOf(round.dokbak) === -1) {
        errors.push('독박 대상이 올바르지 않습니다.');
      }
    }

    // 피박: 승자에게 설정되어 있으면 무시되지만 경고
    if (round.pibak && round.pibak[round.winner]) {
      errors.push('승자는 피박이 될 수 없습니다.');
    }

    return { ok: errors.length === 0, errors };
  }

  GS.scoring = { roundMultiplier, evaluate, computeDeltas, validateGameInput };
})(typeof window !== 'undefined' ? window : globalThis);
