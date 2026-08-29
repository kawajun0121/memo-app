/*
 役割: NoteType（メモの種類）の永続化。
 依存: db/db.js, logic/id.js
*/
(function (App) {
  'use strict';
  App.Db = App.Db || {};
  var STORE = App.Db.STORES ? App.Db.STORES.noteTypes : 'noteTypes';

  function createType(name) {
    var now = Date.now();
    return { id: App.Logic.id.generateId(), name: name, createdAt: now, updatedAt: now };
  }

  function getAllTypes() {
    return App.Db.getAll(STORE);
  }

  function saveType(type) {
    return App.Db.put(STORE, type);
  }

  function deleteType(id) {
    return App.Db.remove(STORE, id);
  }

  App.Db.typesRepo = {
    createType: createType,
    getAllTypes: getAllTypes,
    saveType: saveType,
    deleteType: deleteType
  };
})(window.MemoApp = window.MemoApp || {});
