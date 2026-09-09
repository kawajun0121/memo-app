/*
 役割: Tiptap/ProseMirmirをCDN経由（jsdelivrの+esm機能）でESモジュールとしてimportし、
       残りのアプリ（classicスクリプト＋グローバル名前空間パターン）から使える薄いアダプタとして
       window.MemoApp.RichEditor に公開する。
 依存: なし（このファイル自身がTiptapのCDN取得を担う。他のどのclassicスクリプトより先に
       実行される必要はない。type="module"のためDOMContentLoadedはこの読み込み完了を待つ）

 【なぜCDN importか】このプロジェクトはNode.js非依存・ビルド不要のバニラJS構成のため、
 npm経由でTiptapをバンドルできない。esm.sh（npm上のパッケージをブラウザで直接importできる
 ESモジュールへ変換して返すCDN）経由で動的importする方式を採用した。実機検証の結果、
 jsdelivrの`+esm`機能は@tiptap/core・@tiptap/starter-kit・@tiptap/extension-task-list等を
 個別に読み込むと内部依存のprosemirror-modelが別々のバージョンで重複解決され
 "multiple versions of prosemirror-model were loaded" エラーで動作しなかったため、
 共有ピア依存関係の重複排除に対応しているesm.shへ切り替えた（同条件で動作確認済み）。

 【保存形式の安全性】Tiptapの文書はJSON（ProseMirrorのdoc構造）で保持し、HTMLは
 generateHTML(json, EXTENSIONS)で必要な時にだけ生成する。テキストノードの文字列は
 スキーマにより常にエスケープされるため、<script>等を含む文字列を保存してもHTML化時に
 タグとして解釈されることはない（保存形式そのものが安全性の土台）。
*/
import { Editor, Mark, mergeAttributes, generateHTML, generateText } from 'https://esm.sh/@tiptap/core@2.9.1';
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2.9.1';
import Link from 'https://esm.sh/@tiptap/extension-link@2.9.1';
import TaskList from 'https://esm.sh/@tiptap/extension-task-list@2.9.1';
import TaskItem from 'https://esm.sh/@tiptap/extension-task-item@2.9.1';
import Placeholder from 'https://esm.sh/@tiptap/extension-placeholder@2.9.1';

var ALLOWED_LINK_PROTOCOLS = ['http', 'https', 'mailto', 'tel'];
var COLOR_NAMES = ['red', 'blue', 'green', 'orange', 'gray'];

/** URLが許可されたスキームのみかを判定する（javascript:等の危険なスキームを拒否）。
 *  スキームを含まない相対URL・アンカーは同一オリジン内遷移として許可する。 */
function isSafeUrl(href) {
  if (!href) return false;
  var trimmed = href.trim();
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    var scheme = trimmed.split(':')[0].toLowerCase();
    return ALLOWED_LINK_PROTOCOLS.indexOf(scheme) !== -1;
  }
  // スキームなし（例: "#anchor", "/path", "path"）は危険なスキームになり得ないため許可
  return true;
}

/** 文字色（限定6色）用の独自マーク。標準のColor拡張は任意の16進色を
 *  インラインstyleへ直接埋め込むため自由入力になり、ダークモードにも追従できない。
 *  ここではセマンティックな色名だけをdata-color属性として保存し、実際の色はCSS側
 *  （styles/components.css）でライト/ダークそれぞれ定義する。 */
var TextColor = Mark.create({
  name: 'textColor',
  addAttributes: function () {
    return {
      color: {
        default: null,
        parseHTML: function (el) { return el.getAttribute('data-color'); },
        renderHTML: function (attrs) { return attrs.color ? { 'data-color': attrs.color } : {}; }
      }
    };
  },
  parseHTML: function () { return [{ tag: 'span[data-color]' }]; },
  renderHTML: function (ctx) { return ['span', mergeAttributes(ctx.HTMLAttributes, { class: 'text-color' }), 0]; },
  addCommands: function () {
    var name = this.name;
    return {
      setTextColor: function (color) {
        return function (ctx) {
          if (!color || COLOR_NAMES.indexOf(color) === -1) return ctx.commands.unsetMark(name);
          return ctx.commands.setMark(name, { color: color });
        };
      }
    };
  }
});

function buildExtensions(placeholderText) {
  return [
    StarterKit.configure({ heading: { levels: [1, 2] } }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      protocols: ALLOWED_LINK_PROTOCOLS,
      validate: isSafeUrl,
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' }
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TextColor,
    Placeholder.configure({ placeholder: placeholderText || 'メモを入力…' })
  ];
}

// generateHTML/generateText/parseHTML(貼り付け等)はどのメモを開いていても常に同じスキーマで
// 十分なため、拡張機能インスタンスは使い回す（プレースホルダー文言だけ違っても支障ない）。
var SHARED_EXTENSIONS = buildExtensions('メモを入力…（1行目がタイトルになります）');

function emptyDocJSON() {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/** @param {string} text @returns {Object} 改行区切りのプレーンテキストを1行1段落のTiptap文書に変換する
 *  （既存のプレーン形式メモを開いた瞬間の表示用。実際に保存されるまで元データは書き換えない）。 */
function docFromPlainText(text) {
  var lines = (text || '').split('\n');
  if (lines.length === 0) return emptyDocJSON();
  return {
    type: 'doc',
    content: lines.map(function (line) {
      return line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' };
    })
  };
}

function htmlFromJSON(json) {
  try { return generateHTML(json, SHARED_EXTENSIONS); } catch (e) { return ''; }
}

function textFromJSON(json) {
  try { return generateText(json, SHARED_EXTENSIONS); } catch (e) { return ''; }
}

/** @returns {{title:string, plainText:string}} */
function deriveTitleAndPlainTextFromJSON(json) {
  return window.MemoApp.RichText.deriveTitleAndPlainText(textFromJSON(json));
}

/**
 * @param {HTMLElement} el マウント先
 * @param {{content:Object, autofocus?:boolean, onUpdate?:Function, onSelectionUpdate?:Function}} opts
 * @returns {Editor}
 */
function mount(el, opts) {
  opts = opts || {};
  return new Editor({
    element: el,
    extensions: buildExtensions(opts.placeholder),
    content: opts.content || emptyDocJSON(),
    autofocus: opts.autofocus ? 'end' : false,
    onUpdate: function () { if (opts.onUpdate) opts.onUpdate(); },
    onSelectionUpdate: function () { if (opts.onSelectionUpdate) opts.onSelectionUpdate(); }
  });
}

window.MemoApp = window.MemoApp || {};
window.MemoApp.RichEditor = {
  mount: mount,
  htmlFromJSON: htmlFromJSON,
  textFromJSON: textFromJSON,
  deriveTitleAndPlainTextFromJSON: deriveTitleAndPlainTextFromJSON,
  docFromPlainText: docFromPlainText,
  emptyDocJSON: emptyDocJSON,
  isSafeUrl: isSafeUrl,
  ALLOWED_LINK_PROTOCOLS: ALLOWED_LINK_PROTOCOLS,
  COLOR_NAMES: COLOR_NAMES
};
window.dispatchEvent(new CustomEvent('richeditor:ready'));
