'use strict';
/* manga/manga-gen.js — مولّد المصادر: يفحص موقعًا من رابطه ورابط عمل ورابط فصل نموذجيين.
 * يكتشف القالب (Madara / MangaThemesia / ZeistManga) ويجرّب محوّل التطبيق الحقيقي نفسه على الروابط النموذجية؛
 * فإن عجز في جزء استنتج محدّده من صفحة الفصل أو العمل وأعاد التجربة، وما بقي عاجزًا يُطلب يدويًا.
 * MangaGen.scan({home, work, chapter}) -> {rows, cfg} · MangaGen.apply(cfg, key, value) · MangaGen.source(cfg) -> عنصر لـ db.sources */
(function (global) {
  const X = global.MangaSources.X;
  const t = X.t;
  const segs = u => X.segs(u);
  const NOISE = /^(active|current|odd|even|first|last|selected|open|show|hide|clearfix|row|col-.*|[\d_-]+|.*\d{3,}.*)$/i;
  const esc = s => (global.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/[^\w-]/g, '\\$&');
  const sig = el => {
    if (!el || !el.tagName) return '';
    const c = Array.from(el.classList).filter(x => !NOISE.test(x) && x.length < 40).slice(0, 2);
    return el.tagName.toLowerCase() + c.map(x => '.' + esc(x)).join('');
  };
  const cnt = (d, s) => { try { return d.querySelectorAll(s).length; } catch (e) { return 0; } };
  const shape = p => p.toLowerCase().replace(/\d+([-._]\d+)*/g, '#');
  const same = (a, b) => { try { return new URL(a).hostname.replace(/^www\./, '') === new URL(b).hostname.replace(/^www\./, ''); } catch (e) { return false; } };
  function groupBy(arr, fn) { const m = new Map(); arr.forEach(x => { const k = fn(x); if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return m; }
  function biggest(m) { let b = null; for (const [k, v] of m) if (!b || v.length > b[1].length) b = [k, v]; return b; }
  const attrOf = i => ['data-src', 'data-lazy-src', 'data-original', 'data-cfsrc', 'src'].find(a => { const v = i.getAttribute(a); return v && !/^data:/.test(v) && /[\/.]/.test(v); }) || null;

  // محدّد صور الفصل: أكبر مجموعة صور متشابهة الحاوية
  function guessPages(d) {
    const imgs = Array.from(d.querySelectorAll('img')).filter(attrOf);
    const b = biggest(groupBy(imgs, i => sig(i.parentElement) + '|' + sig(i.parentElement && i.parentElement.parentElement)));
    if (!b || b[1].length < 3) return null;
    const par = b[1][0].parentElement;
    const cands = [sig(par) + ' img', sig(par.parentElement) + ' ' + sig(par) + ' img', sig(par.parentElement) + ' img'];
    return cands.find(c => { const k = cnt(d, c); return k >= b[1].length * 0.8 && k <= b[1].length * 1.5; }) || cands[0];
  }
  // محدّد عنصر الفصل في صفحة العمل: أكبر مجموعة حاويات لروابط تشبه شكل رابط الفصل النموذجي
  function guessChapter(d, wu, cu) {
    const cs = shape(new URL(cu).pathname);
    const as = Array.from(d.querySelectorAll('a[href]')).filter(a => { const u = X.abs(a.getAttribute('href'), wu); return u && same(u, wu) && shape(new URL(u).pathname) === cs; });
    const b = biggest(groupBy(as, a => sig(a.closest('li') || a.parentElement)));
    if (!b || b[1].length < 2) return null;
    const box = b[1][0].closest('li') || b[1][0].parentElement;
    const cands = [sig(box), sig(box.parentElement) + ' > ' + sig(box), sig(box.parentElement) + ' ' + sig(box)];
    return cands.find(c => { const k = cnt(d, c); return k >= b[1].length * 0.8 && k <= b[1].length * 1.3; }) || cands[0];
  }

  // اكتشاف عمل وفصل نموذجيين تلقائياً من رابط الموقع وحده
  async function autoSamples(home, on) {
    const step = m => { if (on) on({ id: 'step', label: m, status: 'run', detail: '' }); };
    const origin = new URL(home).origin;
    const BAD = /^(tag|tags|genre|genres|category|categories|author|authors|artist|user|users|page|wp-|feed|search|login|register|account|profile|bookmark|about|contact|privacy|terms|dmca|faq|blog|news|forum|comments?|cdn-cgi|wp-json|team|teams|type|status|year|letter|az|\?)/i;
    const dec = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };
    const html = async u => { try { return await X.html(u); } catch (e) { return null; } };
    const pathOf = u => { try { return new URL(u).pathname.replace(/\/+$/, ''); } catch (e) { return ''; } };
    const pages = [origin + '/'];
    ['manga', 'series', 'mangas', 'manga-list', 'comics', 'library', 'list', 'all', 'latest', 'popular'].forEach(p => pages.push(origin + '/' + p + '/'));
    const links = new Map();
    const add = (u, img) => { if (!u || !same(u, origin)) return; const p = pathOf(u); if (!p) return; const o = links.get(p) || { u: u.split('#')[0].split('?')[0], img: false }; o.img = o.img || img; links.set(p, o); };
    let got = 0;
    for (const pu of pages) {
      if (got >= 5) break;
      step('تحليل ' + pu.replace(origin, '') + '…');
      const d = await html(pu); if (!d) continue; got++;
      Array.from(d.querySelectorAll('a[href]')).forEach(a => add(X.abs(a.getAttribute('href'), pu), !!a.querySelector('img') || !!(a.parentElement && a.parentElement.querySelector('img'))));
    }
    if (links.size < 8) {
      step('خريطة الموقع…');
      for (const sm of ['/sitemap.xml', '/wp-sitemap.xml', '/sitemap_index.xml', '/manga-sitemap.xml', '/series-sitemap.xml']) {
        const d = await html(origin + sm); if (!d) continue;
        const locs = s => (s.match(/https?:\/\/[^<\s"]+/g) || []);
        const raw = d.documentElement.outerHTML;
        locs(raw).filter(x => !/\.(xml|jpg|png|webp)(\?|$)/i.test(x)).forEach(u => add(u, false));
        for (const su of locs(raw).filter(x => /\.xml/.test(x) && /manga|series|post|work|comic/i.test(x) && !/page-sitemap|category|tag|genre/i.test(x)).slice(0, 2)) { const d2 = await html(su); if (d2) locs(d2.documentElement.outerHTML).filter(x => !/\.(xml|jpg|png|webp)(\?|$)/i.test(x)).forEach(u => add(u, false)); }
        if (links.size >= 8) break;
      }
    }
    const groups = new Map();
    links.forEach((o, p) => {
      const s = p.split('/').filter(Boolean).map(dec);
      if (!s.length || s.length > 3 || BAD.test(s[0]) || s.some(x => /^(page|\d+)$/.test(x))) return;
      const key = s.slice(0, -1).join('/');
      const gr = groups.get(key) || { key, items: [], img: 0 }; gr.items.push(o); if (o.img) gr.img++; groups.set(key, gr);
    });
    const cands = Array.from(groups.values()).filter(gr => gr.items.length >= 3 && gr.key).sort((a, b) => (b.img * 2 + b.items.length) - (a.img * 2 + a.items.length));
    const worksTry = [];
    cands.slice(0, 3).forEach(gr => gr.items.slice(0, 3).forEach(o => worksTry.push(o.u)));
    for (const wu of worksTry.slice(0, 6)) {
      step('فحص عمل محتمل: ' + dec(pathOf(wu)).slice(0, 40) + '…');
      const d = await html(wu); if (!d) continue;
      const wp = pathOf(wu), gs = new Map();
      Array.from(d.querySelectorAll('a[href]')).forEach(a => {
        const u = X.abs(a.getAttribute('href'), wu); if (!u || !same(u, origin)) return;
        const p = pathOf(u); if (!p || p === wp) return;
        const s = dec(p); if (BAD.test(s.replace(/^\//, ''))) return;
        const k = shape(s); const arr = gs.get(k) || []; arr.push(u); gs.set(k, arr);
      });
      const best = Array.from(gs.entries()).filter(([k, v]) => v.length >= 3 && /chapter|فصل|ch|episode|read|capitulo|#/i.test(k)).sort((a, b) => b[1].length - a[1].length)[0];
      if (best) return { work: wu, chapter: best[1].find(u => /(?:^|\D)1(?:\D|$)/.test(dec(pathOf(u)).split('/').pop())) || best[1][0], how: 'من صفحة العمل' };
    }
    return null;
  }


  const withT = (pr, ms) => Promise.race([pr, new Promise((_, no) => setTimeout(() => no(new Error('انتهت المهلة')), ms || 12000))]);
  // كشف واجهة Iken/Azora (api.<النطاق>/api/query أو <النطاق>/api/query)
  async function probeIken(home) {
    const u = new URL(home), h = u.hostname.replace(/^www\./, '');
    const tries = ['https://api.' + h, u.origin];
    for (const API of tries) {
      try {
        const q = X.qs({ page: 1, perPage: 5, searchTerm: '', tag: /\/\/api\./.test(API) ? 'latestUpdate' : undefined, isNovel: /\/\/api\./.test(API) ? 'false' : undefined });
        const j = await withT(X.json(API + '/api/query?' + q, { headers: { Referer: u.origin + '/' } }), 9000);
        const ps = j && j.posts;
        if (Array.isArray(ps) && ps.length && ps[0].slug && ps[0].postTitle) return { api: API === u.origin ? '' : API, slug: ps[0].slug };
      } catch (e) { }
    }
    return null;
  }
  const mk = c => global.MangaSources.build(Object.assign({ id: 'gen-tmp' }, c, { p: Object.assign({}, c.p) }));
  // قياس مصدر: زمن جلب الفصول وعددها وصور أول فصل
  async function measure(cfg, workUrl) {
    const r = { ms: 0, n: 0, imgs: 0, err: '' };
    try {
      const ad = mk(cfg); let wu = workUrl;
      const t0 = Date.now();
      if (!wu) { const l = await withT(ad.list({ page: 1, listing: 'latest', f: {} })); wu = l.items && l.items[0] && l.items[0].url; }
      if (!wu) { r.err = 'لا أعمال'; return r; }
      const t1 = Date.now();
      const m = await withT(ad.manga(wu), 40000); r.ms = Date.now() - t1; r.n = (m.chapters || []).length; r.work = wu;
      const ch = (m.chapters || [])[0];
      if (ch) { try { const c = await withT(ad.chapter(ch.url), 20000); r.imgs = (c.images || []).length; } catch (e) { } }
    } catch (e) { r.err = String(e.message || e).slice(0, 60); }
    return r;
  }
  // تحليل الطرق الأسرع لمصدر قائم: يقيس الحالية ثم بدائل القوالب العامة على العمل نفسه
  async function compare(src, on) {
    const step = l => { try { on && on(l); } catch (e) { } };
    const base = { id: src.id, name: src.name, home: src.home, type: src.type, tpl: src.tpl, base: src.base, chapterFmt: src.chapterFmt, p: Object.assign({}, src.p) };
    step('قياس الطريقة الحالية');
    const cur = await measure(base);
    const alts = [], need = Math.max(1, Math.floor((cur.n || 0) * 0.95));
    const cands = [];
    const b = src.base || 'manga', dir = b !== 'manga' ? { dir: '/' + b } : {};
    const isM = x => x.type === 'madara' || x.tpl === 'madara';
    if (!isM(src) || (src.p && (src.p.paginated || src.p.newCh))) cands.push(['Madara · ajax', { type: 'madara', tpl: 'madara', p: {} }]);
    if (!(src.p && src.p.paginated)) cands.push(['Madara · صفحات ajax', { type: 'madara', tpl: 'madara', p: { paginated: true } }]);
    if (!(src.p && src.p.newCh)) cands.push(['Madara · فصول الصفحة', { type: 'madara', tpl: 'madara', p: { newCh: 1 } }]);
    if (src.type !== 'mangathemesia') cands.push(['MangaStream / Themesia', { type: 'mangathemesia', tpl: 'mangathemesia', p: dir }]);
    if (src.type !== 'iken') { step('بحث عن واجهة API'); const ik = await probeIken(src.home); if (ik) cands.unshift(['Iken API', { type: 'iken', tpl: 'iken', p: ik.api ? { api: ik.api } : {} }]); }
    for (const [label, patch] of cands) {
      step('تجربة: ' + label);
      const c2 = Object.assign({}, base, patch, { id: 'gen-tmp', ovr: true, p: Object.assign({}, patch.p) });
      let r = {}; try { r = await measure(c2, cur.work && patch.type !== 'iken' ? cur.work : null); } catch (e) { r = { err: 'x' }; }
      if (r.n > 0) alts.push({ label, cfg: { type: c2.type, tpl: c2.tpl, p: c2.p }, ms: r.ms, n: r.n, imgs: r.imgs, ok: r.n >= need && r.n <= (cur.n || 1e9) * 1.5, faster: !cur.ms || r.ms < cur.ms * 0.8 });
    }
    return { cur, alts, need };
  }

  async function scan(o, on) {
    const rows = [];
    const push = (id, label, status, detail, manual) => { const r = { id, label, status, detail, manual: manual || null }; rows.push(r); if (on) on(r); return r; };
    // واجهات API (Iken/Azora): تُكشف قبل تحليل الصفحات
    try {
      const ik = await probeIken(o.home);
      if (ik) {
        const hh = new URL(o.home);
        const cfgI = { name: hh.hostname.replace(/^www\./, ''), home: hh.origin, type: 'iken', tpl: 'iken', base: 'series', chapterFmt: '{n}', p: ik.api ? { api: ik.api } : {} };
        push('tpl', 'قالب الموقع', 'ok', 'Iken API (أسرع من تحليل الصفحات)');
        const adI = mk(cfgI);
        const wI = await measure(cfgI, hh.origin + '/series/' + ik.slug);
        push('work', 'صفحة العمل', wI.n ? 'ok' : 'fail', wI.n ? ik.slug : (wI.err || 'فشل'));
        push('chapters', 'قائمة الفصول', wI.n ? 'ok' : 'fail', wI.n + ' فصلاً · ' + wI.ms + 'ms');
        push('pages', 'صور الفصل', wI.imgs >= 1 ? 'ok' : 'fail', wI.imgs + ' صورة');
        let lI = null; try { lI = await adI.list({ page: 1, listing: 'latest', f: {} }); } catch (e) { }
        push('library', 'قائمة الأعمال', lI && lI.items.length >= 3 ? 'ok' : 'fail', lI ? lI.items.length + ' عملاً' : 'فشل');
        let sI = null; try { sI = await adI.list({ page: 1, q: ik.slug.split('-')[0], f: {} }); } catch (e) { }
        push('search', 'البحث', sI && sI.items.length ? 'ok' : 'fail', sI ? sI.items.length + ' نتيجة' : 'فشل');
        return { rows, cfg: cfgI };
      }
    } catch (e) { }
    if (!o.work || !o.chapter) {
      const A = await autoSamples(o.home, on);
      if (!A) { push('sample', 'عمل وفصل نموذجيان', 'fail', 'تعذّر إيجادهما تلقائياً — الصق رابط عمل من الموقع في الخانة الاختيارية'); return { rows, cfg: null }; }
      o = Object.assign({}, o, { work: o.work || A.work, chapter: o.chapter || A.chapter });
      push('sample', 'عمل وفصل نموذجيان', 'ok', A.how + ': ' + decodeURIComponent(new URL(o.work).pathname).slice(0, 40));
    }
    const home = new URL(o.home).origin, wu = o.work, cu = o.chapter;
    if (!same(wu, home) || !same(cu, home)) throw new Error('روابط العمل والفصل يجب أن تكون من نفس الموقع');
    const ws = segs(wu);
    if (ws.length < 2) throw new Error('رابط العمل يجب أن يكون بالشكل /مسار/اسم-العمل/');
    const base = ws[0], slug = ws[1];

    const wd = await X.html(wu), cd = await X.html(cu);
    const raw = (wd.documentElement.outerHTML || '') + (cd.documentElement.outerHTML || '');
    const madara = /wp-manga|madara/i.test(raw);
    const themesia = !madara && /listupd|class="bsx"|ts_reader|themesia|mangareader|mangastream/i.test(raw);
    const zeist = !madara && !themesia && /zeistmanga|blogger\.com|\/feeds\/posts|blogspot/i.test(raw);
    const tpl = madara ? 'madara' : themesia ? 'mangathemesia' : zeist ? 'zeistmanga' : 'madara';
    const known = madara || themesia || zeist;
    const name = ((wd.querySelector('meta[property="og:site_name"]') || {}).content || '').trim() || t(wd.querySelector('title')).split(/\s[-|–]\s/).pop().trim() || new URL(home).hostname;
    const cfg = { name, home, type: known ? tpl : 'auto', tpl, base, chapterFmt: '{n}', p: {} };
    if (themesia && base !== 'manga') cfg.p.dir = '/' + base;
    push('tpl', 'قالب الموقع', known ? 'ok' : 'skip', known ? ({ madara: 'Madara', mangathemesia: 'MangaStream / Themesia', zeistmanga: 'Blogger (ZeistManga)' })[tpl] : 'غير معروف، سأجرّب Madara');

    const build = () => global.MangaSources.build(Object.assign({ id: 'gen-tmp' }, cfg, { p: Object.assign({}, cfg.p) }));
    const tryWork = async ad => { try { const m = await ad.manga(wu); return { title: m.title || '', n: (m.chapters || []).length }; } catch (e) { return { err: String(e.message || e) }; } };
    const tryChap = async ad => { try { const c = await ad.chapter(cu); return { n: (c.images || []).length }; } catch (e) { return { err: String(e.message || e) }; } };

    let ad = build(), w = await tryWork(ad), c = await tryChap(ad);
    // محاولة ثانية بمحددات مستنتجة من الصفحتين
    let changed = false;
    if (!(w.n >= 1)) { const s = guessChapter(wd, wu, cu); if (s) { cfg.p.chapter = s; changed = true; } }
    if (!(c.n >= 3)) { const s = guessPages(cd); if (s) { cfg.p.pages = s; changed = true; } }
    if (changed) { ad = build(); w = await tryWork(ad); c = await tryChap(ad); }

    // العدد المعلن في صفحة العمل («الفصول 655» أو «655 فصل»): إن كان أقل بكثير نجرّب كل طرق جلب الفصول ونختار الأكمل
    const declared = (() => { const tx = (wd.body && wd.body.textContent || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\s+/g, ' '); const nums = []; let m; const re1 = /(?:الفصول|فصول|chapters)\s*[:：(]?\s*(\d[\d,]{1,7})/gi, re2 = /(\d[\d,]{1,7})\s*(?:فصل|فصلاً|chapters)/gi; while ((m = re1.exec(tx))) nums.push(+m[1].replace(/,/g, '')); while ((m = re2.exec(tx))) nums.push(+m[1].replace(/,/g, '')); return Math.max(0, ...nums.filter(n => n < 100000)); })();
    let picked = '';
    if ((declared >= 20 && (w.n || 0) < declared * 0.9) || !(w.n >= 1)) {
      const need = declared >= 20 ? declared * 0.9 : 3, maxOk = declared >= 20 ? declared * 1.5 : 1e9;
      const cands = [];
      const dir = base !== 'manga' ? { dir: '/' + base } : {};
      cands.push(['Madara · ajax', { type: 'madara', tpl: 'madara', p: {} }]);
      cands.push(['Madara · صفحات ajax', { type: 'madara', tpl: 'madara', p: { paginated: true } }]);
      cands.push(['Madara · فصول الصفحة', { type: 'madara', tpl: 'madara', p: { newCh: 1 } }]);
      cands.push(['MangaStream / Themesia', { type: 'mangathemesia', tpl: 'mangathemesia', p: dir }]);
      cands.push(['Blogger (ZeistManga)', { type: 'zeistmanga', tpl: 'zeistmanga', p: {} }]);
      let best = { n: w.n || 0, label: '', cfg: null };
      for (const [label, patch] of cands) {
        if (on) on({ id: 'step', label: 'تجربة طريقة الفصول: ' + label, status: 'run', detail: '' });
        const c2 = Object.assign({}, cfg, patch, { p: Object.assign({}, cfg.p, patch.p) });
        let r = {}; try { r = await tryWork(global.MangaSources.build(Object.assign({ id: 'gen-tmp' }, c2))); } catch (e) { }
        if ((r.n || 0) > best.n && r.n <= maxOk) best = { n: r.n, label, cfg: c2 };
        if (best.n >= need) break;
      }
      if (best.cfg) { Object.assign(cfg, best.cfg); w.n = best.n; if (!w.title) w.title = 'عمل'; picked = best.label; ad = build(); w = await tryWork(ad); c = await tryChap(ad); }
    }
    if (w.title) push('work', 'صفحة العمل', 'ok', w.title);
    else push('work', 'صفحة العمل', 'fail', w.err || 'لم أجد عنوان العمل', { key: 'p.title', hint: 'معرّف عنوان العمل مثل .post-title h1' });
    if (w.n >= 1) push('chapters', 'قائمة الفصول', declared >= 20 && w.n < declared * 0.7 ? 'fail' : 'ok', w.n + ' فصلاً' + (cfg.p.chapter ? ' (محدّد مستنتج)' : '') + (declared ? ' · المعلن في الصفحة ' + declared : '') + (picked ? ' · اختيرت طريقة «' + picked + '» تلقائياً' : '') + (declared >= 20 && w.n < declared * 0.7 ? ' — القائمة ناقصة' : ''));
    else push('chapters', 'قائمة الفصول', 'fail', w.err || 'لم أجد فصولاً', { key: 'p.chapter', hint: 'معرّف عنصر الفصل مثل li.wp-manga-chapter' });
    if (c.n >= 3) push('pages', 'صور الفصل', 'ok', c.n + ' صورة' + (cfg.p.pages ? ' (محدّد مستنتج)' : ''));
    else push('pages', 'صور الفصل', 'fail', c.err || 'لم أجد صور الفصل', { key: 'p.pages', hint: 'معرّف صور الفصل مثل .reading-content img' });

    // المكتبة والتكملة
    let l1 = null;
    try { l1 = await ad.list({ page: 1, listing: 'latest', f: {} }); } catch (e) { push('library', 'قائمة الأعمال', 'fail', String(e.message || e).slice(0, 80), { key: 'p.item', hint: 'معرّف بطاقة العمل في القائمة مثل .page-item-detail' }); }
    if (l1) {
      const n = (l1.items || []).length;
      if (n >= 3) push('library', 'قائمة الأعمال', 'ok', n + ' عملاً');
      else push('library', 'قائمة الأعمال', 'fail', 'لم أجد أعمالاً في القائمة', { key: 'p.item', hint: 'معرّف بطاقة العمل في القائمة مثل .page-item-detail' });
      if (n >= 3) {
        let l2 = null; try { l2 = await ad.list({ page: 2, listing: 'latest', f: {} }); } catch (e) { }
        const a = new Set((l1.items || []).map(x => x.url)), fresh = l2 ? (l2.items || []).filter(x => !a.has(x.url)).length : 0;
        if (fresh >= 3) push('paging', 'التكملة (صفحات أو مزيد)', 'ok', 'الصفحة الثانية تعمل');
        else push('paging', 'التكملة (صفحات أو مزيد)', 'fail', 'لم تُرجع الصفحة الثانية أعمالاً جديدة (قد يحتاج الموقع مصدراً خاصاً)');
      }
    }

    // البحث
    const title = w.title || '', q = (title.split(/\s+/).find(x => x.length >= 3) || title).slice(0, 12);
    if (q) {
      let s = null; try { s = await ad.list({ page: 1, q, f: {} }); } catch (e) { }
      const hit = s && (s.items || []).some(x => { try { return segs(x.url)[1] === slug; } catch (e) { return false; } });
      push('search', 'البحث', hit ? 'ok' : 'fail', hit ? 'يجد العمل النموذجي' : 'لم يُرجع البحث العمل النموذجي');
    }
    return { rows, cfg };
  }

  function apply(cfg, key, value) {
    const parts = key.split('.');
    let o = cfg;
    for (let i = 0; i < parts.length - 1; i++) { if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = value;
    return cfg;
  }
  // عنصر جاهز لـ db.sources (الشكل نفسه الذي تنشئه «فحص وإضافة»)
  function source(cfg) {
    const s = Object.assign({ id: 'u' + Date.now() }, cfg);
    if (s.p && !Object.keys(s.p).length) delete s.p;
    return s;
  }
  global.MangaGen = { scan, apply, source, compare, probeIken };
})(window);
