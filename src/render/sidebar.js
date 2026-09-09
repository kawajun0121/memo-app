/*
 役割: 左カラム（ナビゲーション）の描画。基本メニュー・カテゴリ・種類・スマートビューを表示する。
 依存: render/common.js, logic/navViews.js, store/*
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};
  var c = App.Render.common;

  function countForBasicMenu(defId, activeNotes) {
    switch (defId) {
      case 'all': return activeNotes.filter(function (n) { return !n.isArchived; }).length;
      case 'unclassified': return activeNotes.filter(function (n) { return !n.isArchived && n.categoryIds.length === 0; }).length;
      case 'needsOrganizing': return activeNotes.filter(function (n) { return !n.isArchived && n.needsOrganizing; }).length;
      case 'favorite': return activeNotes.filter(function (n) { return !n.isArchived && n.isFavorite; }).length;
      case 'pinned': return activeNotes.filter(function (n) { return !n.isArchived && n.isPinned; }).length;
      case 'archived': return activeNotes.filter(function (n) { return n.isArchived; }).length;
      case 'trash': return App.Store.notesStore.getTrashed().length;
      default: return null;
    }
  }

  function renderBasicMenu(ui, activeNotes) {
    return App.Logic.navViews.BASIC_MENU.map(function (def) {
      var isSelected = ui.viewMeta.kind === (def.isTrash ? 'trash' : 'basic') && ui.viewMeta.id === def.id;
      var count = countForBasicMenu(def.id, activeNotes);
      return '<button type="button" class="nav-item' + (isSelected ? ' is-selected' : '') + '" data-action="navBasicMenu" data-id="' + def.id + '">' +
        '<span class="nav-icon">' + c.icon(def.id) + '</span>' +
        '<span class="nav-label">' + c.escapeHtml(def.label) + '</span>' +
        (count !== null ? '<span class="nav-count">' + count + '</span>' : '') +
        '</button>';
    }).join('');
  }

  function renderCategories(categories, ui) {
    if (categories.length === 0) {
      return '<div class="nav-empty">カテゴリはまだありません</div>';
    }
    var sorted = categories.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ja'); });
    return sorted.map(function (cat) {
      var count = App.Store.categoriesStore.usageCount(cat.id);
      var isPrimarySelected = ui.viewMeta.kind === 'category' && ui.viewMeta.id === cat.id;
      var isInAndFilter = ui.filter.categoryIds.indexOf(cat.id) !== -1 && !isPrimarySelected;
      return '<button type="button" class="nav-item nav-item--category' + (isPrimarySelected ? ' is-selected' : '') + (isInAndFilter ? ' is-and-filter' : '') + '" data-action="navCategory" data-id="' + cat.id + '" title="Ctrl+クリックでAND絞り込みに追加">' +
        '<span class="nav-label">' + c.escapeHtml(cat.name) + '</span>' +
        '<span class="nav-count">' + count + '</span>' +
        '</button>';
    }).join('');
  }

  function renderTypes(types, ui) {
    if (types.length === 0) {
      return '<div class="nav-empty">種類はまだありません</div>';
    }
    return types.map(function (t) {
      var count = App.Store.typesStore.usageCount(t.id);
      var isSelected = ui.viewMeta.kind === 'type' && ui.viewMeta.id === t.id;
      return '<button type="button" class="nav-item' + (isSelected ? ' is-selected' : '') + '" data-action="navType" data-id="' + t.id + '">' +
        '<span class="nav-label">' + c.escapeHtml(t.name) + '</span>' +
        '<span class="nav-count">' + count + '</span>' +
        '</button>';
    }).join('');
  }

  function renderSmartViews(savedViews, ui) {
    var standard = App.Logic.navViews.STANDARD_SMART_VIEWS.map(function (def) {
      var isSelected = ui.viewMeta.kind === 'smartStandard' && ui.viewMeta.id === def.id;
      return '<button type="button" class="nav-item' + (isSelected ? ' is-selected' : '') + '" data-action="navStandardSmartView" data-id="' + def.id + '">' +
        '<span class="nav-label">' + c.escapeHtml(def.label) + '</span>' +
        '</button>';
    }).join('');

    var custom = savedViews.map(function (v) {
      var isSelected = ui.viewMeta.kind === 'smartSaved' && ui.viewMeta.id === v.id;
      return '<div class="nav-item nav-item--saved-view' + (isSelected ? ' is-selected' : '') + '">' +
        '<button type="button" class="nav-item-main" data-action="navSavedView" data-id="' + v.id + '">' +
        '<span class="nav-label">' + c.escapeHtml(v.name) + '</span>' +
        '</button>' +
        c.iconButton('editSavedView', v.id, '⋯', '編集') +
        '</div>';
    }).join('');

    return standard + custom;
  }

  function render() {
    var ui = App.Store.uiStore.getState();
    var activeNotes = App.Store.notesStore.getAllActive();
    var categories = App.Store.categoriesStore.getAll();
    var types = App.Store.typesStore.getAll();
    var savedViews = App.Store.savedViewsStore.getAll();

    return '' +
      '<div class="sidebar">' +
      '  <div class="sidebar-header">' +
      '    <button type="button" class="icon-btn mobile-only" data-action="setMobileViewList" title="メモ一覧に戻る" aria-label="メモ一覧に戻る">←</button>' +
      '    <span class="app-title">メモ</span>' +
      '    <button type="button" class="icon-btn" data-action="openSettings" title="アプリ設定" aria-label="アプリ設定">' + c.icon('settings') + '</button>' +
      '  </div>' +
      '  <nav class="sidebar-section">' + renderBasicMenu(ui, activeNotes) + '</nav>' +
      '  <div class="sidebar-section-header">' +
      '    <span>カテゴリ</span>' +
      '    <button type="button" class="icon-btn icon-btn--small" data-action="openCategoryManager" title="カテゴリ管理" aria-label="カテゴリ管理">' + c.icon('settings', 16) + '</button>' +
      '  </div>' +
      '  <nav class="sidebar-section sidebar-section--scroll">' + renderCategories(categories, ui) + '</nav>' +
      '  <div class="sidebar-section-header"><span>種類</span></div>' +
      '  <nav class="sidebar-section">' + renderTypes(types, ui) + '</nav>' +
      '  <div class="sidebar-section-header"><span>スマートビュー</span></div>' +
      '  <nav class="sidebar-section sidebar-section--scroll">' + renderSmartViews(savedViews, ui) + '</nav>' +
      '</div>';
  }

  /** 一覧の外で件数に影響する変化（新規メモの正式保存等）があった際、サイドバーが
   *  表示されていれば（PC、またはモバイル「整理」画面）件数バッジだけをその場で更新する。
   *  #app全体の再描画に頼らないため、編集中のフォーカスを一切妨げない（優先度1）。 */
  function syncLiveCounts() {
    var sidebarEl = document.querySelector('.sidebar');
    if (!sidebarEl) return;
    var activeNotes = App.Store.notesStore.getAllActive();
    App.Logic.navViews.BASIC_MENU.forEach(function (def) {
      var count = countForBasicMenu(def.id, activeNotes);
      if (count === null) return;
      var btn = sidebarEl.querySelector('.nav-item[data-action="navBasicMenu"][data-id="' + def.id + '"] .nav-count');
      if (btn) btn.textContent = String(count);
    });
    App.Store.categoriesStore.getAll().forEach(function (cat) {
      var el = sidebarEl.querySelector('.nav-item[data-action="navCategory"][data-id="' + cat.id + '"] .nav-count');
      if (el) el.textContent = String(App.Store.categoriesStore.usageCount(cat.id));
    });
    App.Store.typesStore.getAll().forEach(function (t) {
      var el = sidebarEl.querySelector('.nav-item[data-action="navType"][data-id="' + t.id + '"] .nav-count');
      if (el) el.textContent = String(App.Store.typesStore.usageCount(t.id));
    });
  }

  App.Render.sidebar = { render: render, syncLiveCounts: syncLiveCounts };
})(window.MemoApp = window.MemoApp || {});
