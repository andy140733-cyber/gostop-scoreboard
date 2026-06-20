/* ui.js — 화면 렌더링 + 이벤트 (state는 app이 소유) */
(function (global) {
  'use strict';
  const GS = (global.GS = global.GS || {});
  const cfg = GS.config;
  const scoring = GS.scoring;
  const R = GS.records;
  const L = GS.ledger;
  const money = GS.money;
  const stats = GS.stats;
  const backup = GS.backup;

  const PLAYER_IDS = cfg.PLAYER_IDS;
  const label = GS.label;
  const ADJ_MAX = 99999; // 회차·판 수동 조정 상한 (32비트 오버플로/비정상 입력 방지)

  let app = null; // { state, save() }
  const uiState = {
    tab: 'history',
    statScope: 'current',
    statPeriodIndex: null,
  };
  let gameDraft = null;
  let corrDraft = null;
  let confirmHandler = null;

  /* ---------- 헬퍼 ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  function signed(n) { n = n | 0; return n > 0 ? '+' + n : '' + n; }
  function valClass(n) { return n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${String(d.getFullYear()).slice(2)}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function perPoint() { return app.state.settings.perPointAmount | 0; }

  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast ' + (kind || '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add('hidden'), 2200);
  }
  function commit() { app.save(); renderAll(); }

  /* ---------- 모달 open/close ---------- */
  function openModal(id) { $('#' + id).classList.remove('hidden'); }
  function closeModal(id) { $('#' + id).classList.add('hidden'); }

  /* ====================================================================
     렌더: 점수판 / 회차 표시
  ==================================================================== */
  function renderStandings() {
    const st = L.currentStandings(app.state);
    const periodStats = stats.compute(L.currentPeriodRecords(app.state));
    const max = Math.max(st.me, st.mom, st.dad);
    const pp = perPoint();
    const html = PLAYER_IDS.map((id) => {
      const v = st[id];
      const isLeader = v === max && v > 0;
      const wins = periodStats.perPlayer[id].wins;
      const m = money.format(v, pp);
      return `
        <div class="player-card ${isLeader ? 'leader' : ''}">
          <div class="pc-name">${isLeader ? '<span class="crown">👑</span>' : ''}${esc(label(id))}</div>
          <div class="pc-score ${valClass(v)}">${signed(v)}<span class="pc-unit">점</span></div>
          <div class="pc-money">${m ? esc(m) : ''}</div>
          <div class="pc-sub">${wins}승</div>
        </div>`;
    }).join('');
    $('#standings').innerHTML = html;
  }

  function renderPeriodIndicator() {
    const settled = L.settlementCount(app.state);
    const periodNo = L.currentPeriodNumber(app.state);
    const gameNo = L.currentGameNumber(app.state);
    let txt = `${periodNo}회차 진행 중 · ${gameNo}판`;
    if (settled > 0) txt += ` · 정산 ${settled}회 완료`;
    // ✎는 시각적 편집 표시일 뿐 → aria-hidden 자식으로 분리(스크린리더 접근명에는 숫자만 포함).
    $('#periodIndicator').innerHTML = esc(txt) + ' <span aria-hidden="true">✎</span>';
  }

  /* ====================================================================
     렌더: 탭 전환
  ==================================================================== */
  function renderTab() {
    $$('#tabs .tab').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === uiState.tab));
    ['history', 'stats', 'settings'].forEach((t) =>
      $('#panel-' + t).classList.toggle('hidden', t !== uiState.tab));
    if (uiState.tab === 'history') renderHistory();
    else if (uiState.tab === 'stats') renderStats();
    else renderSettings();
  }

  function renderAll() {
    renderStandings();
    renderPeriodIndicator();
    renderTab();
  }

  /* ====================================================================
     기록 탭
  ==================================================================== */
  function periodOptions() {
    const ps = L.periods(app.state);
    const sel = $('#fPeriod');
    const prev = sel.value;
    let opts = '<option value="">전체</option>';
    ps.forEach((p) => {
      const no = L.periodNumber(app.state, p.index);
      const name = p.isCurrent ? `${no}회차 (현재)` : `${no}회차`;
      opts += `<option value="${p.index}">${name}</option>`;
    });
    sel.innerHTML = opts;
    sel.value = prev;
  }

  function readFilters() {
    const specials = $$('#fSpecials .chip.is-on').map((c) => c.dataset.special);
    const periodVal = $('#fPeriod').value;
    return {
      periodIndex: periodVal === '' ? null : Number(periodVal),
      types: $('#fType').value ? [$('#fType').value] : [],
      winner: $('#fWinner').value || null,
      dateFrom: $('#fFrom').value || null,
      dateTo: $('#fTo').value || null,
      specials,
    };
  }

  function renderHistory() {
    periodOptions();
    const recs = L.filter(app.state, readFilters());
    $('#filterCount').textContent = `${recs.length}건`;
    const list = $('#recordList');
    if (!recs.length) {
      list.innerHTML = '<div class="empty-state">조건에 맞는 기록이 없습니다.<br>＋ 한 판 기록으로 시작하세요.</div>';
      return;
    }
    list.innerHTML = recs.map(recordItemHTML).join('');
  }

  function deltaGrid(deltas) {
    return `<div class="ri-deltas">` + PLAYER_IDS.map((id) => {
      const v = deltas[id] | 0;
      return `<div class="ri-delta"><div class="d-name">${esc(label(id))}</div>` +
        `<div class="d-val ${valClass(v)}">${signed(v)}</div></div>`;
    }).join('') + `</div>`;
  }

  function gameTags(r) {
    const tags = [`<span class="tag">${r.base}점</span>`];
    if (r.bomb) tags.push('<span class="tag">폭탄</span>');
    if (r.threeGo) tags.push('<span class="tag">쓰리고</span>');
    if (r.daepan) tags.push('<span class="tag">대판</span>');
    const pibakIds = PLAYER_IDS.filter((id) => r.pibak && r.pibak[id]);
    if (pibakIds.length) tags.push(`<span class="tag danger">피박: ${pibakIds.map(label).join('·')}</span>`);
    if (r.dokbak) tags.push(`<span class="tag danger">독박: ${esc(label(r.dokbak))}</span>`);
    return `<div class="ri-tags">${tags.join('')}</div>`;
  }

  function recordItemHTML(r) {
    if (r.type === 'game') {
      return `<li class="record-item" data-seq="${r.seq}">
        <div class="ri-top">
          <div class="ri-title">🏆 ${esc(label(r.winner))} 승 <span class="ri-badge game">게임</span></div>
          <div class="ri-time">${fmtTime(r.timestamp)}</div>
        </div>
        ${deltaGrid(r.deltas)}
        ${gameTags(r)}
        <div class="ri-actions">
          <button class="link-btn" data-act="edit-game" data-seq="${r.seq}">수정</button>
          <button class="link-btn danger" data-act="del" data-seq="${r.seq}">삭제</button>
        </div>
      </li>`;
    }
    if (r.type === 'correction') {
      return `<li class="record-item" data-seq="${r.seq}">
        <div class="ri-top">
          <div class="ri-title">✎ 점수 보정 <span class="ri-badge correction">보정</span></div>
          <div class="ri-time">${fmtTime(r.timestamp)}</div>
        </div>
        ${deltaGrid(r.deltas)}
        ${r.reason ? `<div class="ri-meta">사유: ${esc(r.reason)}</div>` : ''}
        <div class="ri-actions">
          <button class="link-btn" data-act="edit-corr" data-seq="${r.seq}">수정</button>
          <button class="link-btn danger" data-act="del" data-seq="${r.seq}">삭제</button>
        </div>
      </li>`;
    }
    // settlement
    const pp = perPoint();
    const snapCells = PLAYER_IDS.map((id) => {
      const v = (r.snapshot && r.snapshot[id]) | 0;
      const m = money.format(v, pp);
      return `<div class="ri-delta"><div class="d-name">${esc(label(id))}</div>` +
        `<div class="d-val ${valClass(v)}">${signed(v)}</div>${m ? `<div class="d-name">${esc(m)}</div>` : ''}</div>`;
    }).join('');
    return `<li class="record-item" data-seq="${r.seq}">
      <div class="ri-top">
        <div class="ri-title">🧧 정산 완료 <span class="ri-badge settlement">정산</span></div>
        <div class="ri-time">${fmtTime(r.timestamp)}</div>
      </div>
      <div class="ri-deltas">${snapCells}</div>
      ${r.note ? `<div class="ri-meta">메모: ${esc(r.note)}</div>` : ''}
      <div class="ri-actions">
        <button class="link-btn danger" data-act="del-settle" data-seq="${r.seq}">정산 취소</button>
      </div>
    </li>`;
  }

  /* ====================================================================
     통계 탭
  ==================================================================== */
  function renderStats() {
    // 범위 토글 상태
    $$('#statScope .seg').forEach((b) => b.classList.toggle('is-active', b.dataset.scope === uiState.statScope));
    const closed = L.periods(app.state).filter((p) => !p.isCurrent);
    $('#statPeriodPick').classList.toggle('hidden', uiState.statScope !== 'period');

    let recs;
    if (uiState.statScope === 'current') {
      recs = L.currentPeriodRecords(app.state);
    } else if (uiState.statScope === 'all') {
      recs = app.state.records;
    } else {
      // period
      const sel = $('#statPeriodSelect');
      sel.innerHTML = closed.length
        ? closed.map((p) => `<option value="${p.index}">${L.periodNumber(app.state, p.index)}회차</option>`).join('')
        : '<option value="">지난 회차 없음</option>';
      if (uiState.statPeriodIndex == null && closed.length) uiState.statPeriodIndex = closed[0].index;
      if (uiState.statPeriodIndex != null) sel.value = String(uiState.statPeriodIndex);
      const chosen = L.periods(app.state).find((p) => p.index === uiState.statPeriodIndex);
      recs = chosen ? chosen.records : [];
    }

    const s = stats.compute(recs);
    const pp = perPoint();
    const max = Math.max.apply(null, PLAYER_IDS.map((id) => s.perPlayer[id].net));

    let html = `<div class="card"><h3>순위 · 순점수</h3><div class="stat-grid">`;
    html += PLAYER_IDS.map((id) => {
      const p = s.perPlayer[id];
      const isLead = p.net === max && p.net > 0;
      const m = money.format(p.net, pp);
      return `<div class="stat-player">
        <div class="sp-name">${isLead ? '👑 ' : ''}${esc(label(id))}</div>
        <div class="sp-net ${valClass(p.net)}">${signed(p.net)}</div>
        <div class="sp-money">${m ? esc(m) : ''}</div>
        <div class="sp-line">${p.wins}승 · ${(p.winRate * 100).toFixed(0)}%</div>
        <div class="sp-line">+${p.gained} / -${p.lost}</div>
      </div>`;
    }).join('');
    html += `</div></div>`;

    // 게임/특수 요약
    const sp = s.specials;
    html += `<div class="card"><h3>게임 요약</h3>
      <div class="kv"><span class="k">전체 게임 수</span><span class="v">${s.games}판</span></div>
      <div class="kv"><span class="k">최고 점수 판</span><span class="v">${s.biggestWin ? `${esc(label(s.biggestWin.record.winner))} +${s.biggestWin.amount}점` : '–'}</span></div>
      <div class="kv"><span class="k">폭탄 / 쓰리고 / 대판</span><span class="v">${sp.bomb} / ${sp.threeGo} / ${sp.daepan}</span></div>
      <div class="kv"><span class="k">독박 횟수 (나/엄마/아빠)</span><span class="v">${sp.dokbak.me} / ${sp.dokbak.mom} / ${sp.dokbak.dad}</span></div>
      <div class="kv"><span class="k">피박 당함 (나/엄마/아빠)</span><span class="v">${sp.pibakSuffered.me} / ${sp.pibakSuffered.mom} / ${sp.pibakSuffered.dad}</span></div>
    </div>`;

    // 보정 합계 (있으면)
    const hasCorr = PLAYER_IDS.some((id) => s.perPlayer[id].correction !== 0);
    if (hasCorr) {
      html += `<div class="card"><h3>보정 합계</h3>` + PLAYER_IDS.map((id) =>
        `<div class="kv"><span class="k">${esc(label(id))}</span><span class="v ${valClass(s.perPlayer[id].correction)}">${signed(s.perPlayer[id].correction)}점</span></div>`
      ).join('') + `</div>`;
    }

    $('#statsBody').innerHTML = html;
  }

  /* ====================================================================
     설정 탭
  ==================================================================== */
  function renderSettings() {
    $('#perPoint').value = perPoint() || '';
    // 정산 이력
    const settlements = app.state.records.filter((r) => r.type === 'settlement').sort((a, b) => b.seq - a.seq);
    const pp = perPoint();
    const box = $('#settlementHistory');
    if (!settlements.length) {
      box.innerHTML = '<p class="muted" style="margin:0">아직 정산 기록이 없습니다.</p>';
    } else {
      box.innerHTML = settlements.map((r) => {
        const parts = PLAYER_IDS.map((id) => {
          const v = (r.snapshot && r.snapshot[id]) | 0;
          return `${label(id)} ${signed(v)}`;
        }).join(' · ');
        return `<div class="kv"><span class="k">${fmtTime(r.timestamp)}</span><span class="v">${esc(parts)}</span></div>`;
      }).join('');
    }
    // 저장소 경고
    const note = $('#storageNote');
    if (!GS.store.isPersistent()) {
      note.textContent = '⚠ 이 브라우저에서 자동 저장이 비활성화되어 있습니다. 백업을 권장합니다.';
    } else {
      note.textContent = '';
    }
  }

  /* ====================================================================
     게임 입력 모달
  ==================================================================== */
  function defaultGameDraft() {
    return { winner: null, base: cfg.DEFAULT_BASE, pibak: {}, bomb: false, threeGo: false, daepan: false, dokbak: null, editingSeq: null };
  }

  function openGameModal(editRec) {
    if (editRec) {
      gameDraft = {
        winner: editRec.winner, base: editRec.base,
        pibak: Object.assign({}, editRec.pibak),
        bomb: !!editRec.bomb, threeGo: !!editRec.threeGo, daepan: !!editRec.daepan,
        dokbak: editRec.dokbak || null, editingSeq: editRec.seq,
      };
    } else {
      gameDraft = defaultGameDraft();
    }
    $('#gameModalTitle').textContent = editRec ? '게임 수정' : '한 판 기록';
    buildGameModal();
    openModal('modalGame');
  }

  function losersOf(winner) { return PLAYER_IDS.filter((id) => id !== winner); }

  function buildRound(d) {
    const base = parseInt(d.base, 10);
    return {
      winner: d.winner,
      base: isNaN(base) ? 0 : base,
      pibak: d.pibak,
      bomb: d.bomb, threeGo: d.threeGo, daepan: d.daepan,
      dokbak: d.dokbak,
    };
  }

  function previewHTML(d) {
    const baseInt = parseInt(d.base, 10);
    const valid = d.winner && Number.isInteger(baseInt) && baseInt >= cfg.MIN_BASE && baseInt <= cfg.MAX_BASE;
    let cells, formula;
    if (valid) {
      const ev = scoring.evaluate(buildRound(d));
      cells = PLAYER_IDS.map((id) => {
        const v = ev.deltas[id];
        return `<div class="pv-cell"><div class="pv-name">${esc(label(id))}</div><div class="pv-val ${valClass(v)}">${signed(v)}</div></div>`;
      }).join('');
      formula = `배수 ×${ev.R} · 승자 획득 합 ${ev.total}점` + (d.dokbak ? ` · 독박 ${esc(label(d.dokbak))}` : '');
    } else {
      cells = PLAYER_IDS.map((id) => `<div class="pv-cell"><div class="pv-name">${esc(label(id))}</div><div class="pv-val zero">–</div></div>`).join('');
      formula = '승자와 점수를 입력하면 결과가 표시됩니다.';
    }
    return `<div class="pv-label">결과 미리보기</div><div class="pv-grid">${cells}</div><div class="pv-formula">${formula}</div>`;
  }

  function buildGameModal() {
    const d = gameDraft;
    const winnerBtns = PLAYER_IDS.map((id) =>
      `<button class="choice ${d.winner === id ? 'is-on' : ''}" data-act="winner" data-id="${id}" type="button">${esc(label(id))}</button>`
    ).join('');

    // 피박 (패자별)
    let pibakSection;
    if (!d.winner) {
      pibakSection = `<div class="hint">승자를 먼저 선택하세요.</div>`;
    } else {
      pibakSection = `<div class="loser-toggles">` + losersOf(d.winner).map((id) =>
        `<button class="toggle-chip loser-toggle ${d.pibak[id] ? 'is-on' : ''}" data-act="pibak" data-id="${id}" type="button">${esc(label(id))} 피박</button>`
      ).join('') + `</div>`;
    }

    // 독박
    let dokbakSection;
    if (!d.winner) {
      dokbakSection = `<div class="hint">승자를 먼저 선택하세요.</div>`;
    } else {
      const opts = [`<button class="choice ${!d.dokbak ? 'is-on' : ''}" data-act="dokbak" data-id="none" type="button">없음</button>`]
        .concat(losersOf(d.winner).map((id) =>
          `<button class="choice ${d.dokbak === id ? 'is-on' : ''}" data-act="dokbak" data-id="${id}" type="button">${esc(label(id))}</button>`));
      dokbakSection = `<div class="choice-row">${opts.join('')}</div>`;
    }

    const specials = cfg.ROUND_MULTIPLIERS.map((m) =>
      `<button class="toggle-chip ${d[m.key] ? 'is-on' : ''}" data-act="special" data-id="${m.key}" type="button">${esc(m.label)}</button>`
    ).join('');

    $('#gameModalBody').innerHTML = `
      <div class="form-section">
        <span class="sec-label">승자 (1명)</span>
        <div class="choice-row">${winnerBtns}</div>
      </div>
      <div class="form-section">
        <span class="sec-label">점수</span>
        <div class="stepper">
          <button data-act="dec" type="button">−</button>
          <input type="number" id="gameBase" inputmode="numeric" min="${cfg.MIN_BASE}" max="${cfg.MAX_BASE}" value="${esc(d.base)}" />
          <button data-act="inc" type="button">＋</button>
        </div>
        <div class="hint">고스톱은 보통 3점부터 납니다. (${cfg.MIN_BASE}~${cfg.MAX_BASE})</div>
      </div>
      <div class="form-section">
        <span class="sec-label">배수 (각 ×2, 곱연산)</span>
        <div class="toggle-row">${specials}</div>
      </div>
      <div class="form-section">
        <span class="sec-label">피박 (패자별, 점수 ×2)</span>
        ${pibakSection}
      </div>
      <div class="form-section">
        <span class="sec-label">독박 (고 외치고 진 사람이 전부 부담)</span>
        ${dokbakSection}
      </div>
      <div class="preview" id="gamePreview">${previewHTML(d)}</div>
      <div class="errors" id="gameErrors"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close="modalGame" type="button">취소</button>
        <button class="btn btn-primary" data-act="save-game" type="button">${d.editingSeq ? '수정 저장' : '저장'}</button>
      </div>`;
  }

  function refreshGamePreview() {
    const el = $('#gamePreview');
    if (el) el.innerHTML = previewHTML(gameDraft);
  }

  function onGameModalClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const d = gameDraft;
    if (act === 'winner') {
      d.winner = btn.dataset.id;
      // 승자가 바뀌면 피박/독박 재검증
      if (d.pibak[d.winner]) delete d.pibak[d.winner];
      if (d.dokbak === d.winner) d.dokbak = null;
      buildGameModal();
    } else if (act === 'special') {
      d[btn.dataset.id] = !d[btn.dataset.id];
      buildGameModal();
    } else if (act === 'pibak') {
      const id = btn.dataset.id;
      d.pibak[id] = !d.pibak[id];
      buildGameModal();
    } else if (act === 'dokbak') {
      d.dokbak = btn.dataset.id === 'none' ? null : btn.dataset.id;
      buildGameModal();
    } else if (act === 'inc' || act === 'dec') {
      let b = parseInt(d.base, 10); if (isNaN(b)) b = cfg.DEFAULT_BASE;
      b += act === 'inc' ? 1 : -1;
      b = Math.max(cfg.MIN_BASE, Math.min(cfg.MAX_BASE, b));
      d.base = b;
      buildGameModal();
    } else if (act === 'save-game') {
      saveGame();
    }
  }

  function onGameModalInput(e) {
    if (e.target.id === 'gameBase') {
      gameDraft.base = e.target.value;
      refreshGamePreview();
    }
  }

  function saveGame() {
    const d = gameDraft;
    const round = buildRound(d);
    const res = d.editingSeq
      ? R.updateGame(app.state, d.editingSeq, round)
      : R.addGame(app.state, round);
    if (!res.ok) {
      $('#gameErrors').textContent = res.errors.join(' ');
      return;
    }
    closeModal('modalGame');
    commit();
    toast(d.editingSeq ? '게임을 수정했습니다.' : '한 판 기록 완료!', 'ok');
  }

  /* ====================================================================
     보정 모달
  ==================================================================== */
  function openCorrectionModal(editRec) {
    corrDraft = editRec
      ? { me: editRec.deltas.me, mom: editRec.deltas.mom, dad: editRec.deltas.dad, reason: editRec.reason || '', editingSeq: editRec.seq }
      : { me: 0, mom: 0, dad: 0, reason: '', editingSeq: null };
    $('#corrModalTitle').textContent = editRec ? '보정 수정' : '점수 보정';
    buildCorrectionModal();
    openModal('modalCorrection');
  }

  function buildCorrectionModal() {
    const d = corrDraft;
    const rows = PLAYER_IDS.map((id) =>
      `<div class="corr-row"><span class="cr-name">${esc(label(id))}</span>
        <input type="number" inputmode="numeric" data-corr="${id}" value="${esc(d[id])}" placeholder="0" /></div>`
    ).join('');
    $('#corrModalBody').innerHTML = `
      <p class="muted">잘못 계산된 점수를 직접 조정합니다. 더할 값은 양수, 뺄 값은 음수로 입력하세요. (예: 나 +5, 엄마 −5)</p>
      <div class="form-section">${rows}</div>
      <div class="form-section">
        <span class="sec-label">사유 (선택)</span>
        <input type="text" data-corr="reason" value="${esc(d.reason)}" placeholder="예: 7판 점수 오타 정정" maxlength="200" />
      </div>
      <div class="errors" id="corrErrors"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close="modalCorrection" type="button">취소</button>
        <button class="btn btn-primary" data-act="save-corr" type="button">${d.editingSeq ? '수정 저장' : '보정 적용'}</button>
      </div>`;
  }

  function onCorrModalClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.dataset.act !== 'save-corr') return;
    const d = corrDraft;
    if ((d.me | 0) === 0 && (d.mom | 0) === 0 && (d.dad | 0) === 0) {
      $('#corrErrors').textContent = '조정할 점수를 1명 이상 입력하세요.';
      return;
    }
    const deltas = { me: d.me, mom: d.mom, dad: d.dad };
    const res = d.editingSeq
      ? R.updateCorrection(app.state, d.editingSeq, deltas, d.reason)
      : R.addCorrection(app.state, deltas, d.reason);
    if (!res.ok) { $('#corrErrors').textContent = (res.errors || ['오류']).join(' '); return; }
    closeModal('modalCorrection');
    commit();
    toast('점수를 보정했습니다.', 'ok');
  }

  function onCorrModalInput(e) {
    const t = e.target;
    if (!t.dataset.corr) return;
    const key = t.dataset.corr;
    if (key === 'reason') corrDraft.reason = t.value;
    else { const v = parseInt(t.value, 10); corrDraft[key] = isNaN(v) ? 0 : v; }
  }

  /* ====================================================================
     정산 모달
  ==================================================================== */
  function openSettleModal() {
    const st = L.currentStandings(app.state);
    const pp = perPoint();
    const games = L.currentPeriodRecords(app.state).filter((r) => r.type === 'game').length;
    const cells = PLAYER_IDS.map((id) => {
      const v = st[id];
      const m = money.format(v, pp);
      return `<div class="settle-cell"><div class="sc-name">${esc(label(id))}</div>
        <div class="sc-val ${valClass(v)}">${signed(v)}</div>${m ? `<div class="sc-money">${esc(m)}</div>` : ''}</div>`;
    }).join('');
    $('#settleModalBody').innerHTML = `
      <p class="muted">현재 회차를 정산하고 누적 점수를 0으로 초기화합니다. 기록은 보존되어 나중에 조회할 수 있습니다.</p>
      <div class="settle-summary">${cells}</div>
      <div class="form-section">
        <span class="sec-label">메모 (선택)</span>
        <input type="text" id="settleNote" placeholder="예: 6월 셋째 주 정산" maxlength="200" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close="modalSettle" type="button">취소</button>
        <button class="btn btn-settle" data-act="do-settle" type="button" ${games === 0 ? 'disabled' : ''}>정산 완료</button>
      </div>
      ${games === 0 ? '<div class="hint" style="text-align:center;margin-top:8px">기록된 게임이 없어 정산할 내용이 없습니다.</div>' : ''}`;
    openModal('modalSettle');
  }

  function doSettle() {
    const note = $('#settleNote') ? $('#settleNote').value : '';
    const snap = L.currentStandings(app.state);
    R.addSettlement(app.state, note, snap);
    // 새 회차 시작 → '판' 표시 보정값 초기화(판은 회차마다 다시 0부터). 회차는 정산 수로 자동 +1.
    app.state.settings.gameOffset = 0;
    closeModal('modalSettle');
    commit();
    toast('정산 완료! 새 회차를 시작합니다.', 'ok');
  }

  /* ====================================================================
     회차·판 번호 조정 모달
  ==================================================================== */
  let adjustDraft = null;

  function openPeriodAdjustModal() {
    const minPeriod = L.settlementCount(app.state) + 1; // 정산 n회 → 현재는 최소 n+1회차
    adjustDraft = {
      period: L.currentPeriodNumber(app.state),
      game: L.currentGameNumber(app.state),
      minPeriod,
    };
    buildPeriodAdjustModal();
    openModal('modalPeriodAdjust');
  }

  function buildPeriodAdjustModal() {
    const d = adjustDraft;
    $('#periodAdjustBody').innerHTML = `
      <p class="muted">화면에 표시되는 회차·판 번호만 바뀝니다. 점수와 기록은 그대로예요.</p>
      <div class="form-section">
        <span class="sec-label">현재 회차</span>
        <div class="stepper">
          <button data-act="pdec" type="button">−</button>
          <input type="number" id="adjPeriod" inputmode="numeric" min="${d.minPeriod}" max="${ADJ_MAX}" value="${esc(d.period)}" />
          <button data-act="pinc" type="button">＋</button>
        </div>
        ${d.minPeriod > 1 ? `<div class="hint">정산 ${d.minPeriod - 1}회 완료 — 현재 회차는 ${d.minPeriod} 이상이어야 합니다.</div>` : ''}
      </div>
      <div class="form-section">
        <span class="sec-label">현재 판</span>
        <div class="stepper">
          <button data-act="gdec" type="button">−</button>
          <input type="number" id="adjGame" inputmode="numeric" min="0" max="${ADJ_MAX}" value="${esc(d.game)}" />
          <button data-act="ginc" type="button">＋</button>
        </div>
        <div class="hint">정산해서 새 회차를 시작하면 판은 자동으로 0부터 다시 셉니다.</div>
      </div>
      <div class="errors" id="adjErrors"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close="modalPeriodAdjust" type="button">취소</button>
        <button class="btn btn-primary" data-act="save-adjust" type="button">적용</button>
      </div>`;
  }

  /** 입력칸에 직접 타이핑한 값을 draft로 흡수(스텝퍼 클릭 전에 호출). */
  function syncAdjustInputs() {
    const pEl = $('#adjPeriod'), gEl = $('#adjGame');
    if (pEl) { const v = parseInt(pEl.value, 10); if (!isNaN(v)) adjustDraft.period = v; }
    if (gEl) { const v = parseInt(gEl.value, 10); if (!isNaN(v)) adjustDraft.game = v; }
  }

  // [lo, hi] 범위로 클램프(32비트 | 0 대신 Number 연산 — 큰 입력이 음수로 wrap되지 않게).
  function clampN(v, lo, hi) {
    const n = Number(v);
    if (!isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, Math.round(n)));
  }

  function onPeriodAdjustClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const d = adjustDraft;
    syncAdjustInputs();
    if (act === 'pinc') { d.period = clampN(d.period + 1, d.minPeriod, ADJ_MAX); buildPeriodAdjustModal(); }
    else if (act === 'pdec') { d.period = clampN(d.period - 1, d.minPeriod, ADJ_MAX); buildPeriodAdjustModal(); }
    else if (act === 'ginc') { d.game = clampN(d.game + 1, 0, ADJ_MAX); buildPeriodAdjustModal(); }
    else if (act === 'gdec') { d.game = clampN(d.game - 1, 0, ADJ_MAX); buildPeriodAdjustModal(); }
    else if (act === 'save-adjust') savePeriodAdjust();
  }

  function savePeriodAdjust() {
    const d = adjustDraft;
    // draft(스텝퍼 값)가 아니라 입력칸의 원시 문자열을 검증 → 빈칸/문자 입력이 조용히 무시되지 않고 오류로 표시됨.
    const pRaw = ($('#adjPeriod') ? $('#adjPeriod').value : '').trim();
    const gRaw = ($('#adjGame') ? $('#adjGame').value : '').trim();
    const p = parseInt(pRaw, 10);
    const g = parseInt(gRaw, 10);
    if (pRaw === '' || isNaN(p) || p < d.minPeriod || p > ADJ_MAX) {
      $('#adjErrors').textContent = `현재 회차는 ${d.minPeriod}~${ADJ_MAX} 사이의 숫자여야 합니다.`;
      return;
    }
    if (gRaw === '' || isNaN(g) || g < 0 || g > ADJ_MAX) {
      $('#adjErrors').textContent = `현재 판은 0~${ADJ_MAX} 사이의 숫자여야 합니다.`;
      return;
    }
    app.state.settings.periodOffset = p - (L.settlementCount(app.state) + 1);
    app.state.settings.gameOffset = g - L.currentGameCount(app.state);
    closeModal('modalPeriodAdjust');
    commit();
    toast('회차·판 번호를 조정했습니다.', 'ok');
  }

  /* ====================================================================
     확인 다이얼로그
  ==================================================================== */
  function showConfirm(text, onOk) {
    $('#confirmText').innerHTML = text;
    confirmHandler = onOk;
    openModal('modalConfirm');
  }

  /* ====================================================================
     기록 리스트 액션 (수정/삭제)
  ==================================================================== */
  function onRecordListClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const seq = Number(btn.dataset.seq);
    const rec = R.find(app.state, seq);
    if (!rec) return;
    const act = btn.dataset.act;
    if (act === 'edit-game') openGameModal(rec);
    else if (act === 'edit-corr') openCorrectionModal(rec);
    else if (act === 'del') {
      showConfirm('이 기록을 삭제할까요?<br>누적 점수가 다시 계산됩니다.', () => {
        R.remove(app.state, seq); commit(); toast('기록을 삭제했습니다.');
      });
    } else if (act === 'del-settle') {
      showConfirm('이 정산을 취소할까요?<br>앞뒤 회차가 하나로 합쳐집니다.', () => {
        R.remove(app.state, seq); commit(); toast('정산을 취소했습니다.');
      });
    }
  }

  /* ====================================================================
     백업 / 복원 / 초기화
  ==================================================================== */
  function doExport() {
    const json = backup.exportJSON(app.state);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = backup.suggestFilename();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('백업 파일을 내보냈습니다.', 'ok');
  }

  function onImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = backup.importJSON(String(reader.result));
      e.target.value = '';
      if (!res.ok) { toast(res.error, 'err'); return; }
      showConfirm(`가져온 데이터로 덮어쓸까요?<br>레코드 ${res.count}건이 현재 데이터를 대체합니다.`, () => {
        app.state = res.state;
        commit();
        toast('데이터를 복원했습니다.', 'ok');
      });
    };
    reader.onerror = () => toast('파일을 읽지 못했습니다.', 'err');
    reader.readAsText(file);
  }

  function doReset() {
    showConfirm('정말 모든 기록을 삭제할까요?<br>이 작업은 되돌릴 수 없습니다.', () => {
      app.state = GS.store.defaultState();
      commit();
      toast('전체 데이터를 삭제했습니다.');
    });
  }

  /* 텍스트 복사/붙여넣기 기반 기기 이전 (모바일 친화) */
  let dataMode = null;
  function openDataModal(mode) {
    dataMode = mode;
    const ta = $('#dataText');
    $('#dataErrors').textContent = '';
    if (mode === 'copy') {
      $('#dataModalTitle').textContent = '텍스트로 복사';
      $('#dataModalDesc').textContent = '아래 텍스트를 전부 복사해, 옮길 기기의 "붙여넣기로 복원"에 붙여넣으세요.';
      ta.value = backup.exportJSON(app.state);
      ta.readOnly = true;
      $('#dataActionBtn').textContent = '클립보드에 복사';
    } else {
      $('#dataModalTitle').textContent = '붙여넣기로 복원';
      $('#dataModalDesc').textContent = '다른 기기에서 복사한 데이터를 아래에 붙여넣고 복원하세요. 현재 데이터는 덮어써집니다.';
      ta.value = '';
      ta.readOnly = false;
      $('#dataActionBtn').textContent = '복원';
    }
    openModal('modalData');
    if (mode === 'copy') setTimeout(function () { ta.focus(); ta.select(); }, 50);
  }

  function onDataAction() {
    const ta = $('#dataText');
    if (dataMode === 'copy') {
      const txt = ta.value;
      const done = function () { toast('복사했습니다. 다른 기기에 붙여넣으세요.', 'ok'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done).catch(function () { ta.focus(); ta.select(); toast('텍스트를 직접 선택해 복사하세요.'); });
      } else {
        ta.focus(); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { toast('텍스트를 직접 선택해 복사하세요.'); }
      }
    } else {
      const res = backup.importJSON(ta.value.trim());
      if (!res.ok) { $('#dataErrors').textContent = res.error; return; }
      closeModal('modalData');
      showConfirm('가져온 데이터로 덮어쓸까요?<br>레코드 ' + res.count + '건이 현재 데이터를 대체합니다.', function () {
        app.state = res.state; commit(); toast('데이터를 복원했습니다.', 'ok');
      });
    }
  }

  /* ====================================================================
     이벤트 바인딩
  ==================================================================== */
  function bindEvents() {
    // 탭
    $('#tabs').addEventListener('click', (e) => {
      const t = e.target.closest('.tab'); if (!t) return;
      uiState.tab = t.dataset.tab; renderTab();
    });
    // 주요 액션
    $('#btnAddGame').addEventListener('click', () => openGameModal(null));
    $('#btnAddCorrection').addEventListener('click', () => openCorrectionModal(null));
    $('#btnSettle').addEventListener('click', openSettleModal);

    // 회차·판 번호 조정 (헤더 표시 클릭 + 설정 버튼)
    $('#periodIndicator').addEventListener('click', openPeriodAdjustModal);
    $('#periodIndicator').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPeriodAdjustModal(); }
    });
    $('#periodAdjustBody').addEventListener('click', onPeriodAdjustClick);

    // 필터
    ['#fPeriod', '#fType', '#fWinner', '#fFrom', '#fTo'].forEach((sel) =>
      $(sel).addEventListener('change', renderHistory));
    $('#fSpecials').addEventListener('click', (e) => {
      const c = e.target.closest('.chip'); if (!c) return;
      c.classList.toggle('is-on'); renderHistory();
    });
    $('#btnClearFilter').addEventListener('click', () => {
      $('#fPeriod').value = ''; $('#fType').value = ''; $('#fWinner').value = '';
      $('#fFrom').value = ''; $('#fTo').value = '';
      $$('#fSpecials .chip').forEach((c) => c.classList.remove('is-on'));
      renderHistory();
    });

    // 기록 리스트
    $('#recordList').addEventListener('click', onRecordListClick);

    // 통계 범위
    $('#statScope').addEventListener('click', (e) => {
      const b = e.target.closest('.seg'); if (!b) return;
      uiState.statScope = b.dataset.scope; renderStats();
    });
    $('#statPeriodSelect').addEventListener('change', (e) => {
      uiState.statPeriodIndex = Number(e.target.value); renderStats();
    });

    // 설정
    $('#perPoint').addEventListener('change', (e) => {
      const v = parseInt(e.target.value, 10);
      app.state.settings.perPointAmount = isNaN(v) || v < 0 ? 0 : v;
      commit();
    });
    $('#btnAdjustPeriod').addEventListener('click', openPeriodAdjustModal);
    $('#btnExport').addEventListener('click', doExport);
    $('#btnImport').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', onImportFile);
    $('#btnCopyData').addEventListener('click', () => openDataModal('copy'));
    $('#btnPasteData').addEventListener('click', () => openDataModal('paste'));
    $('#dataActionBtn').addEventListener('click', onDataAction);
    $('#btnReset').addEventListener('click', doReset);

    // 게임 모달 (위임)
    $('#gameModalBody').addEventListener('click', onGameModalClick);
    $('#gameModalBody').addEventListener('input', onGameModalInput);
    // 보정 모달 (위임)
    $('#corrModalBody').addEventListener('click', onCorrModalClick);
    $('#corrModalBody').addEventListener('input', onCorrModalInput);
    // 정산 모달
    $('#settleModalBody').addEventListener('click', (e) => {
      if (e.target.closest('[data-act="do-settle"]')) doSettle();
    });

    // 확인 다이얼로그
    $('#confirmOk').addEventListener('click', () => {
      closeModal('modalConfirm');
      const h = confirmHandler; confirmHandler = null;
      if (h) h();
    });
    $('#confirmCancel').addEventListener('click', () => { closeModal('modalConfirm'); confirmHandler = null; });

    // 닫기 버튼 + 배경 클릭
    document.addEventListener('click', (e) => {
      const closeBtn = e.target.closest('[data-close]');
      if (closeBtn) { closeModal(closeBtn.dataset.close); return; }
      if (e.target.classList && e.target.classList.contains('modal-backdrop')) {
        e.target.classList.add('hidden');
      }
    });
    // Esc
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') $$('.modal-backdrop:not(.hidden)').forEach((m) => m.classList.add('hidden'));
    });
  }

  GS.ui = {
    init: function (appRef) { app = appRef; bindEvents(); renderAll(); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
