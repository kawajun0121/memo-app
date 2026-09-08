/*
 役割: Service Workerの登録（オフライン起動対応）。
 依存: なし（他のどのファイルにも依存しない、単独で動くスクリプト）

 【経緯】以前はiPhoneホーム画面アプリがキャッシュに固定される不具合のためService Worker自体を
 廃止していたが、sw.js側でネットワーク優先＋即時更新の安全な構成に作り直したため再導入する。
 万一またホーム画面アプリの更新が反映されない等の問題が起きた場合は、このファイルを
 「登録せず既存のService Workerを解除するだけ」の内容に戻せば即座に元の状態へ切り戻せる
 （sw.js側もそのための自己解除版がgit履歴に残っている）。
*/
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js').catch(function (err) {
      console.warn('Service Workerの登録に失敗しました（オフライン起動は使えませんが、通常利用には影響しません）', err);
    });
  });
})();
