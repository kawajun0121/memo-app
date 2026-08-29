/*
 役割: 設定モーダル。現状はAnthropic APIキーの登録のみ（AI機能用、任意）。
 依存: render/common.js, db/settingsRepo.js
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};
  var c = App.Render.common;

  function renderAccountSection() {
    if (!App.Sync || !App.Sync.available) return '';
    var user = App.Sync.auth.currentUser;
    if (user) {
      return '' +
        '<div class="settings-section">' +
        '  <label class="settings-label">アカウント（PC/iPhone同期）</label>' +
        '  <div class="settings-account-row">' +
        '    <span class="settings-account-email">🔗 ' + c.escapeHtml(user.email || '') + '</span>' +
        '    <button type="button" class="btn-text" data-action="signOut">ログアウト</button>' +
        '  </div>' +
        '</div>';
    }
    return '' +
      '<div class="settings-section">' +
      '  <label class="settings-label">アカウント（PC/iPhone同期）</label>' +
      '  <p class="settings-note">同期していません。ログインすると、この端末のメモをPC/iPhoneで共有できます。</p>' +
      '  <button type="button" class="btn-text btn-primary" data-action="showLoginFromSettings">ログイン / 新規登録</button>' +
      '</div>';
  }

  function render(ui) {
    if (!ui.panels.settingsOpen) return '';
    var currentKey = App.Db.settingsRepo.getAnthropicApiKey();

    return '' +
      '<div class="modal-overlay" data-action="closeSettings" data-backdrop="true">' +
      '  <div class="modal-panel modal-panel--small">' +
      '    <div class="modal-header">' +
      '      <h3>設定</h3>' +
      '      <button type="button" class="icon-btn" data-action="closeSettings">✕</button>' +
      '    </div>' +
      '    <div class="modal-body">' +
      renderAccountSection() +
      '      <label class="settings-label">Anthropic APIキー（AIカテゴリ提案機能で使用・任意）</label>' +
      '      <input type="password" id="apiKeyInput" class="saved-view-name-input enter-submits" placeholder="sk-ant-..." value="' + c.escapeHtml(currentKey) + '" autocomplete="off" />' +
      '      <p class="settings-note">このキーはこの端末のブラウザ内にのみ保存され、AIカテゴリ提案機能の呼び出し以外には使用されません。未設定でもメモの作成・編集・検索など基本機能はすべて利用できます。</p>' +
      '      <div class="modal-actions">' +
      '        <button type="button" class="btn-text btn-primary" data-action="saveApiKey">保存</button>' +
      '        <button type="button" class="btn-text btn-danger" data-action="clearApiKey">削除</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '</div>';
  }

  App.Render.settingsModal = { render: render };
})(window.MemoApp = window.MemoApp || {});
