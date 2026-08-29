/*
 役割: いつ編集履歴のスナップショットを取るかを判定するポリシー。
       毎回の自動保存ごとに1件作ると無制限に増殖するため、
       「一定時間が経過した」または「内容が大きく変わった」場合のみ保存前の状態を1件残す。
 依存: なし
*/
(function (App) {
  'use strict';
  App.Logic = App.Logic || {};

  var MIN_INTERVAL_MS = 10 * 60 * 1000; // 10分
  var SIGNIFICANT_LENGTH_DELTA = 80; // 文字数

  function sameArray(a, b) {
    if (a.length !== b.length) return false;
    var sa = a.slice().sort();
    var sb = b.slice().sort();
    return sa.every(function (v, i) { return v === sb[i]; });
  }

  /**
   * @param {Note} previousNote - 保存前（DB上の現在値）
   * @param {Note} nextNote - これから保存する内容
   * @param {number|null} lastHistoryAt - 直近の履歴保存日時
   */
  function shouldSnapshot(previousNote, nextNote, lastHistoryAt) {
    if (!previousNote) return false;

    var categoryChanged = !sameArray(previousNote.categoryIds, nextNote.categoryIds);
    var typeChanged = previousNote.typeId !== nextNote.typeId;
    if (categoryChanged || typeChanged) return true;

    if (previousNote.title === nextNote.title && previousNote.content === nextNote.content) return false;
    if (!lastHistoryAt) return true;
    if (Date.now() - lastHistoryAt >= MIN_INTERVAL_MS) return true;
    var lengthDelta = Math.abs(previousNote.content.length - nextNote.content.length);
    return lengthDelta >= SIGNIFICANT_LENGTH_DELTA;
  }

  App.Logic.historyPolicy = {
    MIN_INTERVAL_MS: MIN_INTERVAL_MS,
    shouldSnapshot: shouldSnapshot
  };
})(window.MemoApp = window.MemoApp || {});
