/* ledger.js — 누적 파생 + 정산 경계/기간 분할 + 필터 (정합성 핵심) */
(function (global) {
  'use strict';
  const GS = (global.GS = global.GS || {});
  const cfg = GS.config;

  function zero() { return { me: 0, mom: 0, dad: 0 }; }

  /** seq 오름차순 정렬된 복사본 (배열은 원래 seq 순이지만 안전하게 정렬). */
  function sorted(records) {
    return records.slice().sort((a, b) => a.seq - b.seq);
  }

  /** game/correction 레코드들의 델타 합산. settlement은 제외(경계). */
  function standings(records) {
    const acc = zero();
    for (const r of records) {
      if (r.type === 'settlement') continue;
      if (!r.deltas) continue;
      acc.me += r.deltas.me | 0;
      acc.mom += r.deltas.mom | 0;
      acc.dad += r.deltas.dad | 0;
    }
    return acc;
  }

  /**
   * 정산 경계로 기간 분할.
   * 각 기간: { index, records(game/correction만), settlement(닫은 정산|null),
   *           standings, startTime, endTime, isCurrent }
   * 반열림 구간: (이전 정산 다음 … 정산 seq]. 마지막 열린 버킷 = 현재 기간.
   */
  function periods(state) {
    const recs = sorted(state.records);
    const result = [];
    let bucket = [];
    let firstTime = null;

    function close(settlementRec, isCurrent) {
      const st = standings(bucket);
      result.push({
        index: result.length,
        records: bucket,
        settlement: settlementRec || null,
        standings: st,
        startTime: firstTime,
        endTime: settlementRec ? settlementRec.timestamp : (bucket.length ? bucket[bucket.length - 1].timestamp : null),
        isCurrent: !!isCurrent,
      });
      bucket = [];
      firstTime = null;
    }

    for (const r of recs) {
      if (r.type === 'settlement') {
        close(r, false);
      } else {
        if (!bucket.length) firstTime = r.timestamp;
        bucket.push(r);
      }
    }
    // 마지막 열린 기간(현재). 비어 있어도 현재 기간으로 추가.
    close(null, true);
    return result;
  }

  /** 현재(마지막 정산 이후) 기간 누적. */
  function currentStandings(state) {
    const ps = periods(state);
    return ps[ps.length - 1].standings;
  }

  /** 현재 기간의 game/correction 레코드. */
  function currentPeriodRecords(state) {
    const ps = periods(state);
    return ps[ps.length - 1].records;
  }

  /** 전체 기간 통산 누적(모든 game/correction, settlement 무시). */
  function allTimeStandings(state) {
    return standings(state.records);
  }

  function settlementCount(state) {
    return state.records.filter((r) => r.type === 'settlement').length;
  }

  /** 게임 레코드가 특정 특수조건을 포함하는지. */
  function hasSpecial(rec, key) {
    if (rec.type !== 'game') return false;
    switch (key) {
      case 'bomb': return !!rec.bomb;
      case 'threeGo': return !!rec.threeGo;
      case 'daepan': return !!rec.daepan;
      case 'dokbak': return rec.dokbak != null;
      case 'pibak': return !!(rec.pibak && (rec.pibak.me || rec.pibak.mom || rec.pibak.dad));
      default: return false;
    }
  }

  /**
   * 필터 적용. filters: {
   *   types: ['game','correction','settlement'] 부분집합 (없으면 전체),
   *   winner: id|null (game만),
   *   dateFrom: 'YYYY-MM-DD'|null, dateTo: 'YYYY-MM-DD'|null,
   *   specials: ['bomb','threeGo','daepan','dokbak','pibak'] (AND 아님, OR; 비면 무시),
   *   periodIndex: number|null  (periods()의 index; null이면 전체)
   * }
   * @returns {records:[], periodsRef:[]} — 최신순(seq 내림차순) 정렬.
   */
  function filter(state, filters) {
    filters = filters || {};
    const ps = periods(state);

    // 기간 필터: 해당 기간의 레코드 seq 범위로 한정 (정산 레코드 포함 위해 경계 사용)
    let allowedSeqSet = null;
    if (filters.periodIndex != null && ps[filters.periodIndex]) {
      const p = ps[filters.periodIndex];
      allowedSeqSet = new Set(p.records.map((r) => r.seq));
      if (p.settlement) allowedSeqSet.add(p.settlement.seq);
    }

    const fromTs = filters.dateFrom ? new Date(filters.dateFrom + 'T00:00:00') : null;
    const toTs = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59.999') : null;

    const out = state.records.filter((r) => {
      if (allowedSeqSet && !allowedSeqSet.has(r.seq)) return false;
      if (filters.types && filters.types.length && filters.types.indexOf(r.type) === -1) return false;
      if (filters.winner) {
        if (r.type !== 'game' || r.winner !== filters.winner) return false;
      }
      if (fromTs || toTs) {
        const t = new Date(r.timestamp);
        if (fromTs && t < fromTs) return false;
        if (toTs && t > toTs) return false;
      }
      if (filters.specials && filters.specials.length) {
        const match = filters.specials.some((k) => hasSpecial(r, k));
        if (!match) return false;
      }
      return true;
    });

    out.sort((a, b) => b.seq - a.seq); // 최신순
    return out;
  }

  GS.ledger = {
    zero,
    standings,
    periods,
    currentStandings,
    currentPeriodRecords,
    allTimeStandings,
    settlementCount,
    hasSpecial,
    filter,
  };
})(typeof window !== 'undefined' ? window : globalThis);
