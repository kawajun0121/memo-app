/*
 役割: 画面下部に一時表示する軽いフィードバック（ゴミ箱移動の「元に戻す」、一括操作の完了通知など）。
 依存: render/common.js, store/uiStore.js
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};
  var c = App.Render.common;

  function render(ui) {
    if (!ui.toast) return '';
    var hasUndo = ui.toast.restoreIds && ui.toast.restoreIds.length > 0;
    return '' +
      '<div class="toast" role="status">' +
      '  <span class="toast-message">' + c.escapeHtml(ui.toast.message) + '</span>' +
      (hasUndo ? '  <button type="button" class="btn-text toast-undo" data-action="undoToast">元に戻す</button>' : '') +
      '  <button type="button" class="icon-btn toast-dismiss" data-action="dismissToast" title="閉じる" aria-label="閉じる">✕</button>' +
      '</div>';
  }

  App.Render.toast = { render: render };
})(window.MemoApp = window.MemoApp || {});
