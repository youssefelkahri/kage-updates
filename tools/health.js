// فحص المصادر الأسبوعي: يشغّل نفس محرك التطبيق في Chromium ويصلح ما يستطيع وحده.
//  - نطاق جديد (تحويل)      → homes[id]
//  - قالب تغيّر               → المولّد → sources[] (تعريف جديد)
//  - معطّل أسبوعين متتاليين → off (تلقائياً، ويُعاد حين يعود)
//  - Cloudflare               → «غير قابل للفحص هنا» (يفحصه هاتف المالك)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFile } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(__dirname, 'engine');
const REMOTE = path.join(ROOT, 'manga', 'remote.json');
const HEALTH = path.join(ROOT, 'manga', 'health.json');
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

function curl(url, opt) {
  return new Promise(res => {
    const a = ['-s', '-L', '--compressed', '-m', '25', '-A', UA, '-w', '\n__META__%{http_code} %{url_effective}', '-X', opt.method || 'GET'];
    for (const [k, v] of Object.entries(opt.headers || {})) a.push('-H', k + ': ' + v);
    if (opt.cookie) a.push('-H', 'Cookie: ' + opt.cookie);
    if (opt.via) a.push('-H', 'Referer: ' + opt.via + '/');
    if (opt.body != null) a.push('--data-raw', opt.body);
    a.push(url);
    execFile('curl', a, { maxBuffer: 64 << 20, encoding: 'latin1' }, (e, out) => {
      out = Buffer.from(out || '', 'latin1').toString('utf8');
      const i = out.lastIndexOf('\n__META__');
      if (i < 0) return res({ error: String(e || 'curl failed') });
      const [st, eff] = out.slice(i + 9).split(' ');
      res({ status: +st, url: eff, text: out.slice(0, i) });
    });
  });
}
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r({ error: 'timeout' }), ms))]);
const origin = u => { try { return new URL(u).origin; } catch (e) { return null; } };

