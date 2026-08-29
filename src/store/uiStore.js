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
    panels: { historyOpen: false, categoryManagerOpen: false, settingsOpen: false, aiSuggestOpen: false, saveViewModalOpen: false, editSavedViewId: null },
    includeArchivedInSearch: false,
    // スマホ幅（iPhone等）でのみ使う画面切り替え。'nav'=ナビゲーション / 'list'=メモ一覧 / 'editor'=メモ本文。
    // PC幅では3カラム同時表示のためCSS側でこの値は無視される。
    mobileView: 'list'
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
      mobileView: 'list'
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

  function setSort(sort) {
    App.Db.settingsRepo.setSortCondition(sort);
    App.Db.settingsRepo.setPinnedFirst(sort.pinnedFirst);
    store.setState({ sort: sort });
  }

  function selectNote(noteId) {
    store.setState({ selectedNoteId: noteId, mobileView: noteId ? 'editor' : 'list' });
  }

  /** @param {'nav'|'list'|'editor'} view スマホ幅での画面切り替え（PCでは無視される） */
  function setMobileView(view) {
    store.setState({ mobileView: view });
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
    setIncludeArchivedInSearch: setIncludeArchivedInSearch,
    setSort: setSort,
    selectNote: selectNote,
    setMobileView: setMobileView,
    enterMultiSelect: enterMultiSelect,
    exitMultiSelect: exitMultiSelect,
    toggleSelected: toggleSelected,
    selectAllIds: selectAllIds,
    clearSelection: clearSelection,
    openPanel: openPanel,
    closePanel: closePanel
  };
})(window.MemoApp = window.MemoApp || {});
