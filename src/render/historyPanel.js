/*
 役割: 編集履歴モーダル。過去バージョンの一覧表示と「この状態に復元」。
 依存: render/common.js, store/historyStore.js, store/notesStore.js, logic/dateUtils.js
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};
  var c = App.Render.common;

  function render(ui) {
    if (!ui.panels.historyOpen) return '';
    var hs = App.Store.historyStore.getState();
    var note = App.Store.notesStore.getById(hs.noteId);
    if (!note) return '';

    var body;
    if (hs.loading) {
      body = '<div class="modal-empty">読み込み中…</div>';
    } else if (hs.entries.length === 0) {
      body = '<div class="modal-empty">まだ編集履歴はありません（一定の変更があると記録されます）</div>';
    } else {
      body = hs.entries.map(function (entry) {
        return '' +
          '<div class="history-entry">' +
          '  <div class="history-entry-head">' +
          '    <span class="history-entry-date">' + App.Logic.dateUtils.formatDateTimeJP(entry.createdAt) + '</span>' +
          '    <button type="button" class="btn-text" data-action="restoreHistory" data-id="' + entry.id + '">この状態に復元</button>' +
          '  </div>' +
          '  <div class="history-entry-title">' + (entry.title ? c.escapeHtml(entry.title) : '<span class="note-title-empty">無題</span>') + '</div>' +
          '  <div class="history-entry-snippet">' + c.escapeHtml(c.snippet(entry.content, 160)) + '</div>' +
          '</div>';
      }).join('');
    }

    return '' +
      '<div class="modal-overlay" data-action="closeHistoryPanel" data-backdrop="true">' +
      '  <div class="modal-panel">' +
      '    <div class="modal-header">' +
      '      <h3>編集履歴</h3>' +
      '      <button type="button" class="icon-btn" data-action="closeHistoryPanel">✕</button>' +
      '    </div>' +
      '    <div class="modal-body">' + body + '</div>' +
      '  </div>' +
      '</div>';
  }

  App.Render.historyPanel = { render: render };
})(window.MemoApp = window.MemoApp || {});
