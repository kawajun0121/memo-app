/*
 役割: Noteの永続化（IndexedDB）。生成・更新のロジックはここに集約する。
 依存: db/db.js, logic/id.js
*/
(function (App) {
  'use strict';
  App.Db = App.Db || {};

  var STORE = App.Db.STORES ? App.Db.STORES.notes : 'notes';

  /** @returns {Note} */
  function createEmptyNote(partial) {
    var now = Date.now();
    return Object.assign({
      id: App.Logic.id.generateId(),
      title: '',
      content: '',
      categoryIds: [],
      typeId: null,
      isFavorite: false,
      isPinned: false,
      needsOrganizing: false,
      isArchived: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    }, partial || {});
  }

  function getAllNotes() {
    return App.Db.getAll(STORE);
  }

  function saveNote(note) {
    return App.Db.put(STORE, note);
  }

  function deleteNoteForever(id) {
    return App.Db.remove(STORE, id);
  }

  App.Db.notesRepo = {
    createEmptyNote: createEmptyNote,
    getAllNotes: getAllNotes,
    saveNote: saveNote,
    deleteNoteForever: deleteNoteForever
  };
})(window.MemoApp = window.MemoApp || {});
