/* طبقة الربط بين محرك المصادر (JS) والتطبيق الأصلي (Kotlin).
 * كل الطلبات تمر عبر OkHttp في التطبيق (كوكيز + تجاوز Cloudflare)، فلا قيود CORS هنا. */
(function (g) {
  'use strict';
  var seq = 0, wait = {};
  // يستدعيه التطبيق عند وصول الرد؛ النص الكبير يُسحب عبر take() بدل تمريره داخل سكربت
  g.__done = function (id, json) {
    var w = wait[id]; if (!w) return; delete wait[id];
    if (json == null) json = g.ShadoNative.take(id);
    var r; try { r = JSON.parse(json); } catch (e) { r = { error: 'bad bridge reply' }; }
    if (r.error) w.no(new Error(r.error)); else w.ok(r);
  };
  function nativeReq(url, o) {
    return new Promise(function (ok, no) {
      var id = 'r' + (++seq); wait[id] = { ok: ok, no: no };
      var opt = { method: o.method || 'GET', headers: o.headers || {}, body: o.body == null ? null : String(o.body), cookie: o.cookie || null, via: o.via || null };
      g.ShadoNative.req(id, url, JSON.stringify(opt));
    });
  }
  g.MangaFetch = {
    req: function (url, o) { return nativeReq(url, o || {}); },
    // الصور تمر عبر التطبيق نفسه (نفس الأصل https://shado.local) فيُسمح بقراءتها في canvas
    imgSrc: function (url, ref) { return 'https://shado.local/img?u=' + encodeURIComponent(url) + '&r=' + encodeURIComponent(ref || ''); },
    hasNative: function () { return true; },
  };
})(window);
