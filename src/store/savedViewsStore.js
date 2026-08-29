/*
 役割: ユーザー作成スマートビューのメモリキャッシュと永続化。
 依存: store/state.js, db/savedViewsRepo.js
*/
(function (App) {
  'use strict';
  App.Store = App.Store || {};

  var store = App.Store.createStore({ views: [], loaded: false });

  function init() {
    return App.Db.savedViewsRepo.getAllSavedViews().then(function (views) {
      store.setState({ views: views, loaded: true });
      return views;
    });
  }

  function getAll() {
    return store.getState().views;
  }

  function getById(id) {
    return getAll().find(function (v) { return v.id === id; }) || null;
  }

  /**
   * @param {string} name
   * @param {FilterConditions} filterConditions
   * @param {SortCondition} sortCondition
   */
  function create(name, filterConditions, sortCondition) {
    var view = App.Db.savedViewsRepo.createSavedView(name.trim(), filterConditions, sortCondition);
    store.setState({ views: getAll().concat([view]) });
    App.Db.savedViewsRepo.saveSavedView(view).catch(function (err) {
      console.error('スマートビューの保存に失敗しました', err);
    });
    return view;
  }

  function rename(id, name) {
    return updateFields(id, { name: name.trim() });
  }

  function updateConditions(id, filterConditions, sortCondition) {
    return updateFields(id, { filterConditions: filterConditions, sortCondition: sortCondition });
  }

  function updateFields(id, patch) {
    var view = getById(id);
    if (!view) return Promise.resolve();
    var updated = Object.assign({}, view, patch, { updatedAt: Date.now() });
    store.setState({ views: getAll().map(function (v) { return v.id === id ? updated : v; }) });
    return App.Db.savedViewsRepo.saveSavedView(updated);
  }

  function remove(id) {
    store.setState({ views: getAll().filter(function (v) { return v.id !== id; }) });
    return App.Db.savedViewsRepo.deleteSavedView(id);
  }

  /** @param {SavedView[]} views クラウド同期でのマージ結果を丸ごと反映する */
  function replaceAll(views) {
    store.setState({ views: views });
    if (views.length > 0) App.Db.bulkPut(App.Db.STORES.savedViews, views);
  }

  App.Store.savedViewsStore = {
    init: init,
    subscribe: store.subscribe,
    getAll: getAll,
    getById: getById,
    create: create,
    rename: rename,
    updateConditions: updateConditions,
    remove: remove,
    replaceAll: replaceAll
  };
})(window.MemoApp = window.MemoApp || {});
