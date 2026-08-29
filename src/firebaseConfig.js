/*
 役割: FirebaseプロジェクトのWeb設定値。
 依存: なし（他のファイルより先に読み込む必要がある）

 【注意】ここに書くapiKey等は「秘密情報」ではない（Firebaseの仕様上、公開されて問題ない値）。
 実際のアクセス制御はFirebase Consoleで設定したFirestoreのセキュリティルール
 （ログインuser.uid本人のデータしか読み書きできない）によって行われる。

 個人TODOアプリと同じFirebaseプロジェクトを再利用している（同じFirestoreセキュリティルールの
 users/{uid}/data/{document} にそのまま収まり、同じメールアドレスでログインできるようにするため）。
 別のFirebaseプロジェクトに変える場合はここを書き換える。
*/
(function (App) {
  'use strict';
  App.FirebaseConfig = {
    apiKey: "AIzaSyAXeOjVzorwh3_044VD6Hp5sLMRtM1_k_c",
    authDomain: "todo-app-5040a.firebaseapp.com",
    projectId: "todo-app-5040a",
    storageBucket: "todo-app-5040a.firebasestorage.app",
    messagingSenderId: "636243641802",
    appId: "1:636243641802:web:37ad4a5a2d5a765a913b33"
  };
})(window.MemoApp = window.MemoApp || {});
