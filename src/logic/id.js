/*
 役割: ID生成。
 依存: なし
*/
(function (App) {
  'use strict';
  App.Logic = App.Logic || {};

  function generateId() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  App.Logic.id = { generateId: generateId };
})(window.MemoApp = window.MemoApp || {});
