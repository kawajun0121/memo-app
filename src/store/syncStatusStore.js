/*
 役割: クラウド同期の状態（保存中/端末内保存済み/同期待ち/同期中/同期完了/同期エラー/オフライン）を
       一元管理する。実際の同期処理自体はsync/cloudSync.jsが行い、進捗をここへ書き込むだけ。
 依存: store/state.js
*/
(function (App) {
  'use strict';
  App.Store = App.Store || {};

  // 'idle'（同期未使用）| 'offline' | 'syncing' | 'synced' | 'error'
  var store = App.Store.createStore({
    status: 'idle',
    isOnline: (typeof navigator === 'undefined' || navigator.onLine !== false)
  });

  function setStatus(status) {
    store.setState({ status: status });
  }

  function setOnline(isOnline) {
    store.setState({ isOnline: isOnline });
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', function () { setOnline(true); });
    window.addEventListener('offline', function () { setOnline(false); });
  }

  App.Store.syncStatusStore = {
    subscribe: store.subscribe,
    getState: store.getState,
    setStatus: setStatus,
    setOnline: setOnline
  };
})(window.MemoApp = window.MemoApp || {});
