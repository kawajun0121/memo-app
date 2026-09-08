/*
 役割: スマホ幅専用の「検索・絞り込み」独立画面（下部ナビの「検索」タブ）。
       PCでは表示しない（PCは従来通りメモ一覧ツールバー内で絞り込む）。
 依存: render/common.js, store/uiStore.js, store/categoriesStore.js, store/typesStore.js, logic/filtering.js
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};
  var c = App.Render.common;

  function sortOption(value, label, sort) {
    var current = sort.field + '-' + sort.direction;
    return '<option value="' + value + '"' + (current === value ? ' selected' : '') + '>' + label + '</option>';
  }

  function categoryToggle(cat, ui) {
    var isSelected = ui.filter.categoryIds.indexOf(cat.id) !== -1;
    return '<button type="button" class="chip chip-toggle' + (isSelected ? ' is-selected' : '') + '" data-action="searchToggleCategory" data-id="' + cat.id + '">' + c.escapeHtml(cat.name) + '</button>';
  }

  function render(ui) {
    if (ui.mobileView !== 'search') return '';
    var sort = ui.sort;
    var categories = App.Store.categoriesStore.getAll();
    var types = App.Store.typesStore.getAll();
    var isEmpty = App.Logic.filtering.isFilterEmpty(ui.filter);

    return '' +
      '<div class="search-screen mobile-only">' +
      '  <div class="search-screen-header">' +
      '    <h2 class="search-screen-title">検索・絞り込み</h2>' +
      '  </div>' +
      '  <div class="search-screen-body">' +
      '    <label class="search-screen-label">キーワード</label>' +
      '    <input type="search" id="searchScreenKeyword" class="search-input" placeholder="タイトル・本文・カテゴリ名・種類名" value="' + c.escapeHtml(ui.filter.keyword) + '" />' +

      '    <label class="search-screen-label">並び替え</label>' +
      '    <select class="sort-select" data-action-change="changeSort" data-id="field">' +
      sortOption('updatedAt-desc', '更新日時: 新しい順', sort) +
      sortOption('updatedAt-asc', '更新日時: 古い順', sort) +
      sortOption('createdAt-desc', '作成日時: 新しい順', sort) +
      sortOption('createdAt-asc', '作成日時: 古い順', sort) +
      sortOption('title-asc', 'タイトル: 昇順', sort) +
      sortOption('title-desc', 'タイトル: 降順', sort) +
      '    </select>' +
      '    <label class="search-screen-checkbox"><input type="checkbox" data-action-change="togglePinnedFirst" ' + (sort.pinnedFirst ? 'checked' : '') + ' /> ピン留めを常に先頭に表示</label>' +
      '    <label class="search-screen-checkbox"><input type="checkbox" data-action-change="toggleIncludeArchived" ' + (ui.includeArchivedInSearch ? 'checked' : '') + ' /> アーカイブ済みのメモも含める</label>' +
      '    <label class="search-screen-checkbox"><input type="checkbox" data-action-change="searchToggleFavorite" ' + (ui.filter.isFavorite ? 'checked' : '') + ' /> お気に入りのみ</label>' +
      '    <label class="search-screen-checkbox"><input type="checkbox" data-action-change="searchToggleNeedsOrganizing" ' + (ui.filter.needsOrganizingOnly ? 'checked' : '') + ' /> あとで整理のみ</label>' +

      '    <label class="search-screen-label">カテゴリ（複数選択でAND絞り込み）</label>' +
      '    <div class="chip-row">' + (categories.length ? categories.map(function (cat) { return categoryToggle(cat, ui); }).join('') : '<span class="settings-note">カテゴリはまだありません</span>') + '</div>' +

      '    <label class="search-screen-label">種類</label>' +
      '    <select class="sort-select" data-action-change="searchSelectType">' +
      '      <option value="">指定しない</option>' +
      types.map(function (t) { return '<option value="' + t.id + '"' + (ui.filter.typeId === t.id ? ' selected' : '') + '>' + c.escapeHtml(t.name) + '</option>'; }).join('') +
      '    </select>' +

      '    <div class="search-screen-actions">' +
      '      <button type="button" class="btn-icon" data-action="searchResetFilter">条件をリセット</button>' +
      (ui.viewMeta.kind !== 'trash' ?
        '      <button type="button" class="btn-text btn-primary" data-action="openSaveViewModal" ' + (isEmpty ? 'disabled' : '') + '>この検索条件をスマートビューとして保存</button>' : '') +
      '    </div>' +
      '  </div>' +
      '</div>';
  }

  App.Render.searchScreen = { render: render };
})(window.MemoApp = window.MemoApp || {});
