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

  /** renderAll()とsyncListLive()の両方で使う、一覧に必要な計算をまとめたもの。 */
  function computeListState(ui) {
    var lookups = buildLookups();
    var notes = getVisibleNotes(ui, lookups);
    var totalScopeCount = ui.viewMeta.kind === 'trash'
      ? App.Store.notesStore.getTrashed().length
      : App.Store.notesStore.getAllActive().length;
    var listCtx = {
      categoryNameById: lookups.categoryNameById,
      typeNameById: lookups.typeNameById,
      selectedNoteId: ui.selectedNoteId,
      multiSelectMode: ui.multiSelectMode,
      selectedIds: ui.selectedIds,
      revealedDeleteNoteId: ui.revealedDeleteNoteId,
      totalScopeCount: totalScopeCount
    };
    return { notes: notes, listCtx: listCtx };
  }

  /**
   * メモ編集中で#app全体の再描画が保留されている間も、一覧・サイドバーの件数表示だけは
   * その場で最新化する（優先度1: 新規メモ・一覧件数の即時反映）。編集中の入力欄には一切触れない。
   */
  function syncListLive() {
    var ui = App.Store.uiStore.getState();
    var computed = computeListState(ui);
    lastRenderedNotes = computed.notes;
    App.Render.noteList.syncLive(computed.notes, computed.listCtx);
    App.Render.sidebar.syncLiveCounts();
  }

  var lastRenderedNoteKey = undefined; // undefined = まだ一度も描画していない
  var renderPendingDeferred = false;

  /** 「今開いている」メモを一意に識別するキー。下書き（uiStore.draftNote）と、最初の入力で
   *  昇格した後の実メモは同じidを使う設計にしてあるため（main.jsのpromoteDraft参照）、
   *  下書き→保存後もこのキーは変わらず、以下のisEditingCurrentNoteField()が
   *  「同じ編集セッションの続き」と正しく判定できる（＝入力欄が作り直されずフォーカスが保たれる）。 */
  function currentNoteKey(ui) {
    if (ui.draftNote) return ui.draftNote.id;
    return ui.selectedNoteId;
  }

  /** 「今まさにこのメモの本文欄（1行目がタイトルを兼ねる）を編集中で、かつメモ自体は
   *  切り替わっていない」かどうか。この場合だけ再描画を保留する（別メモ・別ビューへの
   *  切り替えは対象外にし、即座に反映させる）。
   *  本文欄はTiptap（contenteditable）のため、固定idではなく.note-content-editorクラスの
   *  子孫にフォーカスがあるかどうかで判定する（実際にフォーカスを持つのは内部の.ProseMirror要素）。 */
  function isEditingCurrentNoteField(noteKey) {
    var active = document.activeElement;
    if (!active || !active.closest || !active.closest('.note-content-editor')) return false;
    return noteKey === lastRenderedNoteKey;
  }

  /** タイトル/本文欄からフォーカスが外れた時などに、保留していた再描画があれば実行する。 */
  function flushDeferredRender() {
    if (renderPendingDeferred) {
      renderPendingDeferred = false;
      renderAll();
    }
  }

  function renderAll() {
    var pendingUi = App.Store.uiStore.getState();
    if (isEditingCurrentNoteField(currentNoteKey(pendingUi))) {
      renderPendingDeferred = true;
      return;
    }
    renderPendingDeferred = false;
    var container = document.getElementById('app');
    withUiStatePreserved(container, function () {
      var ui = App.Store.uiStore.getState();
      var computed = computeListState(ui);
      var notes = computed.notes;
      var listCtx = computed.listCtx;
      lastRenderedNotes = notes;
      lastRenderedNoteKey = currentNoteKey(ui);
      var selectedNote = ui.draftNote || (ui.selectedNoteId ? App.Store.notesStore.getById(ui.selectedNoteId) : null);

      container.setAttribute('data-mobile-view', ui.mobileView);
      container.innerHTML = '' +
        '<div class="app-body" data-mobile-view="' + ui.mobileView + '">' +
        App.Render.sidebar.render() +
        App.Render.noteList.render(notes, listCtx, ui) +
        App.Render.noteEditor.render(selectedNote) +
        App.Render.searchScreen.render(ui) +
        '</div>' +
        (ui.mobileView === 'list' ? '<button type="button" class="fab-create mobile-only" data-action="createFullNote" title="新しいメモを作成" aria-label="新しいメモを作成">' + App.Render.common.icon('create', 26) + '</button>' : '') +
        App.Render.bottomNav.render(ui) +
        App.Render.toast.render(ui) +
        App.Render.historyPanel.render(ui) +
        App.Render.categoryManagerModal.render(ui) +
        App.Render.aiSuggestPanel.render(ui) +
        App.Render.savedViewModal.render(ui) +
        App.Render.settingsModal.render(ui) +
        App.Render.sheet.renderAll(ui, selectedNote);

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
    flushDeferredRender: flushDeferredRender,
    syncListLive: syncListLive
  };
})(window.MemoApp = window.MemoApp || {});
