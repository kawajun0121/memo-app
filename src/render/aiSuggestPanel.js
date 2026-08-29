/*
 役割: AIカテゴリ提案モーダル。AIが提案 → ユーザーが確認 → 選んだものだけ追加、の流れを徹底する
       （完全自動分類はしない）。新規カテゴリ候補は既存カテゴリと明確に区別して表示する。
 依存: render/common.js, store/aiSuggestStore.js, store/notesStore.js, store/categoriesStore.js
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};
  var c = App.Render.common;

  function render(ui) {
    if (!ui.panels.aiSuggestOpen) return '';
    var state = App.Store.aiSuggestStore.getState();
    var note = App.Store.notesStore.getById(state.noteId);
    if (!note) return '';

    var body = '';
    if (state.status === 'loading') {
      body = '<div class="modal-empty">AIが分析しています…</div>';
    } else if (state.status === 'error') {
      body = '<div class="modal-empty modal-empty--error">' + c.escapeHtml(state.errorMessage) + '</div>';
    } else if (state.status === 'success') {
      var existingNotYetOnNote = state.result.existingCategories.filter(function (name) {
        var cat = App.Store.categoriesStore.findByName(name);
        return !cat || note.categoryIds.indexOf(cat.id) === -1;
      });

      body += '<div class="ai-suggest-section">';
      body += '<div class="ai-suggest-section-title">既存カテゴリからの提案</div>';
      if (existingNotYetOnNote.length === 0) {
        body += '<div class="modal-empty">提案はありません</div>';
      } else {
        body += existingNotYetOnNote.map(function (name) {
          return '<button type="button" class="chip chip-suggest" data-action="addSuggestedCategory" data-id="' + c.escapeHtml(name) + '">+ ' + c.escapeHtml(name) + '</button>';
        }).join('');
        body += '<div class="ai-suggest-actions"><button type="button" class="btn-text" data-action="addAllSuggestedCategories">すべて追加</button></div>';
      }
      body += '</div>';

      if (state.result.newCategoryCandidates.length > 0) {
        body += '<div class="ai-suggest-section">';
        body += '<div class="ai-suggest-section-title">新規カテゴリ候補（既存に該当なし）</div>';
        body += state.result.newCategoryCandidates.map(function (name) {
          return '<button type="button" class="chip chip-suggest chip-suggest--new" data-action="addNewCategoryCandidate" data-id="' + c.escapeHtml(name) + '">+ ' + c.escapeHtml(name) + '（新規）</button>';
        }).join('');
        body += '</div>';
      }
    }

    return '' +
      '<div class="modal-overlay" data-action="closeAiSuggest" data-backdrop="true">' +
      '  <div class="modal-panel">' +
      '    <div class="modal-header">' +
      '      <h3>AIカテゴリ提案</h3>' +
      '      <button type="button" class="icon-btn" data-action="closeAiSuggest">✕</button>' +
      '    </div>' +
      '    <div class="modal-body">' + body + '</div>' +
      '  </div>' +
      '</div>';
  }

  App.Render.aiSuggestPanel = { render: render };
})(window.MemoApp = window.MemoApp || {});
