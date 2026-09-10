/*
 役割: PWA（ホーム画面に追加したアプリ）をオフラインでも起動できるようにするService Worker。
 依存: なし

 【経緯・注意】以前は一度、iPhoneホーム画面アプリがキャッシュに固定されて更新に気づけなくなる
 不具合が起きたため、Service Worker自体を「自己アンインストールするだけ」の版に置き換えた
 （そのバージョンのファイルはgit履歴に残っている）。今回オフライン起動対応のため再導入するが、
 同じ不具合を再発させないよう以下を徹底している。
   1. HTML（index.html）は常にネットワークを優先し、取得できた場合のみキャッシュを更新する。
      オフラインで取得できない場合だけキャッシュ版にフォールバックする（＝オンラインなら常に最新）。
   2. CSS/JSなどの静的ファイルはindex.html側で `?v=N` のバージョン番号を付けて読み込んでいるため、
      内容を変更すれば自動的に別URL扱いになる。これを利用し、静的ファイルはキャッシュ優先で構わない
      （中身が変わればURLも変わるので、古いキャッシュを掴み続けることがない）。
   3. Firebase/Anthropic等、他オリジンへのリクエストは一切インターセプトしない
      （認証・同期・AI機能が古いキャッシュに引きずられることを防ぐ）。
   4. skipWaiting()+clients.claim()で、新しいバージョンを即座に有効化する。
   問題が再発した場合は、このファイルを「self.registration.unregister()するだけ」の版に
   戻すことで即座にロールバックできる。
*/
'use strict';

var CACHE_NAME = 'memo-app-cache-v15';
var APP_SHELL_URLS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL_URLS).catch(function () { /* オフライン等で失敗しても致命的ではない */ });
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) { return key !== CACHE_NAME; }).map(function (key) { return caches.delete(key); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase/Anthropic等クロスオリジンは一切扱わない

  // HTML（ナビゲーション）: ネットワーク優先、失敗時のみキャッシュへフォールバック
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1) {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (cached) { return cached || caches.match('./index.html'); });
      })
    );
    return;
  }

  // 静的アセット（?v=N付きのCSS/JS/アイコン等）: キャッシュ優先、なければネットワークから取得しキャッシュへ保存
  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
    })
  );
});
