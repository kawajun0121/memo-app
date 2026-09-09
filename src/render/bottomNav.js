/*
 役割: スマホ幅（iPhone等）専用の画面下部ナビゲーション（メモ/検索/整理/設定の4タブ）。
       PC幅ではCSSで非表示にする（3カラム表示のまま）。メモ編集中は入力領域を広く使うため非表示にする。
 依存: render/common.js, store/uiStore.js
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};
  var c = App.Render.common;

  /**
   * @param {Object} ui uiStore.getState()
   */
  function render(ui) {
    if (ui.mobileView === 'editor') return '';

    var tabs = [
      { id: 'list', label: 'メモ', icon: 'memoNav', action: 'setMobileViewList', active: ui.mobileView === 'list' },
      { id: 'search', label: '検索', icon: 'search', action: 'setMobileViewSearch', active: ui.mobileView === 'search' },
      { id: 'organize', label: '整理', icon: 'organizeNav', action: 'setMobileViewOrganize', active: ui.mobileView === 'organize' },
      { id: 'settings', label: '設定', icon: 'settings', action: 'openSettings', active: !!ui.panels.settingsOpen }
    ];

    return '' +
      '<nav class="bottom-nav mobile-only" aria-label="画面切り替え">' +
      tabs.map(function (tab) {
        return '<button type="button" class="bottom-nav-item' + (tab.active ? ' is-active' : '') + '" data-action="' + tab.action + '" aria-label="' + tab.label + '" aria-current="' + (tab.active ? 'true' : 'false') + '">' +
          '<span class="bottom-nav-icon">' + c.icon(tab.icon, 22) + '</span>' +
          '<span class="bottom-nav-label">' + tab.label + '</span>' +
          '</button>';
      }).join('') +
      '</nav>';
  }

  App.Render.bottomNav = { render: render };
})(window.MemoApp = window.MemoApp || {});
