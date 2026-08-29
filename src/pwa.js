/*
 役割: PWA化（アプリとしてインストール可能にする）のための最小限の初期化。
 依存: なし（他のどのファイルにも依存しない、単独で動くスクリプト）

 サービスワーカー(sw.js)はhttp(s)で配信されたページでしか登録できない
 （file://で直接開いた場合は何もしない。それでもアプリ自体は今まで通り動く）。
*/
(function () {
  'use strict';
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function (err) {
        console.warn('サービスワーカーの登録に失敗しました', err);
      });
    });
  }
})();
