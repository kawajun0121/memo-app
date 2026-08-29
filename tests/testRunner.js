/*
 役割: npm等を使わない最小限のテストランナー。tests/*.test.htmlから読み込んで使う。
 依存: なし
*/
(function (global) {
  'use strict';
  var results = [];

  function test(name, fn) {
    try {
      fn();
      results.push({ name: name, pass: true });
    } catch (e) {
      results.push({ name: name, pass: false, error: e.message || String(e) });
    }
  }

  function assertEqual(actual, expected, message) {
    var a = JSON.stringify(actual);
    var e = JSON.stringify(expected);
    if (a !== e) {
      throw new Error((message ? message + ' — ' : '') + '期待値 ' + e + ' に対して実際は ' + a);
    }
  }

  function assertTrue(value, message) {
    if (!value) throw new Error(message || (value + ' は true であるべきです'));
  }

  function report(containerId) {
    var container = document.getElementById(containerId);
    var passCount = results.filter(function (r) { return r.pass; }).length;
    var html = '<h2>テスト結果: ' + passCount + ' / ' + results.length + ' PASS</h2><ul>';
    results.forEach(function (r) {
      html += '<li style="color:' + (r.pass ? 'green' : 'crimson') + '">' +
        (r.pass ? '✅ PASS' : '❌ FAIL') + ' — ' + r.name +
        (r.error ? '<br><small>' + r.error + '</small>' : '') +
        '</li>';
    });
    html += '</ul>';
    container.innerHTML = html;
    return { total: results.length, pass: passCount, fail: results.length - passCount };
  }

  global.TestRunner = { test: test, assertEqual: assertEqual, assertTrue: assertTrue, report: report };
})(window);
