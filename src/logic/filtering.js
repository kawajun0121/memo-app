/*
 役割: メモ一覧に対する絞り込み（AND条件）の適用。純粋関数のみでUIに依存しない。
 依存: types/typedefs.js
*/
(function (App) {
  'use strict';
  App.Logic = App.Logic || {};

  /** @returns {FilterConditions} 何も絞り込まない初期値 */
  function emptyFilter() {
    return {
      keyword: '',
      categoryIds: [],
      typeId: null,
      isFavorite: null,
      isPinned: null,
      unclassifiedOnly: null,
      needsOrganizingOnly: null,
      archiveState: 'active',
      createdRange: { from: null, to: null },
      updatedRange: { from: null, to: null }
    };
  }

  /** @param {Note} note @returns {string} 検索対象の本文テキスト。新形式(json)はcontent自体がJSON文字列
   *  （生のHTML/JSONを検索対象にしないため）なので、保存時に導出済みのplainTextを使う。
   *  旧プレーン形式はcontentがそのままプレーンテキストなのでそれを使う（後方互換）。 */
  function searchableContent(note) {
    return note.contentFormat === 'json' ? (note.plainText || '') : (note.content || '');
  }

  function matchesKeyword(note, keyword, categoryNameById, typeNameById) {
    if (!keyword) return true;
    var q = keyword.toLowerCase();
    if (note.title.toLowerCase().indexOf(q) !== -1) return true;
    if (searchableContent(note).toLowerCase().indexOf(q) !== -1) return true;
    for (var i = 0; i < note.categoryIds.length; i++) {
      var name = categoryNameById[note.categoryIds[i]];
      if (name && name.toLowerCase().indexOf(q) !== -1) return true;
    }
    if (note.typeId) {
      var typeName = typeNameById[note.typeId];
      if (typeName && typeName.toLowerCase().indexOf(q) !== -1) return true;
    }
    return false;
  }

  function inRange(value, range) {
    if (!range) return true;
    if (range.from && value < range.from) return false;
    if (range.to && value > range.to) return false;
    return true;
  }

  /**
   * @param {Note[]} notes - deletedAtがnullのメモのみを渡すこと（ゴミ箱は別画面で扱う）
   * @param {FilterConditions} filter
   * @param {{categoryNameById: Object, typeNameById: Object}} lookups
   */
  function applyFilters(notes, filter, lookups) {
    var categoryNameById = lookups.categoryNameById || {};
    var typeNameById = lookups.typeNameById || {};

    return notes.filter(function (note) {
      if (filter.archiveState === 'active' && note.isArchived) return false;
      if (filter.archiveState === 'archived' && !note.isArchived) return false;

      if (filter.unclassifiedOnly && note.categoryIds.length > 0) return false;
      if (filter.needsOrganizingOnly && !note.needsOrganizing) return false;
      if (filter.isFavorite && !note.isFavorite) return false;
      if (filter.isPinned && !note.isPinned) return false;

      if (filter.typeId && note.typeId !== filter.typeId) return false;

      if (filter.categoryIds && filter.categoryIds.length > 0) {
        for (var i = 0; i < filter.categoryIds.length; i++) {
          if (note.categoryIds.indexOf(filter.categoryIds[i]) === -1) return false;
        }
      }

      if (!inRange(note.createdAt, filter.createdRange)) return false;
      if (!inRange(note.updatedAt, filter.updatedRange)) return false;

      if (!matchesKeyword(note, filter.keyword, categoryNameById, typeNameById)) return false;

      return true;
    });
  }

  /** @returns {boolean} 検索条件が何も指定されていない状態か（検索画面の「スマートビューとして保存」ボタンの有効/無効判定用） */
  function isFilterEmpty(filter) {
    return !filter.keyword &&
      filter.categoryIds.length === 0 &&
      !filter.typeId &&
      !filter.isFavorite &&
      !filter.isPinned &&
      !filter.unclassifiedOnly &&
      !filter.needsOrganizingOnly &&
      filter.archiveState === 'active' &&
      !filter.createdRange.from && !filter.createdRange.to &&
      !filter.updatedRange.from && !filter.updatedRange.to;
  }

  App.Logic.filtering = {
    emptyFilter: emptyFilter,
    applyFilters: applyFilters,
    isFilterEmpty: isFilterEmpty
  };
})(window.MemoApp = window.MemoApp || {});
