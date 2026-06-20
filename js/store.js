/* store.js — localStorage 영속 계층 (실패 시 인메모리 fallback) */
(function (global) {
  'use strict';
  const GS = (global.GS = global.GS || {});
  const cfg = GS.config;

  function defaultState() {
    return {
      schemaVersion: cfg.SCHEMA_VERSION,
      records: [],
      settings: { perPointAmount: cfg.DEFAULT_PER_POINT },
    };
  }

  let memoryFallback = null; // localStorage 사용 불가 시 보관
  let persistent = true;

  function readRaw() {
    try {
      return global.localStorage.getItem(cfg.STORAGE_KEY);
    } catch (e) {
      persistent = false;
      return memoryFallback;
    }
  }

  function writeRaw(str) {
    try {
      global.localStorage.setItem(cfg.STORAGE_KEY, str);
      persistent = true;
    } catch (e) {
      // QuotaExceeded 또는 localStorage 비활성 → 인메모리 유지
      persistent = false;
      memoryFallback = str;
    }
  }

  /** 구버전 스키마 마이그레이션 (현재 v1 단일). */
  function migrate(state) {
    if (!state || typeof state !== 'object') return defaultState();
    if (!Array.isArray(state.records)) state.records = [];
    if (!state.settings || typeof state.settings !== 'object') {
      state.settings = { perPointAmount: cfg.DEFAULT_PER_POINT };
    }
    if (typeof state.settings.perPointAmount !== 'number') {
      state.settings.perPointAmount = cfg.DEFAULT_PER_POINT;
    }
    state.schemaVersion = cfg.SCHEMA_VERSION;
    return state;
  }

  function load() {
    const raw = readRaw();
    if (!raw) return defaultState();
    try {
      return migrate(JSON.parse(raw));
    } catch (e) {
      console.warn('저장 데이터 파싱 실패, 초기화합니다.', e);
      return defaultState();
    }
  }

  function save(state) {
    writeRaw(JSON.stringify(state));
  }

  GS.store = {
    load,
    save,
    defaultState,
    isPersistent: function () { return persistent; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
