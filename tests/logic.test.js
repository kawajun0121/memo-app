/*
 役割: logic層（絞り込み・並び替え・履歴保存ポリシー・共通ヘルパー）の動作確認テスト。
 依存: testRunner.js, src/logic/*.js, src/render/common.js（このファイルより先に読み込む）
*/
(function () {
  'use strict';
  var App = window.MemoApp;
  var t = window.TestRunner;

  function makeNote(overrides) {
    var now = Date.now();
    return Object.assign({
      id: App.Logic.id.generateId(),
      title: '',
      content: '',
      categoryIds: [],
      typeId: null,
      isFavorite: false,
      isPinned: false,
      needsOrganizing: false,
      isArchived: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    }, overrides || {});
  }

  // ---------- id ----------
  t.test('id.generateId: 呼ぶたびに異なるIDを返す', function () {
    var a = App.Logic.id.generateId();
    var b = App.Logic.id.generateId();
    t.assertTrue(a !== b, 'IDが重複しています');
  });

  // ---------- filtering ----------
  t.test('filtering: 未分類はcategoryIdsが空のメモだけを抽出する', function () {
    var notes = [makeNote({ categoryIds: [] }), makeNote({ categoryIds: ['c1'] })];
    var filter = Object.assign(App.Logic.filtering.emptyFilter(), { unclassifiedOnly: true });
    var result = App.Logic.filtering.applyFilters(notes, filter, { categoryNameById: {}, typeNameById: {} });
    t.assertEqual(result.length, 1);
    t.assertEqual(result[0].categoryIds, []);
  });

  t.test('filtering: 複数カテゴリはAND条件で絞り込む', function () {
    var notes = [
      makeNote({ categoryIds: ['a', 'b'] }),
      makeNote({ categoryIds: ['a'] }),
      makeNote({ categoryIds: ['b'] })
    ];
    var filter = Object.assign(App.Logic.filtering.emptyFilter(), { categoryIds: ['a', 'b'] });
    var result = App.Logic.filtering.applyFilters(notes, filter, { categoryNameById: {}, typeNameById: {} });
    t.assertEqual(result.length, 1);
  });

  t.test('filtering: キーワードはタイトル・本文・カテゴリ名・種類名を対象にする', function () {
    var notes = [
      makeNote({ title: '民泊の問い合わせ対応' }),
      makeNote({ content: 'ChatGPTを活用する' }),
      makeNote({ categoryIds: ['cat1'] }),
      makeNote({ typeId: 'type1' }),
      makeNote({ title: '無関係' })
    ];
    var lookups = { categoryNameById: { cat1: 'AI活用' }, typeNameById: { type1: 'アイデア' } };

    function count(keyword) {
      var filter = Object.assign(App.Logic.filtering.emptyFilter(), { keyword: keyword });
      return App.Logic.filtering.applyFilters(notes, filter, lookups).length;
    }

    t.assertEqual(count('民泊'), 1);
    t.assertEqual(count('ChatGPT'), 1);
    t.assertEqual(count('AI活用'), 1);
    t.assertEqual(count('アイデア'), 1);
    t.assertEqual(count('存在しない語'), 0);
  });

  t.test('filtering: アーカイブ状態でactive/archived/allを切り替えられる', function () {
    var notes = [makeNote({ isArchived: false }), makeNote({ isArchived: true })];
    function count(state) {
      var filter = Object.assign(App.Logic.filtering.emptyFilter(), { archiveState: state });
      return App.Logic.filtering.applyFilters(notes, filter, { categoryNameById: {}, typeNameById: {} }).length;
    }
    t.assertEqual(count('active'), 1);
    t.assertEqual(count('archived'), 1);
    t.assertEqual(count('all'), 2);
  });

  // ---------- sorting ----------
  t.test('sorting: タイトル昇順で並び替えられる', function () {
    var notes = [makeNote({ title: 'い' }), makeNote({ title: 'あ' }), makeNote({ title: 'う' })];
    var sorted = App.Logic.sorting.applySort(notes, { field: 'title', direction: 'asc', pinnedFirst: false });
    t.assertEqual(sorted.map(function (n) { return n.title; }), ['あ', 'い', 'う']);
  });

  t.test('sorting: ピン留め優先が有効な場合ピン留めメモが常に先頭に来る', function () {
    var notes = [
      makeNote({ title: 'a', isPinned: false, updatedAt: 3 }),
      makeNote({ title: 'b', isPinned: true, updatedAt: 1 }),
      makeNote({ title: 'c', isPinned: false, updatedAt: 2 })
    ];
    var sorted = App.Logic.sorting.applySort(notes, { field: 'updatedAt', direction: 'desc', pinnedFirst: true });
    t.assertEqual(sorted[0].title, 'b');
  });

  // ---------- historyPolicy ----------
  t.test('historyPolicy: 内容が同じなら履歴を作らない', function () {
    var note = makeNote({ title: 'x', content: 'y' });
    t.assertEqual(App.Logic.historyPolicy.shouldSnapshot(note, Object.assign({}, note), null), false);
  });

  t.test('historyPolicy: カテゴリ変更は即座に履歴対象になる', function () {
    var prev = makeNote({ categoryIds: ['a'] });
    var next = Object.assign({}, prev, { categoryIds: ['a', 'b'] });
    t.assertEqual(App.Logic.historyPolicy.shouldSnapshot(prev, next, Date.now()), true);
  });

  t.test('historyPolicy: 直近保存から間もない小さな文章変更は履歴を作らない', function () {
    var prev = makeNote({ content: 'あいうえお' });
    var next = Object.assign({}, prev, { content: 'あいうえおか' });
    t.assertEqual(App.Logic.historyPolicy.shouldSnapshot(prev, next, Date.now()), false);
  });

  // ---------- render/common ----------
  t.test('common.escapeHtml: HTML特殊文字をエスケープする', function () {
    t.assertEqual(App.Render.common.escapeHtml('<script>&"\''), '&lt;script&gt;&amp;&quot;&#39;');
  });

  t.test('common.snippet: 改行を除去し、指定文字数を超えたら省略記号を付ける', function () {
    t.assertEqual(App.Render.common.snippet('あ\nい\nう', 10), 'あ い う');
    t.assertEqual(App.Render.common.snippet('12345678901234567890', 5), '12345…');
  });

  // ---------- navViews ----------
  t.test('navViews: 基本メニューに仕様書の9項目が揃っている', function () {
    var ids = App.Logic.navViews.BASIC_MENU.map(function (m) { return m.id; });
    t.assertEqual(ids, ['all', 'unclassified', 'needsOrganizing', 'favorite', 'pinned', 'recentCreated', 'recentUpdated', 'archived', 'trash']);
  });

  t.test('navViews: 標準スマートビューに「今日作成」が含まれる', function () {
    var ids = App.Logic.navViews.STANDARD_SMART_VIEWS.map(function (v) { return v.id; });
    t.assertTrue(ids.indexOf('smart:todayCreated') !== -1);
  });

  t.report('results');
})();
