/*
 役割: Categoryの永続化。
 依存: db/db.js, logic/id.js
*/
(function (App) {
  'use strict';
  App.Db = App.Db || {};
  var STORE = App.Db.STORES ? App.Db.STORES.categories : 'categories';

  function createCategory(name) {
    var now = Date.now();
    return { id: App.Logic.id.generateId(), name: name, createdAt: now, updatedAt: now };
  }

  function getAllCategories() {
    return App.Db.getAll(STORE);
  }

  function saveCategory(category) {
    return App.Db.put(STORE, category);
  }

  function deleteCategory(id) {
    return App.Db.remove(STORE, id);
  }

  App.Db.categoriesRepo = {
    createCategory: createCategory,
    getAllCategories: getAllCategories,
    saveCategory: saveCategory,
    deleteCategory: deleteCategory
  };
})(window.MemoApp = window.MemoApp || {});
