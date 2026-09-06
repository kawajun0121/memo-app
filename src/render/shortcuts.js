/*
 役割: グローバルキーボードショートカット。
   Ctrl+K: 検索欄にフォーカス / Ctrl+N: 新規メモ / Ctrl+Shift+M: クイックメモにフォーカス / Esc: 閉じる
 依存: store/uiStore.js, render/quickCapture.js
 【注意】Ctrl+N等は一部ブラウザ（タブとして開いている場合）でブラウザ自体のショートカットが
 優先されることがある。PWAとしてインストールして使うと確実に動作する。
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};

  function isEditableTarget(el) {
    if (!el) return false;
    var tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  }

  function closeTopmostOverlay() {
    var ui = App.Store.uiStore.getState();
    if (ui.panels.aiSuggestOpen) { App.Store.uiStore.closePanel('aiSuggestOpen'); return true; }
    if (ui.panels.historyOpen) { App.Store.uiStore.closePanel('historyOpen'); App.Store.historyStore.clear(); return true; }
    if (ui.panels.categoryManagerOpen) { App.Store.uiStore.closePanel('categoryManagerOpen'); return true; }
    if (ui.panels.settingsOpen) { App.Store.uiStore.closePanel('settingsOpen'); return true; }
    if (ui.panels.saveViewModalOpen) { App.Store.uiStore.closePanel('saveViewModalOpen'); return true; }
    if (ui.multiSelectMode) { App.Store.uiStore.exitMultiSelect(); return true; }
    return false;
  }

  function focusSearch() {
    var input = document.getElementById('searchInput');
    if (input) {
      input.focus();
      input.select();
    }
  }

  function init() {
    document.addEventListener('keydown', function (evt) {
      var mod = evt.ctrlKey || evt.metaKey;

      if (evt.key === 'Escape') {
        if (closeTopmostOverlay()) evt.preventDefault();
        return;
      }

      if (mod && evt.shiftKey && (evt.key === 'M' || evt.key === 'm')) {
        evt.preventDefault();
        App.Render.quickCapture.focusInput();
        return;
      }

      if (mod && !evt.shiftKey && (evt.key === 'k' || evt.key === 'K')) {
        evt.preventDefault();
        focusSearch();
        return;
      }

      if (mod && !evt.shiftKey && (evt.key === 'n' || evt.key === 'N')) {
        if (isEditableTarget(evt.target)) return;
        evt.preventDefault();
        App.Actions['createFullNote']();
        return;
      }
    });
  }

  App.Render.shortcuts = { init: init };
})(window.MemoApp = window.MemoApp || {});
