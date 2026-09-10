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

 ============================================================================
 【責務の分離】以下の4つを明確に分けて扱う。混ざると「リンク・文字色が反映されない」
 「書式ボタンが1回目に反応しない」という不具合になる（実際になっていた）。

 (1) エディタの生存期間 …… Tiptapインスタンスは「開いているメモ」に紐づく。#appMainの
     再描画には紐づかない。以前はrenderMainRegion()がinnerHTMLを差し替えるたびに
     mount()がdestroy＋再生成しており、シートを開いた拍子の再描画だけでエディタが
     作り直され、退避しておいた選択範囲も編集履歴も失われていた。現在はTiptapがマウント
     されているDOM要素（editorHostEl）自体をモジュール変数で保持し、再描画のたびに
     新しいDOMツリーの所定の位置へ差し込み直す。同じメモを開いている限り作り直さない。

 (2) 選択範囲の退避 …… リンク/文字色/その他書式のシートを開くとフォーカスがエディタから
     外れる。適用時に使う座標は「シートを開く直前」に退避したものを使い、適用直前に
     setTextSelection()で復元する。退避データは対象メモIDを持ち、別メモへ移ったら使わない。
     (1)によりエディタ自体が生き残るため、退避データも再描画では消えない。

 (3) 再描画のタイミング …… 本文欄にフォーカスがある間の#appMain再描画はappShell.js側で
     保留される（IME保護）。保留解除（flushDeferredRender）は本文欄からフォーカスが
     外れた時に行うが、フォーカスの移り先がツールバーやシートの場合は保留したままにする。
     ここで再描画してしまうと、今まさに押されているボタンのDOMが差し替わり、
     続いて発火するclickが委譲リスナーのroot.contains()判定で捨てられてしまうため
     （＝「1回目のタップが効かない」不具合の正体）。

 (4) 自動保存 …… Tiptapのon-updateを唯一の起点にし、500msデバウンス。IME変換中
     （editor.view.composing）は保存を待つ。書式コマンドも文書変更なのでonUpdateが走り、
     同じ経路で保存される（書式ごとの個別保存処理は持たない）。
 ============================================================================
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};
  var c = App.Render.common;

  var AUTOSAVE_DELAY_MS = 500;

  /** @type {{noteId: string, getPatch: Function, isComposing: Function, flush: Function, cancel: Function, trigger: Function}|null} */
  var pending = null;

  // ---------- (1) エディタの生存期間 ----------

  var currentEditor = null;
  var currentEditorNoteId = null;
  /** Tiptapがマウントされている実DOM。#appMainのinnerHTML差し替えで一旦DOMツリーから外れるが、
   *  この参照が生きているため要素自体は破棄されず、mount()で新しいツリーへ差し戻せる。 */
  var editorHostEl = null;

  // ---------- (2) 選択範囲の退避 ----------

  /** シート（リンク・文字色・その他の書式）を開いた時点の選択範囲。
   *  @type {{kind:string, noteId:string, from:number, to:number, selectedText:string, existingHref:string, isEmpty:boolean}|null} */
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

  /** @param {string} kind @returns {Object|null} 現在の選択範囲を退避して返す */
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
   *  扱う（extendMarkRange）。これによりURL/表示文字の編集・解除の対象がリンク全体になる。 */
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

  /** 退避した座標を、現在の文書サイズの範囲内へ安全に補正する。
   *  対象メモが変わっていた場合や、エディタが存在しない場合はnullを返す。
   *  @param {string} kind @returns {{from:number, to:number}|null} */
  function resolveSavedRange(kind) {
    if (!currentEditor || !savedSelection || savedSelection.kind !== kind) return null;
    if (savedSelection.noteId !== currentEditorNoteId) return null; // 別のメモへ移動していた
    var maxPos = currentEditor.state.doc.content.size;
    var from = Math.max(0, Math.min(savedSelection.from, maxPos));
    var to = Math.max(from, Math.min(savedSelection.to, maxPos));
    return { from: from, to: to };
  }

  /** 退避した選択範囲を復元したうえで書式コマンドを実行する共通経路
   *  （リンク・文字色・その他の書式シートから使う）。
   *  @param {string} kind @param {(chain:Object, range:Object|null) => Object|null} build
   *  @returns {boolean} 実行できたか */
  function runWithSavedSelection(kind, build) {
    var editor = currentEditor;
    if (!editor || editor.isDestroyed) return false;
    var range = resolveSavedRange(kind);
    var chain = editor.chain().focus();
    if (range) chain = chain.setTextSelection(range);
    var built = build(chain, range);
    if (!built) return false;
    built.run();
    return true;
  }

  // ---------- (4) 自動保存 ----------

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
   * 【重要】保留中のデバウンス（pending）が「作成した時点」のgetPatchを握ったままだと、
   * 作り直される前の（＝既に破棄された）エディタを読み続けてしまう。これを防ぐため、
   * pending.getPatch/isComposingは毎回のscheduleSave呼び出しで必ず最新のものに更新する。
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
          // 編集中は#appMain全体の再描画をappShell.js側で遅延させているため（IME対策）、
          // 一覧・サイドバーの件数/プレビューだけはここで即時同期する。
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

  // ---------- リッチテキストツールバー（項目4） ----------

  /* iPhoneで横スクロールしないと「リンク」「文字色」へ届かない問題への対処として、
     よく使う「太字・文字色・リンク」だけを常時表示し、残り（見出し・小見出し・箇条書き・
     番号付きリスト・チェックリスト・書式解除・元に戻す・やり直す）は「その他の書式」シートへ
     まとめる。シート側は文字ラベル付きなので、記号だけでは意味が分からない操作も読める。 */

  /** @param {string} action @param {string} label 読み上げ・ツールチップ用の説明
   *  @param {string} glyph 表示する記号 @param {string|null} richActiveKey 有効状態の判定キー */
  function toolbarButton(action, label, glyph, richActiveKey) {
    return '<button type="button" class="rich-toolbar-btn" data-action="' + action + '" title="' + c.escapeHtml(label) + '" aria-label="' + c.escapeHtml(label) + '"' +
      (richActiveKey ? ' data-rich-active="' + richActiveKey + '" aria-pressed="false"' : '') + '>' +
      '<span aria-hidden="true">' + glyph + '</span></button>';
  }

  function renderRichToolbar() {
    return '' +
      '<div class="rich-toolbar" id="richToolbar" role="toolbar" aria-label="書式">' +
      toolbarButton('richToggleBold', '太字', 'B', 'bold') +
      toolbarButton('openColorPicker', '文字色', 'A', 'textColor') +
      toolbarButton('openLinkPicker', 'リンク', '🔗', 'link') +
      toolbarButton('openFormatMenu', 'その他の書式', '⋯', 'otherFormat') +
      '</div>';
  }

  /** 各書式が今の選択範囲で有効かどうか。ツールバーと「その他の書式」シートの両方で同じ判定を使う。 */
  function computeActiveFormats(editor) {
    if (!editor || editor.isDestroyed) return {};
    return {
      bold: editor.isActive('bold'),
      textColor: editor.isActive('textColor'),
      link: editor.isActive('link'),
      heading1: editor.isActive('heading', { level: 1 }),
      heading2: editor.isActive('heading', { level: 2 }),
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
      taskList: editor.isActive('taskList')
    };
  }

  /** 「その他の書式」に入っているどれかが有効なら、まとめボタン自体も有効表示にする
   *  （隠れている書式が今かかっていることを、シートを開かなくても分かるようにするため）。 */
  function isAnyGroupedFormatActive(map) {
    return !!(map.heading1 || map.heading2 || map.bulletList || map.orderedList || map.taskList);
  }

  function refreshToolbarActiveStates(editor) {
    var toolbar = document.getElementById('richToolbar');
    if (!toolbar || !editor || editor.isDestroyed) return;
    var map = computeActiveFormats(editor);
    map.otherFormat = isAnyGroupedFormatActive(map);
    Object.keys(map).forEach(function (key) {
      var btn = toolbar.querySelector('[data-rich-active="' + key + '"]');
      if (!btn) return;
      btn.classList.toggle('is-active', !!map[key]);
      btn.setAttribute('aria-pressed', map[key] ? 'true' : 'false');
    });
  }

  // ---------- (項目5) ソフトウェアキーボードへの追従 ----------

  /* position:sticky;top:0 だけでは「編集画面の上端」に留まるだけで、キーボードの直上に来る保証がない。
     visualViewport APIで「レイアウトビューポートのうち実際には見えていない下端の高さ」を求め、
     その分だけ持ち上げた位置にツールバーを固定する。非対応環境では何もしない＝従来のstickyのまま。 */

  var KEYBOARD_OPEN_THRESHOLD_PX = 120; // これ未満の差はアドレスバーの伸縮とみなしキーボード扱いしない
  var viewportListenersBound = false;

  function updateKeyboardInset() {
    var vv = window.visualViewport;
    if (!vv) return;
    var hiddenBottom = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
    var root = document.documentElement;
    root.style.setProperty('--keyboard-inset-bottom', Math.round(hiddenBottom) + 'px');
    root.classList.toggle('is-keyboard-open', hiddenBottom > KEYBOARD_OPEN_THRESHOLD_PX);
  }

  function bindViewportListeners() {
    if (viewportListenersBound) return;
    viewportListenersBound = true;
    var vv = window.visualViewport;
    if (!vv) return; // 非対応環境はstickyのまま（フォールバック）
    // キーボードの開閉・Safariのアドレスバー伸縮・ページ内スクロールのいずれでも発火する
    vv.addEventListener('resize', updateKeyboardInset);
    vv.addEventListener('scroll', updateKeyboardInset);
    window.addEventListener('orientationchange', function () {
      // 回転直後はまだ新しい寸法が確定していないことがあるため、少し後にも測り直す
      updateKeyboardInset();
      window.setTimeout(updateKeyboardInset, 300);
    });
    updateKeyboardInset();
  }

  /** 編集中のカーソルが、下部に固定されたツールバーの裏に隠れないようスクロールを補正する。 */
  function keepCursorVisible(editor) {
    if (!editor || editor.isDestroyed || !editor.view) return;
    if (!document.documentElement.classList.contains('is-keyboard-open')) return;
    try {
      var coords = editor.view.coordsAtPos(editor.state.selection.head);
      var toolbar = document.getElementById('richToolbar');
      if (!toolbar) return;
      var bar = toolbar.getBoundingClientRect();
      if (coords.bottom > bar.top - 8) {
        var scroller = document.querySelector('.note-editor');
        if (scroller) scroller.scrollTop += (coords.bottom - bar.top) + 24;
      }
    } catch (e) { /* 座標が取れない場合は何もしない */ }
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
        '  <div class="note-content-editor note-content-editor--readonly" id="richEditorReadonly"></div>' +
        renderTrashedActions(note) +
        '</div>';
    }

    var typeName = note.typeId ? (App.Store.typesStore.getById(note.typeId) || {}).name : null;

    // richEditorSlotは「ここにエディタを差し込む」という目印だけの空要素。mount()が、
    // 使い回しているエディタ本体（editorHostEl）でこの要素を置き換える。
    return '' +
      '<div class="note-editor" data-note-id="' + note.id + '">' +
      renderTopToolbar(note) +
      renderRichToolbar() +
      '  <div id="richEditorSlot"></div>' +
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

  /** @param {string} title @param {string} content 旧プレーン形式（リッチテキスト移行前）は
   *  title＝1行目、content＝2行目以降というように別フィールドで保持しており、
   *  contentだけにはタイトルの文字列が含まれていない。1つのテキストへ結合してから
   *  Tiptap文書へ変換する必要がある（結合しないとタイトル行が表示されない不具合になる）。 */
  function joinLegacyTitleAndContent(title, content) {
    if (!title) return content || '';
    if (!content) return title;
    return title + '\n' + content;
  }

  function contentJSONForNote(note) {
    if (note.contentFormat === 'json' && note.content) {
      try { return JSON.parse(note.content); } catch (e) { /* 壊れている場合は下のフォールバックへ */ }
    }
    return window.MemoApp.RichEditor.docFromPlainText(joinLegacyTitleAndContent(note.title, note.content));
  }

  /** @param {Object} editor Tiptap Editor @returns {{title:string, content:string, contentFormat:string, plainText:string}} */
  function buildPatchFromEditor(editor) {
    var json = editor.getJSON();
    var derived = window.MemoApp.RichEditor.deriveTitleAndPlainTextFromJSON(json);
    return { content: JSON.stringify(json), contentFormat: 'json', title: derived.title, plainText: derived.plainText };
  }

  /** 下書きへの最初の入力（本文が空でなくなった瞬間）で、正式なメモとしてnotesStoreへ昇格させる。
   *  空のまま一覧等へ戻った場合は何もしない（＝IndexedDBには一切書き込まれない）。 */
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
    editorHostEl = null;
    savedSelection = null; // 別メモへ切り替えたら、古い選択範囲は使わせない
  }

  /**
   * 現在の#appMainのDOMへ、使い回しているエディタ本体を差し込む。
   * @returns {boolean} 差し込めたか（目印が無い＝エディタを表示しない画面ならfalse）
   */
  function attachEditorHost() {
    var slot = document.getElementById('richEditorSlot');
    if (!slot || !editorHostEl) return false;
    slot.replaceWith(editorHostEl);
    return true;
  }

  /**
   * 【責務(1)】同じメモを開き続けている限り、Tiptapインスタンスは作り直さない。
   * #appMainの再描画で一旦DOMツリーから外れた本体を、新しいツリーへ差し戻すだけにする。
   * これにより、シートを開いた拍子の再描画で選択範囲・編集履歴・入力中の状態が失われない。
   */
  function mount(note) {
    if (!note) { destroyCurrentEditor(); return; }

    if (!window.MemoApp.RichEditor) {
      // 通常はtype="module"の読み込みがDOMContentLoadedを待つため起こらないが、万一に備える。
      var slot0 = document.getElementById('richEditorSlot');
      if (slot0) slot0.textContent = 'エディタを読み込み中…';
      window.addEventListener('richeditor:ready', function retryMount() {
        window.removeEventListener('richeditor:ready', retryMount);
        mount(note);
      }, { once: true });
      return;
    }

    if (note.deletedAt) {
      destroyCurrentEditor();
      var readonlyRoot = document.getElementById('richEditorReadonly');
      if (readonlyRoot) readonlyRoot.innerHTML = window.MemoApp.RichEditor.htmlFromJSON(contentJSONForNote(note));
      return;
    }

    // 同じメモを開いたままの再描画: 既存インスタンスをそのまま新しいDOMへ差し戻す
    if (currentEditor && !currentEditor.isDestroyed && currentEditorNoteId === note.id) {
      if (attachEditorHost()) {
        bindToolbarFocusGuard();
        refreshToolbarActiveStates(currentEditor);
      }
      // 目印が無い場合＝このメモの編集画面が今は描画されていない（別画面）。
      // インスタンスは保持したままにして、戻ってきた時にそのまま差し戻す。
      return;
    }

    // ここから先は「別のメモを開いた」または「初回」のときだけ通る
    destroyCurrentEditor();

    editorHostEl = document.createElement('div');
    editorHostEl.className = 'note-content-editor';
    if (!attachEditorHost()) { editorHostEl = null; return; }

    /** このmount()呼び出し1回ぶんに閉じたローカル変数。後から別のメモが開かれて
     *  モジュール変数currentEditorが差し替わっても、このメモ専用のcurrentPatch/isComposingは
     *  常にこのメモ自身のエディタインスタンスだけを参照し続ける。 */
    var editorForThisMount = null;

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
      keepCursorVisible(editorForThisMount);
    }

    var editor = window.MemoApp.RichEditor.mount(editorHostEl, {
      content: contentJSONForNote(note),
      autofocus: isDraftId(note.id),
      onUpdate: handleUpdate,
      onSelectionUpdate: function () { refreshToolbarActiveStates(editorForThisMount); }
    });
    editorForThisMount = editor;
    currentEditor = editor;
    currentEditorNoteId = note.id;

    /** 【責務(3)】保留していた再描画をここで解除する。ただしフォーカスの移り先が
     *  ツールバー/オーバーレイの場合は保留したままにする。今まさに押されているボタンの
     *  DOMを差し替えてしまうと、続いて発火するclickが委譲リスナーの
     *  root.contains()判定で捨てられ、「1回目のタップが効かない」不具合になるため。
     *  この場合の再描画は、シートを閉じた時などの次のrenderAll()で自然に行われる。 */
    editor.on('blur', function () {
      window.setTimeout(function () {
        var active = document.activeElement;
        if (active && active.closest && active.closest('#richToolbar, #appOverlay')) return;
        App.Render.appShell.flushDeferredRender();
      }, 0);
    });

    // チェックリストのチェック切り替えは「即時保存」する（デバウンスの500msを待たない）。
    editorHostEl.addEventListener('change', function (evt) {
      if (evt.target && evt.target.type === 'checkbox') flushPending();
    });

    bindViewportListeners();
    bindToolbarFocusGuard();
    refreshToolbarActiveStates(editor);
  }

  /** ツールバーのボタンを押した際、contenteditableからフォーカスが移って選択範囲が
   *  失われることがないよう、既定のフォーカス移動そのものを止める（clickイベント自体は
   *  止めないため、render/common.jsのdata-action委譲は通常どおり動き、シートも開く）。
   *  ツールバーDOMは再描画で作り直されるため、再描画のたびに張り直す必要がある。
   *  iPhone Safariでのタップも正しく扱うため、対応していればPointer Eventsを使う
   *  （mousedownとの重複登録はしない＝1回のタップで二重発火しない）。 */
  function bindToolbarFocusGuard() {
    var toolbar = document.getElementById('richToolbar');
    if (!toolbar || toolbar.getAttribute('data-focus-guard') === 'bound') return;
    toolbar.setAttribute('data-focus-guard', 'bound');
    var pointerEventName = window.PointerEvent ? 'pointerdown' : 'mousedown';
    toolbar.addEventListener(pointerEventName, function (evt) {
      if (evt.target.closest('[data-action]')) evt.preventDefault();
    });
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
    runWithSavedSelection: runWithSavedSelection,
    computeActiveFormats: computeActiveFormats,
    refreshToolbarActiveStates: refreshToolbarActiveStates,
    AUTOSAVE_DELAY_MS: AUTOSAVE_DELAY_MS
  };
})(window.MemoApp = window.MemoApp || {});
