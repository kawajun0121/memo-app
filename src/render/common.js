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

  /** @returns {string} 改行を除いた本文の先頭部分（一覧カード用） */
  function snippet(text, maxLen) {
    if (!text) return '';
    var flat = text.replace(/\s+/g, ' ').trim();
    if (flat.length <= maxLen) return flat;
    return flat.slice(0, maxLen) + '…';
  }

  function iconButton(action, id, icon, title, extraAttrs, activeClass) {
    return '<button type="button" class="icon-btn' + (activeClass ? ' ' + activeClass : '') + '" data-action="' + action + '" data-id="' + escapeHtml(id) + '" title="' + escapeHtml(title) + '" ' + (extraAttrs || '') + '>' + icon + '</button>';
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
    iconButton: iconButton,
    categoryChip: categoryChip,
    typeBadge: typeBadge,
    bindActionDelegation: bindActionDelegation
  };
})(window.MemoApp = window.MemoApp || {});
