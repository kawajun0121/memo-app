/*
 役割: 現在の表示条件（フィルタ・並び替え・選択中ビュー）、選択中メモ、複数選択モード、
       各種パネルの開閉状態など、画面のUI状態を一元管理する。
 依存: store/state.js, logic/filtering.js, logic/sorting.js, logic/navViews.js, db/settingsRepo.js
*/
(function (App) {
  'use strict';
  App.Store = App.Store || {};

  var defaultView = App.Logic.navViews.BASIC_MENU[0];
  var initialSort = App.Db.settingsRepo.getSortCondition() || App.Logic.sorting.defaultSort();
  initialSort.pinnedFirst = App.Db.settingsRepo.getPinnedFirst();

  var store = App.Store.createStore({
    filter: App.Logic.filtering.emptyFilter(),
    sort: initialSort,
    viewMeta: { kind: 'basic', id: defaultView.id, label: defaultView.label, isTrash: false },
    selectedNoteId: null,
    multiSelectMode: false,
    selectedIds: [],
    panels: {
      historyOpen: false, categoryManagerOpen: false, settingsOpen: false, aiSuggestOpen: false,
      saveViewModalOpen: false, editSavedViewId: null,
      categoryPickerOpen: false, typePickerOpen: false, editorMenuOpen: false,
      bulkCategoryAddOpen: false, bulkCategoryRemoveOpen: false, bulkTypeChangeOpen: false
    },
    includeArchivedInSearch: false,
    // スマホ幅（iPhone等）でのみ使う画面切り替え。下部ナビゲーションの4タブに対応する。
    // 'organize'=整理（カテゴリ/種類/基本メニュー） / 'list'=メモ一覧 / 'editor'=メモ本文 / 'search'=検索・絞り込み。
    // 「設定」はpanels.settingsOpenの既存モーダル機構を流用し、モバイル幅ではCSSでフルスクリーン表示にする。
    // PC幅では3カラム同時表示のためCSS側でこの値は無視される。
    mobileView: 'list',
    // 一覧でメモを左にスワイプした際、裏の「削除」ボタンが見えている状態のメモID（1件のみ）。
    // iPhone純正メモアプリと同様、スワイプで開いた後に削除ボタン自体を別途タップしたときのみ
    // 実際に削除する（render/noteList.jsのスワイプ検出とセット）。
    revealedDeleteNoteId: null,
    // 「＋新規作成」直後の下書き状態のメモ（まだIndexedDBには保存されていない）。
    // 最初の入力で notesStore.create() により正式なメモへ昇格し、ここはnullに戻る。
    // 何も入力されないまま別のメモ/画面に切り替わった場合は破棄される（main.jsのcreateFullNote参照）。
    draftNote: null,
    // 画面下部に一時表示する軽いフィードバック（例: ゴミ箱移動の「元に戻す」）。
    toast: null
  });

  /**
   * @param {{kind:string,id:string,label:string,isTrash?:boolean}} meta
   * @param {FilterConditions} filter
   * @param {SortCondition} [sort]
   */
  function selectView(meta, filter, sort) {
    store.setState({
      viewMeta: Object.assign({ isTrash: false }, meta),
      filter: filter,
      sort: sort || store.getState().sort,
      selectedNoteId: null,
      multiSelectMode: false,
      selectedIds: [],
      includeArchivedInSearch: false,
      mobileView: 'list',
      revealedDeleteNoteId: null,
      draftNote: null // 空のまま放置された下書きは、別ビューへ移った時点で破棄する
    });
  }

  function selectBasicMenu(id) {
    var def = App.Logic.navViews.BASIC_MENU.find(function (m) { return m.id === id; });
    if (!def) return;
    if (def.isTrash) {
      selectView({ kind: 'trash', id: id, label: def.label, isTrash: true }, App.Logic.filtering.emptyFilter(), def.sort);
      return;
    }
    selectView({ kind: 'basic', id: id, label: def.label }, def.filter, def.sort);
  }

  function selectCategory(categoryId, label) {
    selectView({ kind: 'category', id: categoryId, label: label },
      Object.assign(App.Logic.filtering.emptyFilter(), { categoryIds: [categoryId] }));
  }

  function selectType(typeId, label) {
    selectView({ kind: 'type', id: typeId, label: label },
      Object.assign(App.Logic.filtering.emptyFilter(), { typeId: typeId }));
  }

  function selectStandardSmartView(id) {
    var def = App.Logic.navViews.STANDARD_SMART_VIEWS.find(function (v) { return v.id === id; });
    if (!def) return;
    selectView({ kind: 'smartStandard', id: id, label: def.label }, def.filter, def.sort);
  }

  function selectSavedView(view) {
    selectView({ kind: 'smartSaved', id: view.id, label: view.name }, view.filterConditions, view.sortCondition);
  }

  function setKeyword(keyword) {
    store.setState(function (s) {
      return { filter: Object.assign({}, s.filter, { keyword: keyword }) };
    });
  }

  /** カテゴリの絞り込みトグル（Ctrl+クリック等で複数選択するとAND条件になる） */
  function toggleCategoryFilter(categoryId) {
    store.setState(function (s) {
      var ids = s.filter.categoryIds.slice();
      var idx = ids.indexOf(categoryId);
      if (idx === -1) ids.push(categoryId); else ids.splice(idx, 1);

      var label, viewMeta;
      if (ids.length === 0) {
        var def = App.Logic.navViews.BASIC_MENU[0];
        viewMeta = { kind: 'basic', id: def.id, label: def.label };
      } else {
        label = ids.map(function (id) {
          var cat = App.Store.categoriesStore.getById(id);
          return cat ? cat.name : '?';
        }).join(' + ');
        viewMeta = { kind: 'category', id: ids.length === 1 ? ids[0] : null, label: label };
      }

      return {
        filter: Object.assign({}, s.filter, { categoryIds: ids }),
        viewMeta: viewMeta
      };
    });
  }

  function setIncludeArchivedInSearch(value) {
    store.setState(function (s) {
      return {
        includeArchivedInSearch: value,
        filter: Object.assign({}, s.filter, { archiveState: value ? 'all' : 'active' })
      };
    });
  }

  /** 検索画面用: フィルタの1項目だけを差し替える（他の条件・viewMetaはそのまま維持し、複合条件にする）。
   *  カテゴリ/種類ナビのタップ（selectCategory等）とは異なり、単体の条件変更として扱う。 */
  function patchFilter(patch) {
    store.setState(function (s) {
      return {
        filter: Object.assign({}, s.filter, patch),
        viewMeta: { kind: 'search', id: null, label: '検索結果' }
      };
    });
  }

  function setFilterCategoryIds(categoryIds) { patchFilter({ categoryIds: categoryIds }); }
  function setFilterTypeId(typeId) { patchFilter({ typeId: typeId }); }
  function setFilterFavorite(value) { patchFilter({ isFavorite: value ? true : null }); }
  function setFilterNeedsOrganizing(value) { patchFilter({ needsOrganizingOnly: value ? true : null }); }

  function resetFilter() {
    store.setState({
      filter: App.Logic.filtering.emptyFilter(),
      includeArchivedInSearch: false,
      viewMeta: { kind: 'search', id: null, label: '検索結果' }
    });
  }

  function setSort(sort) {
    App.Db.settingsRepo.setSortCondition(sort);
    App.Db.settingsRepo.setPinnedFirst(sort.pinnedFirst);
    store.setState({ sort: sort });
  }

  function selectNote(noteId) {
    store.setState({
      selectedNoteId: noteId,
      mobileView: noteId ? 'editor' : 'list',
      revealedDeleteNoteId: null,
      draftNote: null // 別のメモを開く/一覧に戻る際、空のまま残っている下書きは破棄する
    });
  }

  /** @param {'organize'|'list'|'editor'|'search'} view スマホ幅での画面切り替え（PCでは無視される） */
  function setMobileView(view) {
    store.setState(function (s) {
      // 下書きが空のまま一覧・検索・整理タブへ移動する場合は破棄する（編集画面へはselectNote経由のみ遷移するため対象外）
      var shouldDiscardDraft = view !== 'editor' && s.draftNote && !s.draftNote.title && !s.draftNote.content;
      return { mobileView: view, draftNote: shouldDiscardDraft ? null : s.draftNote };
    });
  }

  /** @param {Note} draftNote 「＋新規作成」直後、まだ保存されていない下書き */
  function setDraftNote(draftNote) {
    store.setState({ draftNote: draftNote, selectedNoteId: null, mobileView: 'editor', revealedDeleteNoteId: null });
  }

  /** 下書きが最初の入力で正式なメモへ昇格した後に呼ぶ */
  function promoteDraftTo(noteId) {
    store.setState({ draftNote: null, selectedNoteId: noteId });
  }

  /** 下書き（まだ保存されていないメモ）のカテゴリ/種類などを、本文以外の理由で書き換える場合に使う */
  function updateDraftNote(patch) {
    store.setState(function (s) {
      if (!s.draftNote) return {};
      return { draftNote: Object.assign({}, s.draftNote, patch) };
    });
  }

  function showToast(toast) {
    store.setState({ toast: toast });
  }

  function clearToast() {
    store.setState({ toast: null });
  }

  /** @param {string} noteId 一覧でのメモのスワイプにより削除ボタンを表示する */
  function revealDeleteForNote(noteId) {
    store.setState({ revealedDeleteNoteId: noteId });
  }

  function hideRevealedDelete() {
    store.setState({ revealedDeleteNoteId: null });
  }

  function enterMultiSelect() {
    store.setState({ multiSelectMode: true });
  }

  function exitMultiSelect() {
    store.setState({ multiSelectMode: false, selectedIds: [] });
  }

  function toggleSelected(noteId) {
    store.setState(function (s) {
      var ids = s.selectedIds.slice();
      var idx = ids.indexOf(noteId);
      if (idx === -1) ids.push(noteId); else ids.splice(idx, 1);
      return { selectedIds: ids };
    });
  }

  function selectAllIds(ids) {
    store.setState({ selectedIds: ids });
  }

  function clearSelection() {
    store.setState({ selectedIds: [] });
  }

  function openPanel(name, extra) {
    store.setState(function (s) {
      var panels = Object.assign({}, s.panels);
      panels[name] = true;
      if (extra) Object.assign(panels, extra);
      return { panels: panels };
    });
  }

  function closePanel(name) {
    store.setState(function (s) {
      var panels = Object.assign({}, s.panels);
      panels[name] = false;
      return { panels: panels };
    });
  }

  App.Store.uiStore = {
    subscribe: store.subscribe,
    getState: store.getState,
    selectBasicMenu: selectBasicMenu,
    selectCategory: selectCategory,
    selectType: selectType,
    selectStandardSmartView: selectStandardSmartView,
    selectSavedView: selectSavedView,
    setKeyword: setKeyword,
    toggleCategoryFilter: toggleCategoryFilter,
    setFilterCategoryIds: setFilterCategoryIds,
    setFilterTypeId: setFilterTypeId,
    setFilterFavorite: setFilterFavorite,
    setFilterNeedsOrganizing: setFilterNeedsOrganizing,
    resetFilter: resetFilter,
    setIncludeArchivedInSearch: setIncludeArchivedInSearch,
    setSort: setSort,
    selectNote: selectNote,
    setMobileView: setMobileView,
    setDraftNote: setDraftNote,
    promoteDraftTo: promoteDraftTo,
    updateDraftNote: updateDraftNote,
    revealDeleteForNote: revealDeleteForNote,
    hideRevealedDelete: hideRevealedDelete,
    enterMultiSelect: enterMultiSelect,
    exitMultiSelect: exitMultiSelect,
    toggleSelected: toggleSelected,
    selectAllIds: selectAllIds,
    clearSelection: clearSelection,
    openPanel: openPanel,
    closePanel: closePanel,
    showToast: showToast,
    clearToast: clearToast
  };
})(window.MemoApp = window.MemoApp || {});
