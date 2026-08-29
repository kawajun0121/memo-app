/*
 役割: 軽量な設定値の永続化（localStorage）。IndexedDBを使うほどではない小さな値（APIキー等）用。
 依存: なし
 【注意】ここに保存するAnthropic APIキーはこの端末のブラウザ内にのみ保存され、コードにもGitにも含まれない。
*/
(function (App) {
  'use strict';
  App.Db = App.Db || {};

  var KEYS = {
    anthropicApiKey: 'memoApp.anthropicApiKey',
    pinnedFirst: 'memoApp.pinnedFirst',
    sortCondition: 'memoApp.sortCondition'
  };

  function getAnthropicApiKey() {
    return localStorage.getItem(KEYS.anthropicApiKey) || '';
  }

  function setAnthropicApiKey(key) {
    if (key) {
      localStorage.setItem(KEYS.anthropicApiKey, key);
    } else {
      localStorage.removeItem(KEYS.anthropicApiKey);
    }
  }

  function getPinnedFirst() {
    var v = localStorage.getItem(KEYS.pinnedFirst);
    return v === null ? true : v === 'true';
  }

  function setPinnedFirst(value) {
    localStorage.setItem(KEYS.pinnedFirst, value ? 'true' : 'false');
  }

  /** @returns {SortCondition|null} */
  function getSortCondition() {
    var raw = localStorage.getItem(KEYS.sortCondition);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  /** @param {SortCondition} cond */
  function setSortCondition(cond) {
    localStorage.setItem(KEYS.sortCondition, JSON.stringify(cond));
  }

  App.Db.settingsRepo = {
    getAnthropicApiKey: getAnthropicApiKey,
    setAnthropicApiKey: setAnthropicApiKey,
    getPinnedFirst: getPinnedFirst,
    setPinnedFirst: setPinnedFirst,
    getSortCondition: getSortCondition,
    setSortCondition: setSortCondition
  };
})(window.MemoApp = window.MemoApp || {});
