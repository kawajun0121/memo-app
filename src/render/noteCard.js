/*
 役割: メモ一覧の1件分のカードHTML生成。
 依存: render/common.js, logic/dateUtils.js

 【スワイプで削除】iPhone純正メモアプリに合わせ、カードを左にスワイプすると裏に隠れている
 赤い「削除」ボタンが現れる（render/noteList.jsがドラッグを検出し、このカード自身をtranslateXで
 動かす）。ドラッグ操作自体はDOM直接操作で行うため、ここでは「現在開いているかどうか
 （ctx.isDeleteRevealed）」に応じた初期transformだけを描画すればよい。
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};
  var c = App.Render.common;

  var MAX_CHIPS = 3;

  /** @returns {string} 一覧カード用のタイトルHTML（空なら「無題」を薄字で表示）。
   *  検索中はヒット箇所をハイライトする。 */
  function formatTitleHtml(title, keyword) {
    return title ? c.highlightHtml(title, keyword) : '<span class="note-title-empty">無題</span>';
  }

  /** @returns {string} 一覧カード用の本文プレビューHTML。元の改行を保ったまま複数行ぶん返し、
   *  実際の表示行数はCSS（.note-snippet の --note-snippet-lines）で制限する。
   *  検索中は一致した行から表示を始め、一致部分をハイライトする。 */
  function formatSnippetHtml(content, keyword) {
    return c.highlightHtml(c.snippetLines(content, 300, keyword), keyword);
  }

  /** @param {Note} note @returns {string} プレビュー・検索に使う生テキスト。新形式(json)はcontent自体が
   *  JSON文字列で人間が読める文章ではないため、保存時に導出済みのplainTextを使う。旧プレーン形式は
   *  contentがそのままプレーンテキストなのでそれを使う（plainText未設定でも問題なく動く＝後方互換）。 */
  function previewText(note) {
    return note.contentFormat === 'json' ? (note.plainText || '') : (note.content || '');
  }

  /**
   * @param {Note} note
   * @param {{categoryNameById: Object, typeNameById: Object, isSelected: boolean, multiSelectMode: boolean, isChecked: boolean, isDeleteRevealed: boolean, keyword: string}} ctx
   */
  function render(note, ctx) {
    var title = formatTitleHtml(note.title, ctx.keyword);
    var snippetText = formatSnippetHtml(previewText(note), ctx.keyword);
    var chips = note.categoryIds.slice(0, MAX_CHIPS).map(function (id) {
      return c.categoryChip(ctx.categoryNameById[id] || '?');
    }).join('');
    var extra = note.categoryIds.length > MAX_CHIPS ? '<span class="chip chip-more">+' + (note.categoryIds.length - MAX_CHIPS) + '</span>' : '';
    var typeName = note.typeId ? ctx.typeNameById[note.typeId] : null;

    var classes = ['note-card'];
    if (ctx.isSelected) classes.push('is-selected');
    if (note.needsOrganizing) classes.push('has-organize-flag');

    var frontStyle = ctx.isDeleteRevealed ? ' style="transform:translateX(calc(-1 * var(--swipe-delete-width)))"' : '';

    return '' +
      '<div class="note-card-swipe" data-swipe-id="' + note.id + '">' +
      '  <button type="button" class="note-swipe-delete-btn" data-action="deleteRevealedNote" data-id="' + note.id + '">🗑<br>削除</button>' +
      '  <div class="' + classes.join(' ') + '" data-action="openNote" data-id="' + note.id + '"' + frontStyle + '>' +
      (ctx.multiSelectMode ?
        '<input type="checkbox" class="note-checkbox" data-action-change="toggleNoteChecked" data-id="' + note.id + '" ' + (ctx.isChecked ? 'checked' : '') + ' />' :
        '') +
      '<div class="note-card-body">' +
      '  <div class="note-card-top">' +
      '    <span class="note-title">' + (note.isPinned ? '<span class="pin-mark" title="ピン留め中">📌</span>' : '') + title + '</span>' +
      '    <span class="note-card-meta-time">' + App.Logic.dateUtils.formatRelative(note.updatedAt) + '</span>' +
      '  </div>' +
      (snippetText ? '<div class="note-snippet">' + snippetText + '</div>' : '') +
      '  <div class="note-card-bottom">' +
      '    <span class="note-card-tags">' + chips + extra + c.typeBadge(typeName) + '</span>' +
      '    <span class="note-card-flags">' +
      c.iconButton('toggleFavorite', note.id, note.isFavorite ? '★' : '☆', 'お気に入り', '', note.isFavorite ? 'is-active' : '') +
      c.iconButton('togglePinned', note.id, '📌', 'ピン留め', '', note.isPinned ? 'is-active' : '') +
      '    </span>' +
      '  </div>' +
      '</div>' +
      '  </div>' +
      '</div>';
  }

  App.Render.noteCard = { render: render };
})(window.MemoApp = window.MemoApp || {});
