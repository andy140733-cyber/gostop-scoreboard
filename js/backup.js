/* backup.js — JSON 내보내기/가져오기 + 복원 검증 */
(function (global) {
  'use strict';
  const GS = (global.GS = global.GS || {});
  const cfg = GS.config;
  const scoring = GS.scoring;
  const recordsMod = GS.records;

  /** 현재 상태를 메타데이터로 감싼 JSON 문자열. */
  function exportJSON(state) {
    const payload = {
      app: 'GoStop',
      schemaVersion: cfg.SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      state: state,
    };
    return JSON.stringify(payload, null, 2);
  }

  function suggestFilename() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `gostop-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
  }

  /**
   * JSON 텍스트를 검증·정규화해 state로 복원. game 델타는 신뢰하지 않고 재계산.
   * @returns {{ok:true, state}|{ok:false, error}}
   */
  function importJSON(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: 'JSON 형식이 올바르지 않습니다.' };
    }
    // 래핑된 형태({state}) 또는 raw state 모두 허용
    const raw = parsed && parsed.state ? parsed.state : parsed;
    if (!raw || !Array.isArray(raw.records)) {
      return { ok: false, error: '레코드 목록을 찾을 수 없습니다.' };
    }

    const ids = cfg.PLAYER_IDS;
    const cleanRecords = [];
    let seq = 0;
    for (const r of raw.records) {
      if (!r || typeof r !== 'object') continue;
      const type = r.type;
      const s = typeof r.seq === 'number' ? r.seq : ++seq;
      seq = Math.max(seq, s);
      const ts = typeof r.timestamp === 'string' ? r.timestamp : new Date().toISOString();

      if (type === 'game') {
        if (ids.indexOf(r.winner) === -1) continue;
        const norm = recordsMod.normalizeGame(r);
        const v = scoring.validateGameInput(norm);
        if (!v.ok) continue; // 손상 게임은 건너뜀
        cleanRecords.push(Object.assign({ seq: s, type: 'game', timestamp: ts }, norm, { deltas: scoring.computeDeltas(norm) }));
      } else if (type === 'correction') {
        const d = {};
        for (const id of ids) {
          const val = Number(r.deltas && r.deltas[id]);
          d[id] = isFinite(val) ? Math.trunc(val) : 0;
        }
        cleanRecords.push({ seq: s, type: 'correction', timestamp: ts, reason: String(r.reason || '').slice(0, 200), deltas: d });
      } else if (type === 'settlement') {
        const snap = { me: 0, mom: 0, dad: 0 };
        for (const id of ids) { const val = Number(r.snapshot && r.snapshot[id]); snap[id] = isFinite(val) ? Math.trunc(val) : 0; }
        cleanRecords.push({ seq: s, type: 'settlement', timestamp: ts, note: String(r.note || '').slice(0, 200), snapshot: snap });
      }
    }

    cleanRecords.sort((a, b) => a.seq - b.seq);

    const perPoint = Number(raw.settings && raw.settings.perPointAmount);
    const periodOffset = Number(raw.settings && raw.settings.periodOffset);
    const gameOffset = Number(raw.settings && raw.settings.gameOffset);
    const state = {
      schemaVersion: cfg.SCHEMA_VERSION,
      records: cleanRecords,
      settings: {
        perPointAmount: isFinite(perPoint) ? Math.max(0, Math.trunc(perPoint)) : cfg.DEFAULT_PER_POINT,
        // periodOffset 불변식: >= 0 (과거 회차 라벨이 1 미만으로 내려가지 않게). 손상 백업 방어.
        periodOffset: isFinite(periodOffset) ? Math.max(0, Math.trunc(periodOffset)) : 0,
        gameOffset: isFinite(gameOffset) ? Math.trunc(gameOffset) : 0,
      },
    };
    return { ok: true, state, count: cleanRecords.length };
  }

  GS.backup = { exportJSON, importJSON, suggestFilename };
})(typeof window !== 'undefined' ? window : globalThis);
