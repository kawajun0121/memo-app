/*
 役割: カテゴリ管理モーダル。作成・名前変更・削除（使用件数の警告付き）。
       削除してもメモ自体は消えない（カテゴリの付け外しのみ）。
 依存: render/common.js, store/categoriesStore.js
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};
  var c = App.Render.common;

  function render(ui) {
    if (!ui.panels.categoryManagerOpen) return '';
    var categories = App.Store.categoriesStore.getAll().slice().sort(function (a, b) {
      return a.name.localeCompare(b.name, 'ja');
    });

    var rows = categories.map(function (cat) {
      var count = App.Store.categoriesStore.usageCount(cat.id);
      return '' +
        '<div class="category-manager-row">' +
        '  <input type="text" class="category-rename-input" data-action-change="renameCategory" data-id="' + cat.id + '" value="' + c.escapeHtml(cat.name) + '" />' +
        '  <span class="category-usage-count">' + count + '件</span>' +
        '  <button type="button" class="btn-text btn-danger" data-action="deleteCategory" data-id="' + cat.id + '">削除</button>' +
        '</div>';
    }).join('');

    if (categories.length === 0) rows = '<div class="modal-empty">カテゴリはまだありません</div>';

    return '' +
      '<div class="modal-overlay" data-action="closeCategoryManager" data-backdrop="true">' +
      '  <div class="modal-panel">' +
      '    <div class="modal-header">' +
      '      <h3>カテゴリ管理</h3>' +
      '      <button type="button" class="icon-btn" data-action="closeCategoryManager">✕</button>' +
      '    </div>' +
      '    <div class="modal-body">' +
      '      <div class="category-manager-new">' +
      '        <input type="text" id="newCategoryInput" class="enter-submits" placeholder="新しいカテゴリ名" />' +
      '        <button type="button" class="btn-text" data-action="createCategoryFromManager">追加</button>' +
      '      </div>' +
      rows +
      '    </div>' +
      '  </div>' +
      '</div>';
  }

  App.Render.categoryManagerModal = { render: render };
})(window.MemoApp = window.MemoApp || {});
