/*
 役割: 以前のバージョンで登録されたService Workerの後片付け専用（自分自身を解除して消える）。
 依存: なし

 【経緯】オフライン起動対応のためService Workerでアプリ本体をキャッシュしていたが、
 iPhoneのホーム画面アプリは独自のキャッシュ領域を持ち、通常のリロードでは更新に気づけない
 （アイコンを作り直すまで古いバージョンが表示され続ける）という問題があったため廃止した。
 Service Workerのスクリプト自体はブラウザが定期的に直接ネットワークから再取得して
 変更をチェックする仕組みになっているため、このファイルの中身を「登録解除するだけ」に
 差し替えることで、過去にキャッシュ優先版を登録済みの端末でも自動的に片付けられる。
*/
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) { return caches.delete(key); }));
      })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll({ type: 'window' }); })
      .then(function (clients) {
        clients.forEach(function (client) { client.navigate(client.url); });
      })
  );
});
