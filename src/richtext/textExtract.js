/*
 役割: リッチテキスト文書のプレーンテキスト表現（改行区切り、ブロック間に空行を含む）から、
       「タイトル（最初の有効な行）」と「本文プレビュー用のplainText（残りの有効な行）」を導出する。
       UIやTiptapに依存しない純粋関数のみ（logic/配下の他ファイルと同じ方針）。
 依存: なし
*/
(function (App) {
  'use strict';
  App.RichText = App.RichText || {};

  /**
   * @param {string} rawText - generateText()等で得られる、ブロックごとに改行区切りのプレーンテキスト
   *   （空段落・ブロック間の空行を含みうる）
   * @returns {{title: string, plainText: string}}
   */
  function deriveTitleAndPlainText(rawText) {
    var lines = (rawText || '').split('\n');
    var nonEmpty = [];
    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      if (trimmed) nonEmpty.push(trimmed);
    }
    if (nonEmpty.length === 0) return { title: '', plainText: '' };
    return { title: nonEmpty[0], plainText: nonEmpty.slice(1).join('\n') };
  }

  App.RichText.deriveTitleAndPlainText = deriveTitleAndPlainText;
})(window.MemoApp = window.MemoApp || {});
