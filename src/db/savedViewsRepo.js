/*
 役割: ユーザー作成のスマートビュー（保存済み検索条件）の永続化。
       標準スマートビュー（今日作成・最近作成 等）はDBに保存せずコード側で定義する（store/uiStore.js参照）。
 依存: db/db.js, logic/id.js
*/
(function (App) {
  'use strict';
  App.Db = App.Db || {};
  var STORE = App.Db.STORES ? App.Db.STORES.savedViews : 'savedViews';

  /**
   * @param {string} name
   * @param {FilterConditions} filterConditions
   * @param {SortCondition} sortCondition
   */
  function createSavedView(name, filterConditions, sortCondition) {
    var now = Date.now();
    return {
      id: App.Logic.id.generateId(),
      name: name,
      filterConditions: filterConditions,
      sortCondition: sortCondition,
      createdAt: now,
      updatedAt: now
    };
  }

  function getAllSavedViews() {
    return App.Db.getAll(STORE);
  }

  function saveSavedView(view) {
    return App.Db.put(STORE, view);
  }

  function deleteSavedView(id) {
    return App.Db.remove(STORE, id);
  }

  App.Db.savedViewsRepo = {
    createSavedView: createSavedView,
    getAllSavedViews: getAllSavedViews,
    saveSavedView: saveSavedView,
    deleteSavedView: deleteSavedView
  };
})(window.MemoApp = window.MemoApp || {});
