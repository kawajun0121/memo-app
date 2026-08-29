/*
 役割: Firestoreとローカル(IndexedDB)の間でメモ/カテゴリ/種類/スマートビューを同期する。
 依存: src/sync/firebaseInit.js, store/notesStore.js, store/categoriesStore.js,
      store/typesStore.js, store/savedViewsStore.js

 【同期の考え方】
 - 各コレクションごとに、Firestore上の1つのドキュメント（users/{uid}/data/{ドキュメント名}）に
   配列をまるごと保存する（1件=1ドキュメントにはしない）。個人TODOアプリと同じFirestore
   セキュリティルール（users/{uid}/data/{document}）にそのまま収まるよう、ドキュメント名は
   衝突しないよう "memo_" を付けている。
 - ローカルが変化したら、そのままFirestoreへ書き込む（各storeのsubscribeで変化を検知する）。
 - Firestoreが変化したら（＝別端末での変更）、ローカルの内容とid単位でマージしてから反映する。
   マージ規則:「同じidが両方にあれば更新日時が新しい方を採用。片方にしかなければそのまま残す」。
 - 編集履歴（noteHistory）は同期対象外（端末ごとにローカルのみで保持・自動間引き）。

 【既知の制限】この方式は「削除」を他端末へ伝えにくい（同じidが無いと単に「両方にしかない
 ものは残す」規則が働くため、完全削除した項目が復活することがある。アーカイブ・ゴミ箱への移動は
 deletedAt/isArchivedというメモ自体のフィールド変更として同期されるため問題ない）。
 また両端末でほぼ同時に同じ項目を編集した場合は、更新日時が新しい方で上書きされる。
 個人の1〜2台での利用を想定した簡易な同期のため、この制限は許容している。
*/
(function (App) {
  'use strict';
  App.Sync = App.Sync || {};

  var COLLECTIONS = [
    { name: 'memo_notes', timeField: 'updatedAt', store: function () { return App.Store.notesStore; } },
    { name: 'memo_categories', timeField: 'updatedAt', store: function () { return App.Store.categoriesStore; } },
    { name: 'memo_types', timeField: 'updatedAt', store: function () { return App.Store.typesStore; } },
    { name: 'memo_savedViews', timeField: 'updatedAt', store: function () { return App.Store.savedViewsStore; } }
  ];

  var unsubscribeFns = [];

  function mergeById(localItems, remoteItems, timeField) {
    var map = {};
    localItems.forEach(function (item) { map[item.id] = item; });
    remoteItems.forEach(function (remoteItem) {
      var localItem = map[remoteItem.id];
      if (!localItem || (remoteItem[timeField] || 0) >= (localItem[timeField] || 0)) {
        map[remoteItem.id] = remoteItem;
      }
    });
    return Object.keys(map).map(function (id) { return map[id]; });
  }

  function sameItems(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function start(onFirstSyncComplete) {
    stop(); // 二重起動防止（呼び出し前に必ず一度リセットする）

    var user = App.Sync.auth.currentUser;
    if (!user) return;
    var uid = user.uid;

    var pendingFirst = COLLECTIONS.length;
    var firstDone = false;

    function handleFirstSyncTick() {
      pendingFirst--;
      if (pendingFirst > 0 || firstDone) return;
      firstDone = true;
      if (typeof onFirstSyncComplete === 'function') onFirstSyncComplete();
    }

    COLLECTIONS.forEach(function (col) {
      var store = col.store();
      var docRef = App.Sync.db.collection('users').doc(uid).collection('data').doc(col.name);
      var applyingRemote = false;
      var gotFirstSnapshot = false;

      var unsubSnapshot = docRef.onSnapshot(function (snap) {
        var data = snap.data();
        var remoteItems = (data && data.items) || [];
        var localItems = store.getAll();
        var merged = mergeById(localItems, remoteItems, col.timeField);

        if (!sameItems(merged, localItems)) {
          applyingRemote = true;
          store.replaceAll(merged);
          applyingRemote = false;
        }
        if (!sameItems(merged, remoteItems)) {
          docRef.set({ items: merged });
        }

        if (!gotFirstSnapshot) {
          gotFirstSnapshot = true;
          handleFirstSyncTick();
        }
      }, function (err) {
        console.warn('同期エラー(' + col.name + ')', err);
        if (!gotFirstSnapshot) {
          gotFirstSnapshot = true;
          handleFirstSyncTick();
        }
      });

      var unsubLocal = store.subscribe(function () {
        if (applyingRemote) return;
        docRef.set({ items: store.getAll() });
      });

      unsubscribeFns.push(unsubSnapshot, unsubLocal);
    });
  }

  function stop() {
    unsubscribeFns.forEach(function (fn) {
      try { fn(); } catch (e) { /* 無視 */ }
    });
    unsubscribeFns = [];
  }

  App.Sync.cloudSync = { start: start, stop: stop };
})(window.MemoApp = window.MemoApp || {});