(async () => {
  const remote = readJson(REMOTE, { v: 0 });
  const health = readJson(HEALTH, { sources: {} });
  remote.homes = remote.homes || {}; remote.sources = remote.sources || []; remote.off = remote.off || [];
  health.autoOff = health.autoOff || [];
  const orig = JSON.stringify(remote);

  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const pg = await b.newPage();
  // يطبّق remote.json الحالي (عدا off حتى نفحص المخفي أيضاً)
  const bundle = JSON.stringify({ data: Object.assign({}, remote, { off: [] }), code: {} });
  await pg.route('https://shado.local/**', async r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/remote.js') return r.fulfill({ contentType: 'application/javascript', body: 'try{localStorage.setItem("mr.remote",' + JSON.stringify(bundle) + ')}catch(e){}' });
    const f = path.join(ENGINE, u.pathname === '/' ? 'engine.html' : u.pathname.slice(1));
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ contentType: f.endsWith('.html') ? 'text/html' : 'application/javascript', body: fs.readFileSync(f) });
  });
  const results = {};
  let ready; const readyP = new Promise(r => ready = r);
  await pg.exposeFunction('__nreq', async (id, url, opt) => { const r = await curl(url, JSON.parse(opt)); await pg.evaluate(([i, j]) => window.__done(i, j), [id, JSON.stringify(r)]); });
  await pg.exposeFunction('__nres', (id, json) => { results[id] && results[id](JSON.parse(json)); });
  await pg.exposeFunction('__nready', () => ready());
  await pg.addInitScript(() => { window.ShadoNative = { req: (i, u, o) => window.__nreq(i, u, o), result: (i, j) => window.__nres(i, j), take: i => window.__take(i), ready: () => window.__nready(), log: () => {} }; });
  await pg.goto('https://shado.local/engine.html');
  await readyP;
  let n = 0;
  const call = (m, S, a, ms = 60000) => withTimeout(new Promise(res => {
    const id = 'c' + (++n); results[id] = res;
    pg.evaluate(([i, m, s, a]) => Engine.call(i, m, s, a), [id, m, S ? JSON.stringify(S) : null, JSON.stringify(a || {})]);
  }), ms);

  // فحص كامل لمصدر: قائمة → عمل → فصل → صفحات
  async function probe(S) {
    const sp = await call('spec', S);
    if (sp.error) return { ok: false, kind: 'broken', note: sp.error };
    const l = await call('list', S, { page: 1, listing: (sp.listings[0] || [])[0] });
    if (l.error || !l.items || !l.items.length) {
      const e = String(l.error || 'قائمة فارغة');
      const kind = /cloudflare|403|503|challenge/i.test(e) ? 'cloudflare' : /HTTP 5\d\d|timeout|ENOTFOUND|resolve|curl failed|HTTP 0/i.test(e) ? 'down' : 'broken';
      return { ok: false, kind, note: e.slice(0, 160) };
    }
    const m = await call('manga', S, { url: l.items[0].url });
    if (m.error || !m.chapters || !m.chapters.length) return { ok: false, kind: 'broken', note: 'تفاصيل العمل: ' + String(m.error || 'لا فصول').slice(0, 120) };
    const ch = m.chapters[m.chapters.length - 1];
    const c = await call('chapter', S, { url: ch.url });
    if (c.error || !c.images || !c.images.length) return { ok: false, kind: 'broken', note: 'صفحات الفصل: ' + String(c.error || 'فارغة').slice(0, 120) };
    return { ok: true, kind: 'ok', note: `${l.items.length} عمل · ${m.chapters.length} فصل · ${c.images.length} صفحة` };
  }

  let catalog = await call('catalog');
  if (process.env.ONLY) catalog = catalog.filter(c => process.env.ONLY.split(',').includes(c.id));
  const changes = [];
  const now = Date.now();
  for (const src of catalog) {
    const id = src.id;
    const prev = health.sources[id] || { fails: 0 };
    let r = await probe({ id });
    // 1) نطاق جديد؟
    if (!r.ok && r.kind !== 'cloudflare') {
      const h = await curl(src.home, {});
      const o = origin(h.url);
      if (h.status >= 200 && h.status < 400 && o && o !== origin(src.home)) {
        const r2 = await probe({ id, home: o });
        if (r2.ok) { remote.homes[id] = o; r = r2; changes.push(`🔁 ${src.name}: نطاق جديد ${o}`); }
      }
    }
    // 2) قالب تغيّر؟ المولّد يتعرف على القالب الجديد
    if (!r.ok && r.kind === 'broken') {
      const home = remote.homes[id] || src.home;
      const g = await call('gen', null, { home }, 120000);
      if (g && g.source) {
        const def = Object.assign({}, g.source, { id, name: src.name, home });
        const r3 = await probe(def);
        if (r3.ok) {
          remote.sources = remote.sources.filter(s => s.id !== id).concat([def]);
          r = r3; changes.push(`🛠 ${src.name}: أُصلح بالمولّد (${def.tpl || 'قالب جديد'})`);
        }
      }
    }
    // 3) الإخفاء التلقائي والإعادة
    const fails = r.ok ? 0 : (r.kind === 'cloudflare' ? prev.fails : (prev.fails || 0) + 1);
    if (r.ok && health.autoOff.includes(id)) {
      remote.off = remote.off.filter(x => x !== id); health.autoOff = health.autoOff.filter(x => x !== id);
      changes.push(`✅ ${src.name}: عاد للعمل فأُعيد للجميع`);
    } else if (!r.ok && r.kind !== 'cloudflare' && fails >= 2 && !remote.off.includes(id)) {
      remote.off.push(id); health.autoOff.push(id);
      changes.push(`⛔ ${src.name}: معطّل أسبوعين فأُخفي (${r.note})`);
    } else if (!r.ok && r.kind === 'broken' && fails === 1) {
      changes.push(`⚠ ${src.name}: يحتاج إصلاحاً يدوياً (${r.note})`);
    }
    health.sources[id] = { name: src.name, status: r.kind, note: r.note, fails, checkedAt: now, lastOk: r.ok ? now : (prev.lastOk || 0) };
    console.log(id, r.kind, r.note);
  }
  await b.close();

  health.at = now;
  health.report = changes;
  if (JSON.stringify(remote) !== orig) remote.v = (remote.v || 0) + 1;
  fs.writeFileSync(REMOTE, JSON.stringify(remote, null, 2) + '\n');
  fs.writeFileSync(HEALTH, JSON.stringify(health, null, 2) + '\n');
  console.log('\n' + (changes.length ? changes.join('\n') : 'لا تغييرات'));
})();
