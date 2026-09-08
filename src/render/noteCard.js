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

  /** @returns {string} 一覧カード用のタイトルHTML（空なら「無題」を薄字で表示） */
  function formatTitleHtml(title) {
    return title ? c.escapeHtml(title) : '<span class="note-title-empty">無題</span>';
  }

  /** @returns {string} 一覧カード用の本文プレビューHTML（改行を除いた先頭部分） */
  function formatSnippetHtml(content) {
    return c.escapeHtml(c.snippet(content, 88));
  }

  /**
   * @param {Note} note
   * @param {{categoryNameById: Object, typeNameById: Object, isSelected: boolean, multiSelectMode: boolean, isChecked: boolean, isDeleteRevealed: boolean}} ctx
   */
  function render(note, ctx) {
    var title = formatTitleHtml(note.title);
    var snippetText = formatSnippetHtml(note.content);
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

  /**
   * 自動保存が完了した直後、対象カードのタイトル/本文プレビューだけを直接書き換える。
   * 編集中はappShell.js側でフォーカス保護のため#app全体の再描画を遅延させているが（IME対策）、
   * それとは別に一覧の見た目だけは即時追従させたい（優先度5: 一覧タイトルのリアルタイム更新）ための
   * ピンポイント更新。仮想スクロールで対象行が現在描画されていない場合は何もしない
   * （範囲内に入れば通常のrender()で最新状態が出るため問題ない）。
   * @param {string} noteId
   * @param {{title:string, content:string, isPinned:boolean}} note
   */
  function patchCardPreview(noteId, note) {
    var card = document.querySelector('.note-card[data-id="' + noteId + '"]');
    if (!card) return;
    var titleEl = card.querySelector('.note-title');
    if (titleEl) {
      titleEl.innerHTML = (note.isPinned ? '<span class="pin-mark" title="ピン留め中">📌</span>' : '') + formatTitleHtml(note.title);
    }
    var snippetText = formatSnippetHtml(note.content);
    var snippetEl = card.querySelector('.note-snippet');
    if (snippetText) {
      if (snippetEl) {
        snippetEl.innerHTML = snippetText;
      } else if (titleEl) {
        var div = document.createElement('div');
        div.className = 'note-snippet';
        div.innerHTML = snippetText;
        card.querySelector('.note-card-top').insertAdjacentElement('afterend', div);
      }
    } else if (snippetEl) {
      snippetEl.remove();
    }
  }

  App.Render.noteCard = { render: render, patchCardPreview: patchCardPreview };
})(window.MemoApp = window.MemoApp || {});
