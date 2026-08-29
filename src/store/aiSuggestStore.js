/*
 役割: AIカテゴリ提案パネルの一時的なUI状態（読み込み中・結果・エラー）。
 依存: store/state.js, ai/aiSuggest.js, store/categoriesStore.js
*/
(function (App) {
  'use strict';
  App.Store = App.Store || {};

  var store = App.Store.createStore({ noteId: null, status: 'idle', result: null, errorMessage: '' });

  function requestFor(note) {
    var existingNames = App.Store.categoriesStore.getAll().map(function (c) { return c.name; });
    store.setState({ noteId: note.id, status: 'loading', result: null, errorMessage: '' });
    App.Ai.aiSuggest.suggestCategories(note, existingNames).then(function (result) {
      if (store.getState().noteId !== note.id) return;
      store.setState({ status: 'success', result: result });
    }).catch(function (err) {
      if (store.getState().noteId !== note.id) return;
      var message = 'AI提案の取得に失敗しました';
      if (err && err.message === 'NO_API_KEY') message = 'AI機能を使うには設定画面でAnthropic APIキーを登録してください';
      if (err && err.message === 'EMPTY_NOTE') message = 'メモの内容が空のため提案できません';
      store.setState({ status: 'error', result: null, errorMessage: message });
    });
  }

  function clear() {
    store.setState({ noteId: null, status: 'idle', result: null, errorMessage: '' });
  }

  App.Store.aiSuggestStore = {
    subscribe: store.subscribe,
    getState: store.getState,
    requestFor: requestFor,
    clear: clear
  };
})(window.MemoApp = window.MemoApp || {});
