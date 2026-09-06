/*
 役割: PWA用のサービスワーカー。アプリ本体（HTML/CSS/JS/アイコン）をオフラインでも
 開けるようキャッシュする。メモデータ自体はIndexedDBに保存されており、
 このファイルとは無関係にオフラインでも読み書きできる。

 【キャッシュ戦略】ネットワーク優先・失敗時のみキャッシュにフォールバックする方式にしている
 （「まずネットワークから最新を取りに行き、取れたらキャッシュも更新する」）。
 これにより、index.htmlを更新してデプロイすれば次回オンライン時に必ず最新が反映される
 （古いキャッシュが残り続けて更新に気づけない、という事態を避けるため）。
 オフライン時のみ、最後に取得できたキャッシュ内容で開ける。

 【注意】新しいJSファイルをindex.htmlに追加したときは、下のASSETSにも同じパスを
 追記すること（初回アクセス時にまとめて先読みキャッシュされる）。
*/
var CACHE_NAME = 'memo-app-cache-v2';

var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './src/styles/base.css',
  './src/styles/layout.css',
  './src/styles/components.css',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js',
  './src/firebaseConfig.js',
  './src/sync/firebaseInit.js',
  './src/types/typedefs.js',
  './src/logic/id.js',
  './src/logic/dateUtils.js',
  './src/logic/debounce.js',
  './src/logic/filtering.js',
  './src/logic/sorting.js',
  './src/logic/historyPolicy.js',
  './src/logic/navViews.js',
  './src/db/db.js',
  './src/db/notesRepo.js',
  './src/db/categoriesRepo.js',
  './src/db/typesRepo.js',
  './src/db/historyRepo.js',
  './src/db/savedViewsRepo.js',
  './src/db/settingsRepo.js',
  './src/store/state.js',
  './src/store/notesStore.js',
  './src/store/categoriesStore.js',
  './src/store/typesStore.js',
  './src/store/savedViewsStore.js',
  './src/store/historyStore.js',
  './src/store/aiSuggestStore.js',
  './src/store/uiStore.js',
  './src/ai/aiSuggest.js',
  './src/render/common.js',
  './src/render/sidebar.js',
  './src/render/noteCard.js',
  './src/render/bulkActionBar.js',
  './src/render/noteList.js',
  './src/render/noteEditor.js',
  './src/render/quickCapture.js',
  './src/render/historyPanel.js',
  './src/render/categoryManagerModal.js',
  './src/render/aiSuggestPanel.js',
  './src/render/savedViewModal.js',
  './src/render/settingsModal.js',
  './src/render/shortcuts.js',
  './src/render/appShell.js',
  './src/sync/authUI.js',
  './src/sync/cloudSync.js',
  './src/main.js',
  './src/pwa.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys.filter(function (key) { return key !== CACHE_NAME; })
            .map(function (key) { return caches.delete(key); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

// ネットワーク優先。取得できたら表示しつつキャッシュも更新し、
// オフライン等で失敗した場合のみキャッシュ内容を返す。
self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).then(function (response) {
      var copy = response.clone();
      caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
      return response;
    }).catch(function () {
      return caches.match(event.request);
    })
  );
});
