/*
 役割: 右カラム（メモ本文の閲覧・編集）。画面遷移せずインラインで編集でき、
       入力後500msの無操作で自動保存する（保存ボタンは持たない）。
       本文はTiptap（richtext/tiptapEditor.js）によるリッチテキストエディタ。
 依存: render/common.js, render/sheet.js, richtext/tiptapEditor.js, richtext/textExtract.js,
      logic/debounce.js, store/notesStore.js, store/categoriesStore.js, store/typesStore.js,
      store/syncStatusStore.js

 【タイトルは最初の有効なブロックから自動生成】iPhone純正メモアプリと同様、タイトル専用の入力欄は
 持たない。RichEditor.deriveTitleAndPlainTextFromJSON()が、文書内の最初の空でない行をタイトル、
 残りをplainText（検索・プレビュー用）として導出する。

 【保存形式】content(JSON文字列) + contentFormat:'json' が新形式。contentFormatが無い
 （＝undefined）メモは旧プレーンテキスト形式として扱い、開いた瞬間だけ1行1段落のTiptap文書に
 変換して表示するが、実際に編集・保存されるまで元のcontent/contentFormatは書き換えない
 （既存データへの後方互換・安全な移行）。

 【IME変換中の保存】ProseMirrorの`editor.view.composing`で変換中かどうかを判定し、変換確定前は
 自動保存を待つ。入力欄が再描画で壊れないようにする対策自体はrender/appShell.js側
 （フォーカス中は再描画を保留する仕組み。contenteditableのため`.note-content-editor`クラスで判定）で行う。

 【一覧の即時反映】自動保存成功時・下書き昇格時にappShell.jsのsyncListLive()を呼び、
 一覧・サイドバーの件数/プレビューをその場で即時反映する（優先度1）。
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};
  var c = App.Render.common;

  var AUTOSAVE_DELAY_MS = 500;

  /** @type {{noteId: string, getPatch: Function, isComposing: Function, flush: Function, cancel: Function, trigger: Function}|null} */
  var pending = null;
  var currentEditor = null;
  var currentEditorNoteId = null;

  /** リンク・文字色シートを開いた時点の選択範囲を一時的に覚えておく（不具合修正）。
   *  シートを開く操作そのものでフォーカスが動いても、保存/適用時にはここへ退避した
   *  座標を使うため、選択範囲が失われない。
   *  @type {{kind:'link'|'color', noteId:string, from:number, to:number, selectedText:string, existingHref:string, isEmpty:boolean}|null} */
  var savedSelection = null;

  function flushPending() {
    if (pending) pending.flush();
  }

  function getCurrentEditor() {
    return currentEditor;
  }

  function getCurrentNoteId() {
    return currentEditorNoteId;
  }

  /** @param {'link'|'color'} kind @returns {Object|null} 現在の選択範囲を退避して返す */
  function captureSelection(kind) {
    if (!currentEditor || !currentEditorNoteId) return null;
    var sel = currentEditor.state.selection;
    var text = currentEditor.state.doc.textBetween(sel.from, sel.to, '');
    var linkAttrs = currentEditor.getAttributes('link');
    savedSelection = {
      kind: kind,
      noteId: currentEditorNoteId,
      from: sel.from,
      to: sel.to,
      selectedText: text,
      existingHref: linkAttrs.href || '',
      isEmpty: sel.from === sel.to
    };
    return savedSelection;
  }

  /** リンク用の退避。カーソルが既存リンクの内側にある場合は、リンク全体を選択範囲として
   *  扱う（extendMarkRange）。これによりURL/表示文字の編集対象がリンク全体になる。 */
  function captureSelectionForLink() {
    if (!currentEditor) return null;
    if (currentEditor.state.selection.empty && currentEditor.isActive('link')) {
      currentEditor.chain().extendMarkRange('link').run();
    }
    return captureSelection('link');
  }

  function getSavedSelection() {
    return savedSelection;
  }

  function clearSavedSelection() {
    savedSelection = null;
  }

  /** 退避した座標を、現在の文書サイズの範囲内へ安全に補正する（不具合修正:項目7）。
   *  対象メモが変わっていた場合や、エディタが存在しない場合はnullを返す。
   *  @param {'link'|'color'} kind @returns {{from:number, to:number}|null} */
  function resolveSavedRange(kind) {
    if (!currentEditor || !savedSelection || savedSelection.kind !== kind) return null;
    if (savedSelection.noteId !== currentEditorNoteId) return null; // 別のメモへ移動していた
    var maxPos = currentEditor.state.doc.content.size;
    var from = Math.max(0, Math.min(savedSelection.from, maxPos));
    var to = Math.max(from, Math.min(savedSelection.to, maxPos));
    return { from: from, to: to };
  }

  function statusSyncSuffix() {
    if (!App.Store.syncStatusStore) return '';
    var s = App.Store.syncStatusStore.getState();
    if (s.status === 'idle') return '';
    if (!s.isOnline) return '（オフライン）';
    if (s.status === 'syncing') return '・同期中…';
    if (s.status === 'synced') return '・同期済み';
    if (s.status === 'error') return '・同期エラー';
    return '';
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
   * 【重要】同じメモを編集し続けている間に別の理由で編集画面が再描画されると、エディタと
   * getPatch/isComposingのクロージャはすべて新しく作り直される。もし保留中のデバウンス（pending）が
   * 「作成した時点」のgetPatchを握ったままだと、それは作り直される前の（=既に破棄された）エディタを
   * 読み続けてしまい、再描画後にユーザーが入力した内容が保存されずに消える不具合になる。これを防ぐため、
   * pending.getPatch/isComposingは毎回のscheduleSave呼び出しで必ず最新のものに更新し、
   * 実際に保存を実行する関数もpending.getPatch()のように間接的に参照する。
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
        App.Store.notesStore.update(savingNoteId, pending.getPatch()).then(function () {
          setStatus('保存済み' + statusSyncSuffix(), false);
          // 編集中は#app全体の再描画をappShell.js側で遅延させているため（IME対策）、
          // 一覧・サイドバーの件数/プレビューだけはここで即時同期する（優先度1）。
          App.Render.appShell.syncListLive();
        }).catch(function () {
          setStatus('保存できませんでした（再試行します）', false);
          if (pending && pending.noteId === savingNoteId) pending.trigger();
        });
      }, AUTOSAVE_DELAY_MS);
      pending = { noteId: noteId, getPatch: getPatch, isComposing: isComposing, flush: debounced.flush, cancel: debounced.cancel, trigger: debounced };
    } else {
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

  // ---------- リッチテキストツールバー ----------

  function toolbarButton(action, label, glyph, richActiveKey) {
    return '<button type="button" class="rich-toolbar-btn" data-action="' + action + '" title="' + label + '" aria-label="' + label + '"' +
      (richActiveKey ? ' data-rich-active="' + richActiveKey + '" aria-pressed="false"' : '') + '>' + glyph + '</button>';
  }

  function renderRichToolbar() {
    return '' +
      '<div class="rich-toolbar" id="richToolbar">' +
      toolbarButton('richToggleHeading1', '見出し1', 'H1', 'heading1') +
      toolbarButton('richToggleHeading2', '見出し2', 'H2', 'heading2') +
      toolbarButton('richToggleBold', '太字', 'B', 'bold') +
      toolbarButton('richToggleBulletList', '箇条書き', '•', 'bulletList') +
      toolbarButton('richToggleOrderedList', '番号付きリスト', '1.', 'orderedList') +
      toolbarButton('richToggleTaskList', 'チェックリスト', '☑', 'taskList') +
      toolbarButton('openLinkPicker', 'リンク', '🔗', 'link') +
      toolbarButton('openColorPicker', '文字色', 'A', null) +
      toolbarButton('richClearFormat', '書式解除', '⌫', null) +
      toolbarButton('richUndo', '元に戻す', '↶', null) +
      toolbarButton('richRedo', 'やり直す', '↷', null) +
      '</div>';
  }

  function refreshToolbarActiveStates(editor) {
    var toolbar = document.getElementById('richToolbar');
    if (!toolbar || !editor) return;
    var map = {
      heading1: editor.isActive('heading', { level: 1 }),
      heading2: editor.isActive('heading', { level: 2 }),
      bold: editor.isActive('bold'),
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
      taskList: editor.isActive('taskList'),
      link: editor.isActive('link')
    };
    Object.keys(map).forEach(function (key) {
      var btn = toolbar.querySelector('[data-rich-active="' + key + '"]');
      if (!btn) return;
      btn.classList.toggle('is-active', map[key]);
      btn.setAttribute('aria-pressed', map[key] ? 'true' : 'false');
    });
  }

  // ---------- 描画 ----------

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
        '  <div id="richEditorRoot" class="note-content-editor note-content-editor--readonly"></div>' +
        renderTrashedActions(note) +
        '</div>';
    }

    var typeName = note.typeId ? (App.Store.typesStore.getById(note.typeId) || {}).name : null;

    return '' +
      '<div class="note-editor" data-note-id="' + note.id + '">' +
      renderTopToolbar(note) +
      renderRichToolbar() +
      '  <div id="richEditorRoot" class="note-content-editor"></div>' +
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
    var initialStatus = isDraftId(note.id) ? '新しいメモ' : '保存済み';
    return '' +
      '  <div class="note-editor-toolbar">' +
      '    <button type="button" class="icon-btn mobile-only" data-action="setMobileViewListFromEditor" title="メモ一覧に戻る" aria-label="メモ一覧に戻る">←</button>' +
      '    <span id="autosaveStatus" class="autosave-status">' + initialStatus + '</span>' +
      '    <button type="button" class="icon-btn" data-action="openEditorMenu" title="その他メニュー" aria-label="その他メニュー">' + c.icon('menu') + '</button>' +
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

  /** @param {Note} note @returns {Object} Tiptapへ渡す初期JSON文書。新形式(json)はそのまま、
   *  旧プレーン形式（contentFormat未設定）は1行1段落へ変換して「表示だけ」する
   *  （実際に保存されるまでnote.content/contentFormat自体は書き換えない）。 */
  function contentJSONForNote(note) {
    if (note.contentFormat === 'json' && note.content) {
      try { return JSON.parse(note.content); } catch (e) { /* 壊れている場合は下のフォールバックへ */ }
    }
    return window.MemoApp.RichEditor.docFromPlainText(note.content || '');
  }

  /** @param {Object} editor Tiptap Editor @returns {{title:string, content:string, contentFormat:string, plainText:string}} */
  function buildPatchFromEditor(editor) {
    var json = editor.getJSON();
    var derived = window.MemoApp.RichEditor.deriveTitleAndPlainTextFromJSON(json);
    return { content: JSON.stringify(json), contentFormat: 'json', title: derived.title, plainText: derived.plainText };
  }

  /** 下書きへの最初の入力（本文が空でなくなった瞬間）で、正式なメモとしてnotesStoreへ昇格させる。
   *  空のまま一覧等へ戻った場合は何もしない（＝IndexedDBには一切書き込まれず、優先度4の要件を満たす）。
   *  昇格後もメモidは下書き時点と同じものを使い続けるため、appShell.js側の「編集中は同じメモとみなし
   *  再描画を保留する」判定が下書き→保存後の間で途切れず、入力中にエディタが作り直されない。 */
  function promoteDraftIfNeeded(noteId, patch) {
    if (!isDraftId(noteId)) return;
    if (!patch.title && !patch.plainText) return; // まだ何も入力されていない
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
    App.Render.appShell.syncListLive();
  }

  function destroyCurrentEditor() {
    if (currentEditor) {
      try { currentEditor.destroy(); } catch (e) { /* 無視 */ }
    }
    currentEditor = null;
    currentEditorNoteId = null;
    savedSelection = null; // 別メモへの切り替え等でエディタが破棄されたら、古い選択範囲は使わせない
  }

  function mount(note) {
    if (!note) { destroyCurrentEditor(); return; }

    if (!window.MemoApp.RichEditor) {
      // 通常はtype="module"の読み込みがDOMContentLoadedを待つため起こらないが、万一に備える。
      var root0 = document.getElementById('richEditorRoot');
      if (root0) root0.textContent = 'エディタを読み込み中…';
      window.addEventListener('richeditor:ready', function retryMount() {
        window.removeEventListener('richeditor:ready', retryMount);
        mount(note);
      }, { once: true });
      return;
    }

    if (note.deletedAt) {
      destroyCurrentEditor();
      var readonlyRoot = document.getElementById('richEditorRoot');
      if (readonlyRoot) readonlyRoot.innerHTML = window.MemoApp.RichEditor.htmlFromJSON(contentJSONForNote(note));
      return;
    }

    var root = document.getElementById('richEditorRoot');
    if (!root) return;
    destroyCurrentEditor();

    /** 【重要・不具合修正】このmount()呼び出し1回ぶんに閉じたローカル変数。以前はcurrentPatch/
     *  isComposingがモジュール変数currentEditorを直接参照していたため、このメモの自動保存の
     *  デバウンス（500ms）が発火する前に別のメモへ切り替えると、currentEditorはその新しい
     *  メモのエディタに差し替わってしまい、発火時に「新しいメモの内容」を「このメモのid」で
     *  保存してしまいタイトル・本文が失われる不具合があった。mount()ごとに閉じたローカル参照
     *  （editorForThisMount）を使うことで、後から別のメモが開かれてモジュール変数
     *  currentEditorが差し替わっても、このメモ専用のcurrentPatch/isComposingは常にこの
     *  メモ自身のエディタインスタンスだけを参照し続ける（textareaの頃のcontentInputクロージャと
     *  同じ考え方）。 */
    var editorForThisMount = null;

    function flushDeferredRenderIfAny() {
      App.Render.appShell.flushDeferredRender();
    }

    function currentPatch() {
      return editorForThisMount ? buildPatchFromEditor(editorForThisMount) : { title: note.title, plainText: note.plainText };
    }
    function isComposing() {
      return !!(editorForThisMount && editorForThisMount.view && editorForThisMount.view.composing);
    }
    function handleUpdate() {
      if (isComposing()) return; // IME変換中は確定まで待つ（確定時に改めてupdateが発火する）
      var patch = currentPatch();
      promoteDraftIfNeeded(note.id, patch);
      scheduleSave(note.id, currentPatch, isComposing);
      refreshToolbarActiveStates(editorForThisMount);
    }

    var editor = window.MemoApp.RichEditor.mount(root, {
      content: contentJSONForNote(note),
      autofocus: isDraftId(note.id),
      onUpdate: handleUpdate,
      onSelectionUpdate: function () { refreshToolbarActiveStates(editorForThisMount); }
    });
    editorForThisMount = editor;
    currentEditor = editor; // ツールバー操作等、常に「今表示中」のエディタを指すためのモジュール変数（こちらは差し替わって正しい）
    currentEditorNoteId = note.id;
    editor.on('blur', flushDeferredRenderIfAny);
    refreshToolbarActiveStates(editor);

    // ツールバーのボタンを押した際、contenteditableからフォーカスが移って選択範囲が
    // 失われることがないよう、既定のフォーカス移動そのものを止める（clickイベント自体は
    // 止めないため、render/common.jsのdata-action委譲は通常どおり動く）。
    // iPhone Safariでのタップも正しく扱うため、対応していればPointer Eventsを使う
    // （mousedownとの重複登録はしない＝1回のタップで二重発火しない）。
    var toolbar = document.getElementById('richToolbar');
    if (toolbar) {
      var pointerEventName = window.PointerEvent ? 'pointerdown' : 'mousedown';
      toolbar.addEventListener(pointerEventName, function (evt) {
        if (evt.target.closest('[data-action]')) evt.preventDefault();
      });
    }
  }

  App.Render.noteEditor = {
    render: render,
    mount: mount,
    flushPending: flushPending,
    getCurrentEditor: getCurrentEditor,
    getCurrentNoteId: getCurrentNoteId,
    captureSelection: captureSelection,
    captureSelectionForLink: captureSelectionForLink,
    getSavedSelection: getSavedSelection,
    clearSavedSelection: clearSavedSelection,
    resolveSavedRange: resolveSavedRange,
    AUTOSAVE_DELAY_MS: AUTOSAVE_DELAY_MS
  };
})(window.MemoApp = window.MemoApp || {});
