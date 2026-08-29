/*
 役割: アプリ全体（クイック入力・3カラム・各種モーダル）を1画面内で組み立てる最上位モジュール。
       イベント委譲リスナーもここで#appに1回だけ設置する。
 依存: render/配下のすべてのモジュール, store/配下のすべてのストア

 【再描画の考え方】
 どれかのストアが変化するたびに main.js から renderAll() が呼ばれ、#app の中身を丸ごと作り直す。
 ただし中央カラムの一覧は仮想スクロール（noteList.js）で可視範囲だけ生成しているため、
 メモが1万件あっても丸ごと再描画のコスト自体は小さく保てる。
 丸ごと作り直すとフォーカス・カーソル位置・スクロール位置が失われるため、
 withUiStatePreserved() で再描画の前後にそれらを覚えておき復元する。
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

  function renderAll() {
    var container = document.getElementById('app');
    withUiStatePreserved(container, function () {
      var ui = App.Store.uiStore.getState();
      var lookups = buildLookups();
      var notes = getVisibleNotes(ui, lookups);
      lastRenderedNotes = notes;
      var selectedNote = ui.selectedNoteId ? App.Store.notesStore.getById(ui.selectedNoteId) : null;

      var listCtx = {
        categoryNameById: lookups.categoryNameById,
        typeNameById: lookups.typeNameById,
        selectedNoteId: ui.selectedNoteId,
        multiSelectMode: ui.multiSelectMode,
        selectedIds: ui.selectedIds
      };

      container.setAttribute('data-mobile-view', ui.mobileView);
      container.innerHTML = '' +
        App.Render.quickCapture.render() +
        '<div class="app-body" data-mobile-view="' + ui.mobileView + '">' +
        App.Render.sidebar.render() +
        App.Render.noteList.render(notes, listCtx, ui) +
        App.Render.noteEditor.render(selectedNote) +
        '</div>' +
        App.Render.historyPanel.render(ui) +
        App.Render.categoryManagerModal.render(ui) +
        App.Render.aiSuggestPanel.render(ui) +
        App.Render.savedViewModal.render(ui) +
        App.Render.settingsModal.render(ui);

      App.Render.quickCapture.mount();
      App.Render.noteList.mount();
      App.Render.noteEditor.mount(selectedNote);
    });
  }

  function init() {
    var app = document.getElementById('app');
    App.Render.common.bindActionDelegation(app);
  }

  App.Render.appShell = { renderAll: renderAll, init: init, getLastRenderedNoteIds: getLastRenderedNoteIds };
})(window.MemoApp = window.MemoApp || {});
