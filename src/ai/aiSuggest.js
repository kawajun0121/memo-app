/*
 役割: Anthropic APIを使ったカテゴリ提案。既存カテゴリを最優先し、似た名前のカテゴリを
       AIが安易に新規作成しないよう、プロンプトで明示的に指示する。
 依存: db/settingsRepo.js

 【重要】サーバーを持たない構成のため、この端末のブラウザに保存したAPIキーで直接Anthropic APIを
 呼び出す（'anthropic-dangerous-direct-browser-access'ヘッダーが必要）。キーはlocalStorageに
 保存されるのみで、コード・Gitには一切含まれない。AI機能が失敗・未設定でも他の全機能は影響を受けない。
*/
(function (App) {
  'use strict';
  App.Ai = App.Ai || {};

  var MODEL = 'claude-haiku-4-5-20251001';
  var API_URL = 'https://api.anthropic.com/v1/messages';

  function buildPrompt(note, existingCategoryNames) {
    return [
      'あなたはメモ整理アシスタントです。以下のメモ内容に最も適したカテゴリを提案してください。',
      '',
      '# 既存カテゴリ一覧（最優先で使うこと）',
      existingCategoryNames.length > 0 ? existingCategoryNames.join(', ') : '（まだ1件もありません）',
      '',
      '# 重要なルール',
      '- 既存カテゴリの中に意味が近いものがあれば、必ずそれを使ってください。',
      '- 「AI」があるのに「生成AI」「人工知能」「AI活用」のような似た新規カテゴリを作らないでください。',
      '- 本当に既存カテゴリでは表現できない場合のみ、newCategoryCandidatesに入れてください。',
      '- カテゴリは日本語の短い名詞（2〜6文字程度）にしてください。',
      '- 提案は多くても4件程度にしてください。',
      '',
      '# メモのタイトル',
      note.title || '(なし)',
      '',
      '# メモの本文',
      note.content || '(なし)',
      '',
      '以下のJSON形式のみを出力してください。説明文やコードブロックの記号は不要です。',
      '{"existingCategories": string[], "newCategoryCandidates": string[]}'
    ].join('\n');
  }

  function parseResponseText(text) {
    var jsonText = text.trim();
    var start = jsonText.indexOf('{');
    var end = jsonText.lastIndexOf('}');
    if (start !== -1 && end !== -1) jsonText = jsonText.slice(start, end + 1);
    var parsed = JSON.parse(jsonText);
    return {
      existingCategories: Array.isArray(parsed.existingCategories) ? parsed.existingCategories.filter(function (s) { return typeof s === 'string'; }) : [],
      newCategoryCandidates: Array.isArray(parsed.newCategoryCandidates) ? parsed.newCategoryCandidates.filter(function (s) { return typeof s === 'string'; }) : []
    };
  }

  /**
   * @param {Note} note
   * @param {string[]} existingCategoryNames
   * @returns {Promise<AiCategorySuggestion>}
   */
  function suggestCategories(note, existingCategoryNames) {
    var apiKey = App.Db.settingsRepo.getAnthropicApiKey();
    if (!apiKey) {
      return Promise.reject(new Error('NO_API_KEY'));
    }
    if (!note.title && !note.content) {
      return Promise.reject(new Error('EMPTY_NOTE'));
    }

    return fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        messages: [{ role: 'user', content: buildPrompt(note, existingCategoryNames) }]
      })
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error('API_ERROR: ' + res.status + ' ' + t);
        });
      }
      return res.json();
    }).then(function (data) {
      var text = data && data.content && data.content[0] && data.content[0].text;
      if (!text) throw new Error('EMPTY_RESPONSE');
      return parseResponseText(text);
    });
  }

  App.Ai.aiSuggest = { suggestCategories: suggestCategories, MODEL: MODEL };
})(window.MemoApp = window.MemoApp || {});
