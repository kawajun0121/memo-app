/*
 役割: 汎用debounce。自動保存などで使用。cancel/flushに対応（即時フラッシュしたい場面向け）。
 依存: なし
*/
(function (App) {
  'use strict';
  App.Logic = App.Logic || {};

  /**
   * @param {Function} fn
   * @param {number} waitMs
   */
  function debounce(fn, waitMs) {
    var timer = null;
    var pendingArgs = null;

    function invoke() {
      var args = pendingArgs;
      pendingArgs = null;
      timer = null;
      fn.apply(null, args || []);
    }

    function debounced() {
      pendingArgs = Array.prototype.slice.call(arguments);
      if (timer) clearTimeout(timer);
      timer = setTimeout(invoke, waitMs);
    }

    debounced.cancel = function () {
      if (timer) clearTimeout(timer);
      timer = null;
      pendingArgs = null;
    };

    debounced.flush = function () {
      if (timer) {
        clearTimeout(timer);
        invoke();
      }
    };

    debounced.isPending = function () {
      return timer !== null;
    };

    return debounced;
  }

  App.Logic.debounce = debounce;
})(window.MemoApp = window.MemoApp || {});
