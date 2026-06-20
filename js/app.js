/* app.js — 부트스트랩: 상태 로드 + UI 초기화 */
(function (global) {
  'use strict';
  const GS = global.GS;

  const app = {
    state: GS.store.load(),
    save: function () { GS.store.save(this.state); },
  };

  GS.app = app;

  function start() {
    GS.ui.init(app);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // PWA: 오프라인/설치 지원. http(s)에서만 동작(file://는 건너뜀).
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 무시 */ });
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
