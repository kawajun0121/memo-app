/*
 役割: スマートビュー（保存済み検索条件）の作成・名前変更・条件更新・削除モーダル。
 依存: render/common.js, store/uiStore.js, store/savedViewsStore.js
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};
  var c = App.Render.common;

  function render(ui) {
    if (!ui.panels.saveViewModalOpen) return '';
    var editId = ui.panels.editSavedViewId;
    var existing = editId ? App.Store.savedViewsStore.getById(editId) : null;
    var title = existing ? 'スマートビューを編集' : '現在の条件をスマートビューとして保存';
    var nameValue = existing ? existing.name : '';

    var deleteButton = existing ? '<button type="button" class="btn-text btn-danger" data-action="deleteSavedView" data-id="' + existing.id + '">このビューを削除</button>' : '';
    var updateConditionsButton = existing ? '<button type="button" class="btn-text" data-action="updateSavedViewConditions" data-id="' + existing.id + '">現在の絞り込み条件で更新</button>' : '';

    return '' +
      '<div class="modal-overlay" data-action="closeSaveViewModal" data-backdrop="true">' +
      '  <div class="modal-panel modal-panel--small">' +
      '    <div class="modal-header">' +
      '      <h3>' + title + '</h3>' +
      '      <button type="button" class="icon-btn" data-action="closeSaveViewModal">✕</button>' +
      '    </div>' +
      '    <div class="modal-body">' +
      '      <input type="text" id="savedViewNameInput" class="saved-view-name-input enter-submits" placeholder="ビュー名（例: 民泊のアイデア）" value="' + c.escapeHtml(nameValue) + '" />' +
      '      <div class="modal-actions">' +
      (existing ?
        '<button type="button" class="btn-text btn-primary" data-action="renameSavedView" data-id="' + existing.id + '">名前を保存</button>' :
        '<button type="button" class="btn-text btn-primary" data-action="createSavedView">保存</button>') +
      '      </div>' +
      (existing ? '<div class="modal-actions modal-actions--secondary">' + updateConditionsButton + deleteButton + '</div>' : '') +
      '    </div>' +
      '  </div>' +
      '</div>';
  }

  App.Render.savedViewModal = { render: render };
})(window.MemoApp = window.MemoApp || {});
