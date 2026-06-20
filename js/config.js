/* config.js — 도메인 상수 한 곳 집중 (전역 네임스페이스 GS) */
(function (global) {
  'use strict';
  const GS = (global.GS = global.GS || {});

  GS.config = {
    // 플레이어는 고정 3인. id는 내부 식별자, label은 화면 표시용.
    PLAYERS: [
      { id: 'me', label: '나' },
      { id: 'mom', label: '엄마' },
      { id: 'dad', label: '아빠' },
    ],
    PLAYER_IDS: ['me', 'mom', 'dad'],
    LABELS: { me: '나', mom: '엄마', dad: '아빠' },

    // 점수(base) 범위. 고스톱은 통상 3점부터 남.
    MIN_BASE: 1,
    MAX_BASE: 999,
    DEFAULT_BASE: 3,

    // 라운드 배수 규칙 (각각 ×2, 곱연산 중첩)
    ROUND_MULTIPLIERS: [
      { key: 'bomb', label: '폭탄', desc: '폭탄을 한 판 — 점수 ×2' },
      { key: 'threeGo', label: '쓰리고 이상', desc: '쓰리고 이상 — 점수 ×2' },
      { key: 'daepan', label: '대판', desc: '대판 — 점수 ×2' },
    ],

    // 저장
    STORAGE_KEY: 'gostop.v1',
    SCHEMA_VERSION: 1,

    // 점당 금액 환산 기본값 (0 = 점수만 표시)
    DEFAULT_PER_POINT: 0,
  };

  /** id -> 표시 라벨 */
  GS.label = function (id) {
    return GS.config.LABELS[id] || id;
  };
})(typeof window !== 'undefined' ? window : globalThis);
