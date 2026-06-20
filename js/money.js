/* money.js — 점수 → 금액 환산 (점당 단가, 정수 연산) */
(function (global) {
  'use strict';
  const GS = (global.GS = global.GS || {});

  function toAmount(points, perPoint) {
    return Math.trunc((points | 0) * (perPoint | 0));
  }

  /** 금액을 원화 형식 문자열로. 부호 유지. */
  function formatWon(amount) {
    const n = Math.trunc(amount || 0);
    const sign = n > 0 ? '+' : '';
    return sign + n.toLocaleString('ko-KR') + '원';
  }

  /** 점수와 단가로 금액 문자열. perPoint가 0이면 빈 문자열. */
  function format(points, perPoint) {
    if (!perPoint) return '';
    return formatWon(toAmount(points, perPoint));
  }

  GS.money = { toAmount, formatWon, format };
})(typeof window !== 'undefined' ? window : globalThis);
