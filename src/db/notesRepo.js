/*
 役割: Noteの永続化（IndexedDB）。生成・更新のロジックはここに集約する。
 依存: db/db.js, logic/id.js
*/
(function (App) {
  'use strict';
  App.Db = App.Db || {};

  var STORE = App.Db.STORES ? App.Db.STORES.notes : 'notes';

  // Tiptapの空文書のJSON文字列。richtext/tiptapEditor.jsのemptyDocJSON()と同じ構造だが、
  // db層はUIのリッチテキスト実装に依存させたくないためここでは定数として直接持つ
  // （両者は意図的に単純・安定した構造にしてあり、ズレるリスクは低い）。
  var EMPTY_JSON_CONTENT = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });

  /** @returns {Note} 新規メモは最初からリッチテキスト形式(contentFormat:'json')で作成する。
   *  既存のプレーン形式メモ（contentFormat未設定）はこの関数を経由しないため影響を受けない。 */
  function createEmptyNote(partial) {
    var now = Date.now();
    return Object.assign({
      id: App.Logic.id.generateId(),
      title: '',
      content: EMPTY_JSON_CONTENT,
      contentFormat: 'json',
      plainText: '',
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
