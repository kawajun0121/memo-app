/*
 役割: メモのメモリ上キャッシュと永続化の橋渡し。フィルタ・検索・並び替えは常にこのstoreが
       保持する全件配列に対してlogic/*の純粋関数を適用して行う（1万件規模でも配列操作で十分高速なため、
       IndexedDBの複合インデックスによる絞り込みは採用しない）。
 依存: store/state.js, db/notesRepo.js, db/historyRepo.js, logic/historyPolicy.js, logic/id.js
*/
(function (App) {
  'use strict';
  App.Store = App.Store || {};

  var store = App.Store.createStore({ notes: [], loaded: false });
  var lastHistoryAtByNoteId = {};

  function init() {
    return App.Db.notesRepo.getAllNotes().then(function (notes) {
      store.setState({ notes: notes, loaded: true });
      return notes;
    });
  }

  function getAll() {
    return store.getState().notes;
  }

  /** 削除済み(deletedAt!=null)を除いた全メモ */
  function getAllActive() {
    return getAll().filter(function (n) { return n.deletedAt === null; });
  }

  function getTrashed() {
    return getAll().filter(function (n) { return n.deletedAt !== null; });
  }

  function getById(id) {
    return getAll().find(function (n) { return n.id === id; }) || null;
  }

  /** @param {Note[]} notes クラウド同期でのマージ結果を丸ごと反映する */
  function replaceAll(notes) {
    store.setState({ notes: notes });
    if (notes.length > 0) App.Db.bulkPut(App.Db.STORES.notes, notes);
  }

  function replaceInState(note) {
    var notes = getAll().map(function (n) { return n.id === note.id ? note : n; });
    store.setState({ notes: notes });
  }

  /** @param {Partial<Note>} partial @returns {Note} */
  function create(partial) {
    var note = App.Db.notesRepo.createEmptyNote(partial);
    store.setState({ notes: [note].concat(getAll()) });
    App.Db.notesRepo.saveNote(note).catch(function (err) {
      console.error('メモの保存に失敗しました', err);
    });
    return note;
  }

  /**
   * @param {string} id
   * @param {Partial<Note>} patch
   * @returns {Promise<Note>}
   */
  function update(id, patch) {
    var previous = getById(id);
    if (!previous) return Promise.reject(new Error('メモが見つかりません: ' + id));

    var next = Object.assign({}, previous, patch, { updatedAt: Date.now() });
    replaceInState(next);

    var historyPromise = Promise.resolve();
    if (App.Logic.historyPolicy.shouldSnapshot(previous, next, lastHistoryAtByNoteId[id])) {
      historyPromise = App.Db.historyRepo.snapshot(previous).then(function () {
        lastHistoryAtByNoteId[id] = Date.now();
      }).catch(function (err) {
        console.error('編集履歴の保存に失敗しました', err);
      });
    }

    return historyPromise.then(function () {
      return App.Db.notesRepo.saveNote(next);
    }).then(function () {
      return next;
    }).catch(function (err) {
      console.error('メモの保存に失敗しました', err);
      throw err;
    });
  }

  /**
   * 複数メモへ変更を一度に適用する（一括操作用）。1件ずつupdate()するとメモ件数分の
   * 再描画・DB書き込みが発生し大量選択時に重くなるため、状態更新とDB書き込みをそれぞれ1回にまとめる。
   * @param {string[]} ids
   * @param {Partial<Note>|((note: Note) => Partial<Note>)} patchOrFn - メモごとに異なる変更をしたい場合は関数を渡す
   */
  function bulkUpdate(ids, patchOrFn) {
    var now = Date.now();
    var nextById = {};
    var historySnapshots = [];
    var isFn = typeof patchOrFn === 'function';

    ids.forEach(function (id) {
      var previous = getById(id);
      if (!previous) return;
      var patch = isFn ? patchOrFn(previous) : patchOrFn;
      if (!patch || Object.keys(patch).length === 0) return; // 変更なしのメモは更新日時も含めて触らない
      var next = Object.assign({}, previous, patch, { updatedAt: now });
      nextById[id] = next;
      if (App.Logic.historyPolicy.shouldSnapshot(previous, next, lastHistoryAtByNoteId[id])) {
        historySnapshots.push(previous);
        lastHistoryAtByNoteId[id] = now;
      }
    });

    store.setState({ notes: getAll().map(function (n) { return nextById[n.id] || n; }) });

    var historyPromise = historySnapshots.length === 0 ? Promise.resolve() :
      Promise.all(historySnapshots.map(function (n) { return App.Db.historyRepo.snapshot(n); })).catch(function (err) {
        console.error('編集履歴の保存に失敗しました', err);
      });

    return historyPromise.then(function () {
      return App.Db.bulkPut(App.Db.STORES.notes, Object.keys(nextById).map(function (id) { return nextById[id]; }));
    }).catch(function (err) {
      console.error('メモの一括保存に失敗しました', err);
      throw err;
    });
  }

  function softDelete(id) {
    return update(id, { deletedAt: Date.now(), isPinned: false });
  }

  function restore(id) {
    return update(id, { deletedAt: null });
  }

  function permanentDelete(id) {
    return bulkPermanentDelete([id]);
  }

  function bulkSoftDelete(ids) {
    return bulkUpdate(ids, { deletedAt: Date.now(), isPinned: false });
  }

  function bulkRestore(ids) {
    return bulkUpdate(ids, { deletedAt: null });
  }

  function bulkPermanentDelete(ids) {
    var idSet = {};
    ids.forEach(function (id) { idSet[id] = true; });
    store.setState({ notes: getAll().filter(function (n) { return !idSet[n.id]; }) });
    ids.forEach(function (id) { delete lastHistoryAtByNoteId[id]; });
    return Promise.all(ids.map(function (id) {
      return Promise.all([App.Db.notesRepo.deleteNoteForever(id), App.Db.historyRepo.deleteHistoryForNote(id)]);
    }));
  }

  /** @param {string} categoryId 削除されたカテゴリをすべてのメモから外す（メモ自体は削除しない） */
  function removeCategoryFromAllNotes(categoryId) {
    var affectedIds = getAll().filter(function (n) { return n.categoryIds.indexOf(categoryId) !== -1; }).map(function (n) { return n.id; });
    if (affectedIds.length === 0) return Promise.resolve();
    return bulkUpdate(affectedIds, function (note) {
      return { categoryIds: note.categoryIds.filter(function (c) { return c !== categoryId; }) };
    });
  }

  /** @param {string} typeId 削除された種類をすべてのメモから外す */
  function clearTypeFromAllNotes(typeId) {
    var affectedIds = getAll().filter(function (n) { return n.typeId === typeId; }).map(function (n) { return n.id; });
    if (affectedIds.length === 0) return Promise.resolve();
    return bulkUpdate(affectedIds, { typeId: null });
  }

  App.Store.notesStore = {
    init: init,
    subscribe: store.subscribe,
    getAll: getAll,
    getAllActive: getAllActive,
    getTrashed: getTrashed,
    getById: getById,
    replaceAll: replaceAll,
    create: create,
    update: update,
    bulkUpdate: bulkUpdate,
    softDelete: softDelete,
    restore: restore,
    permanentDelete: permanentDelete,
    bulkSoftDelete: bulkSoftDelete,
    bulkRestore: bulkRestore,
    bulkPermanentDelete: bulkPermanentDelete,
    removeCategoryFromAllNotes: removeCategoryFromAllNotes,
    clearTypeFromAllNotes: clearTypeFromAllNotes
  };
})(window.MemoApp = window.MemoApp || {});
