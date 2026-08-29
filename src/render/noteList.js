/*
 役割: 中央カラム（メモ一覧）の描画。ヘッダー（検索・並び替え・複数選択切替）と、
       自前の仮想スクロールによる一覧本体を担当する。
 依存: render/common.js, render/noteCard.js, logic/filtering.js, logic/sorting.js, store/*

 【仮想スクロールの方針】
 メモが1万件規模になっても軽快に動くよう、一覧のカードは固定高さ(ROW_HEIGHT)にし、
 スクロール位置から「今見えている範囲」だけHTMLを生成する。スクロール自体はグローバルな
 状態変化ではないため、appShellの全体再描画は起こさず、noteList内でscrollイベントを直接
 購読して表示範囲のみ差し替える（mount関数）。
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};
  var c = App.Render.common;

  var ROW_HEIGHT = 92;
  var BUFFER_ROWS = 6;

  var lastScrollTop = 0;
  var lastViewKey = null;
  var currentNotesCache = [];
  var currentCtxCache = null;

  function computeVisibleRange(scrollTop, viewportHeight, total) {
    var start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
    var visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + BUFFER_ROWS * 2;
    var end = Math.min(total, start + visibleCount);
    return { start: start, end: end };
  }

  function renderRowsHtml(notes, start, end, ctx) {
    var slice = notes.slice(start, end);
    return slice.map(function (note) {
      return App.Render.noteCard.render(note, {
        categoryNameById: ctx.categoryNameById,
        typeNameById: ctx.typeNameById,
        isSelected: note.id === ctx.selectedNoteId,
        multiSelectMode: ctx.multiSelectMode,
        isChecked: ctx.selectedIds.indexOf(note.id) !== -1
      });
    }).join('');
  }

  function renderToolbar(ui, resultCount) {
    var sort = ui.sort;
    return '' +
      '<div class="note-list-toolbar">' +
      '  <div class="note-list-title-row">' +
      '    <button type="button" class="icon-btn mobile-only" data-action="setMobileViewNav" title="メニュー">☰</button>' +
      '    <h2 class="note-list-title">' + c.escapeHtml(ui.viewMeta.label) + '</h2>' +
      '    <span class="note-list-count">' + resultCount + '件</span>' +
      '  </div>' +
      '  <div class="note-list-controls">' +
      '    <input type="search" class="search-input" id="searchInput" placeholder="検索 (Ctrl+K)" value="' + c.escapeHtml(ui.filter.keyword) + '" data-role="search-input" />' +
      '    <select class="sort-select" data-action-change="changeSort" data-id="field">' +
      sortOption('updatedAt-desc', '更新日時: 新しい順', sort) +
      sortOption('updatedAt-asc', '更新日時: 古い順', sort) +
      sortOption('createdAt-desc', '作成日時: 新しい順', sort) +
      sortOption('createdAt-asc', '作成日時: 古い順', sort) +
      sortOption('title-asc', 'タイトル: 昇順', sort) +
      sortOption('title-desc', 'タイトル: 降順', sort) +
      '    </select>' +
      '    <label class="toolbar-checkbox" title="ピン留めしたメモを常に先頭に表示"><input type="checkbox" data-action-change="togglePinnedFirst" ' + (sort.pinnedFirst ? 'checked' : '') + ' /> ピン留め優先</label>' +
      (ui.viewMeta.kind !== 'trash' ? '<label class="toolbar-checkbox" title="アーカイブ済みのメモも表示する"><input type="checkbox" data-action-change="toggleIncludeArchived" ' + (ui.includeArchivedInSearch ? 'checked' : '') + ' /> アーカイブも含める</label>' : '') +
      '    <button type="button" class="btn-icon" data-action="toggleMultiSelect" title="複数選択">' + (ui.multiSelectMode ? '選択終了' : '選択') + '</button>' +
      (ui.multiSelectMode ? '<button type="button" class="btn-icon" data-action="selectAllVisible" title="表示中のメモをすべて選択">すべて選択</button>' : '') +
      (ui.viewMeta.kind !== 'trash' ? '<button type="button" class="btn-icon" data-action="openSaveViewModal" title="この条件をスマートビューとして保存">条件を保存</button>' : '') +
      '  </div>' +
      '</div>';
  }

  function sortOption(value, label, sort) {
    var current = sort.field + '-' + sort.direction;
    return '<option value="' + value + '"' + (current === value ? ' selected' : '') + '>' + label + '</option>';
  }

  /**
   * @param {Note[]} notes - 既にフィルタ・ソート済みの配列
   * @param {{categoryNameById:Object, typeNameById:Object, selectedNoteId:string|null, multiSelectMode:boolean, selectedIds:string[]}} ctx
   * @param {Object} ui
   */
  function render(notes, ctx, ui) {
    currentNotesCache = notes;
    currentCtxCache = ctx;

    var viewKey = ui.viewMeta.kind + ':' + ui.viewMeta.id;
    if (viewKey !== lastViewKey) {
      lastScrollTop = 0;
      lastViewKey = viewKey;
    }

    var viewportHeight = 600; // 初期HTML生成時は未マウントのため概算。mount()で実測して補正する。
    var range = computeVisibleRange(lastScrollTop, viewportHeight, notes.length);
    var totalHeight = notes.length * ROW_HEIGHT;
    var offsetTop = range.start * ROW_HEIGHT;

    var emptyState = notes.length === 0 ?
      '<div class="note-list-empty">該当するメモがありません</div>' : '';

    return '' +
      '<div class="note-list">' +
      renderToolbar(ui, notes.length) +
      App.Render.bulkActionBar.render(ui) +
      '  <div class="note-list-scroller" id="noteListScroller">' +
      (notes.length > 0 ?
        '    <div class="note-list-spacer" style="height:' + totalHeight + 'px">' +
        '      <div class="note-list-rows" id="noteListRows" style="transform:translateY(' + offsetTop + 'px)">' +
        renderRowsHtml(notes, range.start, range.end, ctx) +
        '      </div>' +
        '    </div>' : emptyState) +
      '  </div>' +
      '</div>';
  }

  function patchVisibleRows() {
    var scroller = document.getElementById('noteListScroller');
    var rowsEl = document.getElementById('noteListRows');
    if (!scroller || !rowsEl || !currentCtxCache) return;
    var range = computeVisibleRange(scroller.scrollTop, scroller.clientHeight, currentNotesCache.length);
    var offsetTop = range.start * ROW_HEIGHT;
    rowsEl.style.transform = 'translateY(' + offsetTop + 'px)';
    rowsEl.innerHTML = renderRowsHtml(currentNotesCache, range.start, range.end, currentCtxCache);
    lastScrollTop = scroller.scrollTop;
  }

  function mount() {
    var scroller = document.getElementById('noteListScroller');
    if (!scroller) return;
    scroller.scrollTop = lastScrollTop;
    scroller.addEventListener('scroll', function () {
      window.requestAnimationFrame(patchVisibleRows);
    });
    // 実際のビューポート高さで再計算（初回描画時の概算600pxとズレるため）
    patchVisibleRows();
  }

  App.Render.noteList = { render: render, mount: mount, ROW_HEIGHT: ROW_HEIGHT };
})(window.MemoApp = window.MemoApp || {});
