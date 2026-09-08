/*
 役割: アプリ全体（3カラム・画面下部の新規作成ボタン・各種モーダル）を1画面内で組み立てる最上位モジュール。
       イベント委譲リスナーもここで#appに1回だけ設置する。
 依存: render/配下のすべてのモジュール, store/配下のすべてのストア

 【再描画の考え方】
 どれかのストアが変化するたびに main.js から renderAll() が呼ばれ、#app の中身を丸ごと作り直す。
 ただし中央カラムの一覧は仮想スクロール（noteList.js）で可視範囲だけ生成しているため、
 メモが1万件あっても丸ごと再描画のコスト自体は小さく保てる。
 丸ごと作り直すとフォーカス・カーソル位置・スクロール位置が失われるため、
 withUiStatePreserved() で再描画の前後にそれらを覚えておき復元する。

 【編集中の入力欄は再描画で壊さない】メモのタイトル・本文欄にフォーカスがある間に#appの中身が
 作り直されると、入力中のinput/textarea自体が新しいDOM要素に置き換わってしまい、日本語入力の
 変換中の文字が消える・乱れるなどの不具合につながる。当初はcompositionstart〜compositionendの
 間だけ再描画を保留していたが、実機での変換イベントの発火タイミングは想定通りとは限らないため、
 タイミングに依存しないより確実な方法に変更した: 「タイトル/本文欄にフォーカスがあり、かつ
 開いているメモが変わっていない（＝自分自身の自動保存やクラウド同期など、今開いているメモの
 見た目を作り直す必要が実質無い変化）」場合は、そもそも再描画そのものを行わない。
 別のメモやビューに切り替える操作（selectNote等）は開いているメモIDが変わるためこの対象外になり、
 通常どおり即座に再描画される。保留した再描画は、その入力欄からフォーカスが外れた時
 （render/noteEditor.jsのblurハンドラ）に改めてまとめて実行する。
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};

  var TEXT_SELECTION_INPUT_TYPES = { text: true, search: true, url: true, tel: true, password: true };
  function supportsTextSelection(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') return TEXT_SELECTION_INPUT_TYPES[el.type] === true;
    return false;
  }

  function withUiStatePreserved(container, renderFn) {
    var active = document.activeElement;
    var activeId = container.contains(active) && active.id ? active.id : null;
    var selectionStart = supportsTextSelection(active) ? active.selectionStart : null;
    var selectionEnd = supportsTextSelection(active) ? active.selectionEnd : null;

    var sidebarBefore = container.querySelector('.sidebar');
    var sidebarScrollTop = sidebarBefore ? sidebarBefore.scrollTop : 0;

    renderFn();

    var sidebarAfter = container.querySelector('.sidebar');
    if (sidebarAfter) sidebarAfter.scrollTop = sidebarScrollTop;

    if (activeId) {
      var el = document.getElementById(activeId);
      if (el) {
        try {
          el.focus({ preventScroll: true });
          if (selectionStart !== null && supportsTextSelection(el)) {
            el.setSelectionRange(selectionStart, selectionEnd);
          }
        } catch (e) { /* ignore */ }
      }
    }
  }

  function buildLookups() {
    var categoryNameById = {};
    App.Store.categoriesStore.getAll().forEach(function (c) { categoryNameById[c.id] = c.name; });
    var typeNameById = {};
    App.Store.typesStore.getAll().forEach(function (t) { typeNameById[t.id] = t.name; });
    return { categoryNameById: categoryNameById, typeNameById: typeNameById };
  }

  function getVisibleNotes(ui, lookups) {
    if (ui.viewMeta.kind === 'trash') {
      var trashFilter = Object.assign(App.Logic.filtering.emptyFilter(), { keyword: ui.filter.keyword, archiveState: 'all' });
      var trashed = App.Logic.filtering.applyFilters(App.Store.notesStore.getTrashed(), trashFilter, lookups);
      return App.Logic.sorting.applySort(trashed, ui.sort);
    }
    var active = App.Store.notesStore.getAllActive();
    var filtered = App.Logic.filtering.applyFilters(active, ui.filter, lookups);
    return App.Logic.sorting.applySort(filtered, ui.sort);
  }

  var lastRenderedNotes = [];

  function getLastRenderedNoteIds() {
    return lastRenderedNotes.map(function (n) { return n.id; });
  }

  var EDITABLE_NOTE_FIELD_IDS = { noteContentInput: true };
  var lastRenderedSelectedNoteId = undefined; // undefined = まだ一度も描画していない
  var renderPendingDeferred = false;

  /** 「今まさにこのメモの本文欄（1行目がタイトルを兼ねる）を編集中で、かつメモ自体は
   *  切り替わっていない」かどうか。この場合だけ再描画を保留する（別メモ・別ビューへの
   *  切り替えは対象外にし、即座に反映させる）。 */
  function isEditingCurrentNoteField(currentSelectedNoteId) {
    var activeId = document.activeElement && document.activeElement.id;
    if (!EDITABLE_NOTE_FIELD_IDS[activeId]) return false;
    return currentSelectedNoteId === lastRenderedSelectedNoteId;
  }

  /** タイトル/本文欄からフォーカスが外れた時などに、保留していた再描画があれば実行する。 */
  function flushDeferredRender() {
    if (renderPendingDeferred) {
      renderPendingDeferred = false;
      renderAll();
    }
  }

  function renderAll() {
    var pendingSelectedNoteId = App.Store.uiStore.getState().selectedNoteId;
    if (isEditingCurrentNoteField(pendingSelectedNoteId)) {
      renderPendingDeferred = true;
      return;
    }
    renderPendingDeferred = false;
    var container = document.getElementById('app');
    withUiStatePreserved(container, function () {
      var ui = App.Store.uiStore.getState();
      var lookups = buildLookups();
      var notes = getVisibleNotes(ui, lookups);
      lastRenderedNotes = notes;
      lastRenderedSelectedNoteId = ui.selectedNoteId;
      var selectedNote = ui.selectedNoteId ? App.Store.notesStore.getById(ui.selectedNoteId) : null;

      var listCtx = {
        categoryNameById: lookups.categoryNameById,
        typeNameById: lookups.typeNameById,
        selectedNoteId: ui.selectedNoteId,
        multiSelectMode: ui.multiSelectMode,
        selectedIds: ui.selectedIds,
        revealedDeleteNoteId: ui.revealedDeleteNoteId
      };

      container.setAttribute('data-mobile-view', ui.mobileView);
      container.innerHTML = '' +
        '<div class="app-body" data-mobile-view="' + ui.mobileView + '">' +
        App.Render.sidebar.render() +
        App.Render.noteList.render(notes, listCtx, ui) +
        App.Render.noteEditor.render(selectedNote) +
        '</div>' +
        '<div class="bottom-bar">' +
        '  <button type="button" class="btn-create-note" data-action="createFullNote">＋ 新規作成</button>' +
        '</div>' +
        App.Render.historyPanel.render(ui) +
        App.Render.categoryManagerModal.render(ui) +
        App.Render.aiSuggestPanel.render(ui) +
        App.Render.savedViewModal.render(ui) +
        App.Render.settingsModal.render(ui);

      App.Render.noteList.mount();
      App.Render.noteEditor.mount(selectedNote);
    });
  }

  function init() {
    var app = document.getElementById('app');
    App.Render.common.bindActionDelegation(app);
  }

  App.Render.appShell = {
    renderAll: renderAll,
    init: init,
    getLastRenderedNoteIds: getLastRenderedNoteIds,
    flushDeferredRender: flushDeferredRender
  };
})(window.MemoApp = window.MemoApp || {});
