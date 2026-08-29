/*
 役割: メモ一覧の並び替え。
 依存: なし
*/
(function (App) {
  'use strict';
  App.Logic = App.Logic || {};

  /** @returns {SortCondition} */
  function defaultSort() {
    return { field: 'updatedAt', direction: 'desc', pinnedFirst: true };
  }

  function compareByField(a, b, field, direction) {
    var result = 0;
    if (field === 'title') {
      result = a.title.localeCompare(b.title, 'ja');
    } else {
      result = a[field] - b[field];
    }
    return direction === 'asc' ? result : -result;
  }

  /**
   * @param {Note[]} notes
   * @param {SortCondition} sortCondition
   */
  function applySort(notes, sortCondition) {
    var sorted = notes.slice().sort(function (a, b) {
      return compareByField(a, b, sortCondition.field, sortCondition.direction);
    });
    if (sortCondition.pinnedFirst) {
      var pinned = sorted.filter(function (n) { return n.isPinned; });
      var rest = sorted.filter(function (n) { return !n.isPinned; });
      return pinned.concat(rest);
    }
    return sorted;
  }

  App.Logic.sorting = {
    defaultSort: defaultSort,
    applySort: applySort
  };
})(window.MemoApp = window.MemoApp || {});
