/*
 役割: メモの「種類」のメモリキャッシュと永続化。
 依存: store/state.js, db/typesRepo.js, store/notesStore.js
*/
(function (App) {
  'use strict';
  App.Store = App.Store || {};

  var store = App.Store.createStore({ types: [], loaded: false });

  function init() {
    return App.Db.typesRepo.getAllTypes().then(function (types) {
      store.setState({ types: types, loaded: true });
      return types;
    });
  }

  function getAll() {
    return store.getState().types;
  }

  function getById(id) {
    return getAll().find(function (t) { return t.id === id; }) || null;
  }

  function findByName(name) {
    var normalized = name.trim().toLowerCase();
    return getAll().find(function (t) { return t.name.trim().toLowerCase() === normalized; }) || null;
  }

  function create(name) {
    var trimmed = name.trim();
    if (!trimmed) return null;
    var type = App.Db.typesRepo.createType(trimmed);
    store.setState({ types: getAll().concat([type]) });
    App.Db.typesRepo.saveType(type).catch(function (err) {
      console.error('種類の保存に失敗しました', err);
    });
    return type;
  }

  /** @returns {NoteType} 既存に同名があればそれを返す（重複作成防止） */
  function getOrCreate(name) {
    var trimmed = name.trim();
    if (!trimmed) return null;
    return findByName(trimmed) || create(trimmed);
  }

  function rename(id, name) {
    var type = getById(id);
    if (!type) return Promise.resolve();
    var updated = Object.assign({}, type, { name: name.trim(), updatedAt: Date.now() });
    store.setState({ types: getAll().map(function (t) { return t.id === id ? updated : t; }) });
    return App.Db.typesRepo.saveType(updated);
  }

  /** @param {NoteType[]} types クラウド同期でのマージ結果を丸ごと反映する */
  function replaceAll(types) {
    store.setState({ types: types });
    if (types.length > 0) App.Db.bulkPut(App.Db.STORES.noteTypes, types);
  }

  function usageCount(id) {
    return App.Store.notesStore.getAll().filter(function (n) {
      return n.deletedAt === null && n.typeId === id;
    }).length;
  }

  function remove(id) {
    store.setState({ types: getAll().filter(function (t) { return t.id !== id; }) });
    return App.Store.notesStore.clearTypeFromAllNotes(id).then(function () {
      return App.Db.typesRepo.deleteType(id);
    });
  }

  App.Store.typesStore = {
    init: init,
    subscribe: store.subscribe,
    getAll: getAll,
    getById: getById,
    findByName: findByName,
    create: create,
    getOrCreate: getOrCreate,
    rename: rename,
    usageCount: usageCount,
    remove: remove,
    replaceAll: replaceAll
  };
})(window.MemoApp = window.MemoApp || {});
