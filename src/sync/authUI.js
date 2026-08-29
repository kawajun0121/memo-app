/*
 役割: ログイン/新規登録画面。未ログイン時に#appの中身をこの画面に差し替える。
 依存: src/sync/firebaseInit.js, render/common.js
 通常の画面描画（render/*.js + appShellの委譲イベント）とは別の、
 このファイル単体で完結する小さな画面。
*/
(function (App) {
  'use strict';
  App.Sync = App.Sync || {};

  var mode = 'signin'; // 'signin' | 'signup'
  var errorMessage = '';
  var busy = false;

  var ERROR_MESSAGES = {
    'auth/invalid-email': 'メールアドレスの形式が正しくありません',
    'auth/user-not-found': 'アカウントが見つかりません',
    'auth/wrong-password': 'パスワードが違います',
    'auth/invalid-credential': 'メールアドレスまたはパスワードが正しくありません',
    'auth/email-already-in-use': 'このメールアドレスは既に登録されています',
    'auth/weak-password': 'パスワードは6文字以上にしてください',
    'auth/too-many-requests': '試行回数が多すぎます。しばらくしてから試してください',
    'auth/network-request-failed': '通信に失敗しました。ネットワークをご確認ください'
  };

  function render() {
    var container = document.getElementById('app');
    var isSignin = mode === 'signin';
    container.innerHTML =
      '<div class="auth-screen">' +
        '<div class="auth-card">' +
          '<div class="auth-title">📝 メモ</div>' +
          '<div class="auth-subtitle">' + (isSignin ? 'ログイン' : '新規登録') + '（PCとiPhoneでデータを同期します）</div>' +
          (errorMessage ? '<div class="auth-error">' + App.Render.common.escapeHtml(errorMessage) + '</div>' : '') +
          '<label>メールアドレス<input type="email" id="auth-email" autocomplete="username" /></label>' +
          '<label>パスワード<input type="password" id="auth-password" autocomplete="' + (isSignin ? 'current-password' : 'new-password') + '" /></label>' +
          '<button type="button" class="btn-primary auth-submit" id="auth-submit" ' + (busy ? 'disabled' : '') + '>' +
            (busy ? '処理中…' : (isSignin ? 'ログイン' : '新規登録')) +
          '</button>' +
          '<button type="button" class="btn-text auth-toggle" id="auth-toggle">' +
            (isSignin ? 'アカウントをお持ちでない方はこちら（新規登録）' : 'すでにアカウントをお持ちの方はこちら（ログイン）') +
          '</button>' +
          '<button type="button" class="btn-text auth-skip" id="auth-skip">同期せずこの端末だけで使う</button>' +
        '</div>' +
      '</div>';

    var emailInput = document.getElementById('auth-email');
    var passwordInput = document.getElementById('auth-password');
    document.getElementById('auth-submit').addEventListener('click', handleSubmit);
    document.getElementById('auth-toggle').addEventListener('click', function () {
      mode = isSignin ? 'signup' : 'signin';
      errorMessage = '';
      render();
    });
    document.getElementById('auth-skip').addEventListener('click', function () {
      if (typeof App.Sync.onSkip === 'function') App.Sync.onSkip();
    });
    passwordInput.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter') handleSubmit();
    });
    emailInput.focus();
  }

  function handleSubmit() {
    var email = document.getElementById('auth-email').value.trim();
    var password = document.getElementById('auth-password').value;
    if (!email || !password) {
      errorMessage = 'メールアドレスとパスワードを入力してください';
      render();
      return;
    }

    busy = true;
    errorMessage = '';
    render();

    var action = mode === 'signin'
      ? App.Sync.auth.signInWithEmailAndPassword(email, password)
      : App.Sync.auth.createUserWithEmailAndPassword(email, password);

    action.catch(function (err) {
      busy = false;
      errorMessage = ERROR_MESSAGES[err.code] || ('エラーが発生しました（' + err.message + '）');
      render();
    });
    // 成功時はonAuthStateChangedがmain.js側で検知し、この画面からアプリ本体へ自動的に切り替わる
  }

  App.Sync.authUI = { render: render };
})(window.MemoApp = window.MemoApp || {});
