/*
 役割: 中央カラム（メモ一覧）の描画。ヘッダー（検索・並び替え・複数選択切替）と、
       自前の仮想スクロールによる一覧本体を担当する。
 依存: render/common.js, render/noteCard.js, logic/filtering.js, logic/sorting.js, store/*

 【スワイプで削除】iPhone純正メモアプリと同様、カードを左にドラッグすると裏の赤い削除ボタンが
 現れる。ドラッグ中はこのモジュールがカード要素のtransformを直接書き換えて追従させ（60fps相当の
 滑らかさのため、状態管理やDOM再構築は経由しない）、指を離した時点でどれだけ開いたかに応じて
 「全開（store/uiStore.jsのrevealedDeleteNoteIdをセット）」か「閉じる」かにスナップする。
 開いている間に別のメモをタップ/ドラッグしたり削除ボタン以外の場所をタップした場合は
 閉じるだけで削除は起きない（main.jsのopenNoteアクション側でも二重にガードしている）。

 【仮想スクロールの方針】
 メモが1万件規模になっても軽快に動くよう、一覧のカードは固定高さにし、
 スクロール位置から「今見えている範囲」だけHTMLを生成する。カードの高さはCSS変数
 --note-card-height（画面幅に応じてlayout.cssが値を切り替える）から読み取り、
 CSSの実際の見た目と常に一致させている。スクロール自体はグローバルな状態変化ではないため、
 appShellの全体再描画は起こさず、noteList内でscrollイベントを直接購読して表示範囲のみ
 差し替える（mount関数）。
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};
  var c = App.Render.common;

  var BUFFER_ROWS = 6;
  var FALLBACK_ROW_HEIGHT = 92;

  var lastScrollTop = 0;
  var lastViewKey = null;
  var currentNotesCache = [];
  var currentCtxCache = null;

  /** カードの高さはCSS変数 --note-card-height で決まる（画面幅に応じてlayout.cssが切り替える）。
   *  仮想スクロールの位置計算をCSSの実際の値と必ず一致させるため、ここで読み取って使う。 */
  function getRowHeight() {
    var value = getComputedStyle(document.documentElement).getPropertyValue('--note-card-height');
    var px = parseFloat(value);
    return px > 0 ? px : FALLBACK_ROW_HEIGHT;
  }

  function computeVisibleRange(scrollTop, viewportHeight, total, rowHeight) {
    var start = Math.max(0, Math.floor(scrollTop / rowHeight) - BUFFER_ROWS);
    var visibleCount = Math.ceil(viewportHeight / rowHeight) + BUFFER_ROWS * 2;
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
        isChecked: ctx.selectedIds.indexOf(note.id) !== -1,
        isDeleteRevealed: note.id === ctx.revealedDeleteNoteId
      });
    }).join('');
  }

  function renderToolbar(ui, resultCount) {
    var sort = ui.sort;
    return '' +
      '<div class="note-list-toolbar">' +
      '  <div class="note-list-title-row">' +
      '    <h2 class="note-list-title">' + c.escapeHtml(ui.viewMeta.label) + '</h2>' +
      '    <span class="note-list-count">' + resultCount + '件</span>' +
      '    <button type="button" class="btn-new-note-compact" data-action="createFullNote" title="新しいメモを作成" aria-label="新しいメモを作成">' + c.icon('create', 16) + ' 新規作成</button>' +
      '  </div>' +
      '  <div class="note-list-controls">' +
      '    <input type="search" class="search-input" id="searchInput" placeholder="検索 (Ctrl+K)" value="' + c.escapeHtml(ui.filter.keyword) + '" data-role="search-input" />' +
      '    <button type="button" class="btn-icon mobile-only" data-action="setMobileViewSearch" title="詳細な検索・絞り込み" aria-label="詳細な検索・絞り込み">' + c.icon('search', 16) + ' 絞り込み</button>' +
      '    <button type="button" class="btn-icon" data-action="toggleMultiSelect" title="複数選択" aria-label="複数選択">' + (ui.multiSelectMode ? '選択終了' : '複数選択') + '</button>' +
      (ui.multiSelectMode ? '<button type="button" class="btn-icon" data-action="selectAllVisible" title="表示中のメモをすべて選択">すべて選択</button>' : '') +
      '    <div class="note-list-detail-controls">' +
      '      <select class="sort-select" data-action-change="changeSort" data-id="field">' +
      sortOption('updatedAt-desc', '更新日時: 新しい順', sort) +
      sortOption('updatedAt-asc', '更新日時: 古い順', sort) +
      sortOption('createdAt-desc', '作成日時: 新しい順', sort) +
      sortOption('createdAt-asc', '作成日時: 古い順', sort) +
      sortOption('title-asc', 'タイトル: 昇順', sort) +
      sortOption('title-desc', 'タイトル: 降順', sort) +
      '      </select>' +
      '      <label class="toolbar-checkbox" title="ピン留めしたメモを常に先頭に表示"><input type="checkbox" data-action-change="togglePinnedFirst" ' + (sort.pinnedFirst ? 'checked' : '') + ' /> ピン留め優先</label>' +
      (ui.viewMeta.kind !== 'trash' ? '<label class="toolbar-checkbox" title="アーカイブ済みのメモも表示する"><input type="checkbox" data-action-change="toggleIncludeArchived" ' + (ui.includeArchivedInSearch ? 'checked' : '') + ' /> アーカイブも含める</label>' : '') +
      (ui.viewMeta.kind !== 'trash' ? '<button type="button" class="btn-icon" data-action="openSaveViewModal" title="この検索条件をスマートビューとして保存" ' + (App.Logic.filtering.isFilterEmpty(ui.filter) ? 'disabled' : '') + '>この検索条件をスマートビューとして保存</button>' : '') +
      '    </div>' +
      '  </div>' +
      '</div>';
  }

  function sortOption(value, label, sort) {
    var current = sort.field + '-' + sort.direction;
    return '<option value="' + value + '"' + (current === value ? ' selected' : '') + '>' + label + '</option>';
  }

  /** PC（768px以上）かどうか。空状態の案内文をCSSでの文字列すり替えではなく実際に出し分けるために使う。 */
  function isWideViewport() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 768px)').matches;
  }

  function emptyStateHtml(totalScopeCount) {
    if (totalScopeCount === 0) {
      return isWideViewport()
        ? '<div class="note-list-empty">メモがまだありません。右上の「新規作成」から最初のメモを作成できます。</div>'
        : '<div class="note-list-empty">メモがまだありません。右下の＋ボタンから最初のメモを作成できます。</div>';
    }
    return '<div class="note-list-empty">条件に一致するメモがありません。検索条件を変更またはリセットしてください。</div>';
  }

  /** スクローラー内側（仮想スクロールの本体、または空状態）のHTML片を生成する。render()と syncLive() の両方から使う。 */
  function scrollerInnerHtml(notes, ctx, scrollTop, viewportHeight) {
    if (notes.length === 0) return emptyStateHtml(ctx.totalScopeCount);
    var rowHeight = getRowHeight();
    var range = computeVisibleRange(scrollTop, viewportHeight, notes.length, rowHeight);
    var totalHeight = notes.length * rowHeight;
    var offsetTop = range.start * rowHeight;
    return '' +
      '<div class="note-list-spacer" style="height:' + totalHeight + 'px">' +
      '  <div class="note-list-rows" id="noteListRows" style="transform:translateY(' + offsetTop + 'px)">' +
      renderRowsHtml(notes, range.start, range.end, ctx) +
      '  </div>' +
      '</div>';
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

    return '' +
      '<div class="note-list">' +
      renderToolbar(ui, notes.length) +
      App.Render.bulkActionBar.render(ui) +
      '  <div class="note-list-scroller" id="noteListScroller">' +
      scrollerInnerHtml(notes, ctx, lastScrollTop, 600) + // 初期HTML生成時は未マウントのため600pxで概算。mount()で実測して補正する。
      '  </div>' +
      '</div>';
  }

  function patchVisibleRows() {
    var scroller = document.getElementById('noteListScroller');
    var rowsEl = document.getElementById('noteListRows');
    if (!scroller || !rowsEl || !currentCtxCache) return;
    var rowHeight = getRowHeight();
    var range = computeVisibleRange(scroller.scrollTop, scroller.clientHeight, currentNotesCache.length, rowHeight);
    var offsetTop = range.start * rowHeight;
    rowsEl.style.transform = 'translateY(' + offsetTop + 'px)';
    rowsEl.innerHTML = renderRowsHtml(currentNotesCache, range.start, range.end, currentCtxCache);
    lastScrollTop = scroller.scrollTop;
  }

  /**
   * 一覧の外（メモ編集画面）で何かが変わった際に、一覧側だけをその場で最新状態へ同期する。
   * #app全体の再描画（appShell.jsのrenderAll）はIME保護のため編集中は遅延されるが、
   * .note-list-scrollerは編集中のフォーカス対象（本文入力欄）と無関係なDOMのため、
   * ここだけ独立して即時更新して問題ない。新規メモの一覧追加・件数即時反映（優先度1）の要。
   * @param {Note[]} notes @param {Object} listCtx
   */
  function syncLive(notes, listCtx) {
    currentNotesCache = notes;
    currentCtxCache = listCtx;
    var scroller = document.getElementById('noteListScroller');
    if (!scroller) return; // 一覧画面が現在表示されていない（モバイルで編集画面表示中等）→ 次回の通常描画で自然に反映される
    var countEl = document.querySelector('.note-list-count');
    if (countEl) countEl.textContent = notes.length + '件';
    scroller.innerHTML = scrollerInnerHtml(notes, listCtx, scroller.scrollTop, scroller.clientHeight || 600);
  }

  var SWIPE_INTENT_THRESHOLD = 8; // これ未満の移動はタップとみなしスワイプ扱いにしない
  var VERTICAL_CANCEL_RATIO = 1.2; // 縦方向の動きが横方向よりこの倍率以上大きければスクロールとみなす

  function getSwipeDeleteWidth() {
    var value = getComputedStyle(document.documentElement).getPropertyValue('--swipe-delete-width');
    var px = parseFloat(value);
    return px > 0 ? px : 88;
  }

  /** 一覧のメモを左にスワイプすると裏の削除ボタンが現れる（iPhone純正メモアプリを参考にした挙動）。
   *  ドラッグ中はcardのtransformを直接動かし、指を離した時点で開くか閉じるかスナップする。 */
  function attachSwipeToDelete(scroller) {
    var dragCard = null;
    var dragNoteId = null;
    var dragBaseOffset = 0;
    var dragStartX = 0;
    var dragStartY = 0;
    var dragOffset = 0;
    var dragMode = null; // null | 'horizontal' | 'vertical'

    function isCardRevealed(card) {
      return card.getAttribute('data-id') === App.Store.uiStore.getState().revealedDeleteNoteId;
    }

    function endDrag() {
      if (!dragCard) return;
      var actionWidth = getSwipeDeleteWidth();
      var card = dragCard;
      var noteId = dragNoteId;
      var offset = dragOffset;
      var mode = dragMode;
      dragCard = null;
      dragNoteId = null;
      dragMode = null;

      card.classList.remove('is-dragging');
      if (mode === null) return; // タップのみ（ドラッグ未成立）だった場合はそのまま通常のクリックに任せる

      var shouldOpen = offset <= -actionWidth / 2;
      card.style.transform = shouldOpen ? 'translateX(' + (-actionWidth) + 'px)' : '';
      if (shouldOpen) {
        App.Store.uiStore.revealDeleteForNote(noteId);
      } else if (App.Store.uiStore.getState().revealedDeleteNoteId === noteId) {
        App.Store.uiStore.hideRevealedDelete();
      }
    }

    scroller.addEventListener('pointerdown', function (evt) {
      if (evt.pointerType === 'mouse' && evt.button !== 0) return;
      var card = evt.target.closest('.note-card');
      if (!card) return;
      var noteId = card.getAttribute('data-id');

      // 既に開いている別のメモがあれば先に閉じる。これは#appの再描画を伴い、
      // 上で取得したcard要素がDOMから切り離される（作り直される）ため、
      // 再描画後のDOMから改めて取得し直す。
      var revealedId = App.Store.uiStore.getState().revealedDeleteNoteId;
      if (revealedId && revealedId !== noteId) {
        App.Store.uiStore.hideRevealedDelete();
        card = scroller.querySelector('.note-card[data-id="' + noteId + '"]');
        if (!card) return;
      }

      dragCard = card;
      dragNoteId = noteId;
      dragBaseOffset = isCardRevealed(card) ? -getSwipeDeleteWidth() : 0;
      dragStartX = evt.clientX;
      dragStartY = evt.clientY;
      dragOffset = dragBaseOffset;
      dragMode = null;
    });

    scroller.addEventListener('pointermove', function (evt) {
      if (!dragCard) return;
      var dx = evt.clientX - dragStartX;
      var dy = evt.clientY - dragStartY;

      if (dragMode === null) {
        if (Math.abs(dx) < SWIPE_INTENT_THRESHOLD && Math.abs(dy) < SWIPE_INTENT_THRESHOLD) return;
        if (Math.abs(dy) > Math.abs(dx) * VERTICAL_CANCEL_RATIO) {
          // 縦方向の動きが優勢 → スクロール操作とみなし、このカードの追跡をやめる（スクロールは妨げない）
          dragCard = null;
          dragMode = null;
          return;
        }
        dragMode = 'horizontal';
        dragCard.classList.add('is-dragging');
      }

      var actionWidth = getSwipeDeleteWidth();
      dragOffset = Math.max(-actionWidth, Math.min(0, dragBaseOffset + dx));
      dragCard.style.transform = 'translateX(' + dragOffset + 'px)';
      evt.preventDefault();
    }, { passive: false });

    scroller.addEventListener('pointerup', endDrag);
    scroller.addEventListener('pointercancel', endDrag);
  }

  function mount() {
    var scroller = document.getElementById('noteListScroller');
    if (!scroller) return;
    scroller.scrollTop = lastScrollTop;
    scroller.addEventListener('scroll', function () {
      window.requestAnimationFrame(patchVisibleRows);
    });
    attachSwipeToDelete(scroller);
    // 実際のビューポート高さで再計算（初回描画時の概算600pxとズレるため）
    patchVisibleRows();
  }

  App.Render.noteList = { render: render, mount: mount, syncLive: syncLive };
})(window.MemoApp = window.MemoApp || {});
