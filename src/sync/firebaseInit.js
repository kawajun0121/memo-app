/*
 役割: Firebase SDK（CDN読み込み済み）の初期化。auth/dbをApp.Sync配下に公開する。
 依存: firebaseInit.jsより前にFirebaseのCDN<script>とsrc/firebaseConfig.jsが読み込まれていること。

 Firebase SDK自体の読み込みに失敗した場合（オフラインで初回アクセス等）でもアプリのJS全体が
 止まらないよう、try/catchで囲み、失敗時はApp.Sync.available=falseにしてmain.jsに知らせる。
 個人TODOアプリと同じFirebaseプロジェクトを使うが、firebase.initializeApp()の第2引数に別名を
 渡し、同じページ内で両アプリのFirebase SDKインスタンスが衝突しないようにしている
 （このメモアプリ自体は単独で動くため通常は問題にならないが、将来同じページに埋め込む可能性に備える）。
*/
(function (App) {
  'use strict';
  App.Sync = App.Sync || {};

  try {
    var app = firebase.initializeApp(App.FirebaseConfig, 'memoApp');
    App.Sync.auth = app.auth();
    App.Sync.db = app.firestore();
    App.Sync.db.enablePersistence({ synchronizeTabs: true }).catch(function () {
      // 複数タブを開いている等でオフラインキャッシュが有効化できなくても致命的ではないため無視する
    });
    App.Sync.available = true;
  } catch (e) {
    console.warn('Firebaseの初期化に失敗しました。同期機能なしで起動します。', e);
    App.Sync.available = false;
  }
})(window.MemoApp = window.MemoApp || {});
