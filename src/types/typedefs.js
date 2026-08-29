/*
 役割: アプリ全体で使うデータ構造の型定義（JSDoc）。ビルド不要のためTypeScriptは使わず、
       jsconfig.json（checkJs）でエディタ上の型チェックを効かせる。
 依存: なし（他のすべてのファイルより先に読み込む）
*/

/**
 * @typedef {Object} Note
 * @property {string} id
 * @property {string} title - タイトル未入力の場合は空文字
 * @property {string} content - 本文（クイックメモはここだけでもよい）
 * @property {string[]} categoryIds - カテゴリID配列（0件 = 未分類）
 * @property {string|null} typeId - メモの種類ID（null可）
 * @property {boolean} isFavorite
 * @property {boolean} isPinned
 * @property {boolean} needsOrganizing - 「あとで整理」フラグ
 * @property {boolean} isArchived
 * @property {number|null} deletedAt - ゴミ箱に移動した日時（epoch ms）。null=ゴミ箱に無い
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} name
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @typedef {Object} NoteType
 * @property {string} id
 * @property {string} name
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @typedef {Object} NoteHistoryEntry
 * @property {string} id
 * @property {string} noteId
 * @property {string} title
 * @property {string} content
 * @property {string[]} categoryIds
 * @property {string|null} typeId
 * @property {number} createdAt - このバージョンが保存された日時
 */

/**
 * @typedef {Object} FilterConditions
 * @property {string} keyword
 * @property {string[]} categoryIds - AND条件
 * @property {string|null} typeId
 * @property {boolean|null} isFavorite
 * @property {boolean|null} isPinned
 * @property {boolean|null} unclassifiedOnly
 * @property {boolean|null} needsOrganizingOnly
 * @property {'active'|'archived'|'all'} archiveState
 * @property {{from: number|null, to: number|null}} createdRange
 * @property {{from: number|null, to: number|null}} updatedRange
 */

/**
 * @typedef {Object} SortCondition
 * @property {'createdAt'|'updatedAt'|'title'} field
 * @property {'asc'|'desc'} direction
 * @property {boolean} pinnedFirst
 */

/**
 * @typedef {Object} SavedView
 * @property {string} id
 * @property {string} name
 * @property {FilterConditions} filterConditions
 * @property {SortCondition} sortCondition
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @typedef {Object} AiCategorySuggestion
 * @property {string[]} existingCategories - 既存カテゴリ名のうち提案されたもの
 * @property {string[]} newCategoryCandidates - 新規作成候補（未確定）
 */

window.MemoApp = window.MemoApp || {};
