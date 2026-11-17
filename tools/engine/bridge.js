/* واجهة المحرك التي يستدعيها التطبيق:
 *   Engine.call(id, method, specJson, argsJson)  → النتيجة تعود عبر ShadoNative.result(id, json)
 *   method: catalog | list | manga | chapter | decode | gen
 */
(function (g) {
  'use strict';
  var cache = {};
  function adapter(S) {
    var key = JSON.stringify(S);
    return cache[key] || (cache[key] = g.MangaSources.build(S));
  }
  function out(id, v) { g.ShadoNative.result(id, JSON.stringify(v)); }
  function fail(id, e) { out(id, { error: String((e && e.message) || e || 'خطأ') }); }
  function toB64(buf) {
    var u8 = new Uint8Array(buf), s = '';
    for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  var M = {
    catalog: async function () {
      var data = g.MANGA_SOURCES_DATA || [];
      return data.map(function (d) {
        var ad = null; try { ad = adapter({ id: d.id }); } catch (e) { }
        return { id: d.id, name: d.name, home: d.home, tpl: (ad && ad.tpl) || d.tpl || 'custom', remote: !!d.remote,
          listings: (ad && ad.listings) || d.listings || [], filters: (ad && ad.filters) || d.filters || [], note: (ad && ad.note) || '' };
      });
    },
    spec: async function (S) {
      var ad = adapter(S);
      return { id: ad.id, name: ad.name, home: ad.home, tpl: ad.tpl, listings: ad.listings || [], filters: ad.filters || [], note: ad.note || '' };
    },
    genres: async function (S) { var ad = adapter(S); return ad.genres ? await ad.genres() : null; },
    list: async function (S, a) { return await adapter(S).list(a); },
    manga: async function (S, a) { return await adapter(S).manga(a.url); },
    chapter: async function (S, a) { return await adapter(S).chapter(a.url); },
    decode: async function (S, a) {
      var src = await g.MangaSources.decode(a.url, a.ref);
      var r = await fetch(src);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return { b64: toB64(await r.arrayBuffer()), type: r.headers.get('content-type') || 'image/jpeg' };
    },
    gen: async function (S, a) {
      if (!g.MangaGen) throw new Error('المولّد غير متوفر');
      var r = await g.MangaGen.scan(a);
      return { rows: r.rows, source: r.cfg ? g.MangaGen.source(r.cfg) : null };
    },
  };
  g.Engine = {
    call: function (id, method, specJson, argsJson) {
      var f = M[method]; if (!f) return fail(id, 'unknown ' + method);
      var S = null, A = null;
      try { S = specJson ? JSON.parse(specJson) : null; A = argsJson ? JSON.parse(argsJson) : {}; } catch (e) { return fail(id, e); }
      Promise.resolve().then(function () { return f(S, A); }).then(function (v) { out(id, v == null ? null : v); }, function (e) { fail(id, e); });
    },
    reset: function () { cache = {}; },
  };
  g.ShadoNative.ready();
})(window);
