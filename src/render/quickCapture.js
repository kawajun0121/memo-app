/*
 役割: 画面上部のクイック入力欄。「思いついた瞬間に雑に放り込む」ための最短経路。
       タイトル・カテゴリ・種類を一切要求せず、本文だけで即保存する。
 依存: store/notesStore.js, logic/dateUtils.js
*/
(function (App) {
  'use strict';
  App.Render = App.Render || {};

  var savedFlashTimer = null;

  function render() {
    return '' +
      '<div class="quick-capture">' +
      '  <textarea id="quickCaptureInput" class="quick-capture-input" rows="1" placeholder="何か思いつきましたか？（Enterで保存 / Shift+Enterで改行）"></textarea>' +
      '  <span class="quick-capture-flash">保存しました</span>' +
      '</div>';
  }

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }

  function flashSaved() {
    var el = document.querySelector('.quick-capture-flash');
    if (!el) return;
    el.classList.add('is-visible');
    clearTimeout(savedFlashTimer);
    savedFlashTimer = setTimeout(function () {
      el.classList.remove('is-visible');
    }, 1200);
  }

  function submit(textarea) {
    var content = textarea.value.trim();
    if (!content) return;
    // create()はストア変更を通知し#app全体を再描画するため、その前に入力欄側の後始末を済ませておく
    // （再描画後は新しいtextarea要素に置き換わり、このtextarea変数は参照できなくなる）
    textarea.value = '';
    autoResize(textarea);
    App.Store.notesStore.create({ content: content });
    flashSaved();
  }

  function mount() {
    var textarea = document.getElementById('quickCaptureInput');
    if (!textarea) return;
    textarea.addEventListener('input', function () { autoResize(textarea); });
    textarea.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter' && !evt.shiftKey) {
        evt.preventDefault();
        submit(textarea);
      } else if (evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey)) {
        evt.preventDefault();
        submit(textarea);
      }
    });
  }

  function focusInput() {
    var textarea = document.getElementById('quickCaptureInput');
    if (textarea) textarea.focus();
  }

  App.Render.quickCapture = { render: render, mount: mount, focusInput: focusInput };
})(window.MemoApp = window.MemoApp || {});
