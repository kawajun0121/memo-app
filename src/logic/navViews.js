/*
 役割: 左カラムの「基本メニュー」と「標準スマートビュー」の定義（コード側に固定、DB非保存）。
       ユーザーが保存するスマートビュー（db/savedViewsRepo.js）とは別管理にするための土台。
 依存: logic/filtering.js, logic/sorting.js

 【設計メモ】
 仕様書のセクション2「基本メニュー」とセクション15「標準スマートビュー」は項目がほぼ重複していたため
 (最近作成/最近更新/未分類/あとで整理/お気に入り/ピン留め)、ナビゲーションが二重表示でごちゃつかないよう、
 基本メニューをそのまま採用し、標準スマートビューは基本メニューに無い「今日作成」のみを
 スマートビューセクションの先頭に配置する形に統合した。
*/
(function (App) {
  'use strict';
  App.Logic = App.Logic || {};

  function baseFilter(overrides) {
    return Object.assign(App.Logic.filtering.emptyFilter(), overrides || {});
  }

  var DEFAULT_SORT = App.Logic.sorting.defaultSort();

  /** @type {{id: string, label: string, icon: string, filter: FilterConditions, sort: SortCondition}[]} */
  var BASIC_MENU = [
    { id: 'all', label: 'すべてのメモ', icon: '📄', filter: baseFilter({}), sort: DEFAULT_SORT },
    { id: 'unclassified', label: '未分類', icon: '📥', filter: baseFilter({ unclassifiedOnly: true }), sort: DEFAULT_SORT },
    { id: 'needsOrganizing', label: 'あとで整理', icon: '🗂', filter: baseFilter({ needsOrganizingOnly: true }), sort: DEFAULT_SORT },
    { id: 'favorite', label: 'お気に入り', icon: '⭐', filter: baseFilter({ isFavorite: true }), sort: DEFAULT_SORT },
    { id: 'pinned', label: 'ピン留め', icon: '📌', filter: baseFilter({ isPinned: true }), sort: DEFAULT_SORT },
    { id: 'recentCreated', label: '最近作成', icon: '🆕', filter: baseFilter({}), sort: { field: 'createdAt', direction: 'desc', pinnedFirst: false } },
    { id: 'recentUpdated', label: '最近更新', icon: '🕒', filter: baseFilter({}), sort: { field: 'updatedAt', direction: 'desc', pinnedFirst: false } },
    { id: 'archived', label: 'アーカイブ', icon: '📦', filter: baseFilter({ archiveState: 'archived' }), sort: DEFAULT_SORT },
    { id: 'trash', label: 'ゴミ箱', icon: '🗑', filter: null, sort: DEFAULT_SORT, isTrash: true }
  ];

  function isTodayRangeFilter() {
    var startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return baseFilter({ createdRange: { from: startOfDay.getTime(), to: null } });
  }

  /** @type {{id: string, label: string, filter: FilterConditions, sort: SortCondition}[]} */
  var STANDARD_SMART_VIEWS = [
    { id: 'smart:todayCreated', label: '今日作成', filter: isTodayRangeFilter(), sort: DEFAULT_SORT }
  ];

  App.Logic.navViews = {
    BASIC_MENU: BASIC_MENU,
    STANDARD_SMART_VIEWS: STANDARD_SMART_VIEWS
  };
})(window.MemoApp = window.MemoApp || {});
