/*
 役割: 右カラム（メモ本文の閲覧・編集）。画面遷移せずインラインで編集でき、
       入力後300〜800msの無操作で自動保存する（保存ボタンは持たない）。
 依存: render/common.js, logic/debounce.js, store/notesStore.js, store/categoriesStore.js, store/typesStore.js

 【IME変換中の保存】compositionstart〜compositionendの間は自動保存の実行そのものを待つ
 （変換途中の未確定文字を保存しないため）。入力欄が再描画で壊れないようにする対策自体は
 render/appShell.js側（フォーカス中は再描画を保留する仕組み）で行っている。
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};
  var c = App.Render.common;

  var AUTOSAVE_DELAY_MS = 500;
  var NEW_TYPE_VALUE = '__new__';

  /** @type {{noteId: string, flush: Function, cancel: Function}|null} */
  var pending = null;

  function flushPending() {
    if (pending) pending.flush();
  }

  function setStatus(text, isSaving) {
    var el = document.getElementById('autosaveStatus');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-saving', !!isSaving);
  }

  /**
   * @param {string} noteId
   * @param {() => Partial<Note>} getPatch
   * @param {() => boolean} isComposing 日本語入力などのIME変換中かどうか
   */
  function scheduleSave(noteId, getPatch, isComposing) {
    if (pending && pending.noteId !== noteId) {
      pending.flush();
    }
    if (!pending || pending.noteId !== noteId) {
      var debounced = App.Logic.debounce(function () {
        // IME変換中に保存すると、直後の再描画でinput/textareaのDOM要素が作り直され、
        // 変換中の文字が消えたり表示が乱れたりする不具合が起きるため、変換が終わるまで待つ。
        // compositionendのタイミングで改めてscheduleSave()が呼ばれるため、そこで再度保存される。
        if (isComposing && isComposing()) return;
        setStatus('保存中…', true);
        App.Store.notesStore.update(noteId, getPatch()).then(function () {
          setStatus('保存済み', false);
        }).catch(function () {
          setStatus('保存に失敗しました（再試行します）', false);
          scheduleSave(noteId, getPatch, isComposing);
        });
      }, AUTOSAVE_DELAY_MS);
      pending = { noteId: noteId, flush: debounced.flush, cancel: debounced.cancel, trigger: debounced };
    }
    setStatus('編集中…', false);
    pending.trigger();
  }

  function categoryChipsHtml(note) {
    return note.categoryIds.map(function (id) {
      var cat = App.Store.categoriesStore.getById(id);
      return c.categoryChip(cat ? cat.name : '?', { removable: true, categoryId: id });
    }).join('');
  }

  function typeOptionsHtml(note) {
    var types = App.Store.typesStore.getAll();
    var options = '<option value="">種類なし</option>';
    options += types.map(function (t) {
      return '<option value="' + t.id + '"' + (note.typeId === t.id ? ' selected' : '') + '>' + c.escapeHtml(t.name) + '</option>';
    }).join('');
    options += '<option value="' + NEW_TYPE_VALUE + '">+ 新しい種類を追加…</option>';
    return options;
  }

  function categoryDatalistHtml() {
    return App.Store.categoriesStore.getAll().map(function (cat) {
      return '<option value="' + c.escapeHtml(cat.name) + '"></option>';
    }).join('');
  }

  function flagButton(action, id, icon, label, isActive) {
    return '<button type="button" class="flag-btn' + (isActive ? ' is-active' : '') + '" data-action="' + action + '" data-id="' + id + '">' + icon + ' ' + label + '</button>';
  }

  /** @param {Note|null} note */
  function render(note) {
    if (!note) {
      return '<div class="note-editor note-editor--empty">メモを選択するか、上のクイック入力から新しいメモを作成してください</div>';
    }

    return '' +
      '<div class="note-editor" data-note-id="' + note.id + '">' +
      '  <div class="note-editor-toolbar">' +
      '    <button type="button" class="icon-btn mobile-only" data-action="setMobileViewListFromEditor" title="メモ一覧に戻る">←</button>' +
      '    <span id="autosaveStatus" class="autosave-status">保存済み</span>' +
      '    <div class="note-editor-toolbar-actions">' +
      '      <button type="button" class="btn-text" data-action="openHistoryPanel" data-id="' + note.id + '">編集履歴</button>' +
      '      <button type="button" class="btn-text" data-action="openAiSuggest" data-id="' + note.id + '">AIカテゴリ提案</button>' +
      '    </div>' +
      '  </div>' +
      '  <input type="text" id="noteTitleInput" class="note-title-input" placeholder="無題" value="' + c.escapeHtml(note.title) + '" />' +
      '  <textarea id="noteContentInput" class="note-content-input" placeholder="本文を入力…">' + c.escapeHtml(note.content) + '</textarea>' +
      '  <div class="note-editor-categories">' +
      '    <div class="chip-row">' + categoryChipsHtml(note) + '</div>' +
      '    <input type="text" list="categoryDatalist" class="category-add-input" id="categoryAddInput" placeholder="+ カテゴリを追加（Enterで確定）" />' +
      '    <datalist id="categoryDatalist">' + categoryDatalistHtml() + '</datalist>' +
      '  </div>' +
      '  <div class="note-editor-row">' +
      '    <select class="type-select" data-action-change="changeNoteType" data-id="' + note.id + '">' + typeOptionsHtml(note) + '</select>' +
      '  </div>' +
      (note.deletedAt ? renderTrashedActions(note) : renderFlags(note)) +
      '</div>';
  }

  function renderFlags(note) {
    return '' +
      '<div class="note-editor-flags">' +
      flagButton('toggleFavorite', note.id, note.isFavorite ? '★' : '☆', 'お気に入り', note.isFavorite) +
      flagButton('togglePinned', note.id, '📌', 'ピン留め', note.isPinned) +
      flagButton('toggleNeedsOrganizing', note.id, '🗂', 'あとで整理', note.needsOrganizing) +
      flagButton(note.isArchived ? 'unarchiveNote' : 'archiveNote', note.id, '📦', note.isArchived ? 'アーカイブ解除' : 'アーカイブ', note.isArchived) +
      '    <button type="button" class="flag-btn flag-btn--danger" data-action="trashNote" data-id="' + note.id + '">🗑 ゴミ箱へ</button>' +
      '</div>';
  }

  function renderTrashedActions(note) {
    return '' +
      '<div class="note-editor-flags note-editor-flags--trashed">' +
      '  <span class="trashed-note-label">🗑 ゴミ箱にあります</span>' +
      '  <button type="button" class="flag-btn" data-action="restoreNote" data-id="' + note.id + '">元に戻す</button>' +
      '  <button type="button" class="flag-btn flag-btn--danger" data-action="permanentDeleteNote" data-id="' + note.id + '">完全に削除</button>' +
      '</div>';
  }

  function mount(note) {
    if (!note) return;

    var titleInput = document.getElementById('noteTitleInput');
    var contentInput = document.getElementById('noteContentInput');
    var categoryAddInput = document.getElementById('categoryAddInput');

    function currentPatch() {
      return {
        title: titleInput ? titleInput.value : note.title,
        content: contentInput ? contentInput.value : note.content
      };
    }

    // 日本語入力（IME）などの変換中は、compositionstart〜compositionendの間trueになる。
    // 変換確定前に自動保存の再描画が起きて入力中の文字が消える不具合を防ぐために使う。
    var titleComposing = false;
    var contentComposing = false;
    function isComposing() {
      return titleComposing || contentComposing;
    }

    // フォーカスがある間はappShell.js側で再描画自体を保留している（編集中の入力欄が
    // 作り直されて壊れるのを防ぐため）。フォーカスが外れたタイミングで、保留されていた
    // 再描画（他メモの自動保存・カテゴリ変更・クラウド同期の反映など）をまとめて実行する。
    function flushDeferredRenderIfAny() {
      App.Render.appShell.flushDeferredRender();
    }

    if (titleInput) {
      titleInput.addEventListener('compositionstart', function () { titleComposing = true; });
      titleInput.addEventListener('compositionend', function () {
        titleComposing = false;
        scheduleSave(note.id, currentPatch, isComposing);
      });
      titleInput.addEventListener('input', function () {
        scheduleSave(note.id, currentPatch, isComposing);
      });
      titleInput.addEventListener('blur', flushDeferredRenderIfAny);
    }
    if (contentInput) {
      contentInput.addEventListener('compositionstart', function () { contentComposing = true; });
      contentInput.addEventListener('compositionend', function () {
        contentComposing = false;
        scheduleSave(note.id, currentPatch, isComposing);
      });
      contentInput.addEventListener('input', function () {
        scheduleSave(note.id, currentPatch, isComposing);
      });
      contentInput.addEventListener('blur', flushDeferredRenderIfAny);
    }
    if (categoryAddInput) {
      categoryAddInput.addEventListener('keydown', function (evt) {
        if (evt.key !== 'Enter') return;
        evt.preventDefault();
        var name = categoryAddInput.value.trim();
        if (!name) return;
        var category = App.Store.categoriesStore.getOrCreate(name);
        if (!category) return;
        var current = App.Store.notesStore.getById(note.id);
        if (current.categoryIds.indexOf(category.id) === -1) {
          App.Store.notesStore.update(note.id, { categoryIds: current.categoryIds.concat([category.id]) });
        }
        categoryAddInput.value = '';
      });
    }
  }

  App.Render.noteEditor = { render: render, mount: mount, flushPending: flushPending, AUTOSAVE_DELAY_MS: AUTOSAVE_DELAY_MS };
})(window.MemoApp = window.MemoApp || {});
