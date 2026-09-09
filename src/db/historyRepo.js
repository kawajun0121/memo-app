/*
 役割: メモの編集履歴の永続化。無制限増殖を避けるため、1メモあたりの保持件数に上限を設ける。
 依存: db/db.js, logic/id.js
*/
(function (App) {
  'use strict';
  App.Db = App.Db || {};
  var STORE = App.Db.STORES ? App.Db.STORES.noteHistory : 'noteHistory';

  var MAX_ENTRIES_PER_NOTE = 50;

  /** @param {Note} note */
  function buildEntry(note) {
    return {
      id: App.Logic.id.generateId(),
      noteId: note.id,
      title: note.title,
      content: note.content,
      contentFormat: note.contentFormat,
      plainText: note.plainText,
      categoryIds: note.categoryIds.slice(),
      typeId: note.typeId,
      createdAt: Date.now()
    };
  }

  function getHistoryForNote(noteId) {
    return App.Db.getByIndex(STORE, 'noteId', noteId).then(function (list) {
      return list.sort(function (a, b) {
        return b.createdAt - a.createdAt;
      });
    });
  }

  /** @param {Note} note 変更を適用する直前の状態を1件保存し、上限を超えた古い履歴を削除する */
  function snapshot(note) {
    var entry = buildEntry(note);
    return App.Db.put(STORE, entry).then(function () {
      return getHistoryForNote(note.id);
    }).then(function (all) {
      if (all.length <= MAX_ENTRIES_PER_NOTE) return entry;
      var toRemove = all.slice(MAX_ENTRIES_PER_NOTE);
      return Promise.all(toRemove.map(function (e) {
        return App.Db.remove(STORE, e.id);
      })).then(function () {
        return entry;
      });
    });
  }

  function deleteHistoryForNote(noteId) {
    return getHistoryForNote(noteId).then(function (all) {
      return Promise.all(all.map(function (e) {
        return App.Db.remove(STORE, e.id);
      }));
    });
  }

  App.Db.historyRepo = {
    MAX_ENTRIES_PER_NOTE: MAX_ENTRIES_PER_NOTE,
    getHistoryForNote: getHistoryForNote,
    snapshot: snapshot,
    deleteHistoryForNote: deleteHistoryForNote
  };
})(window.MemoApp = window.MemoApp || {});
