/*
 役割: 複数選択モード時に表示される一括操作バー。
 依存: render/common.js, store/uiStore.js
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};

  function render(ui) {
    if (!ui.multiSelectMode || ui.selectedIds.length === 0) return '';
    var isTrash = ui.viewMeta.kind === 'trash';
    var isArchiveView = ui.viewMeta.kind === 'basic' && ui.viewMeta.id === 'archived';

    var buttons = '';
    if (isTrash) {
      buttons += '<button type="button" class="btn-text" data-action="bulkRestore">復元</button>';
      buttons += '<button type="button" class="btn-text btn-danger" data-action="bulkPermanentDelete">完全削除</button>';
    } else {
      buttons += '<button type="button" class="btn-text" data-action="bulkOpenCategoryAdd">カテゴリ追加</button>';
      buttons += '<button type="button" class="btn-text" data-action="bulkOpenCategoryRemove">カテゴリ削除</button>';
      buttons += '<button type="button" class="btn-text" data-action="bulkOpenTypeChange">種類変更</button>';
      buttons += '<button type="button" class="btn-text" data-action="bulkToggleFavorite">お気に入りON/OFF</button>';
      buttons += '<button type="button" class="btn-text" data-action="bulkTogglePinned">ピン留めON/OFF</button>';
      buttons += '<button type="button" class="btn-text" data-action="bulkToggleNeedsOrganizing">あとで整理ON/OFF</button>';
      if (isArchiveView) {
        buttons += '<button type="button" class="btn-text" data-action="bulkUnarchive">アーカイブ解除</button>';
      } else {
        buttons += '<button type="button" class="btn-text" data-action="bulkArchive">アーカイブ</button>';
      }
      buttons += '<button type="button" class="btn-text btn-danger" data-action="bulkTrash">ゴミ箱へ</button>';
    }

    return '' +
      '<div class="bulk-action-bar">' +
      '  <span class="bulk-count">' + ui.selectedIds.length + '件選択中</span>' +
      '  <div class="bulk-buttons">' + buttons + '</div>' +
      '  <button type="button" class="btn-text" data-action="clearSelection">選択解除</button>' +
      '</div>';
  }

  App.Render.bulkActionBar = { render: render };
})(window.MemoApp = window.MemoApp || {});
