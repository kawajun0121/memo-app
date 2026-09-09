/*
 役割: 画面描画で共通に使うHTML部品・ヘルパー・アクション登録レジストリ。
 依存: logic/dateUtils.js

 【操作の統一ルール】
 クリックは data-action="xxx" 属性 + App.Actions['xxx'] へ登録した関数で処理する
 （1つの委譲リスナーをappShellが#appに1回だけ設置する）。
 data-id="xxx" があればハンドラの第2引数として渡される。
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};
  App.Actions = App.Actions || {};

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** @returns {string} 改行を除いた本文の先頭部分（1行表示したい箇所用） */
  function snippet(text, maxLen) {
    if (!text) return '';
    var flat = text.replace(/\s+/g, ' ').trim();
    if (flat.length <= maxLen) return flat;
    return flat.slice(0, maxLen) + '…';
  }

  /** 一覧カードのプレビュー用。元の改行を保ったまま数行ぶんを返す（買い物リストのような
   *  箇条書きが1行に潰れて読めなくならないようにするため）。空行は詰める。実際に何行表示するかは
   *  CSS側（--note-snippet-lines）で制限するので、ここでは折り返しを考慮して少し多めに残す。
   *
   *  keywordが指定された場合は、先頭からではなく「その語を含む最初の行」から返す。
   *  検索結果の一覧で、ヒットしたはずの語がプレビューに出てこない（長いメモで一致箇所が
   *  4行目以降にある）と、なぜヒットしたのか分からないため。
   *  @param {string} text @param {number} maxLen @param {string} [keyword] @returns {string} */
  function snippetLines(text, maxLen, keyword) {
    if (!text) return '';
    var lines = String(text).split('\n');
    var startIndex = 0;
    if (keyword) {
      var q = String(keyword).toLowerCase();
      for (var s = 0; s < lines.length; s++) {
        if (lines[s].toLowerCase().indexOf(q) !== -1) { startIndex = s; break; }
      }
    }
    var kept = [];
    for (var i = startIndex; i < lines.length && kept.length < 8; i++) {
      var line = lines[i].replace(/[ \t　]+/g, ' ').trim();
      if (line) kept.push(line);
    }
    var joined = kept.join('\n');
    if (joined.length <= maxLen) return joined;
    return joined.slice(0, maxLen) + '…';
  }

  /** テキストをHTMLエスケープしつつ、keywordに一致する部分だけ<mark>で囲む。
   *  一致判定はlogic/filtering.jsのmatchesKeywordと同じ「小文字化した単純部分一致」に揃えてあるため、
   *  検索でヒットした語とハイライトされる語が必ず一致する。
   *  エスケープ後の文字列を検索すると&amp;等の実体参照を誤ってまたいでしまうので、
   *  必ず「元テキストで位置を探す→切り出した断片を個別にエスケープ」の順で組み立てる。
   *  @param {string} text @param {string} [keyword] @returns {string} HTML */
  function highlightHtml(text, keyword) {
    var src = text === null || text === undefined ? '' : String(text);
    var q = keyword ? String(keyword).toLowerCase() : '';
    if (!q) return escapeHtml(src);
    var lower = src.toLowerCase();
    var out = '';
    var from = 0;
    while (true) {
      var idx = lower.indexOf(q, from);
      if (idx === -1) { out += escapeHtml(src.slice(from)); break; }
      out += escapeHtml(src.slice(from, idx)) +
        '<mark class="search-hit">' + escapeHtml(src.slice(idx, idx + q.length)) + '</mark>';
      from = idx + q.length;
    }
    return out;
  }

  function iconButton(action, id, icon, title, extraAttrs, activeClass) {
    return '<button type="button" class="icon-btn' + (activeClass ? ' ' + activeClass : '') + '" data-action="' + action + '" data-id="' + escapeHtml(id) + '" title="' + escapeHtml(title) + '" aria-label="' + escapeHtml(title) + '" ' + (extraAttrs || '') + '>' + icon + '</button>';
  }

  function categoryChip(name, opts) {
    opts = opts || {};
    if (!opts.removable) {
      return '<span class="chip">' + escapeHtml(name) + '</span>';
    }
    return '<span class="chip chip-removable" data-action="removeCategoryFromNote" data-id="' + escapeHtml(opts.categoryId) + '">' +
      escapeHtml(name) + ' <span class="chip-x" aria-hidden="true">×</span></span>';
  }

  function typeBadge(name) {
    if (!name) return '';
    return '<span class="badge badge-type">' + escapeHtml(name) + '</span>';
  }

  /** 主要ナビゲーション用インラインSVGアイコン（項目11）。OSによって見た目が変わる絵文字の代わりに、
   *  線幅・サイズを統一した軽量な独自アイコンセットを使う（外部ライブラリは追加しない）。
   *  すべて24x24のstroke系（fill="none"）で、色は現在のテキスト色（currentColor）を継承するため
   *  ダークモードでも自動的に読める色になる。常にボタン側のtitle/aria-labelと併用するため、
   *  アイコン自体は装飾として扱いaria-hidden="true"を付ける。 */
  var ICON_PATHS = {
    all: '<path d="M6 3h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4"/><path d="M8 12h8M8 15.5h8M8 8.5h3"/>',
    unclassified: '<path d="M4 6h16M4 6l1.2 12A2 2 0 0 0 7.2 20h9.6a2 2 0 0 0 2-1.8L20 6M4 6l2-3h12l2 3"/><path d="M9.5 11h5"/>',
    needsOrganizing: '<path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
    favorite: '<path d="M12 3.5l2.6 5.4 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9z"/>',
    pinned: '<path d="M9.5 3.5h5l.7 5.6L18 11v2h-6v6.5l-.5 1-.5-1V13H5v-2l2.8-1.9z"/>',
    recentCreated: '<path d="M6 3h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4"/><path d="M12 11v6M9 14h6"/>',
    recentUpdated: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/>',
    archived: '<rect x="3.5" y="4" width="17" height="4.5" rx="1"/><path d="M4.5 8.5V19a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V8.5"/><path d="M10 13h4"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7"/><path d="M6.5 7l.8 12.5A1 1 0 0 0 8.3 20.5h7.4a1 1 0 0 0 1-1.3L17.5 7"/><path d="M10 11v6M14 11v6"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-5-5"/>',
    create: '<path d="M12 5v14M5 12h14"/>',
    menu: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    memoNav: '<path d="M6 3h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4"/><path d="M8 12h8M8 15.5h8"/>',
    organizeNav: '<path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2M12 18.5v2M4.6 6.6l1.4 1.4M18 16l1.4 1.4M3.5 12h2M18.5 12h2M4.6 17.4l1.4-1.4M18 8l1.4-1.4"/>'
  };

  /** @param {string} name ICON_PATHSのキー @param {number} [size] @returns {string} */
  function icon(name, size) {
    var d = ICON_PATHS[name];
    if (!d) return '';
    var s = size || 20;
    return '<svg class="svg-icon" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }

  /** イベント委譲: rootに一度だけ設置する。
   *  data-backdrop="true" を持つ要素（モーダルの背景）は、クリックが要素自身（背景そのもの）に
   *  当たった場合のみ発火する。モーダル内側の要素をクリックした際に閉じてしまうのを防ぐため。 */
  function bindActionDelegation(root) {
    root.addEventListener('click', function (event) {
      // input/select/textarea自体のクリックは(change委譲や既定動作に任せ)、
      // 親要素のdata-action（例: メモカードのopenNote）が誤って発火しないようにする
      if (event.target.matches('input, select, textarea')) return;
      var el = event.target.closest('[data-action]');
      if (!el || !root.contains(el)) return;
      if (el.getAttribute('data-backdrop') === 'true' && event.target !== el) return;
      var actionName = el.getAttribute('data-action');
      var handler = App.Actions[actionName];
      if (!handler) return;
      event.preventDefault();
      handler({ id: el.getAttribute('data-id'), dataset: el.dataset }, event, el);
    });

    root.addEventListener('change', function (event) {
      var el = event.target.closest('[data-action-change]');
      if (!el || !root.contains(el)) return;
      var actionName = el.getAttribute('data-action-change');
      var handler = App.Actions[actionName];
      if (!handler) return;
      handler({ id: el.getAttribute('data-id'), dataset: el.dataset, value: el.value, checked: el.checked }, event, el);
    });
  }

  App.Render.common = {
    escapeHtml: escapeHtml,
    snippet: snippet,
    snippetLines: snippetLines,
    highlightHtml: highlightHtml,
    iconButton: iconButton,
    categoryChip: categoryChip,
    typeBadge: typeBadge,
    icon: icon,
    bindActionDelegation: bindActionDelegation
  };
})(window.MemoApp = window.MemoApp || {});
