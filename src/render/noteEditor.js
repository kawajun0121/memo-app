/*
 役割: 右カラム（メモ本文の閲覧・編集）。画面遷移せずインラインで編集でき、
       入力後300〜800msの無操作で自動保存する（保存ボタンは持たない）。
 依存: render/common.js, logic/debounce.js, store/notesStore.js, store/categoriesStore.js, store/typesStore.js

 【タイトルは1行目から自動生成】iPhone純正メモアプリと同様、タイトル専用の入力欄は持たず、
 本文と1つの入力欄（textarea）にまとめている。1行目がタイトル、2行目以降が本文として保存される
 （1行目しか無ければ本文は空になる）。タイトルを別途意識して入力する必要がない。

 【IME変換中の保存】compositionstart〜compositionendの間は自動保存の実行そのものを待つ
 （変換途中の未確定文字を保存しないため）。入力欄が再描画で壊れないようにする対策自体は
 render/appShell.js側（フォーカス中は再描画を保留する仕組み）で行っている。
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};
  var c = App.Render.common;

  var AUTOSAVE_DELAY_MS = 500;

  /** @param {string} title @param {string} content @returns {string} 入力欄に表示する結合済みテキスト */
  function joinTitleAndContent(title, content) {
    if (!title) return content;
    if (!content) return title;
    return title + '\n' + content;
  }

  /** @param {string} fullText @returns {{title: string, content: string}} 1行目をタイトル、残りを本文として分割する。
   *  1行目が空白のみの場合は空文字として扱い、不自然な（空白だけの）タイトルにならないようにする。 */
  function splitTitleAndContent(fullText) {
    var newlineIndex = fullText.indexOf('\n');
    if (newlineIndex === -1) return { title: fullText.trim(), content: '' };
    return { title: fullText.slice(0, newlineIndex).trim(), content: fullText.slice(newlineIndex + 1) };
  }

  /** @type {{noteId: string, getPatch: Function, isComposing: Function, flush: Function, cancel: Function, trigger: Function}|null} */
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
   *
   * 【重要】同じメモを編集し続けている間に別の理由（カテゴリ変更・スマホでの画面遷移からの
   * 復帰など）で編集画面が再描画されると、title/content要素とgetPatch/isComposingのクロージャは
   * すべて新しく作り直される。もし保留中のデバウンス（pending）が「作成した時点」のgetPatchを
   * 握ったままだと、それは作り直される前の（=すでにDOMから外れた）要素を読み続けてしまい、
   * 再描画後にユーザーが入力した内容が保存されずに消える不具合になる。これを防ぐため、
   * pending.getPatch/isComposingは毎回のscheduleSave呼び出しで必ず最新のものに更新し、
   * 実際に保存を実行する関数もpending.getPatch()のように間接的に参照する
   * （生成時のgetPatchを直接クロージャに固定しない）。
   */
  function scheduleSave(noteId, getPatch, isComposing) {
    if (pending && pending.noteId !== noteId) {
      pending.flush();
    }
    if (!pending || pending.noteId !== noteId) {
      var debounced = App.Logic.debounce(function () {
        if (pending.isComposing && pending.isComposing()) return;
        setStatus('保存中…', true);
        var savingNoteId = pending.noteId;
        App.Store.notesStore.update(savingNoteId, pending.getPatch()).then(function (saved) {
          setStatus('保存済み', false);
          // 編集中は#app全体の再描画をappShell.js側で遅延させているため（IME対策）、
          // 一覧の該当カードのタイトル/プレビューだけはここで直接書き換えて即時反映する（優先度5）。
          App.Render.noteCard.patchCardPreview(savingNoteId, saved);
        }).catch(function () {
          setStatus('保存に失敗しました（再試行します）', false);
          if (pending && pending.noteId === savingNoteId) pending.trigger();
        });
      }, AUTOSAVE_DELAY_MS);
      pending = { noteId: noteId, getPatch: getPatch, isComposing: isComposing, flush: debounced.flush, cancel: debounced.cancel, trigger: debounced };
    } else {
      // 同じメモを引き続き編集中。再描画で入力欄が作り直されていても、
      // 常に最新のgetPatch/isComposingを参照するよう更新しておく。
      pending.getPatch = getPatch;
      pending.isComposing = isComposing;
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

  function flagButton(action, id, icon, label, isActive) {
    return '<button type="button" class="flag-btn' + (isActive ? ' is-active' : '') + '" data-action="' + action + '" data-id="' + id + '" aria-pressed="' + (isActive ? 'true' : 'false') + '">' + icon + ' ' + label + '</button>';
  }

  /** @param {Note|null} note 選択中のメモ（下書き中の新規メモの場合もある） */
  function render(note) {
    if (!note) {
      // このプレースホルダーはPCの3カラム表示でのみ見える（モバイルは常にメモを開いた状態で
      // この画面に入るため）。一覧が空の場合の案内文はrender/noteList.jsのnote-list-empty側で扱う。
      return '<div class="note-editor note-editor--empty">左のメモ一覧からメモを選択するか、新規作成してください</div>';
    }

    if (note.deletedAt) {
      return '' +
        '<div class="note-editor" data-note-id="' + note.id + '">' +
        renderTopToolbar(note) +
        '  <textarea id="noteContentInput" class="note-content-input" readonly>' + c.escapeHtml(joinTitleAndContent(note.title, note.content)) + '</textarea>' +
        renderTrashedActions(note) +
        '</div>';
    }

    var typeName = note.typeId ? (App.Store.typesStore.getById(note.typeId) || {}).name : null;

    return '' +
      '<div class="note-editor" data-note-id="' + note.id + '">' +
      renderTopToolbar(note) +
      '  <textarea id="noteContentInput" class="note-content-input" placeholder="メモを入力…（1行目がタイトルになります）">' + c.escapeHtml(joinTitleAndContent(note.title, note.content)) + '</textarea>' +
      '  <div class="note-editor-categories">' +
      '    <div class="chip-row">' + categoryChipsHtml(note) +
      '      <button type="button" class="chip chip-add" data-action="openCategoryPicker" aria-label="カテゴリを追加">+ カテゴリ</button>' +
      '    </div>' +
      '  </div>' +
      '  <div class="note-editor-row">' +
      '    <button type="button" class="btn-icon note-type-button" data-action="openTypePicker" aria-label="種類を選択">' + (typeName ? '🏷 ' + c.escapeHtml(typeName) : '+ 種類を選択') + '</button>' +
      flagButton('toggleNeedsOrganizing', note.id, '🗂', 'あとで整理', note.needsOrganizing) +
      '  </div>' +
      '</div>';
  }

  function renderTopToolbar(note) {
    return '' +
      '  <div class="note-editor-toolbar">' +
      '    <button type="button" class="icon-btn mobile-only" data-action="setMobileViewListFromEditor" title="メモ一覧に戻る" aria-label="メモ一覧に戻る">←</button>' +
      '    <span id="autosaveStatus" class="autosave-status">保存済み</span>' +
      '    <button type="button" class="icon-btn" data-action="openEditorMenu" title="その他メニュー" aria-label="その他メニュー">⋯</button>' +
      '  </div>';
  }

  function renderTrashedActions(note) {
    return '' +
      '<div class="note-editor-flags note-editor-flags--trashed">' +
      '  <span class="trashed-note-label">🗑 ゴミ箱にあります</span>' +
      '  <button type="button" class="flag-btn" data-action="restoreNote" data-id="' + note.id + '">元に戻す</button>' +
      '  <button type="button" class="flag-btn flag-btn--danger" data-action="permanentDeleteNote" data-id="' + note.id + '">完全に削除</button>' +
      '</div>';
  }

  /** @param {string} id @returns {boolean} まだIndexedDBに保存されていない下書きかどうか */
  function isDraftId(id) {
    var draft = App.Store.uiStore.getState().draftNote;
    return !!(draft && draft.id === id);
  }

  /** 下書きへの最初の入力（本文が空でなくなった瞬間）で、正式なメモとしてnotesStoreへ昇格させる。
   *  空のまま一覧等へ戻った場合は何もしない（＝IndexedDBには一切書き込まれず、優先度4の要件を満たす）。
   *  昇格後もメモidは下書き時点と同じものを使い続けるため（App.Db.notesRepo.createEmptyNoteへ明示的にid/
   *  createdAtを渡す）、appShell.js側の「編集中は同じメモとみなし再描画を保留する」判定が
   *  下書き→保存後の間で途切れず、入力中に入力欄が作り直されてフォーカスが飛ぶことがない。 */
  function promoteDraftIfNeeded(noteId, patch) {
    if (!isDraftId(noteId)) return;
    if (!patch.title && !patch.content) return; // まだ何も入力されていない
    var draft = App.Store.uiStore.getState().draftNote;
    App.Store.notesStore.create(Object.assign({
      id: draft.id,
      createdAt: draft.createdAt,
      categoryIds: draft.categoryIds,
      typeId: draft.typeId,
      isFavorite: draft.isFavorite,
      isPinned: draft.isPinned,
      needsOrganizing: draft.needsOrganizing,
      isArchived: draft.isArchived
    }, patch));
    App.Store.uiStore.promoteDraftTo(draft.id);
  }

  function mount(note) {
    if (!note) return;

    var contentInput = document.getElementById('noteContentInput');

    function currentPatch() {
      return contentInput ? splitTitleAndContent(contentInput.value) : { title: note.title, content: note.content };
    }

    // 日本語入力（IME）などの変換中は、compositionstart〜compositionendの間trueになる。
    // 変換確定前に自動保存の再描画が起きて入力中の文字が消える不具合を防ぐために使う。
    var composing = false;
    function isComposing() {
      return composing;
    }

    // フォーカスがある間はappShell.js側で再描画自体を保留している（編集中の入力欄が
    // 作り直されて壊れるのを防ぐため）。フォーカスが外れたタイミングで、保留されていた
    // 再描画（他メモの自動保存・カテゴリ変更・クラウド同期の反映など）をまとめて実行する。
    function flushDeferredRenderIfAny() {
      App.Render.appShell.flushDeferredRender();
    }

    function handleInput() {
      var patch = currentPatch();
      promoteDraftIfNeeded(note.id, patch);
      scheduleSave(note.id, currentPatch, isComposing);
    }

    if (contentInput && !note.deletedAt) {
      contentInput.addEventListener('compositionstart', function () { composing = true; });
      contentInput.addEventListener('compositionend', function () {
        composing = false;
        handleInput();
      });
      contentInput.addEventListener('input', handleInput);
      contentInput.addEventListener('blur', flushDeferredRenderIfAny);
    }
  }

  App.Render.noteEditor = { render: render, mount: mount, flushPending: flushPending, AUTOSAVE_DELAY_MS: AUTOSAVE_DELAY_MS };
})(window.MemoApp = window.MemoApp || {});
