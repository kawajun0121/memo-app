/*
 役割: 日時のフォーマット・相対時刻表示・当日判定など。
 依存: なし
*/
(function (App) {
  'use strict';
  App.Logic = App.Logic || {};

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatDateTimeJP(epochMs) {
    if (!epochMs) return '';
    var d = new Date(epochMs);
    return d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + ' ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function formatDateJP(epochMs) {
    if (!epochMs) return '';
    var d = new Date(epochMs);
    return d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate());
  }

  function isSameDay(a, b) {
    var da = new Date(a);
    var db_ = new Date(b);
    return da.getFullYear() === db_.getFullYear() && da.getMonth() === db_.getMonth() && da.getDate() === db_.getDate();
  }

  function isToday(epochMs) {
    if (!epochMs) return false;
    return isSameDay(epochMs, Date.now());
  }

  /** @returns {string} 「たった今」「5分前」「3時間前」「2024/03/05」等 */
  function formatRelative(epochMs) {
    if (!epochMs) return '';
    var diffMs = Date.now() - epochMs;
    var diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'たった今';
    if (diffMin < 60) return diffMin + '分前';
    var diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24 && isToday(epochMs)) return diffHour + '時間前';
    var diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return diffDay + '日前';
    return formatDateJP(epochMs);
  }

  App.Logic.dateUtils = {
    formatDateTimeJP: formatDateTimeJP,
    formatDateJP: formatDateJP,
    isSameDay: isSameDay,
    isToday: isToday,
    formatRelative: formatRelative
  };
})(window.MemoApp = window.MemoApp || {});
