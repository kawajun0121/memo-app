/*
 役割: 編集履歴パネル表示用の一時キャッシュ。ノートごとに開いたタイミングで読み込む
       （全メモ分を常時メモリに保持する必要はないため）。
 依存: store/state.js, db/historyRepo.js
*/
(function (App) {
  'use strict';
  App.Store = App.Store || {};

  var store = App.Store.createStore({ noteId: null, entries: [], loading: false });

  function loadForNote(noteId) {
    store.setState({ noteId: noteId, entries: [], loading: true });
    return App.Db.historyRepo.getHistoryForNote(noteId).then(function (entries) {
      if (store.getState().noteId === noteId) {
        store.setState({ entries: entries, loading: false });
      }
      return entries;
    });
  }

  function clear() {
    store.setState({ noteId: null, entries: [], loading: false });
  }

  App.Store.historyStore = {
    subscribe: store.subscribe,
    getState: store.getState,
    loadForNote: loadForNote,
    clear: clear
  };
})(window.MemoApp = window.MemoApp || {});
