/*
 役割: カテゴリのメモリキャッシュと永続化。
 依存: store/state.js, db/categoriesRepo.js, store/notesStore.js
*/
(function (App) {
  'use strict';
  App.Store = App.Store || {};

  var store = App.Store.createStore({ categories: [], loaded: false });

  function init() {
    return App.Db.categoriesRepo.getAllCategories().then(function (categories) {
      store.setState({ categories: categories, loaded: true });
      return categories;
    });
  }

  function getAll() {
    return store.getState().categories;
  }

  function getById(id) {
    return getAll().find(function (c) { return c.id === id; }) || null;
  }

  function findByName(name) {
    var normalized = name.trim().toLowerCase();
    return getAll().find(function (c) { return c.name.trim().toLowerCase() === normalized; }) || null;
  }

  /** @returns {Category} 既存に同名があればそれを返す（重複作成防止） */
  function getOrCreate(name) {
    var trimmed = name.trim();
    if (!trimmed) return null;
    var existing = findByName(trimmed);
    if (existing) return existing;
    var category = App.Db.categoriesRepo.createCategory(trimmed);
    store.setState({ categories: getAll().concat([category]) });
    App.Db.categoriesRepo.saveCategory(category).catch(function (err) {
      console.error('カテゴリの保存に失敗しました', err);
    });
    return category;
  }

  function rename(id, name) {
    var category = getById(id);
    if (!category) return Promise.resolve();
    var updated = Object.assign({}, category, { name: name.trim(), updatedAt: Date.now() });
    store.setState({ categories: getAll().map(function (c) { return c.id === id ? updated : c; }) });
    return App.Db.categoriesRepo.saveCategory(updated);
  }

  /** @returns {number} このカテゴリを使用中のメモ件数（ゴミ箱を除く） */
  function usageCount(id) {
    return App.Store.notesStore.getAll().filter(function (n) {
      return n.deletedAt === null && n.categoryIds.indexOf(id) !== -1;
    }).length;
  }

  function remove(id) {
    store.setState({ categories: getAll().filter(function (c) { return c.id !== id; }) });
    return App.Store.notesStore.removeCategoryFromAllNotes(id).then(function () {
      return App.Db.categoriesRepo.deleteCategory(id);
    });
  }

  /** @param {Category[]} categories クラウド同期でのマージ結果を丸ごと反映する */
  function replaceAll(categories) {
    store.setState({ categories: categories });
    if (categories.length > 0) App.Db.bulkPut(App.Db.STORES.categories, categories);
  }

  App.Store.categoriesStore = {
    init: init,
    subscribe: store.subscribe,
    getAll: getAll,
    getById: getById,
    findByName: findByName,
    getOrCreate: getOrCreate,
    rename: rename,
    usageCount: usageCount,
    remove: remove,
    replaceAll: replaceAll
  };
})(window.MemoApp = window.MemoApp || {});
