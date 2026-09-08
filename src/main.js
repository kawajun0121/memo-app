/*
 役割: アプリの起動処理と、data-action属性から呼ばれるApp.Actionsハンドラの登録。
 依存: すべてのstore/*.js, render/*.js（index.htmlでこれより先に読み込まれている前提）
*/
(function (App) {
  'use strict';

  // ---------- 起動 ----------
  // IndexedDBの読み込み（非同期）→ ログイン状態の判定・クラウド同期の開始 → 画面表示、の順で行う。
  // ログインなし、またはFirebase自体が使えない場合も、ローカルのみでアプリ本体が使えるようにする。

  var mainAppInitialized = false;

  function bootMainApp() {
    if (mainAppInitialized) {
      App.Render.appShell.renderAll();
      return;
    }
    mainAppInitialized = true;

    App.Render.appShell.init();
    App.Render.shortcuts.init();

    var rerender = function () { App.Render.appShell.renderAll(); };
    App.Store.notesStore.subscribe(rerender);
    App.Store.categoriesStore.subscribe(rerender);
    App.Store.typesStore.subscribe(rerender);
    App.Store.savedViewsStore.subscribe(rerender);
    App.Store.uiStore.subscribe(rerender);
    App.Store.historyStore.subscribe(rerender);
    App.Store.aiSuggestStore.subscribe(rerender);
    if (App.Store.syncStatusStore) App.Store.syncStatusStore.subscribe(rerender);

    App.Render.appShell.renderAll();

    window.addEventListener('beforeunload', function () {
      App.Render.noteEditor.flushPending();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        App.Render.noteEditor.flushPending();
      }
    });
  }

  function startAppOrAuth() {
    if (!App.Sync || !App.Sync.available) {
      bootMainApp();
      return;
    }
    App.Sync.onSkip = function () {
      App.Db.settingsRepo.setSyncSkipped(true);
      bootMainApp();
    };
    App.Sync.auth.onAuthStateChanged(function (user) {
      if (user) {
        App.Db.settingsRepo.setSyncSkipped(false); // ログイン済みなら以後は同期を試みる
        App.Sync.cloudSync.start(bootMainApp);
      } else {
        App.Sync.cloudSync.stop();
        if (!mainAppInitialized) {
          // 前回「同期せずこの端末だけで使う」を選んでいれば、毎回ログイン画面を出さず直接アプリを開く
          if (App.Db.settingsRepo.getSyncSkipped()) {
            bootMainApp();
          } else {
            App.Sync.authUI.render();
          }
        }
      }
    });
  }

  function boot() {
    Promise.all([
      App.Store.notesStore.init(),
      App.Store.categoriesStore.init(),
      App.Store.typesStore.init(),
      App.Store.savedViewsStore.init()
    ]).then(startAppOrAuth).catch(function (err) {
      console.error('起動に失敗しました', err);
      var app = document.getElementById('app');
      if (app) app.innerHTML = '<div class="fatal-error">アプリの起動に失敗しました。ページを再読み込みしてください。</div>';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  App.Actions['signOut'] = function () {
    if (window.confirm('ログアウトします。よろしいですか？（この端末のデータは消えません）')) {
      App.Sync.auth.signOut();
      App.Sync.cloudSync.stop();
      App.Sync.authUI.render();
    }
  };

  App.Actions['showLoginFromSettings'] = function () {
    App.Store.uiStore.closePanel('settingsOpen');
    App.Sync.authUI.render();
  };

  // ---------- ナビゲーション ----------

  App.Actions['navBasicMenu'] = function (d) {
    App.Store.uiStore.selectBasicMenu(d.id);
  };

  App.Actions['navCategory'] = function (d, evt) {
    if (evt && (evt.ctrlKey || evt.metaKey)) {
      App.Store.uiStore.toggleCategoryFilter(d.id);
      return;
    }
    var cat = App.Store.categoriesStore.getById(d.id);
    if (cat) App.Store.uiStore.selectCategory(cat.id, cat.name);
  };

  App.Actions['navType'] = function (d) {
    var type = App.Store.typesStore.getById(d.id);
    if (type) App.Store.uiStore.selectType(type.id, type.name);
  };

  App.Actions['navStandardSmartView'] = function (d) {
    App.Store.uiStore.selectStandardSmartView(d.id);
  };

  App.Actions['navSavedView'] = function (d) {
    var view = App.Store.savedViewsStore.getById(d.id);
    if (view) App.Store.uiStore.selectSavedView(view);
  };

  App.Actions['editSavedView'] = function (d) {
    App.Store.uiStore.openPanel('saveViewModalOpen', { editSavedViewId: d.id });
  };

  // ---------- パネル開閉 ----------

  App.Actions['closeSettings'] = function () { App.Store.uiStore.closePanel('settingsOpen'); };

  App.Actions['closeCategoryManager'] = function () { App.Store.uiStore.closePanel('categoryManagerOpen'); };

  App.Actions['openHistoryPanel'] = function (d) {
    App.Render.noteEditor.flushPending();
    App.Store.uiStore.closePanel('editorMenuOpen');
    App.Store.uiStore.openPanel('historyOpen');
    App.Store.historyStore.loadForNote(d.id);
  };
  App.Actions['closeHistoryPanel'] = function () {
    App.Store.uiStore.closePanel('historyOpen');
    App.Store.historyStore.clear();
  };

  App.Actions['openAiSuggest'] = function (d) {
    App.Render.noteEditor.flushPending();
    var note = App.Store.notesStore.getById(d.id);
    if (!note) return;
    App.Store.uiStore.closePanel('editorMenuOpen');
    App.Store.uiStore.openPanel('aiSuggestOpen');
    App.Store.aiSuggestStore.requestFor(note);
  };
  App.Actions['closeAiSuggest'] = function () {
    App.Store.uiStore.closePanel('aiSuggestOpen');
    App.Store.aiSuggestStore.clear();
  };

  App.Actions['openSaveViewModal'] = function () {
    App.Render.noteEditor.flushPending();
    App.Store.uiStore.openPanel('saveViewModalOpen', { editSavedViewId: null });
  };
  App.Actions['closeSaveViewModal'] = function () {
    App.Store.uiStore.closePanel('saveViewModalOpen');
  };

  App.Actions['openCategoryManager'] = function () { App.Render.noteEditor.flushPending(); App.Store.uiStore.openPanel('categoryManagerOpen'); };

  App.Actions['openSettings'] = function () { App.Render.noteEditor.flushPending(); App.Store.uiStore.openPanel('settingsOpen'); };

  // ---------- カテゴリ・種類ピッカー（エディタ用。標準のprompt()は使わない） ----------

  /** 現在編集中のメモ（下書き含む）を1件だけ返す */
  function currentEditingNote() {
    var ui = App.Store.uiStore.getState();
    if (ui.draftNote) return ui.draftNote;
    if (ui.selectedNoteId) return App.Store.notesStore.getById(ui.selectedNoteId);
    return null;
  }

  /** 下書き/既存メモのどちらでも同じ書き方で更新できるようにする */
  function updateCurrentNote(patch) {
    var ui = App.Store.uiStore.getState();
    if (ui.draftNote) {
      App.Store.uiStore.updateDraftNote(patch);
      return;
    }
    if (ui.selectedNoteId) App.Store.notesStore.update(ui.selectedNoteId, patch);
  }

  App.Actions['openCategoryPicker'] = function () {
    App.Render.noteEditor.flushPending();
    App.Store.uiStore.openPanel('categoryPickerOpen');
  };
  App.Actions['closeCategoryPicker'] = function () { App.Store.uiStore.closePanel('categoryPickerOpen'); };

  App.Actions['openTypePicker'] = function () {
    App.Render.noteEditor.flushPending();
    App.Store.uiStore.openPanel('typePickerOpen');
  };
  App.Actions['closeTypePicker'] = function () { App.Store.uiStore.closePanel('typePickerOpen'); };

  App.Actions['openEditorMenu'] = function () {
    App.Render.noteEditor.flushPending();
    App.Store.uiStore.openPanel('editorMenuOpen');
  };
  App.Actions['closeEditorMenu'] = function () { App.Store.uiStore.closePanel('editorMenuOpen'); };

  App.Actions['toggleCategoryOnNote'] = function (d) {
    var note = currentEditingNote();
    if (!note) return;
    var has = note.categoryIds.indexOf(d.id) !== -1;
    updateCurrentNote({ categoryIds: has ? note.categoryIds.filter(function (id) { return id !== d.id; }) : note.categoryIds.concat([d.id]) });
  };

  App.Actions['addCategoryOnNote'] = function () {
    var input = document.getElementById('categoryPickerAddInput');
    if (!input || !input.value.trim()) return;
    var category = App.Store.categoriesStore.getOrCreate(input.value);
    var note = currentEditingNote();
    if (category && note && note.categoryIds.indexOf(category.id) === -1) {
      updateCurrentNote({ categoryIds: note.categoryIds.concat([category.id]) });
    }
    input.value = '';
  };

  App.Actions['selectTypeOnNote'] = function (d) {
    var note = currentEditingNote();
    if (!note) return;
    updateCurrentNote({ typeId: note.typeId === d.id ? null : d.id });
    App.Store.uiStore.closePanel('typePickerOpen');
  };

  App.Actions['addTypeOnNote'] = function () {
    var input = document.getElementById('typePickerAddInput');
    if (!input || !input.value.trim()) return;
    var type = App.Store.typesStore.getOrCreate(input.value);
    if (type) updateCurrentNote({ typeId: type.id });
    input.value = '';
    App.Store.uiStore.closePanel('typePickerOpen');
  };

  // ---------- メモ単体操作 ----------

  App.Actions['openNote'] = function (d) {
    // スワイプで削除ボタンが開いている間のタップは、メモを開かず閉じるだけにする
    // （iPhone純正メモアプリ等と同様の挙動）。同じカードを再タップした場合はこちらに入る。
    if (App.Store.uiStore.getState().revealedDeleteNoteId) {
      App.Store.uiStore.hideRevealedDelete();
      return;
    }
    App.Store.uiStore.selectNote(d.id);
  };

  // 空メモを一覧に残さないため、「＋新規作成」時点ではまだIndexedDBに保存しない下書き状態にする。
  // 最初の入力（本文が空でなくなった瞬間）にnoteEditor.js側でnotesStore.create()へ昇格させる。
  // 何も入力せず一覧・検索・整理タブへ戻った場合は、uiStore側の自動破棄ロジックによりそのまま消える
  // （新規作成ボタン・Ctrl+Nの両方から呼ばれる）。
  App.Actions['createFullNote'] = function () {
    var draft = App.Db.notesRepo.createEmptyNote({});
    App.Store.uiStore.setDraftNote(draft);
    setTimeout(function () {
      var contentInput = document.getElementById('noteContentInput');
      if (contentInput) contentInput.focus();
    }, 0);
  };

  // 一覧でのスワイプ削除（削除ボタン自体をタップしたときだけ実行される）
  App.Actions['hideRevealedDelete'] = function () {
    App.Store.uiStore.hideRevealedDelete();
  };

  App.Actions['deleteRevealedNote'] = function (d) {
    App.Store.notesStore.softDelete(d.id);
    App.Store.uiStore.hideRevealedDelete();
    if (App.Store.uiStore.getState().selectedNoteId === d.id) App.Store.uiStore.selectNote(null);
    showUndoToast('ゴミ箱に移動しました', [d.id]);
  };

  // ---------- 軽いフィードバック（トースト） ----------
  // ゴミ箱移動直後など、一定時間だけ「元に戻す」を出す。誤操作防止のため（優先度16）。
  var TOAST_DURATION_MS = 6000;
  var toastTimer = null;

  function showUndoToast(message, restoreIds) {
    if (toastTimer) clearTimeout(toastTimer);
    App.Store.uiStore.showToast({ message: message, restoreIds: restoreIds });
    toastTimer = setTimeout(function () { App.Store.uiStore.clearToast(); }, TOAST_DURATION_MS);
  }

  App.Actions['undoToast'] = function () {
    var toast = App.Store.uiStore.getState().toast;
    if (toastTimer) clearTimeout(toastTimer);
    App.Store.uiStore.clearToast();
    if (toast && toast.restoreIds) App.Store.notesStore.bulkRestore(toast.restoreIds);
  };

  App.Actions['dismissToast'] = function () {
    if (toastTimer) clearTimeout(toastTimer);
    App.Store.uiStore.clearToast();
  };

  // ---------- スマホ幅でのナビゲーション ----------

  App.Actions['setMobileViewOrganize'] = function () {
    App.Store.uiStore.setMobileView('organize');
  };

  App.Actions['setMobileViewList'] = function () {
    App.Store.uiStore.setMobileView('list');
  };

  App.Actions['setMobileViewSearch'] = function () {
    App.Store.uiStore.setMobileView('search');
  };

  App.Actions['setMobileViewListFromEditor'] = function () {
    App.Render.noteEditor.flushPending();
    App.Store.uiStore.setMobileView('list');
  };

  // その他メニュー（editorMenuOpen）から呼ばれる操作は、選んだ時点でメニュー自体を閉じる
  // （開いていなければclosePanelは何もしないため、他の呼び出し元にも影響しない）。
  App.Actions['toggleFavorite'] = function (d) {
    App.Store.uiStore.closePanel('editorMenuOpen');
    var note = App.Store.notesStore.getById(d.id);
    if (note) App.Store.notesStore.update(d.id, { isFavorite: !note.isFavorite });
  };

  App.Actions['togglePinned'] = function (d) {
    App.Store.uiStore.closePanel('editorMenuOpen');
    var note = App.Store.notesStore.getById(d.id);
    if (note) App.Store.notesStore.update(d.id, { isPinned: !note.isPinned });
  };

  App.Actions['toggleNeedsOrganizing'] = function (d) {
    var note = App.Store.notesStore.getById(d.id);
    if (note) App.Store.notesStore.update(d.id, { needsOrganizing: !note.needsOrganizing });
  };

  App.Actions['archiveNote'] = function (d) { App.Store.uiStore.closePanel('editorMenuOpen'); App.Store.notesStore.update(d.id, { isArchived: true }); };
  App.Actions['unarchiveNote'] = function (d) { App.Store.uiStore.closePanel('editorMenuOpen'); App.Store.notesStore.update(d.id, { isArchived: false }); };

  App.Actions['trashNote'] = function (d) {
    App.Store.uiStore.closePanel('editorMenuOpen');
    App.Store.notesStore.softDelete(d.id);
    if (App.Store.uiStore.getState().selectedNoteId === d.id) App.Store.uiStore.selectNote(null);
    showUndoToast('ゴミ箱に移動しました', [d.id]);
  };

  App.Actions['restoreNote'] = function (d) {
    App.Store.notesStore.restore(d.id);
  };

  App.Actions['permanentDeleteNote'] = function (d) {
    if (!window.confirm('このメモを完全に削除します。この操作は取り消せません。よろしいですか？')) return;
    App.Store.notesStore.permanentDelete(d.id);
    App.Store.uiStore.selectNote(null);
  };

  App.Actions['removeCategoryFromNote'] = function (d, evt, el) {
    var editor = el.closest('.note-editor');
    if (!editor) return;
    var noteId = editor.getAttribute('data-note-id');
    var note = App.Store.notesStore.getById(noteId);
    if (!note) return;
    App.Store.notesStore.update(noteId, { categoryIds: note.categoryIds.filter(function (id) { return id !== d.id; }) });
  };

  App.Actions['restoreHistory'] = function (d) {
    var hs = App.Store.historyStore.getState();
    var entry = hs.entries.find(function (e) { return e.id === d.id; });
    if (!entry) return;
    if (!window.confirm('この状態に復元しますか？現在の内容は上書きされます（復元前の状態も履歴に残ります）。')) return;
    App.Store.notesStore.update(entry.noteId, {
      title: entry.title,
      content: entry.content,
      categoryIds: entry.categoryIds.slice(),
      typeId: entry.typeId
    }).then(function () {
      App.Store.historyStore.loadForNote(entry.noteId);
    });
  };

  // ---------- 一覧ツールバー ----------

  App.Actions['changeSort'] = function (d, evt, el) {
    var parts = el.value.split('-');
    var current = App.Store.uiStore.getState().sort;
    App.Store.uiStore.setSort({ field: parts[0], direction: parts[1], pinnedFirst: current.pinnedFirst });
  };

  App.Actions['togglePinnedFirst'] = function (d, evt, el) {
    var current = App.Store.uiStore.getState().sort;
    App.Store.uiStore.setSort(Object.assign({}, current, { pinnedFirst: el.checked }));
  };

  App.Actions['toggleIncludeArchived'] = function (d, evt, el) {
    App.Store.uiStore.setIncludeArchivedInSearch(el.checked);
  };

  // ---------- 検索・絞り込み画面（スマホ幅の独立画面） ----------

  App.Actions['searchToggleCategory'] = function (d) {
    App.Store.uiStore.toggleCategoryFilter(d.id);
  };

  App.Actions['searchToggleFavorite'] = function (d, evt, el) {
    App.Store.uiStore.setFilterFavorite(el.checked);
  };

  App.Actions['searchToggleNeedsOrganizing'] = function (d, evt, el) {
    App.Store.uiStore.setFilterNeedsOrganizing(el.checked);
  };

  App.Actions['searchSelectType'] = function (d, evt, el) {
    App.Store.uiStore.setFilterTypeId(el.value || null);
  };

  App.Actions['searchResetFilter'] = function () {
    App.Store.uiStore.resetFilter();
  };

  App.Actions['toggleMultiSelect'] = function () {
    var ui = App.Store.uiStore.getState();
    if (ui.multiSelectMode) App.Store.uiStore.exitMultiSelect();
    else App.Store.uiStore.enterMultiSelect();
  };

  App.Actions['toggleNoteChecked'] = function (d) {
    App.Store.uiStore.toggleSelected(d.id);
  };

  App.Actions['selectAllVisible'] = function () {
    App.Store.uiStore.selectAllIds(App.Render.appShell.getLastRenderedNoteIds());
  };

  App.Actions['clearSelection'] = function () {
    App.Store.uiStore.exitMultiSelect();
  };

  // 検索欄は入力のたびに検索するため、change委譲ではなくinputイベントを直接使う。
  // appShellの再描画ごとに要素が作り直されるためnoteList.mount()内で毎回束ね直す。
  var searchDebounced = App.Logic.debounce(function (value) {
    App.Store.uiStore.setKeyword(value);
  }, 150);
  document.addEventListener('input', function (evt) {
    if (evt.target && (evt.target.id === 'searchInput' || evt.target.id === 'searchScreenKeyword')) {
      searchDebounced(evt.target.value);
    }
  });

  // モーダル内の単一テキスト入力（新規カテゴリ名・ビュー名・APIキー）はEnterで主ボタンを押したことにする
  document.addEventListener('keydown', function (evt) {
    if (evt.key !== 'Enter') return;
    if (!evt.target || !evt.target.classList || !evt.target.classList.contains('enter-submits')) return;
    var scope = evt.target.closest('.modal-panel') || evt.target.closest('.category-manager-new');
    if (!scope) return;
    var btn = scope.querySelector('.btn-primary') || scope.querySelector('[data-action="createCategoryFromManager"]');
    if (btn) {
      evt.preventDefault();
      btn.click();
    }
  });

  // ---------- 複数選択・一括操作 ----------

  function selectedIds() {
    return App.Store.uiStore.getState().selectedIds;
  }

  function selectedNotes() {
    return selectedIds().map(function (id) { return App.Store.notesStore.getById(id); }).filter(Boolean);
  }

  App.Actions['bulkToggleFavorite'] = function () {
    var makeFavorite = selectedNotes().some(function (n) { return !n.isFavorite; });
    App.Store.notesStore.bulkUpdate(selectedIds(), { isFavorite: makeFavorite });
  };

  App.Actions['bulkTogglePinned'] = function () {
    var makePinned = selectedNotes().some(function (n) { return !n.isPinned; });
    App.Store.notesStore.bulkUpdate(selectedIds(), { isPinned: makePinned });
  };

  App.Actions['bulkToggleNeedsOrganizing'] = function () {
    var makeFlag = selectedNotes().some(function (n) { return !n.needsOrganizing; });
    App.Store.notesStore.bulkUpdate(selectedIds(), { needsOrganizing: makeFlag });
  };

  App.Actions['bulkArchive'] = function () {
    var count = selectedIds().length;
    App.Store.notesStore.bulkUpdate(selectedIds(), { isArchived: true });
    App.Store.uiStore.exitMultiSelect();
    showUndoToast(count + '件をアーカイブしました', []);
  };

  App.Actions['bulkUnarchive'] = function () {
    var count = selectedIds().length;
    App.Store.notesStore.bulkUpdate(selectedIds(), { isArchived: false });
    App.Store.uiStore.exitMultiSelect();
    showUndoToast(count + '件のアーカイブを解除しました', []);
  };

  App.Actions['bulkTrash'] = function () {
    var ids = selectedIds();
    if (!window.confirm(ids.length + '件のメモをゴミ箱へ移動します。よろしいですか？')) return;
    App.Store.notesStore.bulkSoftDelete(ids);
    App.Store.uiStore.exitMultiSelect();
    showUndoToast(ids.length + '件をゴミ箱に移動しました', ids);
  };

  App.Actions['bulkRestore'] = function () {
    App.Store.notesStore.bulkRestore(selectedIds());
    App.Store.uiStore.exitMultiSelect();
  };

  App.Actions['bulkPermanentDelete'] = function () {
    var ids = selectedIds();
    if (!window.confirm(ids.length + '件のメモを完全に削除します。この操作は取り消せません。よろしいですか？')) return;
    App.Store.notesStore.bulkPermanentDelete(ids);
    App.Store.uiStore.exitMultiSelect();
  };

  App.Actions['bulkOpenCategoryAdd'] = function () { App.Store.uiStore.openPanel('bulkCategoryAddOpen'); };
  App.Actions['closeBulkCategoryAdd'] = function () { App.Store.uiStore.closePanel('bulkCategoryAddOpen'); };
  App.Actions['bulkAddCategory'] = function (d) {
    var category = App.Store.categoriesStore.getById(d.id);
    if (!category) return;
    App.Store.notesStore.bulkUpdate(selectedIds(), function (note) {
      if (note.categoryIds.indexOf(category.id) !== -1) return {};
      return { categoryIds: note.categoryIds.concat([category.id]) };
    });
    App.Store.uiStore.closePanel('bulkCategoryAddOpen');
    App.Store.uiStore.showToast({ message: selectedIds().length + '件のメモに「' + category.name + '」を追加しました' });
  };
  App.Actions['bulkCreateAndAddCategory'] = function () {
    var input = document.getElementById('bulkCategoryAddInput');
    if (!input || !input.value.trim()) return;
    var category = App.Store.categoriesStore.getOrCreate(input.value);
    if (!category) return;
    App.Actions['bulkAddCategory']({ id: category.id });
  };

  App.Actions['bulkOpenCategoryRemove'] = function () { App.Store.uiStore.openPanel('bulkCategoryRemoveOpen'); };
  App.Actions['closeBulkCategoryRemove'] = function () { App.Store.uiStore.closePanel('bulkCategoryRemoveOpen'); };
  App.Actions['bulkRemoveCategory'] = function (d) {
    var category = App.Store.categoriesStore.getById(d.id);
    if (!category) return;
    App.Store.notesStore.bulkUpdate(selectedIds(), function (note) {
      if (note.categoryIds.indexOf(category.id) === -1) return {};
      return { categoryIds: note.categoryIds.filter(function (id) { return id !== category.id; }) };
    });
    App.Store.uiStore.closePanel('bulkCategoryRemoveOpen');
    App.Store.uiStore.showToast({ message: selectedIds().length + '件のメモから「' + category.name + '」を削除しました' });
  };

  App.Actions['bulkOpenTypeChange'] = function () { App.Store.uiStore.openPanel('bulkTypeChangeOpen'); };
  App.Actions['closeBulkTypeChange'] = function () { App.Store.uiStore.closePanel('bulkTypeChangeOpen'); };
  App.Actions['bulkSetType'] = function (d) {
    App.Store.notesStore.bulkUpdate(selectedIds(), { typeId: d.id || null });
    App.Store.uiStore.closePanel('bulkTypeChangeOpen');
  };
  App.Actions['bulkCreateAndSetType'] = function () {
    var input = document.getElementById('bulkTypeChangeInput');
    if (!input || !input.value.trim()) return;
    var type = App.Store.typesStore.getOrCreate(input.value);
    if (!type) return;
    App.Actions['bulkSetType']({ id: type.id });
  };

  // ---------- カテゴリ管理 ----------

  App.Actions['createCategoryFromManager'] = function () {
    var input = document.getElementById('newCategoryInput');
    if (!input || !input.value.trim()) return;
    App.Store.categoriesStore.getOrCreate(input.value);
    input.value = '';
  };

  App.Actions['renameCategory'] = function (d, evt, el) {
    if (!el.value.trim()) return;
    App.Store.categoriesStore.rename(d.id, el.value);
  };

  App.Actions['deleteCategory'] = function (d) {
    var count = App.Store.categoriesStore.usageCount(d.id);
    var category = App.Store.categoriesStore.getById(d.id);
    var name = category ? category.name : '';
    var message = count > 0
      ? 'このカテゴリ「' + name + '」は' + count + '件のメモで使用されています。削除するとこれらのメモからカテゴリが外れます（メモ自体は削除されません）。よろしいですか？'
      : 'カテゴリ「' + name + '」を削除しますか？';
    if (!window.confirm(message)) return;
    App.Store.categoriesStore.remove(d.id);
  };

  // ---------- AIカテゴリ提案 ----------

  App.Actions['addSuggestedCategory'] = function (d) {
    var state = App.Store.aiSuggestStore.getState();
    var note = App.Store.notesStore.getById(state.noteId);
    if (!note) return;
    var category = App.Store.categoriesStore.getOrCreate(d.id);
    if (category && note.categoryIds.indexOf(category.id) === -1) {
      App.Store.notesStore.update(note.id, { categoryIds: note.categoryIds.concat([category.id]) });
    }
  };

  App.Actions['addAllSuggestedCategories'] = function () {
    var state = App.Store.aiSuggestStore.getState();
    var note = App.Store.notesStore.getById(state.noteId);
    if (!note || !state.result) return;
    var newIds = note.categoryIds.slice();
    state.result.existingCategories.forEach(function (name) {
      var category = App.Store.categoriesStore.getOrCreate(name);
      if (category && newIds.indexOf(category.id) === -1) newIds.push(category.id);
    });
    App.Store.notesStore.update(note.id, { categoryIds: newIds });
  };

  App.Actions['addNewCategoryCandidate'] = function (d) {
    var state = App.Store.aiSuggestStore.getState();
    var note = App.Store.notesStore.getById(state.noteId);
    if (!note) return;
    var category = App.Store.categoriesStore.getOrCreate(d.id);
    if (category && note.categoryIds.indexOf(category.id) === -1) {
      App.Store.notesStore.update(note.id, { categoryIds: note.categoryIds.concat([category.id]) });
    }
  };

  // ---------- スマートビュー保存 ----------

  App.Actions['createSavedView'] = function () {
    var input = document.getElementById('savedViewNameInput');
    var name = input ? input.value.trim() : '';
    if (!name) { window.alert('ビュー名を入力してください'); return; }
    var ui = App.Store.uiStore.getState();
    var view = App.Store.savedViewsStore.create(name, ui.filter, ui.sort);
    App.Store.uiStore.closePanel('saveViewModalOpen');
    App.Store.uiStore.selectSavedView(view);
  };

  App.Actions['renameSavedView'] = function (d) {
    var input = document.getElementById('savedViewNameInput');
    var name = input ? input.value.trim() : '';
    if (!name) return;
    App.Store.savedViewsStore.rename(d.id, name);
    App.Store.uiStore.closePanel('saveViewModalOpen');
  };

  App.Actions['updateSavedViewConditions'] = function (d) {
    var ui = App.Store.uiStore.getState();
    App.Store.savedViewsStore.updateConditions(d.id, ui.filter, ui.sort);
    window.alert('現在の絞り込み条件でスマートビューを更新しました');
  };

  App.Actions['deleteSavedView'] = function (d) {
    if (!window.confirm('このスマートビューを削除しますか？')) return;
    App.Store.savedViewsStore.remove(d.id);
    App.Store.uiStore.closePanel('saveViewModalOpen');
    App.Store.uiStore.selectBasicMenu('all');
  };

  // ---------- 設定 ----------

  App.Actions['saveApiKey'] = function () {
    var input = document.getElementById('apiKeyInput');
    if (!input) return;
    App.Db.settingsRepo.setAnthropicApiKey(input.value.trim());
    App.Store.uiStore.closePanel('settingsOpen');
  };

  App.Actions['clearApiKey'] = function () {
    App.Db.settingsRepo.setAnthropicApiKey('');
    App.Store.uiStore.closePanel('settingsOpen');
  };
})(window.MemoApp = window.MemoApp || {});
