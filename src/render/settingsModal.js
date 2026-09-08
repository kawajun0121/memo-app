/*
 役割: 設定モーダル。現状はAnthropic APIキーの登録のみ（AI機能用、任意）。
 依存: render/common.js, db/settingsRepo.js
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};
  var c = App.Render.common;

  var SYNC_STATUS_LABEL = {
    idle: '',
    offline: '📴 オフライン（この端末には保存済み）',
    syncing: '🔄 同期中…',
    synced: '🟢 同期完了',
    error: '⚠️ 同期エラー（この端末には保存済み）'
  };

  function renderAccountSection() {
    if (!App.Sync || !App.Sync.available) return '';
    var user = App.Sync.auth.currentUser;
    if (user) {
      var syncState = App.Store.syncStatusStore ? App.Store.syncStatusStore.getState() : { status: 'idle', isOnline: true };
      var statusKey = !syncState.isOnline ? 'offline' : syncState.status;
      var statusLabel = SYNC_STATUS_LABEL[statusKey] || '';
      return '' +
        '<div class="settings-section">' +
        '  <label class="settings-label">アカウント（複数端末で同期中）</label>' +
        '  <div class="settings-account-row">' +
        '    <span class="settings-account-email">🔗 ' + c.escapeHtml(user.email || '') + '</span>' +
        '    <button type="button" class="btn-text" data-action="signOut">ログアウト</button>' +
        '  </div>' +
        (statusLabel ? '  <p class="settings-note sync-status-note">' + statusLabel + '</p>' : '') +
        '</div>';
    }
    return '' +
      '<div class="settings-section">' +
      '  <label class="settings-label">アカウント</label>' +
      '  <p class="settings-note">現在、同期せずこの端末のみでメモを使用しています。</p>' +
      '  <button type="button" class="btn-text btn-primary" data-action="showLoginFromSettings">ログイン・同期へ切り替える</button>' +
      '  <p class="settings-note settings-note--warning">この端末だけで使用しているメモは、Safariの履歴やWebサイトデータを削除すると失われる可能性があります。複数端末で使う・バックアップを残したい場合はログインをおすすめします。</p>' +
      '</div>';
  }

  function renderContent(ui) {
    var currentKey = App.Db.settingsRepo.getAnthropicApiKey();
    return '' +
      renderAccountSection() +
      '      <label class="settings-label">Anthropic APIキー（AIカテゴリ提案機能で使用・任意）</label>' +
      '      <input type="password" id="apiKeyInput" class="saved-view-name-input enter-submits" placeholder="sk-ant-..." value="' + c.escapeHtml(currentKey) + '" autocomplete="off" />' +
      '      <p class="settings-note">このキーはこの端末のブラウザ内にのみ保存され、AIカテゴリ提案機能の呼び出し以外には使用されません。未設定でもメモの作成・編集・検索など基本機能はすべて利用できます。</p>' +
      '      <div class="modal-actions">' +
      '        <button type="button" class="btn-text btn-primary" data-action="saveApiKey">保存</button>' +
      '        <button type="button" class="btn-text btn-danger" data-action="clearApiKey">削除</button>' +
      '      </div>';
  }

  function render(ui) {
    if (!ui.panels.settingsOpen) return '';

    return '' +
      '<div class="modal-overlay settings-overlay" data-action="closeSettings" data-backdrop="true">' +
      '  <div class="modal-panel modal-panel--small settings-panel">' +
      '    <div class="modal-header">' +
      '      <button type="button" class="icon-btn mobile-only" data-action="closeSettings" title="戻る" aria-label="戻る">←</button>' +
      '      <h3>設定</h3>' +
      '      <button type="button" class="icon-btn" data-action="closeSettings" title="閉じる" aria-label="閉じる">✕</button>' +
      '    </div>' +
      '    <div class="modal-body">' + renderContent(ui) + '</div>' +
      '  </div>' +
      '</div>';
  }

  App.Render.settingsModal = { render: render };
})(window.MemoApp = window.MemoApp || {});
