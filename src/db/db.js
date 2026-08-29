/*
 役割: IndexedDBのオープン・スキーマ定義（マイグレーション）・Promiseベースの薄いラッパー。
 依存: なし
 スキーマ変更時はDB_VERSIONを上げ、onupgradeneededに分岐を追加する（Prismaのmigrationに相当）。
*/
(function (App) {
  'use strict';
  App.Db = App.Db || {};

  var DB_NAME = 'memoAppDB';
  var DB_VERSION = 1;

  var STORES = {
    notes: 'notes',
    categories: 'categories',
    noteTypes: 'noteTypes',
    noteHistory: 'noteHistory',
    savedViews: 'savedViews'
  };

  /** @type {Promise<IDBDatabase>|null} */
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = function (event) {
        var db = req.result;

        if (event.oldVersion < 1) {
          // note: 絞り込み・並び替え・検索は起動時に全件メモリへ読み込んだ配列に対して行うため
          // （1万件規模でも配列操作で十分高速。詳細はnotesStore.jsを参照）、
          // notesストア自体にはIDでの取得以外のインデックスを持たせていない。
          db.createObjectStore(STORES.notes, { keyPath: 'id' });
          db.createObjectStore(STORES.categories, { keyPath: 'id' });
          db.createObjectStore(STORES.noteTypes, { keyPath: 'id' });

          var history = db.createObjectStore(STORES.noteHistory, { keyPath: 'id' });
          history.createIndex('noteId', 'noteId');

          db.createObjectStore(STORES.savedViews, { keyPath: 'id' });
        }
      };

      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error || new Error('IndexedDBを開けませんでした'));
      };
      req.onblocked = function () {
        reject(new Error('IndexedDBが他のタブでブロックされています'));
      };
    });
    return dbPromise;
  }

  /**
   * @param {string} storeName
   * @param {'readonly'|'readwrite'} mode
   * @param {(store: IDBObjectStore) => IDBRequest} fn
   */
  function withStore(storeName, mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(storeName, mode);
        var store = tx.objectStore(storeName);
        var req = fn(store);
        tx.oncomplete = function () {
          resolve(req ? req.result : undefined);
        };
        tx.onerror = function () {
          reject(tx.error || new Error('DB操作に失敗しました'));
        };
        tx.onabort = function () {
          reject(tx.error || new Error('DB操作が中断されました'));
        };
      });
    });
  }

  function getAll(storeName) {
    return withStore(storeName, 'readonly', function (store) {
      return store.getAll();
    });
  }

  function get(storeName, id) {
    return withStore(storeName, 'readonly', function (store) {
      return store.get(id);
    });
  }

  function put(storeName, value) {
    return withStore(storeName, 'readwrite', function (store) {
      return store.put(value);
    });
  }

  function bulkPut(storeName, values) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(storeName, 'readwrite');
        var store = tx.objectStore(storeName);
        values.forEach(function (v) {
          store.put(v);
        });
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function remove(storeName, id) {
    return withStore(storeName, 'readwrite', function (store) {
      return store.delete(id);
    });
  }

  function getByIndex(storeName, indexName, value) {
    return withStore(storeName, 'readonly', function (store) {
      return store.index(indexName).getAll(value);
    });
  }

  App.Db.STORES = STORES;
  App.Db.openDb = openDb;
  App.Db.getAll = getAll;
  App.Db.get = get;
  App.Db.put = put;
  App.Db.bulkPut = bulkPut;
  App.Db.remove = remove;
  App.Db.getByIndex = getByIndex;
})(window.MemoApp = window.MemoApp || {});
