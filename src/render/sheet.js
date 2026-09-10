/*
 役割: ボトムシート/モーダル形式の汎用UI部品。カテゴリ・種類の選択＋追加（editorとbulk操作の両方から
       使う）、エディタの「その他メニュー」、一括操作でのカテゴリ・種類指定など、標準の window.prompt()
       ダイアログを使わずアプリ内で完結させたい箇所すべてで再利用する。
 依存: render/common.js, store/uiStore.js, store/categoriesStore.js, store/typesStore.js

 開閉状態は既存のuiStore.panels（openPanel/closePanel）をそのまま流用する（新しい状態機構は増やさない）。
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};
  var c = App.Render.common;

  /** シート共通の外枠（オーバーレイ＋パネル＋ヘッダー＋任意の補足説明） */
  function wrap(title, bodyHtml, closeAction, helpText) {
    return '' +
      '<div class="modal-overlay sheet-overlay" data-action="' + closeAction + '" data-backdrop="true">' +
      '  <div class="sheet-panel" role="dialog" aria-label="' + c.escapeHtml(title) + '">' +
      '    <div class="sheet-handle" aria-hidden="true"></div>' +
      '    <div class="modal-header">' +
      '      <h3>' + c.escapeHtml(title) + '</h3>' +
      '      <button type="button" class="icon-btn" data-action="' + closeAction + '" title="閉じる" aria-label="閉じる">✕</button>' +
      '    </div>' +
      '    <div class="modal-body sheet-body">' +
      (helpText ? '<p class="settings-note sheet-help">' + helpText + '</p>' : '') +
      bodyHtml +
      '    </div>' +
      '  </div>' +
      '</div>';
  }

  /**
   * カテゴリ/種類ピッカーの中身（既存項目一覧＋新規追加フォーム）。
   * @param {{id:string,name:string}[]} items
   * @param {string[]} selectedIds - 既にメモに付いている項目のid（チェック表示用。単一選択の種類の場合は1件）
   * @param {string} selectAction - 項目タップ時のアクション名（d.id=項目id）
   * @param {string} addAction - 追加フォーム確定時のアクション名（テキスト入力の値を読む）
   * @param {string} addInputId - 追加フォームのinput要素id（addActionハンドラ側で参照する）
   * @param {string} addPlaceholder
   */
  function pickerBody(items, selectedIds, selectAction, addAction, addInputId, addPlaceholder, extraItemHtml) {
    var sorted = items.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ja'); });
    var listHtml = sorted.length === 0 && !extraItemHtml
      ? '<div class="modal-empty">まだ登録されていません</div>'
      : sorted.map(function (item) {
        var isSelected = selectedIds.indexOf(item.id) !== -1;
        return '<button type="button" class="sheet-picker-item' + (isSelected ? ' is-selected' : '') + '" data-action="' + selectAction + '" data-id="' + item.id + '">' +
          '<span class="sheet-picker-check" aria-hidden="true">' + (isSelected ? '✓' : '') + '</span>' +
          '<span class="sheet-picker-label">' + c.escapeHtml(item.name) + '</span>' +
          '</button>';
      }).join('');

    return '' +
      '<div class="sheet-picker-list">' + (extraItemHtml || '') + listHtml + '</div>' +
      (addAction ?
        '<div class="sheet-add-row">' +
        '  <input type="text" id="' + addInputId + '" class="sheet-add-input enter-submits" placeholder="' + c.escapeHtml(addPlaceholder) + '" />' +
        '  <button type="button" class="btn-text btn-primary" data-action="' + addAction + '">追加</button>' +
        '</div>' : '');
  }

  /** 編集中のメモ（下書きの場合はuiStore.draftNote、既存メモの場合はnotesStoreから）を取得する */
  function currentEditingNote(ui) {
    if (ui.draftNote) return ui.draftNote;
    if (ui.selectedNoteId) return App.Store.notesStore.getById(ui.selectedNoteId);
    return null;
  }

  function renderCategoryPicker(ui) {
    if (!ui.panels.categoryPickerOpen) return '';
    var note = currentEditingNote(ui);
    if (!note) return '';
    var body = pickerBody(
      App.Store.categoriesStore.getAll(), note.categoryIds,
      'toggleCategoryOnNote', 'addCategoryOnNote', 'categoryPickerAddInput', '新しいカテゴリ名'
    );
    return wrap('カテゴリを選択', body, 'closeCategoryPicker',
      'カテゴリは複数付与できます（例: 仕事、民泊、旅行）。タップで付与・解除できます。');
  }

  function renderTypePicker(ui) {
    if (!ui.panels.typePickerOpen) return '';
    var note = currentEditingNote(ui);
    if (!note) return '';
    var body = pickerBody(
      App.Store.typesStore.getAll(), note.typeId ? [note.typeId] : [],
      'selectTypeOnNote', 'addTypeOnNote', 'typePickerAddInput', '新しい種類名'
    );
    return wrap('種類を選択', body, 'closeTypePicker',
      '種類は1メモにつき1つだけ設定できます（例: タスク、アイデア、記録）。もう一度タップで解除できます。');
  }

  function renderBulkCategoryAdd(ui) {
    if (!ui.panels.bulkCategoryAddOpen) return '';
    var body = pickerBody(App.Store.categoriesStore.getAll(), [], 'bulkAddCategory', 'bulkCreateAndAddCategory', 'bulkCategoryAddInput', '新しいカテゴリ名');
    return wrap('選択したメモにカテゴリを追加', body, 'closeBulkCategoryAdd');
  }

  function renderBulkCategoryRemove(ui) {
    if (!ui.panels.bulkCategoryRemoveOpen) return '';
    var body = pickerBody(App.Store.categoriesStore.getAll(), [], 'bulkRemoveCategory', null, '', '');
    return wrap('選択したメモからカテゴリを削除', body, 'closeBulkCategoryRemove');
  }

  function renderBulkTypeChange(ui) {
    if (!ui.panels.bulkTypeChangeOpen) return '';
    var clearItem = '<button type="button" class="sheet-picker-item" data-action="bulkSetType" data-id="">' +
      '<span class="sheet-picker-check" aria-hidden="true"></span><span class="sheet-picker-label">種類なし（クリア）</span></button>';
    var body = pickerBody(App.Store.typesStore.getAll(), [], 'bulkSetType', 'bulkCreateAndSetType', 'bulkTypeChangeInput', '新しい種類名', clearItem);
    return wrap('選択したメモの種類を変更', body, 'closeBulkTypeChange');
  }

  /** エディタ上部「その他メニュー」（お気に入り・ピン留め・アーカイブ・ゴミ箱・編集履歴・AI提案） */
  function renderEditorMenu(ui, note) {
    if (!ui.panels.editorMenuOpen || !note) return '';
    var items = [
      { action: 'toggleFavorite', icon: note.isFavorite ? '★' : '☆', label: note.isFavorite ? 'お気に入りから外す' : 'お気に入りに追加' },
      { action: 'togglePinned', icon: '📌', label: note.isPinned ? 'ピン留めを外す' : 'ピン留めする' },
      { action: 'openHistoryPanel', icon: '🕘', label: '編集履歴' },
      { action: 'openAiSuggest', icon: '✨', label: 'AIカテゴリ提案' },
      { action: note.isArchived ? 'unarchiveNote' : 'archiveNote', icon: '📦', label: note.isArchived ? 'アーカイブを解除' : 'アーカイブする' },
      { action: 'trashNote', icon: '🗑', label: 'ゴミ箱へ移動', danger: true }
    ];
    var body = '<div class="sheet-action-list">' + items.map(function (item) {
      return '<button type="button" class="sheet-action-item' + (item.danger ? ' sheet-action-item--danger' : '') + '" data-action="' + item.action + '" data-id="' + note.id + '">' +
        '<span class="sheet-action-icon" aria-hidden="true">' + item.icon + '</span>' +
        '<span>' + item.label + '</span>' +
        '</button>';
    }).join('') + '</div>';
    return wrap('その他メニュー', body, 'closeEditorMenu');
  }

  /** リンクの表示文字・URL設定。現在の選択/カーソル位置の状態はuiStore.panelsのextraに
   *  main.js側（openLinkPicker）が積んで渡す（既存リンクの編集時はURL/表示文字を事前入力する）。
   *  URLが不正な場合はシートを閉じずにlinkPickerErrorを表示する。 */
  function renderLinkPicker(ui) {
    if (!ui.panels.linkPickerOpen) return '';
    var p = ui.panels;
    var hasError = !!p.linkPickerError;
    var body = '' +
      '<label class="settings-label" for="linkPickerTextInput">表示文字</label>' +
      '<input type="text" id="linkPickerTextInput" class="sheet-add-input enter-submits" value="' + c.escapeHtml(p.linkPickerText || '') + '" placeholder="表示する文字" />' +
      '<label class="settings-label" for="linkPickerUrlInput" style="margin-top:12px;display:block">URL</label>' +
      '<input type="text" id="linkPickerUrlInput" class="sheet-add-input enter-submits' + (hasError ? ' has-error' : '') + '" value="' + c.escapeHtml(p.linkPickerUrl || '') + '" placeholder="https://..." inputmode="url" autocapitalize="off" autocorrect="off"' +
      (hasError ? ' aria-invalid="true" aria-describedby="linkPickerError"' : '') + ' />' +
      (hasError
        ? '<p class="sheet-error" id="linkPickerError" role="alert">' + c.escapeHtml(p.linkPickerError) + '</p>'
        : '<p class="settings-note">http(s)・mailto・telのリンクのみ設定できます。「example.com」のようにスキームを省略した場合はhttps://を補います。</p>') +
      '<div class="modal-actions">' +
      '  <button type="button" class="btn-text btn-primary" data-action="saveLinkPicker">保存</button>' +
      (p.linkPickerHasExistingLink ? '  <button type="button" class="btn-text btn-danger" data-action="removeLinkPicker">リンク解除</button>' : '') +
      '  <button type="button" class="btn-text" data-action="closeLinkPicker">キャンセル</button>' +
      '</div>';
    return wrap('リンクを設定', body, 'closeLinkPicker');
  }

  /** 「その他の書式」（項目4）。iPhoneのツールバーは太字・文字色・リンクだけを常設し、
   *  残りの書式はここへ集約する。記号だけでは意味が分からないため文字ラベルを併記し、
   *  今かかっている書式はaria-pressedとチェック表示の両方で分かるようにする。 */
  var FORMAT_MENU_ITEMS = [
    { action: 'richToggleHeading1', label: '見出し', glyph: 'H1', activeKey: 'heading1' },
    { action: 'richToggleHeading2', label: '小見出し', glyph: 'H2', activeKey: 'heading2' },
    { action: 'richToggleBulletList', label: '箇条書き', glyph: '•', activeKey: 'bulletList' },
    { action: 'richToggleOrderedList', label: '番号付きリスト', glyph: '1.', activeKey: 'orderedList' },
    { action: 'richToggleTaskList', label: 'チェックリスト', glyph: '☑', activeKey: 'taskList' },
    { action: 'richClearFormat', label: '書式解除', glyph: '⌫', activeKey: null },
    { action: 'richUndo', label: '元に戻す', glyph: '↶', activeKey: null },
    { action: 'richRedo', label: 'やり直す', glyph: '↷', activeKey: null }
  ];

  function renderFormatMenu(ui) {
    if (!ui.panels.formatMenuOpen) return '';
    var editor = App.Render.noteEditor.getCurrentEditor();
    var active = App.Render.noteEditor.computeActiveFormats(editor);
    var body = '<div class="sheet-picker-list">' + FORMAT_MENU_ITEMS.map(function (item) {
      var isOn = !!(item.activeKey && active[item.activeKey]);
      return '<button type="button" class="sheet-picker-item' + (isOn ? ' is-selected' : '') + '" data-action="' + item.action + '"' +
        (item.activeKey ? ' aria-pressed="' + (isOn ? 'true' : 'false') + '"' : '') + '>' +
        '<span class="sheet-picker-check" aria-hidden="true">' + (isOn ? '✓' : '') + '</span>' +
        '<span class="sheet-format-glyph" aria-hidden="true">' + item.glyph + '</span>' +
        '<span class="sheet-picker-label">' + item.label + '</span>' +
        '</button>';
    }).join('') + '</div>';
    return wrap('その他の書式', body, 'closeFormatMenu',
      '選択した文字（選択していない場合はカーソルのある行）に適用します。');
  }

  var COLOR_OPTIONS = [
    { key: '', label: '標準' },
    { key: 'red', label: '赤（重要・注意）' },
    { key: 'blue', label: '青（情報）' },
    { key: 'green', label: '緑（完了・良好）' },
    { key: 'orange', label: 'オレンジ（保留・確認）' },
    { key: 'gray', label: 'グレー（補足）' }
  ];

  /** 文字色（限定6色）。今かかっている色にチェックを付けて分かるようにする。
   *  「標準」はtextColorマークを外すだけで、太字・リンク等の他の書式は残す。 */
  function renderColorPicker(ui) {
    if (!ui.panels.colorPickerOpen) return '';
    var editor = App.Render.noteEditor.getCurrentEditor();
    var currentColor = '';
    if (editor && !editor.isDestroyed) currentColor = (editor.getAttributes('textColor') || {}).color || '';
    var body = '<div class="sheet-picker-list">' + COLOR_OPTIONS.map(function (opt) {
      var isOn = opt.key === currentColor;
      return '<button type="button" class="sheet-picker-item' + (isOn ? ' is-selected' : '') + '" data-action="applyTextColor" data-id="' + opt.key + '" aria-pressed="' + (isOn ? 'true' : 'false') + '">' +
        '<span class="sheet-picker-check" aria-hidden="true">' + (isOn ? '✓' : '') + '</span>' +
        '<span class="color-swatch" data-color="' + opt.key + '" aria-hidden="true"></span>' +
        '<span class="sheet-picker-label">' + opt.label + '</span>' +
        '</button>';
    }).join('') + '</div>';
    return wrap('文字色', body, 'closeColorPicker');
  }

  function renderAll(ui, note) {
    return renderCategoryPicker(ui) + renderTypePicker(ui) + renderEditorMenu(ui, note) +
      renderBulkCategoryAdd(ui) + renderBulkCategoryRemove(ui) + renderBulkTypeChange(ui) +
      renderLinkPicker(ui) + renderColorPicker(ui) + renderFormatMenu(ui);
  }

  App.Render.sheet = {
    wrap: wrap,
    pickerBody: pickerBody,
    renderAll: renderAll,
    currentEditingNote: currentEditingNote
  };
})(window.MemoApp = window.MemoApp || {});
