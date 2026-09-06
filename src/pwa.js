/*
 役割: 以前のバージョンで登録したService Workerを解除する後片付け処理。
 依存: なし（他のどのファイルにも依存しない、単独で動くスクリプト）

 【経緯】オフライン起動対応のためService Workerを導入していたが、iPhoneのホーム画面アプリは
 独自のキャッシュ領域を持ち、通常のリロードでは更新に気づけない（アイコンを作り直すまで
 古いバージョンが表示され続ける）という問題があったため廃止した。常に最新版がネットワークから
 読み込まれることを優先し、代わりに機内モード等の完全なオフライン時はアプリ自体が開けなくなる
 （メモのデータ自体はIndexedDBに保存されているため、一度開けばオンライン/オフラインどちらでも使える）。
 sw.js自体は「登録を解除して自分を消す」だけの内容にして残してあり、以前のバージョンを
 インストール済みの端末でも自動的に後片付けされるようにしている。
*/
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then(function (registrations) {
    registrations.forEach(function (registration) { registration.unregister(); });
  }).catch(function () { /* 無視 */ });
  if (window.caches) {
    caches.keys().then(function (keys) {
      keys.forEach(function (key) { caches.delete(key); });
    }).catch(function () { /* 無視 */ });
  }
})();
