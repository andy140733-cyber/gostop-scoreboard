/* records.js — 레코드 CRUD + 단조 seq 발급 (state를 인자로 받아 변형) */
(function (global) {
  'use strict';
  const GS = (global.GS = global.GS || {});
  const cfg = GS.config;
  const scoring = GS.scoring;

  function nowISO() {
    return new Date().toISOString();
  }

  /** 기존 최대 seq + 1 (빈 경우 1). 단조 증가 보장. */
  function nextSeq(state) {
    let max = 0;
    for (const r of state.records) if (r.seq > max) max = r.seq;
    return max + 1;
  }

  function find(state, seq) {
    return state.records.find((r) => r.seq === seq) || null;
  }

  /** 게임 입력을 정규화: 패자만 피박 유지, 배수 boolean화, 독박 검증. */
  function normalizeGame(input) {
    const winner = input.winner;
    const losers = cfg.PLAYER_IDS.filter((id) => id !== winner);
    const pibak = {};
    for (const L of losers) pibak[L] = !!(input.pibak && input.pibak[L]);
    let dokbak = input.dokbak != null ? input.dokbak : null;
    if (dokbak !== null && losers.indexOf(dokbak) === -1) dokbak = null;
    return {
      winner,
      base: Number(input.base),
      pibak,
      bomb: !!input.bomb,
      threeGo: !!input.threeGo,
      daepan: !!input.daepan,
      dokbak,
    };
  }

  /** 게임 레코드 추가. 유효하지 않으면 {ok:false, errors} 반환. */
  function addGame(state, input) {
    const norm = normalizeGame(input);
    const v = scoring.validateGameInput(norm);
    if (!v.ok) return { ok: false, errors: v.errors };
    const rec = Object.assign(
      { seq: nextSeq(state), type: 'game', timestamp: nowISO() },
      norm,
      { deltas: scoring.computeDeltas(norm) }
    );
    state.records.push(rec);
    return { ok: true, record: rec };
  }

  /** 게임 레코드 수정 (입력값 변경 → deltas 재계산). timestamp는 유지. */
  function updateGame(state, seq, input) {
    const rec = find(state, seq);
    if (!rec || rec.type !== 'game') return { ok: false, errors: ['게임 기록을 찾을 수 없습니다.'] };
    const norm = normalizeGame(input);
    const v = scoring.validateGameInput(norm);
    if (!v.ok) return { ok: false, errors: v.errors };
    Object.assign(rec, norm, { deltas: scoring.computeDeltas(norm) });
    return { ok: true, record: rec };
  }

  /** 점수 보정 추가. deltas는 정수, 제로섬 비강제. */
  function addCorrection(state, deltas, reason) {
    const d = sanitizeDeltas(deltas);
    const rec = {
      seq: nextSeq(state),
      type: 'correction',
      timestamp: nowISO(),
      reason: (reason || '').toString().slice(0, 200),
      deltas: d,
    };
    state.records.push(rec);
    return { ok: true, record: rec };
  }

  function updateCorrection(state, seq, deltas, reason) {
    const rec = find(state, seq);
    if (!rec || rec.type !== 'correction') return { ok: false, errors: ['보정 기록을 찾을 수 없습니다.'] };
    rec.deltas = sanitizeDeltas(deltas);
    rec.reason = (reason || '').toString().slice(0, 200);
    return { ok: true, record: rec };
  }

  function sanitizeDeltas(deltas) {
    const d = {};
    for (const id of cfg.PLAYER_IDS) {
      const v = Number(deltas && deltas[id]);
      d[id] = isFinite(v) ? Math.trunc(v) : 0;
    }
    return d;
  }

  /**
   * 정산 레코드 추가. 정산 직전 현재 기간 누적을 스냅샷으로 보관(표시용).
   * 정본은 항상 ledger 재계산이므로 스냅샷은 캐시일 뿐.
   */
  function addSettlement(state, note, snapshot) {
    const rec = {
      seq: nextSeq(state),
      type: 'settlement',
      timestamp: nowISO(),
      note: (note || '').toString().slice(0, 200),
      snapshot: snapshot || { me: 0, mom: 0, dad: 0 },
    };
    state.records.push(rec);
    return { ok: true, record: rec };
  }

  /** 레코드 삭제. */
  function remove(state, seq) {
    const i = state.records.findIndex((r) => r.seq === seq);
    if (i === -1) return { ok: false };
    const [removed] = state.records.splice(i, 1);
    return { ok: true, record: removed };
  }

  GS.records = {
    nextSeq,
    find,
    normalizeGame,
    addGame,
    updateGame,
    addCorrection,
    updateCorrection,
    addSettlement,
    remove,
  };
})(typeof window !== 'undefined' ? window : globalThis);
