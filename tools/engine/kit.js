/* manga-sources.js — محوّلات المصادر (مستقل؛ يعتمد على MangaFetch.req للطلبات عبر جلسة الموقع).
 * منقول منطقه من naifqarni/aidoku-arabic-sources (Apache-2.0 / MIT) من Rust إلى JavaScript.
 *
 * محوّل المصدر:
 *   list({page, q, listing, f}) -> {items:[{url,title,cover,latest}], hasNext}
 *   manga(url)   -> {url,title,cover,summary,genres,status,chapters:[{url,title,num,date}]}
 *   chapter(url) -> {images:[url]}   (رابط فيه ‎#mg=…‎ يحتاج فكًّا عبر MangaSources.decode)
 *   isChapter(url), mangaOf(chapterUrl), listings:[[id,name]], filters:[…]
 */
(function (global) {
  'use strict';

  // كل الأدوات والمحوّلات داخل kit(RO) ليأخذ كل استعمال خيارات طلباته (مثلًا البحث الشامل: طلبات أصلية فقط)
  function kit(RO) {
  RO = RO || {};
  // ================= أدوات =================
  const X = {};
  // نطاقات API تُطلب من داخل جلسة الموقع الأم
  const VIA = { 'api.ariatoon.com': 'https://ariatoon.com', 'manga-api.kawaii-anime.com': 'https://kawaiimanga.org', 'api.mangatuk.com': 'https://mangatuk.com', 'api.rocksmanga.com': 'https://rocksmanga.com', 'api.azorafly.com': 'https://azorafly.com', 'mangatales.com': 'https://www.mangatales.com' };
  const viaFor = u => { try { const h = new URL(u).hostname; return VIA[h] || new URL(u).origin; } catch (e) { return undefined; } };
  X.req = (url, o) => global.MangaFetch.req(url, Object.assign({ via: viaFor(url) }, RO, o));
  X.abs = (h, base) => { try { return h ? new URL(String(h).trim(), base).href : null; } catch (e) { return null; } };
  X.t = e => (e && e.textContent || '').replace(/\s+/g, ' ').trim();
  X.own = e => e ? Array.from(e.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim() : '';
  X.num = s => { const m = String(s == null ? '' : s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).match(/\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; };
  X.qs = o => {
    const p = [];
    Object.keys(o).forEach(k => {
      const v = o[k];
      if (v == null || v === '') return;
      (Array.isArray(v) ? v : [v]).forEach(x => { if (x != null && x !== '') p.push(encodeURIComponent(k) + '=' + encodeURIComponent(x)); });
    });
    return p.join('&');
  };
  X.date = v => {
    if (v == null || v === '') return '';
    let d;
    if (typeof v === 'number') d = new Date(v < 1e12 ? v * 1000 : v);
    else d = new Date(String(v).replace(' ', 'T'));
    if (isNaN(d)) return String(v).slice(0, 20);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const IMG_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-cfsrc', 'data-url', 'data-zoom-src', 'src'];
  X.img = (el, base) => {
    if (!el) return '';
    for (const a of IMG_ATTRS) { const v = el.getAttribute(a); if (v && v.trim() && !/^(data|blob):/.test(v.trim())) return X.abs(v, base); }
    const ss = el.getAttribute('data-srcset') || el.getAttribute('srcset');
    if (ss) {
      const parts = ss.split(',').map(x => x.trim().split(/\s+/)).filter(x => x[0]);
      parts.sort((a, b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0));
      if (parts[0]) return X.abs(parts[0][0], base);
    }
    const st = el.getAttribute('style') || '';
    const m = st.match(/url\(['"]?([^'")]+)/);
    return m ? X.abs(m[1], base) : '';
  };
  X.parse = (text, url) => {
    const d = new DOMParser().parseFromString(text || '', 'text/html');
    try { const b = d.createElement('base'); b.href = url; (d.head || d.documentElement).prepend(b); } catch (e) { }
    d.__url = url;
    return d;
  };
  function httpErr(r, url) { const e = new Error('HTTP ' + r.status); e.status = r.status; e.url = url; return e; }
  X.text = async (url, o) => { const r = await X.req(url, o); if (r.status >= 400) throw httpErr(r, url); return r.text; };
  X.html = async (url, o) => { const r = await X.req(url, Object.assign({ html: true }, o)); if (r.status >= 400) throw httpErr(r, url); return X.parse(r.text, r.url || url); };
  X.json = async (url, o) => {
    o = Object.assign({}, o); o.headers = Object.assign({ Accept: 'application/json' }, o.headers || {});
    const r = await X.req(url, o);
    if (r.status >= 400) throw httpErr(r, url);
    try { return JSON.parse(r.text); } catch (e) { throw new Error('ردّ غير متوقع من الموقع'); }
  };
  X.postForm = (url, obj, o) => { o = o || {}; return X.req(url, Object.assign({}, o, { method: 'POST', body: typeof obj === 'string' ? obj : X.qs(obj), headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }, o.headers || {}) })); };
  X.postJson = async (url, obj, o) => {
    const r = await X.req(url, Object.assign({}, o, { method: 'POST', body: JSON.stringify(obj), headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json' }, (o && o.headers) || {}) }));
    if (r.status >= 400) throw httpErr(r, url);
    return JSON.parse(r.text);
  };
  X.between = (s, a, b) => { const i = s.indexOf(a); if (i < 0) return null; const j = s.indexOf(b, i + a.length); return j < 0 ? null : s.slice(i + a.length, j); };
  // عناصر تحمل نصًا معيّنًا (بديل :contains)
  X.byText = (root, sel, words) => Array.from(root.querySelectorAll(sel)).filter(e => words.some(w => X.t(e).indexOf(w) >= 0));
  X.uniqBy = (arr, k) => { const s = new Set(); return arr.filter(x => { const v = x[k]; if (!v || s.has(v)) return false; s.add(v); return true; }); };
  X.path = u => { try { return decodeURIComponent(new URL(u).pathname); } catch (e) { return ''; } };
  X.segs = u => X.path(u).split('/').filter(Boolean);
  // حمولة Next.js (self.__next_f.push)
  X.nextPayload = doc => {
    let p = '';
    doc.querySelectorAll('script').forEach(s => {
      const d = (s.textContent || '').trim();
      if (d.indexOf('self.__next_f.push(') !== 0) return;
      try { const a = JSON.parse(d.slice(19).replace(/\);?$/, '')); if (a[0] === 1) p += a[1]; } catch (e) { }
    });
    return p;
  };
  X.nextFind = (payload, keys) => {
    const find = v => {
      if (Array.isArray(v)) { for (const x of v) { const r = find(x); if (r) return r; } return null; }
      if (v && typeof v === 'object') { if (keys.every(k => k in v)) return v; for (const k in v) { const r = find(v[k]); if (r) return r; } }
      return null;
    };
    for (const line of payload.split('\n')) {
      const i = line.indexOf(':'); if (i < 0) continue;
      let v; try { v = JSON.parse(line.slice(i + 1)); } catch (e) { continue; }
      const r = find(v); if (r) return r;
    }
    return null;
  };
  X.status = s => {
    s = String(s || '').toLowerCase();
    if (/مستمر|ongoing|on-going|releasing|coming|قادم/.test(s)) return 'مستمر';
    if (/مكتمل|completed|end\b|finished|منتهي/.test(s)) return 'مكتمل';
    if (/متوقف|hiatus|on-hold|on_hold/.test(s)) return 'متوقف';
    if (/ملغ|cancel|dropped|متروك/.test(s)) return 'ملغى';
    return '';
  };
  // تمييز الصور التي تحتاج فكًّا
  X.mark = (url, spec) => url + '#mg=' + encodeURIComponent(JSON.stringify(spec));

  // MD5 (لفك حماية Madara: CryptoJS AES بمفتاح EVP_BytesToKey)
  function md5(bytes) {
    const K = [], S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
    const n = bytes.length, len = ((n + 8) >>> 6 << 6) + 64, m = new Uint8Array(len);
    m.set(bytes); m[n] = 0x80;
    const bits = n * 8; for (let i = 0; i < 8; i++) m[len - 8 + i] = Math.floor(bits / Math.pow(2, 8 * i)) & 255;
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    const w = new Uint32Array(16);
    for (let off = 0; off < len; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = m[off + i * 4] | (m[off + i * 4 + 1] << 8) | (m[off + i * 4 + 2] << 16) | (m[off + i * 4 + 3] << 24);
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + K[i] + w[g]) >>> 0; A = D; D = C; C = B;
        B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    const out = new Uint8Array(16);
    [a0, b0, c0, d0].forEach((v, i) => { for (let j = 0; j < 4; j++) out[i * 4 + j] = (v >>> (8 * j)) & 255; });
    return out;
  }
  const b64 = s => Uint8Array.from(atob(String(s).trim()), c => c.charCodeAt(0));
  const hexb = h => Uint8Array.from((h.match(/../g) || []).map(x => parseInt(x, 16)));
  const utf8 = s => new TextEncoder().encode(s);
  const cat = (...a) => { const r = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; a.forEach(x => { r.set(x, o); o += x.length; }); return r; };
  async function cryptoJsDecrypt(ctB64, saltHex, pass) {
    const p = utf8(pass), salt = hexb(saltHex);
    let d = new Uint8Array(0), prev = new Uint8Array(0);
    while (d.length < 48) { prev = md5(cat(prev, p, salt)); d = cat(d, prev); }
    const key = await crypto.subtle.importKey('raw', d.slice(0, 32), 'AES-CBC', false, ['decrypt']);
    const out = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: d.slice(32, 48) }, key, b64(ctB64));
    return new TextDecoder().decode(out);
  }

  // ================= القوالب =================
  const sameHost = (u, home) => { try { return new URL(u).hostname.replace(/^www\./, '') === new URL(home).hostname.replace(/^www\./, ''); } catch (e) { return false; } };
  const sel1 = (root, s) => { try { return root.querySelector(s); } catch (e) { return null; } };
  const selA = (root, s) => { try { return Array.from(root.querySelectorAll(s)); } catch (e) { return []; } };

  // ---------- Madara ----------
  function madara(S, p) {
    p = Object.assign({
      base: 'manga',
      item: 'div.c-tabs-item__content, .manga__item, .page-item-detail, .am-search-card, .am-manga-card',
      itemLink: 'div.post-title a, .post-title a, .am-search-card__title a, .am-manga-card__title a',
      title: '.post-title h1, .post-title h3, #manga-title > h1',
      cover: 'div.summary_image img',
      desc: 'div.description-summary div.summary__content, div.summary_content div.post-content_item > h5 + div, div.summary_content div.manga-excerpt, div.manga-excerpt',
      tags: 'div.genres-content a',
      chapter: 'li.wp-manga-chapter',
      date: 'span.chapter-release-date',
      pages: 'div.page-break img, li.blocks-gallery-item img, .reading-content img, img.wp-manga-chapter-img',
    }, p || {});
    const H = S.home;
    let loadMore = null;
    const segs = u => X.segs(u);
    const ad = {
      listings: S.listings.length ? S.listings : [['latest', 'الأحدث'], ['popular', 'الأكثر مشاهدة']],
      isChapter: u => { const s = segs(u); return s[0] === p.base && s.length >= 3; },
      mangaOf: u => { const s = segs(u); return s[0] === p.base && s.length >= 2 ? H + '/' + p.base + '/' + s[1] + '/' : null; },
      async genres() {
        const d = await X.html(H + '/?s=genre&post_type=wp-manga');
        const o = [], v = [];
        selA(d, 'div.checkbox-group div.checkbox').forEach(c => { const l = X.t(c.querySelector('label')), i = c.querySelector('input'); if (l && i) { o.push(l); v.push(i.value); } });
        return o.length ? { id: 'genre[]', t: 'm', n: 'التصنيفات', o, v, g: 1 } : null;
      },
      async list(a) {
        const f = a.f || {};
        let order = f.m_orderby;
        if (order == null || order === '') order = a.q ? '' : (a.listing === 'popular' ? 'views' : 'latest');
        const q = 's=' + encodeURIComponent(a.q || '') + '&' + X.qs({ post_type: 'wp-manga', m_orderby: order, op: f.op, 'genre[]': f['genre[]'], 'status[]': f['status[]'] });
        if (loadMore && a.page > 1) {
          const vars = { action: 'madara_load_more', page: a.page - 1, template: 'madara-core/content/content-search', 'vars[paged]': 1, 'vars[template]': 'archive', 'vars[sidebar]': 'right', 'vars[post_type]': 'wp-manga', 'vars[post_status]': 'publish', 'vars[manga_archives_item_layout]': 'big_thumbnail' };
          if (a.q) vars['vars[s]'] = a.q;
          const om = { latest: ['meta_value_num', '_latest_update'], views: ['meta_value_num', '_wp_manga_views'], trending: ['meta_value_num', '_wp_manga_week_views_value'], 'new-manga': ['date'], alphabet: ['post_title'] }[order];
          if (om) { vars['vars[orderby]'] = om[0]; if (om[1]) vars['vars[meta_key]'] = om[1]; vars['vars[order]'] = order === 'alphabet' ? 'ASC' : 'DESC'; }
          const r = await X.postForm(H + '/wp-admin/admin-ajax.php', vars);
          const items = this.items(X.parse(r.text, H + '/'));
          return { items, hasNext: items.length > 0 };
        }
        const d = await X.html(H + '/' + (a.page > 1 ? 'page/' + a.page + '/' : '') + '?' + q);
        if (loadMore == null) loadMore = !!d.querySelector('nav.navigation-ajax');
        const items = this.items(d);
        return { items, hasNext: !!d.querySelector('div.nav-previous, nav.navigation-ajax, a.nextpostslink, .wp-pagenavi a.next, a.next.page-numbers') };
      },
      items(d) {
        const out = [];
        selA(d, p.item).forEach(c => {
          const a = sel1(c, p.itemLink) || c.querySelector('a[href]');
          const u = a && X.abs(a.getAttribute('href'), d.__url);
          if (!u) return;
          const t = X.t(a) || a.getAttribute('title') || (c.querySelector('img') || {}).alt || '';
          if (!t) return;
          const latest = X.t(c.querySelector('.chapter-item .chapter a, span.chapter a, .latest-chap .chapter a, .chapter a'));
          out.push({ url: u, title: t.slice(0, 150), cover: X.img(c.querySelector('img'), d.__url), latest: latest.slice(0, 40), rating: X.t(c.querySelector('.score, .post-total-rating .score, .numscore')).replace(/[^\d.]/g, '').slice(0, 4) });
        });
        return X.uniqBy(out, 'url');
      },
      async manga(url) {
        const d = await X.html(url);
        const title = X.t(sel1(d, p.title)) || (d.querySelector('meta[property="og:title"]') || {}).content || '';
        const stEl = X.byText(d, 'div.summary-heading, .am-manga-meta td', ['Status', 'الحالة'])[0];
        const r = {
          url, title: title.replace(/\s*(HOT|NEW)\s*$/i, '').trim(),
          cover: X.img(sel1(d, p.cover), url) || (d.querySelector('meta[property="og:image"]') || {}).content || '',
          summary: X.t(sel1(d, p.desc)).slice(0, 2000),
          genres: selA(d, p.tags).map(X.t).filter(Boolean),
          status: X.status(stEl ? X.t(stEl.nextElementSibling) : ''),
        };
        let els = selA(d, p.chapter);
        const mu = url.replace(/[?#].*$/, '').replace(/\/?$/, '/');
        // قائمة الصفحة قد تعرض آخر الفصول فقط (جزئية): نجلب القائمة الكاملة بـajax ونعتمدها إن كانت أطول
        const els0 = els, partial = els.length > 0 && (p.paginated || p.newCh || els.length <= 30);
        if (partial) els = [];
        if (!els.length) {
          if (p.paginated) {
            const all = [];
            for (let pg = 1; pg < 60; pg++) {
              const x = await X.postForm(mu + 'ajax/chapters/?t=' + pg, '');
              if (x.status === 404) break;
              const got = selA(X.parse(x.text, url), p.chapter);
              if (!got.length) break;
              const last = got[got.length - 1].querySelector('a');
              if (all.length && last && all[all.length - 1].querySelector('a').href === last.href) break;
              all.push(...got);
            }
            els = all;
          } else {
            const x = await X.postForm(mu + 'ajax/chapters/', '').catch(() => null);
            if (x && x.status < 400) els = selA(X.parse(x.text, url), p.chapter);
            if (!els.length) {
              const holder = d.querySelector('[id^=manga-chapters-holder][data-id], #manga-chapters-holder');
              const id = holder && holder.getAttribute('data-id');
              if (id) {
                const y = await X.postForm(H + '/wp-admin/admin-ajax.php', { action: 'manga_get_chapters', manga: id });
                els = selA(X.parse(y.text, url), p.chapter);
              }
            }
          }
        }
        if (partial && els.length <= els0.length) els = els0;
        r.chapters = X.uniqBy(els.map(li => {
          const a = li.querySelector('a[href]'); if (!a) return null;
          const cu = X.abs(a.getAttribute('href'), url), t = X.t(a);
          const de = sel1(li, p.date);
          const date = de ? (X.t(de) || ((de.querySelector('a[title]') || {}).title || '')) : '';
          return { url: cu, title: t, num: X.num(t) != null ? X.num(t) : X.num(X.segs(cu).pop()), date };
        }).filter(Boolean), 'url');
        return r;
      },
      async chapter(url) {
        const d = await X.html(url);
        const prot = d.querySelector('#chapter-protector-data');
        if (prot) {
          let js = prot.textContent || '';
          const src = prot.getAttribute('src') || '';
          if (src.indexOf('data:text/javascript;base64,') === 0) js = atob(src.slice(28));
          const pass = X.between(js, "wpmangaprotectornonce='", "';");
          const data = JSON.parse((X.between(js, "chapter_data='", "';") || '{}').replace(/\\\//g, '/'));
          const plain = await cryptoJsDecrypt(data.ct, data.s, pass);
          let arr = JSON.parse(plain); if (typeof arr === 'string') arr = JSON.parse(arr);
          return { images: arr };
        }
        const imgs = selA(d, p.pages).map(i => X.img(i, url)).filter(Boolean);
        return { images: Array.from(new Set(imgs)) };
      },
    };
    return ad;
  }

  // ---------- MangaThemesia ----------
  function themesia(S, p) {
    p = Object.assign({
      dir: '/manga',
      item: '.utao .uta .imgu, .listupd .bs .bsx, .listo .bs .bsx',
      itemTitle: '',
      next: 'div.pagination .next, div.hpage .r',
      details: 'div.bigcontent, div.animefull, div.main-info, div.postbody',
      title: 'h1.entry-title, .ts-breadcrumb li:last-child span',
      cover: '.infomanga > div[itemprop=image] img, .thumb img',
      desc: '.desc, .entry-content[itemprop=description]',
      genre: 'div.gnr a, .mgen a, .seriestugenre a',
      status: null,
      chapters: 'div.bxcl li, div.cl li, #chapterlist li, ul li:has(div.chbox):has(div.eph-num)',
      chTitle: '.lch a, .chapternum',
      chDate: '.chapterdate',
    }, p || {});
    const H = S.home;
    const ad = {
      listings: S.listings.length ? S.listings : [['update', 'آخر التحديثات'], ['popular', 'الأكثر شعبية']],
      isChapter: u => { const s = X.segs(u); return s.length === 1 && /(chapter|ch-|فصل|-\d+$)/i.test(s[0]); },
      mangaOf: u => { const s = X.segs(u); return s[0] === p.dir.replace(/^\//, '') && s.length >= 2 ? H + p.dir + '/' + s[1] + '/' : null; },
      async list(a) {
        const f = Object.assign({}, a.f || {});
        if (!f.order && !a.q) f.order = a.listing === 'popular' ? 'popular' : 'update';
        const q = Object.assign({ page: a.page, title: a.q || '' }, f);
        const d = await X.html(H + p.dir + '/?' + X.qs(q));
        const items = X.uniqBy(selA(d, p.item).map(c => {
          const l = c.querySelector('a[href]'); if (!l) return null;
          const t = (p.itemTitle && X.t(sel1(c, p.itemTitle))) || l.getAttribute('title') || X.t(c.querySelector('.tt')) || '';
          const latest = X.t(c.querySelector('.epxs, .adds .epxs'));
          return t ? { url: X.abs(l.getAttribute('href'), d.__url), title: t.trim().slice(0, 150), cover: X.img(c.querySelector('img'), d.__url), latest, rating: X.t(c.querySelector('.numscore, .score')).replace(/[^\d.]/g, '').slice(0, 4) } : null;
        }).filter(Boolean), 'url');
        return { items, hasNext: !!sel1(d, p.next) };
      },
      async manga(url) {
        const d = await X.html(url);
        const box = sel1(d, p.details) || d;
        const st = p.status ? sel1(box, p.status) : X.byText(box, '.infotable tr, .tsinfo .imptdt, .fmed, .info-label', ['الحالة', 'Status', 'حالة العمل'])[0];
        let stText = '';
        if (st) stText = st.matches && st.matches('tr') ? X.t(st.querySelector('td:last-child')) : (X.t(st.querySelector('i, span, a')) || (st.nextElementSibling ? X.t(st.nextElementSibling) : X.t(st)));
        const r = {
          url,
          title: X.t(sel1(box, p.title)) || X.t(d.querySelector('h1')),
          cover: X.img(sel1(box, p.cover), url),
          summary: X.t(sel1(box, p.desc)).slice(0, 2000),
          genres: selA(box, p.genre).map(X.t).filter(Boolean),
          status: X.status(stText),
        };
        r.chapters = X.uniqBy(selA(d, p.chapters).map(li => {
          const a = li.querySelector('a[href]'); if (!a) return null;
          const t = X.t(sel1(li, p.chTitle)) || X.t(a);
          return { url: X.abs(a.getAttribute('href'), url), title: t, num: X.num(t), date: X.t(sel1(li, p.chDate)) };
        }).filter(Boolean), 'url');
        return r;
      },
      async chapter(url) {
        const r = await X.req(url, { html: true });
        if (r.status >= 400) throw httpErr(r, url);
        const d = X.parse(r.text, url);
        let images = selA(d, 'div#readerarea img').map(i => X.img(i, url)).filter(Boolean);
        if (!images.length && r.text.indexOf('"images":') >= 0) {
          try { images = JSON.parse('[' + X.between(r.text, '"images":[', ']') + ']'); } catch (e) { }
        }
        if (p.halves && d.querySelector('#chapter-pages-js-before')) {
          const out = [];
          for (let i = 0; i + 1 < images.length; i += 2) out.push(X.mark(images[i], { k: 'halves', r: images[i + 1] }));
          return { images: out };
        }
        if (p.secure && !images.length) {
          const id = (d.querySelector('#comment_post_ID') || {}).value;
          if (id) {
            const x = await X.postForm(H + '/wp-admin/admin-ajax.php', { action: 'get_secure_chapter_images', chapter_id: id.trim() }, { headers: { Referer: url } });
            const j = JSON.parse(x.text);
            if (j && j.success && j.data && j.data.status === 'unlocked') images = selA(X.parse(j.data.content, H + '/'), 'img').map(i => X.img(i, H + '/')).filter(Boolean);
            else if (j && j.data && j.data.status === 'locked') throw new Error('الفصل مقفل في الموقع');
          }
        }
        return { images };
      },
    };
    return ad;
  }

  // ---------- ZeistManga (Blogger) ----------
  function zeist(S, p) {
    p = Object.assign({
      mangaCat: 'Series', chapterCat: 'Chapter', excluded: ['Anime', 'Novel', 'Novela'],
      details: '.grid.gtc-235fr', genres: 'div.mt-15 > a[rel=tag]', info: '.y6x11p', infoTitle: 'strong', infoDesc: 'span.dt',
      pages: 'div.check-box div.separator',
    }, p || {});
    const H = S.home;
    const enc = l => String(l).split('/').map(encodeURIComponent).join('/');
    const feed = H + '/feeds/posts/default/-/';
    const alt = e => ((e.link || []).find(l => l.rel === 'alternate') || {}).href;
    const has = (e, c) => (e.category || []).some(x => x.term === c);
    const thumb = u => { if (!u) return ''; let m = u.match(/^(.*)\/s\d+-c\/(.*)$/); if (m) return m[1] + '/w600/' + m[2]; m = u.match(/^(.*)=s\d+-c$/); if (m) return m[1] + '=w600'; return u; };
    const listings = [['latest', 'الأحدث']].concat(S.listings.filter(l => l[0] === 'popular'));
    const ad = {
      listings,
      isChapter: () => false,
      mangaOf: () => null,
      async list(a) {
        if (a.listing === 'popular' && !a.q) {
          if (a.page > 1) return { items: [], hasNext: false };
          const d = await X.html(H + '/');
          return { items: selA(d, 'div.PopularPosts figure').map(f => { const l = f.querySelector('figcaption > a'); return l ? { url: X.abs(l.getAttribute('href'), H), title: X.t(l), cover: X.img(f.querySelector('img'), H) } : null; }).filter(Boolean), hasNext: false };
        }
        let url = feed + enc(p.mangaCat);
        if (!a.q) Object.values(a.f || {}).forEach(v => (Array.isArray(v) ? v : [v]).forEach(x => { if (x) url += '/' + enc(x); }));
        url += '?alt=json&max-results=21&start-index=' + (20 * (a.page - 1) + 1);
        url += a.q ? '&q=' + encodeURIComponent('label:' + p.mangaCat + ' ' + a.q.trim()) : '&orderby=published';
        const j = await X.json(url);
        const es = (j.feed && j.feed.entry) || [];
        const items = es.slice(0, 20).filter(e => has(e, p.mangaCat) && !p.excluded.some(c => has(e, c))).map(e => {
          let cover = e.media$thumbnail ? thumb(e.media$thumbnail.url) : '';
          if (!cover && e.content) { const m = String(e.content.$t).match(/<img[^>]+src="([^"]+)"/); if (m) cover = m[1]; }
          return { url: alt(e), title: (e.title.$t || '').trim(), cover };
        }).filter(x => x.url);
        return { items, hasNext: es.length > 20 };
      },
      async manga(url) {
        const d = await X.html(url);
        const box = sel1(d, p.details) || d;
        let title = ((d.querySelector('meta[property="og:title"]') || {}).content || X.t(d.querySelector('h1')) || '').split(' - ')[0].trim();
        const genres = selA(box, p.genres).map(X.t).filter(Boolean);
        let status = X.status(X.t(box.querySelector('span[data-status]')));
        selA(box, p.info).forEach(row => {
          const lbl = X.own(row) || X.t(sel1(row, p.infoTitle));
          const v = X.t(sel1(row, p.infoDesc));
          if (!status && /Status|Estado|الحالة/.test(lbl)) status = X.status(v);
        });
        if (!status) status = genres.map(X.status).find(Boolean) || '';
        const r = { url, title, cover: (box.querySelector('img') || {}).src || '', summary: X.t(box.querySelector('#synopsis')).slice(0, 2000), genres, status };
        // رابط خلاصة الفصول
        let fu = null;
        const scr = s => { const e = d.querySelector(s); return e ? (e.textContent || e.innerHTML) : null; };
        const qa = (t, k) => { const i = t.indexOf(k); if (i < 0) return null; const m = t.slice(i + k.length).match(/^\s*=?\s*(['"])(.*?)\1/); return m ? m[2] : null; };
        const s1 = scr('#clwd > script');
        if (s1) { const l = qa(s1, 'clwd.run('); if (l) fu = feed + enc(p.chapterCat) + '/' + enc(l) + '?alt=json'; }
        else {
          const sc = d.querySelector('#myUL > script[src]');
          const src = sc && sc.getAttribute('src').split('?')[0];
          if (src) fu = (src[0] === '/' ? H : '') + src + '?alt=json';
          else { const s3 = scr('#latest > script'); const l = s3 && qa(s3, 'label'); if (l) fu = feed + enc(l) + '?alt=json'; }
        }
        if (!fu) { const dl = p.dataLabel && d.querySelector('[data-label]'); const lbl = (dl && dl.getAttribute('data-label')) || title; fu = feed + enc(p.chapterCat) + '/' + enc(lbl) + '?alt=json'; }
        const page = (st, n) => X.json(fu + '&orderby=published&start-index=' + st + '&max-results=' + n);
        const f0 = (await page(1, 150)).feed || {};
        let es = f0.entry || [];
        const total = +((f0.openSearch$totalResults || {}).$t || 0), per = +((f0.openSearch$itemsPerPage || {}).$t || 150) || 150;
        const reqs = [];
        for (let st = es.length; st < total; st += per) reqs.push(page(st + 1, per));
        (await Promise.all(reqs)).forEach(x => { es = es.concat((x.feed && x.feed.entry) || []); });
        r.chapters = es.filter(e => has(e, p.chapterCat)).map(e => {
          const t = (e.title.$t || '').trim();
          const pub = p.updated ? (e.updated || e.published) : (e.published || e.updated);
          return { url: alt(e), title: t, num: chNum(t), date: X.date(pub && pub.$t) };
        }).filter(c => c.url);
        if (p.extraLinks) selA(d, 'div#download > div.index-list > a').forEach(a => {
          const u = X.abs(a.getAttribute('href'), url), path = X.path(u).split('?')[0];
          if (!r.chapters.some(c => X.path(c.url) === path)) r.chapters.push({ url: u, title: X.t(a), num: chNum(X.t(a)) });
        });
        return r;
      },
      async chapter(url) {
        const r = await X.req(url, { html: true });
        const d = X.parse(r.text, url);
        const s = p.pages.split(',').map(x => x.trim() + ' img[src]').join(', ');
        let images = selA(d, s).map(i => i.getAttribute('src')).filter(u => /^http/.test(u || ''));
        if (!images.length) {
          const id = X.between(r.text, "'postId': '", "'");
          if (id && /^\d+$/.test(id)) {
            const j = await X.json(H + '/feeds/posts/default/' + id + '?alt=json');
            const c = j.entry && j.entry.content && j.entry.content.$t;
            if (c) images = selA(X.parse(c, url), 'img[src]').map(i => i.getAttribute('src')).filter(u => /^http/.test(u || ''));
          }
        }
        return { images };
      },
    };
    return ad;
  }
  const CH_WORDS = ['الفصل', 'فصل', 'chapter', 'ch', 'ch.', 'الحلقة', 'العدد', 'episode'];
  function chNum(title) {
    const tk = String(title).toLowerCase().split(/[\s#:]+/).filter(Boolean);
    const lead = t => { const m = t.match(/^\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; };
    for (let i = 0; i + 1 < tk.length; i++) if (CH_WORDS.indexOf(tk[i]) >= 0 && lead(tk[i + 1]) != null) return lead(tk[i + 1]);
    for (const t of tk) if (lead(t) != null) return lead(t);
    return null;
  }

  // ---------- Iken ----------
  function iken(S, p) {
    const H = S.home, API = p.api || H;
    const posts = {};
    async function post(slug) {
      if (posts[slug]) return posts[slug];
      const j = await X.json(API + '/api/post?postSlug=' + encodeURIComponent(slug), { headers: { Referer: H + '/' } });
      let chs = j.post.chapters || [];
      if (p.full || !chs.length) { const c = await X.json(API + '/api/chapters?postId=' + j.post.id, { headers: { Referer: H + '/' } }); chs = (c.post && c.post.chapters) || chs; }
      return (posts[slug] = { post: j.post, chs });
    }
    return {
      listings: [['latest', 'آخر التحديثات']],
      isChapter: u => { const s = X.segs(u); return s[0] === 'series' && s.length >= 3; },
      mangaOf: u => { const s = X.segs(u); return s[0] === 'series' && s[1] ? H + '/series/' + s[1] : null; },
      async list(a) {
        const f = a.f || {};
        const q = { page: a.page, perPage: 18, searchTerm: a.q || '', seriesStatus: f.seriesStatus, seriesType: f.seriesType, genreIds: f.genreIds && f.genreIds.length ? f.genreIds.join(',') : '' };
        if (/^https:\/\/api\./.test(API)) { q.tag = 'latestUpdate'; q.isNovel = 'false'; }
        const j = await X.json(API + '/api/query?' + X.qs(q), { headers: { Referer: H + '/' } });
        return { items: (j.posts || []).map(x => ({ url: H + '/series/' + x.slug, title: x.postTitle, cover: x.featuredImage || '' })), hasNext: j.totalCount > a.page * 18 };
      },
      async manga(url) {
        const slug = X.segs(url)[1];
        delete posts[slug];
        const { post: x, chs } = await post(slug);
        return {
          url, title: x.postTitle, cover: x.featuredImage || '',
          summary: X.t(X.parse(x.postContent || '', url).body).slice(0, 2000),
          genres: (x.genres || []).map(g => g.name), status: X.status(x.seriesStatus),
          chapters: chs.filter(c => !(c.isLocked || c.isTimeLocked)).map(c => ({ url: H + '/series/' + slug + '/' + c.slug, title: c.title || ('الفصل ' + c.number), num: c.number, date: X.date(c.createdAt) })),
        };
      },
      async chapter(url) {
        const s = X.segs(url);
        const { post: x, chs } = await post(s[1]);
        const c = chs.find(c => c.slug === s[2]);
        if (!c) throw new Error('الفصل غير موجود');
        const j = await X.json(API + '/api/chapter?postId=' + x.id + '&chapterId=' + c.id, { headers: { Referer: H + '/' } });
        return { images: ((j.chapter && j.chapter.images) || []).map(i => i.url) };
      },
    };
  }

  // ================= المصادر المخصّصة =================
  const ISO = X.date;
  const C = {};

  C.teamx = S => {
    const H = S.home, R = { headers: { Referer: H + '/' } };
    const src = el => el ? X.abs(el.getAttribute('data-src') || el.getAttribute('src'), H) : '';
    const chs = d => selA(d, 'div.chapter-card').filter(c => !c.querySelector('span.locked')).map(c => {
      const a = c.querySelector('a'); if (!a) return null;
      const n = c.getAttribute('data-number');
      return { url: X.abs(a.getAttribute('href'), H), title: X.t(c.querySelector('div.chapter-info div.chapter-title')) || ('الفصل ' + n), num: n != null ? parseFloat(n) : null, date: ISO(+c.getAttribute('data-date') || '') };
    }).filter(Boolean);
    return {
      isChapter: u => X.segs(u)[0] === 'series' && X.segs(u).length >= 3,
      mangaOf: u => { const s = X.segs(u); return s[0] === 'series' ? H + '/series/' + s[1] : null; },
      async list(a) {
        if (a.q) {
          if (a.page > 1) return { items: [], hasNext: false };
          const d = await X.html(H + '/search?' + X.qs({ keyword: a.q }), R);
          return { items: selA(d, 'div.tx-grid a.tx-card').map(e => ({ url: X.abs(e.getAttribute('href'), H), title: X.t(e.querySelector('h3')), cover: src(e.querySelector('img')).replace('thumbnail_', '') })), hasNext: false };
        }
        const f = a.f || {};
        if (a.listing === 'latest' && !Object.values(f).some(Boolean)) {
          const d = await X.html(H + (a.page > 1 ? '/?page=' + a.page : '/'), R);
          return { items: selA(d, 'div.last-chapter div.box').map(b => { const l = b.querySelector('div.info a'); return l ? { url: X.abs(l.getAttribute('href'), H), title: X.t(l.querySelector('h3')), cover: src(b.querySelector('div.imgu img')).replace('thumbnail_', ''), latest: X.t(b.querySelector('.epxs, .info .chapter, ul li a')).slice(0, 40) } : null; }).filter(Boolean), hasNext: !!d.querySelector('a[rel=next]') };
        }
        const d = await X.html(H + '/series?' + X.qs(Object.assign({}, f, { page: a.page > 1 ? a.page : '' })), R);
        return { items: selA(d, 'div.listupd div.bsx').map(e => { const l = e.querySelector('a'); return l ? { url: X.abs(l.getAttribute('href'), H), title: l.getAttribute('title') || '', cover: src(e.querySelector('img')) } : null; }).filter(x => x && x.title), hasNext: !!d.querySelector('a[rel=next]') };
      },
      async manga(url) {
        const d = await X.html(url, R);
        const info = lbl => { for (const i of selA(d, '.full-list-info')) { const s = i.querySelectorAll('small'); if (s[0] && X.t(s[0]).indexOf(lbl) >= 0 && s[1]) return X.t(s[1]); } return ''; };
        let chapters = chs(d);
        const last = Math.max(1, ...selA(d, 'ul.pagination a.page-link').map(a => parseInt(X.t(a))).filter(n => n > 0));
        const more = await Promise.all(Array.from({ length: last - 1 }, (_, i) => X.html(url + '?page=' + (i + 2), R).then(chs, () => [])));
        more.forEach(x => { chapters = chapters.concat(x); });
        return { url, title: X.t(d.querySelector('div.author-info-title h1, div.author-info-title h6')), cover: src(d.querySelector('div.text-right img')), summary: X.t(d.querySelector('div.review-content')), genres: selA(d, 'div.review-author-info a').map(X.t), status: X.status(info('الحالة')), chapters };
      },
      async chapter(url) {
        const d = await X.html(url, R);
        return { images: selA(d, 'div.image_list canvas[data-src], div.image_list img[src]').map(src).filter(Boolean) };
      },
    };
  };

  C.ariatoon = S => {
    const H = S.home, API = 'https://api.ariatoon.com/v1', CDN = 'https://api.ariatoon.com/uploads', o = { headers: { Referer: H + '/' } };
    const m = x => ({ url: H + '/series/manga/' + x.id, title: (x.title || '').trim(), cover: x.coverPath ? CDN + '/' + x.coverPath : '', summary: x.summary || '', status: X.status(x.status) });
    const page = async u => { const j = await X.json(u, o); const d = j.data || []; return { items: d.map(m), hasNext: d.length === 20 }; };
    return {
      isChapter: u => X.segs(u).indexOf('episodes') > 0,
      mangaOf: u => { const s = X.segs(u); return s[2] ? H + '/series/manga/' + s[2] : null; },
      list(a) {
        if (a.q) return page(API + '/mangas/search?' + X.qs({ page: a.page, limit: 20, search: a.q }));
        if (a.f && a.f.genre) return page(API + '/mangas/filters/' + a.f.genre + '?page=' + a.page + '&limit=20&language=ar');
        return page(a.listing === 'popular' ? API + '/feed/mangas/popular?page=' + a.page + '&limit=20' : API + '/mangas?page=' + a.page + '&limit=20');
      },
      async manga(url) {
        const id = X.segs(url)[2];
        const r = m((await X.json(API + '/mangas/' + id, o)).data);
        r.chapters = [];
        for (let pg = 1; pg < 50; pg++) {
          const b = (await X.json(API + '/mangas/' + id + '/episodes?direction=desc&publishStatus=published&limit=100&page=' + pg, o)).data || [];
          b.filter(c => c.isFree !== false).forEach(c => r.chapters.push({ url: H + '/series/manga/' + c.mangaID + '/episodes/' + c.id, title: c.title || ('الفصل ' + c.number), num: c.number, date: ISO(c.createdAt) }));
          if (b.length < 100) break;
        }
        return r;
      },
      async chapter(url) {
        const s = X.segs(url);
        const j = await X.json(API + '/mangas/' + s[2] + '/episodes/' + s[4], o);
        return { images: ((j.data && j.data.images) || []).map(p => CDN + '/' + p) };
      },
    };
  };

  C.asgardscans = S => {
    const H = S.home, o = { headers: { Referer: H + '/' } };
    const list = async (page, q) => {
      const d = await X.html(H + '/manga?' + X.qs(Object.assign(q, { page: page > 1 ? page : '' })), o);
      return { items: selA(d, '.grid a.group[href^="/manga/"]').map(e => ({ url: X.abs(e.getAttribute('href'), H), title: X.t(e.querySelector('h3')), cover: X.img(e.querySelector('img'), H) })), hasNext: !!d.querySelector('a[rel=next]') };
    };
    return {
      isChapter: u => X.segs(u)[0] === 'manga' && X.segs(u).length >= 3,
      mangaOf: u => { const s = X.segs(u); return s[0] === 'manga' ? H + '/manga/' + s[1] : null; },
      list: a => a.q || Object.values(a.f || {}).some(Boolean) ? list(a.page, Object.assign({ q: a.q || '' }, a.f)) : list(a.page, a.listing === 'popular' ? { sort: 'popular' } : {}),
      async manga(url) {
        const d = await X.html(url, o);
        let series = null;
        selA(d, 'script[type="application/ld+json"]').some(s => {
          try { const j = JSON.parse(s.textContent); const c = j['@type'] === 'CreativeWorkSeries' ? j : (j['@graph'] || []).find(x => x['@type'] === 'CreativeWorkSeries'); if (c) { series = c; return true; } } catch (e) { } return false;
        });
        const lst = v => Array.isArray(v) ? v : v ? [v] : [];
        const info = l => { const e = selA(d, 'span.text-ink-faint').find(x => X.t(x) === l); return e && e.nextElementSibling ? X.t(e.nextElementSibling) : ''; };
        return {
          url, title: X.t(d.querySelector('h1')), cover: (d.querySelector('meta[property="og:image"]') || {}).content || '',
          summary: series ? lst(series.description).join('\n') : '', genres: series ? lst(series.genre) : selA(d, 'a[href^="/manga?genres="]').map(X.t),
          status: X.status(info('الحالة')),
          chapters: selA(d, 'ol > li > a[dir=ltr]').filter(a => !a.querySelector('svg.lucide-lock, svg.lucide-coins')).map(a => {
            const name = X.t(a.querySelector('div[dir=rtl] span'));
            return { url: X.abs(a.getAttribute('href'), H), title: name, num: X.num(name), date: X.t(a.querySelector('div[dir=rtl] span.tabular')) };
          }),
        };
      },
      async chapter(url) {
        const t = await X.text(url, o);
        const s = t.split('imageUrl:\\"').length > 1 ? t.split('imageUrl:\\"').slice(1).map(x => x.split('\\"')[0]) : t.split('imageUrl:"').slice(1).map(x => x.split('"')[0]);
        return { images: s.filter(Boolean).map(p => /^http/.test(p) ? p : H + p) };
      },
    };
  };

  C.despairmanga = S => {
    const H = S.home, API = H + '/supabase-api/rest/v1';
    const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkwMzczMDE4LCJleHAiOjE5NDgwNTMwMTh9.xYgAlC_9SuUCdzdff6wBYGWzYFmAI9apP_mk4DCPaVI';
    const o = { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } };
    const COLS = 'id,slug,title_ar,title_en,cover_url,genres,synopsis,status,author_or_studio,type';
    const m = w => ({ url: H + '/series/' + w.slug, title: (w.title_ar || w.title_en || '').trim(), cover: w.cover_url || '', summary: w.synopsis || '', genres: w.genres || [], status: X.status(w.status) });
    const works = async (page, order, extra) => { const j = await X.json(API + '/manga_works?' + X.qs(Object.assign({ select: COLS }, extra || {}, { order, limit: 24, offset: (page - 1) * 24 })), o); return { items: j.filter(w => w.slug).map(m), hasNext: j.length === 24 }; };
    const work = async (slug, cols) => (await X.json(API + '/manga_works?' + X.qs({ select: cols, slug: 'eq.' + slug, limit: 1 }), o))[0];
    return {
      isChapter: u => X.segs(u).indexOf('ch') > 0,
      mangaOf: u => { const s = X.segs(u); return s[0] === 'series' ? H + '/series/' + s[1] : null; },
      list(a) {
        if (a.q) { const t = a.q.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"'); return works(a.page, 'views_count.desc', { or: '(title_ar.ilike."*' + t + '*",title_en.ilike."*' + t + '*")' }); }
        return works(a.page, a.listing === 'latest' ? 'updated_at.desc' : 'views_count.desc');
      },
      async manga(url) {
        const slug = X.segs(url)[1];
        const w = await work(slug, COLS); if (!w) throw new Error('العمل غير موجود');
        const r = m(w);
        const chs = await X.json(API + '/chapters?' + X.qs({ select: 'id,chapter_number,title,is_free,created_at', work_id: 'eq.' + w.id, order: 'chapter_number.desc,id.desc' }), o);
        r.chapters = chs.filter(c => c.is_free !== false).map(c => ({ url: H + '/series/' + slug + '/main/ch/' + String(c.chapter_number).replace(/\.0$/, ''), title: c.title || ('الفصل ' + c.chapter_number), num: c.chapter_number, date: ISO(c.created_at) }));
        return r;
      },
      async chapter(url) {
        const s = X.segs(url);
        const w = await work(s[1], 'id');
        const j = await X.json(API + '/chapters?' + X.qs({ select: 'pages', work_id: 'eq.' + w.id, chapter_number: 'eq.' + s[s.length - 1] }), o);
        return { images: (j[0] && j[0].pages) || [] };
      },
    };
  };

  C.dilar = S => {
    const H = S.home;
    const cover = x => { if (!x.cover) return ''; const n = x.cover.replace(/\.[^.]+$/, ''); return H + '/uploads/manga/cover/' + x.id + '/large_' + n + '.webp'; };
    const m = x => ({ url: H + '/series/' + x.id, title: x.title, cover: cover(x), summary: x.summary || '', genres: (x.categories || []).map(c => c.name), status: X.status(x.translation_status) });
    const ok = x => !(x.seriesType && x.seriesType.title === 'رواية');
    return {
      isChapter: u => X.segs(u)[0] === 'reader',
      mangaOf: u => { const s = X.segs(u); return s[0] === 'reader' ? H + '/series/' + s[1] : null; },
      async list(a) {
        const f = a.f || {};
        if (a.q || Object.keys(f).some(k => f[k] && f[k].length)) {
          const cats = [].concat(f.category0 || [], f.category1 || [], f.category2 || []).map(Number).filter(n => !isNaN(n));
          const body = { query: a.q || '', page: a.page, seriesType: { include: f.type || [], exclude: [] }, categories: { include: cats, exclude: [] }, oneshot: false, storyStatus: { include: f.story || [], exclude: [] }, translationStatus: { include: f.translation || [], exclude: [] }, over17: f.over17 === 'true' ? true : f.over17 === 'false' ? false : null };
          const j = await X.postJson(H + '/api/search/filter', body);
          return { items: (j.rows || []).filter(ok).map(m), hasNext: j.total > j.page * j.perPage };
        }
        if (a.listing === 'popular') {
          if (a.page > 1) return { items: [], hasNext: false };
          const j = await X.json(H + '/api/rankings');
          return { items: (j.topSeries || []).filter(ok).map(m), hasNext: false };
        }
        const j = await X.json(H + '/api/series?page=' + a.page);
        return { items: (j.series || []).filter(ok).map(m), hasNext: j.currentPage < j.totalPages };
      },
      async manga(url) {
        const id = X.segs(url)[1];
        const r = m(await X.json(H + '/api/series/' + id));
        const j = await X.json(H + '/api/series/' + id + '/chapters');
        const lab = n => n.indexOf('.') >= 0 ? n.replace(/0+$/, '').replace(/\.$/, '') : n;
        r.chapters = [];
        (j.chapters || []).forEach(c => (c.releases || []).forEach(rel => r.chapters.push({ url: H + '/reader/' + id + '/_/' + lab(c.chapter) + '?release=' + rel.id, title: (c.title && c.title.trim()) || ('الفصل ' + lab(c.chapter)) + ((rel.teams || []).length ? ' · ' + rel.teams.map(t => t.name).join('، ') : ''), num: parseFloat(c.chapter), date: ISO(rel.created_at) })));
        r.chapters.sort((x, y) => (y.num || -1) - (x.num || -1));
        return r;
      },
      chapter: null, // تُقرأ بالمتصفح المدمج (الطريقة العامة)
    };
  };

  C.eshadow = S => {
    const H = S.home;
    const m = x => ({ url: H + '/manga/' + x.slug + '#id=' + x.id, title: x.title, cover: x.coverImage || '', summary: x.description || '', genres: (x.genres || []).map(g => typeof g === 'string' ? g : (g.name || (g.genre && g.genre.name) || '')).filter(Boolean), status: X.status(x.status) });
    const idOf = u => { const h = String(u).split('#id=')[1]; return h || X.segs(u)[1]; };
    return {
      isChapter: u => X.segs(u)[0] === 'read',
      mangaOf: () => null,
      async list(a) {
        const j = await X.json(H + '/api/manga?' + X.qs({ page: a.page, query: a.q || '' }));
        return { items: (j.data || []).map(m), hasNext: j.page * j.limit < j.total };
      },
      async manga(url) {
        const x = await X.json(H + '/api/manga/' + idOf(url));
        const r = m(x); r.url = url;
        r.chapters = (x.chapters || []).filter(c => c.id).map(c => ({ url: H + '/read/' + c.id, title: c.title || ('الفصل ' + c.number), num: c.number, date: ISO(c.publishedAt) })).sort((a, b) => b.num - a.num);
        return r;
      },
      async chapter(url) { const j = await X.json(H + '/api/chapters/' + X.segs(url)[1]); return { images: (j.chapter && j.chapter.images) || [] }; },
    };
  };

  C.kawaiimanga = S => {
    const H = S.home, API = 'https://manga-api.kawaii-anime.com/api/manga', KEY = 'km_2026_live';
    let tok = null;
    async function token(force) {
      if (!force && tok && Date.now() < tok.exp) return tok.t;
      const j = await X.json(API + '/token', { headers: { 'x-app-key': KEY } });
      tok = { t: j.token, exp: Date.now() + (j.expiresIn - 120) * 1000 };
      return tok.t;
    }
    async function api(q) {
      let r = await X.req(API + '/own?' + q, { headers: { 'x-app-key': KEY, 'x-app-token': await token() } });
      if (r.status === 401) r = await X.req(API + '/own?' + q, { headers: { 'x-app-key': KEY, 'x-app-token': await token(true) } });
      if (r.status >= 400) throw httpErr(r, API);
      return JSON.parse(r.text);
    }
    const m = x => ({ url: H + '/manga/' + x.slug, title: x.title, cover: x.coverUrl || '', summary: x.description || '', genres: x.genres || [], status: X.status(x.status) });
    const series = slug => api(X.qs({ action: 'series', slug }));
    return {
      isChapter: u => X.segs(u)[0] === 'reader',
      mangaOf: u => { const s = X.segs(u); return s[0] === 'reader' ? H + '/manga/' + s[1] : null; },
      async list(a) {
        if (a.q) { if (a.page > 1) return { items: [], hasNext: false }; const j = await api(X.qs({ action: 'search', q: a.q })); return { items: (j.results || []).map(m), hasNext: false }; }
        const j = await api('action=browse&page=' + a.page + (a.listing === 'popular' ? '&sort=views' : ''));
        return { items: (j.results || []).map(m), hasNext: !!j.hasMore };
      },
      async manga(url) {
        const slug = X.segs(url)[1], x = await series(slug), r = m(x);
        const fmt = n => String(n).replace(/\.0$/, '');
        r.chapters = (x.chapters || []).map(c => ({ url: H + '/reader/' + slug + '/' + fmt(c.number), title: c.title || ('الفصل ' + fmt(c.number)), num: c.number, date: ISO(c.createdAt) }));
        return r;
      },
      async chapter(url) {
        const s = X.segs(url), x = await series(s[1]);
        const c = (x.chapters || []).find(c => String(c.number).replace(/\.0$/, '') === s[2]);
        if (!c) throw new Error('الفصل غير موجود');
        const j = await api(X.qs({ action: 'pages', chapterId: c.id }));
        return { images: j.pages || [] };
      },
    };
  };

  C.mangadar = S => {
    const H = S.home, o = { headers: { Referer: H + '/' } };
    const unwrap = t => t.replace(/<template[^>]*>/g, '').replace(/<\/template>/g, '');
    const slugOf = u => { const s = X.segs(u); return s[0] === 'manga' && s.length === 2 && s[1] !== 'page' ? s[1] : null; };
    const parseList = d => {
      const out = [];
      selA(d, 'a[href*="/manga/"]').forEach(l => {
        const u = X.abs(l.getAttribute('href'), H), sl = u && slugOf(u); if (!sl) return;
        const im = l.querySelector('img');
        const t = ((im && im.getAttribute('alt')) || X.t(l.querySelector('h3, h4'))).trim(); if (!t) return;
        out.push({ url: H + '/manga/' + sl + '/', title: t, cover: X.img(im, H) });
      });
      return { items: X.uniqBy(out, 'url'), hasNext: !!d.querySelector('link[rel=next], a[rel=next], a.next') };
    };
    return {
      isChapter: u => X.segs(u)[0] === 'manga' && X.segs(u).length >= 3,
      mangaOf: u => { const s = X.segs(u); return s[0] === 'manga' ? H + '/manga/' + s[1] + '/' : null; },
      async list(a) {
        if (a.q) {
          if (a.page > 1) return { items: [], hasNext: false };
          const j = await X.json(H + '/wp-admin/admin-ajax.php?' + X.qs({ action: 'mangaverse_search', q: a.q }), o);
          return { items: (j.data || []).filter(x => slugOf(x.url)).map(x => ({ url: H + '/manga/' + slugOf(x.url) + '/', title: x.title, cover: x.cover || '' })), hasNext: false };
        }
        const f = Object.assign({}, a.f || {});
        if (!f.sort && !Object.values(f).some(Boolean)) f.sort = a.listing === 'popular' ? 'popular' : 'new';
        const q = X.qs(f);
        const t = await X.text(H + '/manga/' + (a.page > 1 ? 'page/' + a.page + '/' : '') + (q ? '?' + q : ''), o);
        return parseList(X.parse(unwrap(t), H + '/manga/'));
      },
      async manga(url) {
        const d = await X.html(url, o);
        let ld = null;
        selA(d, 'script[type="application/ld+json"]').some(s => { try { const j = JSON.parse(s.textContent); if (j['@type'] === 'ComicSeries') { ld = j; return true; } } catch (e) { } return false; });
        const info = l => { const v = selA(d, 'aside div').map(r => { const n = X.t(r.querySelector('span')); return n === l ? X.t(r).replace(l, '').trim() : null; }).filter(Boolean); return v.sort((a, b) => a.length - b.length)[0] || ''; };
        let chs = [];
        try { const j = JSON.parse(d.querySelector('script#mdg-manga-chapters-json').textContent); chs = (j.rows || []).map(r => ({ url: r[2], title: isNaN(parseFloat(r[1])) ? String(r[1]) : 'الفصل ' + r[1], num: parseFloat(r[1]), date: r[3] > 0 ? ISO(r[3]) : '' })); } catch (e) { }
        return {
          url, title: X.t(d.querySelector('main h1')) || (ld && ld.name) || '',
          cover: X.img(d.querySelector('main picture img'), url) || (ld && ld.image) || '',
          summary: (ld && ld.description) || (d.querySelector('meta[name=description]') || {}).content || '',
          genres: (ld && ld.genre) || [], status: X.status(info('الحالة')), chapters: chs,
        };
      },
      async chapter(url) {
        const d = await X.html(url, o);
        return {
          images: selA(d, '.reader-page img').map(i => {
            const m = i.getAttribute('data-mds');
            if (m) { try { return atob(m.trim()); } catch (e) { } }
            return X.abs(i.getAttribute('data-src') || i.getAttribute('src'), url);
          }).filter(u => /^http/.test(u || '')),
        };
      },
    };
  };

  C.mangaswat = S => {
    const H = S.home, API = H + '/v2/api/v2', o = { headers: { Referer: H + '/' } };
    const page = async u => { const j = await X.json(u, o); return { items: (j.results || []).map(m => ({ url: H + '/series/' + (m.id || m.serie_id), title: m.title, cover: (m.poster && m.poster.medium) || '' })).filter(x => !/undefined$/.test(x.url)), hasNext: !!j.next }; };
    return {
      isChapter: u => X.segs(u)[0] === 'chapters',
      mangaOf: () => null,
      list(a) {
        if (a.q) return page(API + '/series/?' + X.qs({ search: a.q, page: a.page }));
        return page(a.listing === 'popular' ? API + '/series/?order_by=-followers_count&page=' + a.page : API + '/series/releases/?page=' + a.page);
      },
      async manga(url) {
        const id = X.segs(url)[1];
        const x = await X.json(API + '/series/' + id + '/', o);
        const r = { url, title: x.title, cover: (x.poster && x.poster.medium) || '', summary: x.story || '', genres: (x.genres || []).map(g => g.name), status: X.status(x.status && x.status.name), chapters: [] };
        let next = API + '/chapters/?' + X.qs({ serie: id, order_by: '-order', page_size: 200 });
        for (let i = 0; next && i < 50; i++) {
          const j = await X.json(next, o);
          (j.results || []).forEach(c => r.chapters.push({ url: H + '/chapters/' + c.id + '/' + c.slug + '/', title: isNaN(parseFloat(c.chapter)) ? c.chapter : 'الفصل ' + c.chapter, num: parseFloat(c.chapter), date: ISO(c.created_at) }));
          next = j.next;
        }
        return r;
      },
      async chapter(url) { const j = await X.json(API + '/chapters/' + X.segs(url)[1] + '/', o); return { images: (j.images || []).map(i => i.image) }; },
    };
  };

  C.mangatik = S => {
    const H = S.home, o = { headers: { Referer: H + '/' } };
    const parse = d => ({
      items: selA(d, 'article.manga-card').map(c => { const l = c.querySelector('.manga-title > a'); return l ? { url: X.abs(l.getAttribute('href'), H), title: X.t(l), cover: X.img(c.querySelector('img.manga-poster'), H) } : null; }).filter(Boolean),
      hasNext: selA(d, 'a.btn').some(b => X.t(b).indexOf('التالي') >= 0 && /^\?page=/.test(b.getAttribute('href') || '')),
    });
    return {
      isChapter: u => X.segs(u)[0] === 'manga' && X.segs(u).length >= 3,
      mangaOf: u => { const s = X.segs(u); return s[0] === 'manga' ? H + '/manga/' + s[1] : null; },
      async list(a) {
        const f = a.f || {};
        if (a.listing === 'latest' && !a.q && !Object.values(f).some(Boolean)) return parse(await X.html(H + '/latest?page=' + a.page, o));
        return parse(await X.html(H + '/manga?' + X.qs(Object.assign({ q: a.q || '' }, f, { sort: f.sort || 'popular', page: a.page })), o));
      },
      async manga(url) {
        const d = await X.html(url, o);
        let ld = {}; try { ld = JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent); } catch (e) { }
        const badge = selA(d, 'span.badge').map(X.t).find(t => X.status(t));
        return {
          url, title: (ld.name || X.t(d.querySelector('h1'))).trim(), cover: (ld.image && ld.image.url) || '', summary: ld.description || '', genres: ld.genre || [], status: X.status(badge),
          chapters: selA(d, 'a.chapter-item-card').map(a => {
            const n = a.getAttribute('data-chapter'), sp = selA(a, 'span').map(X.t);
            return { url: X.abs(a.getAttribute('href'), H), title: sp.find(s => s.indexOf('الفصل') === 0) || ('الفصل ' + n), num: parseFloat(n), date: sp[sp.length - 1] || '' };
          }),
        };
      },
      async chapter(url) { const d = await X.html(url, o); return { images: selA(d, 'img.webtoon-image').map(i => X.abs(i.getAttribute('src'), url)).filter(Boolean) }; },
    };
  };

  C.mangatime = S => {
    const H = S.home;
    const trpc = async (ep, input) => { const j = await X.json(H + '/api/trpc/' + ep + '?' + X.qs({ batch: 1, input: JSON.stringify({ 0: { json: input } }) }), { headers: { Referer: H + '/' } }); return j[0].result.data.json; };
    const img = u => { u = String(u).replace(/ /g, '%20'); return /^http/.test(u) ? u : H + u; };
    const surl = (k, s) => H + '/' + (k || 'manga') + '/' + s;
    const fmt = n => String(n).replace(/\.0$/, '');
    return {
      isChapter: u => X.segs(u).indexOf('chapter') > 0,
      mangaOf: u => { const s = X.segs(u); return s.length >= 2 ? H + '/' + s[0] + '/' + s[1] : null; },
      async list(a) {
        const j = await trpc('search.searchSeries', Object.assign({ page: a.page, limit: 24, sortBy: a.q ? 'popularity' : (a.listing === 'latest' ? 'recent' : 'popularity'), sortOrder: 'desc' }, a.q ? { query: a.q } : {}));
        return { items: (j.results || []).map(s => ({ url: surl(s.type, s.slug), title: s.title, cover: s.coverUrl ? img(s.coverUrl) : '' })), hasNext: !!j.hasMore };
      },
      async manga(url) {
        const slug = X.segs(url)[1];
        const s = await trpc('content.getSeriesBySlug', { slug });
        const c = await trpc('content.getChapters', { seriesId: s.id, limit: -1 });
        const base = surl(s.type, s.slug);
        return {
          url, title: s.title, cover: s.coverUrl ? img(s.coverUrl) : '', summary: s.description || '', genres: (s.genres || []).map(g => g.name), status: X.status(s.status),
          chapters: (c.chapters || []).filter(x => x.isUnlocked != null ? x.isUnlocked : !x.isPremium).map(x => ({ url: base + '/chapter/' + fmt(x.number), title: x.title || ('الفصل ' + fmt(x.number)), num: x.number, date: ISO(x.publishedAt) })),
        };
      },
      async chapter(url) {
        const s = X.segs(url);
        const j = await trpc('content.getChapterPages', { seriesSlug: s[1], chapterNumber: parseFloat(s[s.length - 1]) });
        if (j.isUnlocked === false) throw new Error('الفصل مقفل في الموقع');
        return { images: (j.pages || []).map(img) };
      },
    };
  };

  C.mangatuk = S => {
    const H = S.home, API = 'https://api.mangatuk.com/api';
    const bySlug = slug => X.json(API + '/catalog/series/by-slug/' + slug);
    return {
      listings: [['popular', 'الأكثر شعبية'], ['latest_updates', 'آخر التحديثات']],
      isChapter: u => X.segs(u)[0] === 'series' && X.segs(u).length >= 3,
      mangaOf: u => { const s = X.segs(u); return s[0] === 'series' ? H + '/series/' + s[1] : null; },
      async list(a) {
        const f = a.f || {};
        const j = await X.json(API + '/catalog/search?' + X.qs({ q: a.q || '', sort: f.sort || (a.q ? 'popular' : a.listing), status: f.status, limit: 30, offset: (a.page - 1) * 30 }));
        return { items: (j.data || []).map(s => ({ url: H + '/series/' + s.slug, title: s.title, cover: s.coverImage || '' })), hasNext: a.page * 30 < j.total };
      },
      async manga(url) {
        const s = await bySlug(X.segs(url)[1]);
        return {
          url, title: s.title, cover: s.coverImage || '', summary: s.description || '', genres: (s.genres || []).map(g => g.name), status: X.status(s.status),
          chapters: (s.chapters || []).slice().reverse().filter(c => !(c.coinAccess && c.coinAccess.locked)).map(c => ({ url: H + '/series/' + s.slug + '/' + c.slug, title: c.title || ('الفصل ' + c.number), num: parseFloat(c.number), date: ISO(c.publishedAt) })),
        };
      },
      async chapter(url) {
        const p = X.segs(url), s = await bySlug(p[1]);
        const c = (s.chapters || []).find(c => c.slug === p[2]);
        if (!c) throw new Error('الفصل غير موجود');
        const j = await X.json(API + '/catalog/chapters/' + c.id + '/pages');
        return { images: j.map(x => x.imageUrl) };
      },
    };
  };

  C.oduto = S => {
    const H = S.home, LABEL = 'مانجا بوروتو';
    const item = { url: H + '/search/label/' + encodeURIComponent(LABEL), title: 'BORUTO: Two Blue Vortex', cover: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEggWB9vWPMqjEvIoDsJSO29OmW-srULDQD3cS9HJ8cDk0vq2jLwDerUX-i61CqmZf62eBVmWZwU5CgXi0p2lxhKrh2_nZum3p-k3q9QJ2uozove0QAbOKtbd1QPjytjrJc9UsL65X4BbFdgcicLDYubD9LgY1Kco8wyhDGm4YEOim8u1TL42gOFe16NaaEP/s3464/4D55C3C5-9168-4103-B45C-99B52B58B6A5.jpeg' };
    return {
      isChapter: u => /\.html$/.test(X.path(u)),
      mangaOf: () => item.url,
      list: async a => ({ items: a.q && !/boruto|بوروتو|بوروت/i.test(a.q) ? [] : [item], hasNext: false }),
      async manga() {
        const j = await X.json(H + '/feeds/posts/summary/-/' + encodeURIComponent(LABEL) + '?alt=json&max-results=500');
        return Object.assign({}, item, {
          summary: '', genres: ['شونين', 'دراما', 'خيال', 'أكشن', 'نينجا'], status: 'مستمر',
          chapters: ((j.feed && j.feed.entry) || []).map(e => { const t = e.title.$t.trim(); return { url: ((e.link || []).find(l => l.rel === 'alternate') || {}).href, title: t, num: X.num(t), date: ISO(e.published.$t) }; }).filter(c => c.url),
        });
      },
      async chapter(url) { const d = await X.html(url); return { images: selA(d, 'div#post-body img').map(i => X.abs(i.getAttribute('src'), url)).filter(Boolean) }; },
    };
  };

  C.rocksmanga = S => {
    const H = S.home, API = 'https://api.rocksmanga.com';
    return {
      isChapter: u => X.segs(u).indexOf('chapter') > 0,
      mangaOf: u => { const s = X.segs(u); return s[0] === 'manga' ? H + '/manga/' + s[1] : null; },
      async list(a) {
        const f = a.f || {};
        const sort = f.sort || (a.q ? '' : a.listing);
        const q = { page: a.page > 1 ? a.page : '', sort, direction: sort === 'alphabetical' ? 'asc' : '', search: a.q || '', type: f.type, status: f.status, genre: f.genre && f.genre.length ? f.genre.join(',') : '' };
        const d = await X.html(H + '/browse?' + X.qs(q));
        return { items: X.uniqBy(selA(d, 'main .unit').map(e => { const l = e.querySelector('.info > a[href]'); return l ? { url: X.abs(l.getAttribute('href'), H), title: X.t(l), cover: X.img(e.querySelector('img'), H) } : null; }).filter(Boolean), 'url'), hasNext: !!d.querySelector('li.page-item > a.page-link[rel=next]') };
      },
      async manga(url) {
        const d = await X.html(url), pl = X.nextPayload(d);
        const det = X.nextFind(pl, ['readHref', 'manga']), s = (det && det.manga) || {};
        const list = X.nextFind(pl, ['mangaSlug', 'chapters']) || { chapters: [] };
        return {
          url, title: s.title || X.t(d.querySelector('h1')), cover: s.cover_url ? API + s.cover_url : '', summary: s.synopsis || '', genres: (s.genres || []).map(g => g.name), status: X.status(s.status),
          chapters: list.chapters.slice().sort((a, b) => b.id - a.id).map(c => ({ url: H + '/manga/' + list.mangaSlug + '/chapter/' + c.number, title: c.title || ('الفصل ' + c.number), num: parseFloat(c.number), date: ISO(c.created_at) })),
        };
      },
      async chapter(url) {
        const d = await X.html(url);
        const r = X.nextFind(X.nextPayload(d), ['chapter', 'manga']);
        if (!r) throw new Error('لم يُعثر على صفحات الفصل');
        return { images: (r.chapter.pages || []).map(p => API + p) };
      },
    };
  };

  C.stellarsaber = S => {
    const H = S.home, AJAX = H + '/wp-admin/admin-ajax.php', o = { headers: { Referer: H + '/' } };
    let nonce = null;
    const remember = d => { if (nonce) return; const s = d.querySelector('#flavor-ajax-js-extra'); const n = s && X.between(s.textContent, 'nonce":"', '"'); if (n) nonce = n; };
    const listPage = async (sort, page) => {
      const d = await X.html(H + '/manga/' + (page > 1 ? 'page/' + page + '/' : '') + '?sort=' + sort, o);
      remember(d);
      return { items: selA(d, '.card-grid .card').map(c => { const l = c.querySelector('a'); return l ? { url: X.abs(l.getAttribute('href'), H), title: X.t(c.querySelector('.card__title')), cover: X.img(c.querySelector('img'), H) } : null; }).filter(Boolean), hasNext: !!d.querySelector('.nav-links .next') };
    };
    return {
      isChapter: u => X.segs(u).length >= 3,
      mangaOf: u => { const s = X.segs(u); return s.length >= 2 ? H + '/' + s[0] + '/' + s[1] + '/' : null; },
      async list(a) {
        if (!a.q) return listPage(a.listing || 'latest', a.page);
        if (!nonce) remember(await X.html(H + '/manga/', o));
        const fd = '----MRBoundary7MA4YWxk', body = [['action', 'flavor_ajax_filter_content'], ['nonce', nonce || ''], ['page', String(a.page)], ['keyword', a.q.trim()]].map(([k, v]) => '--' + fd + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + v + '\r\n').join('') + '--' + fd + '--\r\n';
        const r = await X.req(AJAX, { method: 'POST', body, headers: { 'Content-Type': 'multipart/form-data; boundary=' + fd } });
        const j = JSON.parse(r.text);
        const items = ((j.data && j.data.results) || []).filter(x => x.type !== 'novel' && x.type !== 'anime').map(x => ({ url: x.url, title: x.title, cover: x.cover }));
        return { items, hasNext: items.length > 0 };
      },
      async manga(url) {
        const d = await X.html(url, o), box = d.querySelector('.detail-content') || d;
        let status = '';
        selA(box, '.detail-meta__label').forEach(l => { if (X.t(l).indexOf('الحالة') >= 0 && l.nextElementSibling) status = X.status(X.t(l.nextElementSibling)); });
        const chapters = [];
        selA(d, '.volume-group').forEach(v => selA(v, '.chapter-item').forEach(e => {
          const t = X.t(e.querySelector('.chapter-item__title'));
          chapters.push({ url: X.abs(e.getAttribute('href'), H), title: t || X.t(e.querySelector('.chapter-item__number')), num: X.num(X.t(e.querySelector('.chapter-item__number'))) || X.num(t), date: X.t(e.querySelector('.chapter-item__date')) });
        }));
        return { url, title: X.t(box.querySelector('.detail-info__title')), cover: X.img(box.querySelector('.detail-poster img'), H), summary: selA(box, '#detail-desc p').map(X.t).join('\n'), genres: selA(box, '.detail-genres a').map(X.t), status, chapters: chapters.filter(c => c.url) };
      },
      async chapter(url) {
        const t = await X.text(url, o), d = X.parse(t, url);
        const sc = selA(d, 'script').map(s => s.textContent).find(s => s.indexOf('flavorReaderData') >= 0) || '';
        const n = X.between(sc, "cdnNonce: '", "'"), id = (X.between(sc, 'chapterId: ', ',') || '').trim();
        if (!n || !id) throw new Error('لم يُعثر على بيانات القارئ');
        const r = await X.postForm(AJAX, { action: 'flavor_cdn_get_key', nonce: n, chapter_id: id }, o);
        const key = JSON.parse(r.text).data.key;
        return { images: selA(d, 'img.reader__page[data-cdn-url]').map(i => X.mark(X.abs(i.getAttribute('data-cdn-url'), url), { k: 'gcm', key })) };
      },
    };
  };

  C.procomic = S => {
    const H = S.home, o = { cookie: 'safe_browsing=off', headers: { Referer: H + '/' } };
    const cov = c => c.thumbnail ? (c.thumbnail[0] === '/' ? 'https://' + (c.cdn_path || 'cdn') + '.procomic.pro' + c.thumbnail : c.thumbnail) : (c.coverImage || '');
    const m = c => ({ url: H + '/ar/' + c.slug + '-' + c.id, title: c.title, cover: cov(c) });
    const readable = c => c.type !== 'novel' && !c.isBlockedSeries;
    const listing = async (path, page) => {
      const j = await X.json(H + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'limit=50&page=' + page, o);
      return { items: (j.data || []).filter(readable).map(m), hasNext: j.meta && j.meta.page < j.meta.pages };
    };
    const idOf = u => (X.segs(u)[1] || '').split('-').pop();
    return {
      isChapter: u => X.segs(u)[1] === 'chapter',
      mangaOf: () => null,
      list(a) {
        if (a.q) return listing('/api/public/series/search?' + X.qs({ search: a.q }), a.page);
        const f = a.f || {};
        const q = X.qs({ type: f.type, progress: f.progress, year: f.year, sort: f.sort || a.listing || 'popular' });
        return listing('/api/public/content?' + q, a.page);
      },
      async manga(url) {
        const c = await X.json(H + '/api/public/content/' + idOf(url), o);
        const meta = c.metadata || {};
        const r = Object.assign(m(c), { url, summary: c.description || '', genres: [].concat(meta.genres || [], meta.tags || []), status: X.status(c.progress) });
        const base = H + '/api/public/' + c.type + '/' + c.id + '/chapters?limit=100&order=desc';
        const first = await X.json(base + '&page=1', o);
        const pages = Math.ceil(first.total / 100);
        const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => X.json(base + '&page=' + (i + 2), o)));
        r.chapters = [first].concat(rest).flatMap(x => x.data || []).filter(ch => ch.language === 'AR' && !(ch.lockedForever || ch.lockedByCoins || ch.lockedByShortlink || ch.lockedByExclusive))
          .map(ch => ({ url: H + '/ar/chapter/' + c.slug + '-' + ch.chapter_number + '-' + ch.id, title: (ch.title && ch.title !== ch.chapter_number) ? ch.title : 'الفصل ' + ch.chapter_number, num: parseFloat(ch.chapter_number), date: ISO(ch.published_at) }));
        return r;
      },
      async chapter(url) {
        let d = await X.html(url, o), pl = X.nextPayload(d);
        let rd = X.nextFind(pl, ['chapterId', 'appImages']);
        if (!rd) { const mv = X.nextFind(pl, ['targetUrl']); if (!mv) throw new Error('لم يُعثر على القارئ'); d = await X.html(mv.targetUrl, o); rd = X.nextFind(X.nextPayload(d), ['chapterId', 'appImages']); }
        if (!rd) throw new Error('لم يُعثر على القارئ');
        const images = (rd.appImages || []).map(i => i.mobile || i.desktop).filter(Boolean);
        if (rd.deferredMedia) {
          const j = await X.json(H + '/chapter-deferred-media/' + rd.chapterId + '?' + X.qs({ token: rd.deferredMedia.token }), Object.assign({}, o, { headers: { Referer: url } }));
          if (!j.data) throw new Error((j.error || 'تعذّر تحميل بقية الفصل') + ' — افتح الفصل في الموقع مرة');
          (j.data.images || []).forEach(u => images.push(X.mark(u, { k: 'sign', ref: url })));
          const off = images.length;
          (j.data.maps || []).forEach((e, i) => images.push(X.mark(H + '/chapter-map-proxy-plan/' + rd.chapterId + '?p=' + (off + i), { k: 'map', ch: rd.chapterId, body: { token: e.token, method: e.method, cdnPath: rd.cdnPath, pageIndex: off + i } })));
        }
        return { images };
      },
    };
  };

  C.mangatales = S => {
    const H = 'https://www.mangatales.com', CDN = 'https://media.mangatales.com', o = { headers: { Referer: H + '/' } };
    const cover = (id, c) => c ? CDN + '/uploads/manga/cover/' + id + '/large_' + c : '';
    const m = x => ({ url: H + '/mangas/' + x.id, title: (x.title || '').trim(), cover: cover(x.id, x.cover) });
    const props = d => { for (const e of selA(d, '.js-react-on-rails-component')) { try { return JSON.parse(e.textContent); } catch (x) { } } return null; };
    async function dec(data) {
      const p = data.split('|');
      const key = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', utf8(p[3])), 'AES-CBC', false, ['decrypt']);
      return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: b64(p[2]) }, key, b64(p[0])));
    }
    return {
      isChapter: u => X.segs(u)[0] === 'r',
      mangaOf: () => null,
      async list(a) {
        const f = a.f || {};
        if (!a.q && !Object.values(f).some(v => v && v.length)) {
          const j = await X.json(H + '/api/releases?page=' + a.page, o);
          const items = X.uniqBy((j.releases || []).map(r => r.manga).filter(x => !x.is_novel).map(m), 'url');
          return { items, hasNext: (j.releases || []).length >= 30 };
        }
        const ie = (v, d) => ({ include: v && v.length ? v : d, exclude: [] });
        const body = { oneshot: { value: false }, title: (a.q || '').trim(), page: a.page, manga_types: ie(f.manga_types, ['1', '2']), story_status: ie(f.story_status, []), translation_status: { include: f.translation_status || [], exclude: f.translation_status && f.translation_status.length ? [] : ['3'] }, categories: { include: [null].concat(f.categories || []), exclude: [] }, chapters: { min: '', max: '' }, dates: { start: '', end: '' } };
        const r = await X.postJson(H + '/api/mangas/search', body, { headers: { Referer: H + '/mangas/' } });
        const j = JSON.parse(await dec(r.data));
        return { items: (j.mangas || []).filter(x => !x.is_novel).map(m), hasNext: (j.mangas || []).length === 50 };
      },
      async manga(url) {
        const d = await X.html(url, o), pr = props(d);
        const x = pr && pr.mangaDataAction && pr.mangaDataAction.mangaData;
        if (!x) throw new Error('لم يُعثر على بيانات العمل');
        const j = await X.json(H + '/api' + X.path(url), o);
        return {
          url, title: x.title.trim(), cover: cover(x.id, x.cover), summary: (x.summary || '').trim(), genres: (x.categories || []).map(c => c.name), status: x.story_status === 2 ? 'مستمر' : x.story_status === 3 ? 'مكتمل' : '',
          chapters: (j.mangaReleases || []).map(r => ({ url: H + '/r/' + r.id, title: (r.title || '').trim() || ('الفصل ' + r.chapter) + (r.team_name ? ' · ' + r.team_name : ''), num: parseFloat(r.chapter), date: ISO(r.created_at) })).sort((a, b) => (b.num || -1) - (a.num || -1)),
        };
      },
      async chapter(url) {
        const d = await X.html(url, o), pr = props(d);
        const key = pr.globals.mediaKey;
        const hq = pr.readerDataAction.readerData.release.hq_pages;
        const enc = s => s.split('').map(c => /[A-Za-z0-9\-_.~/]/.test(c) ? c : encodeURIComponent(c)).join('');
        return { images: hq.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean).map(i => CDN + '/uploads/releases/' + enc(i) + '?ak=' + key) };
      },
    };
  };

  // ================= الإعدادات الخاصة بكل مصدر قالبي =================
  const P = {
    anyonemanga: { newCh: 1, title: '.am-manga-hero__title', cover: '.am-manga-hero__cover img', desc: '.am-manga-summary__text', tags: '.am-genres-wrap a' },
    detectiveconanar: { newCh: 1 },
    manga3asq: { newCh: 1, paginated: 1, itemLink: 'div.post-title a:not([target])', date: 'span.chapter-release-date .timediff, span.chapter-release-date' },
    mangalek: {}, mangalink: {}, mangalionz: {}, mangastarz: {},
    mangaspark: { pages: 'div.wp-manga-chapter-img img, div.reading-content img, .reading-content img' },
    areamanga: { item: '.listupd .manga-card-v', itemTitle: '.bigor .tt, h3 a', details: 'div.legendary-single-page', title: '.manga-title-large', cover: '.manga-poster img', desc: 'div.story-text', genre: 'div.filter-tags a', chapters: '#chapters-list-container .ch-item', chTitle: '.chap-num', chDate: '.chap-date', secure: 1 },
    lavascans: { item: '.listupd .manga-card-v', itemTitle: '.card-v-title a, .bigor .tt, h3 a', details: 'div.lh-container', title: '.lh-title', cover: '.lh-poster img', desc: '#manga-story', genre: '.lh-genres a', status: '.status-badge-lux', chapters: '#chapters-list-container .ch-item:not(.locked)', chTitle: '.ch-num', chDate: '.ch-date' },
    hijala: { halves: 1 },
    azora: { api: 'https://api.azorafly.com', full: 1 },
    comicverse: { genres: 'a.label[rel=tag]', pages: '#cvOriginal', dataLabel: 1 },
    mangaailand: { chapterCat: 'فصل' },
    xsanomanga: { details: 'main', genres: 'dl a[rel=tag]', info: 'aside dl', infoTitle: 'dt', infoDesc: 'dd', pages: '#reader div.separator' },
    yokai: { updated: 1, extraLinks: 1 },
  };
  const TPL = { madara, mangathemesia: themesia, zeistmanga: zeist, iken };

  return { X, P, TPL, C, chNum, cryptoJsDecrypt, md5, madara };
  }
  const K = kit();
  const X = K.X, b64 = s => Uint8Array.from(atob(String(s).trim()), c => c.charCodeAt(0));
  const httpErr = (r, url) => { const e = new Error('HTTP ' + r.status); e.status = r.status; e.url = url; return e; };

  // ================= فك الصور الخاصة =================
  async function bytes(url, ref) {
    const r = await fetch(global.MangaFetch.imgSrc(url, ref, true));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.arrayBuffer();
  }
  const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
  const blobUrl = b => URL.createObjectURL(b instanceof Blob ? b : new Blob([b]));
  const canvasBlob = cv => new Promise(ok => cv.toBlob(b => ok(URL.createObjectURL(b)), 'image/jpeg', 0.92));
  const procomicPlans = {};
  async function decode(url, ref) {
    const i = url.indexOf('#mg='); if (i < 0) return url;
    const raw = url.slice(0, i), spec = JSON.parse(decodeURIComponent(url.slice(i + 4)));
    if (spec.k === 'gcm') {
      const data = new Uint8Array(await bytes(url, ref));
      const kb = b64(spec.key);
      const key = await crypto.subtle.importKey('raw', kb, 'AES-GCM', false, ['decrypt']);
      return blobUrl(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, key, data.slice(12)));
    }
    if (spec.k === 'halves') {
      const [l, r] = await Promise.all([bytes(raw, ref), bytes(spec.r, ref)].map(p => p.then(b => loadImg(blobUrl(b)))));
      const cv = document.createElement('canvas'); cv.width = l.naturalWidth + r.naturalWidth; cv.height = Math.max(l.naturalHeight, r.naturalHeight);
      const g = cv.getContext('2d'); g.drawImage(l, 0, 0); g.drawImage(r, l.naturalWidth, 0);
      return canvasBlob(cv);
    }
    if (spec.k === 'sign') {
      const home = new URL(spec.ref).origin;
      const s = await X.postJson(home + '/api/cdn-image/sign', { url: raw }, { cookie: 'safe_browsing=off', headers: { Referer: spec.ref } });
      return global.MangaFetch.imgSrc(home + '/api/cdn-image?' + X.qs({ url: raw, token: s.token, expires: s.expires }), spec.ref);
    }
    if (spec.k === 'map') {
      const home = new URL(raw).origin;
      const key = JSON.stringify(spec.body);
      const plan = procomicPlans[key] || (procomicPlans[key] = (await X.postJson(home + '/chapter-map-proxy-plan/' + spec.ch, spec.body, { cookie: 'safe_browsing=off', headers: { Referer: home + '/' } })).data.map);
      const cv = document.createElement('canvas'); cv.width = plan.dim[0]; cv.height = plan.dim[1];
      const g = cv.getContext('2d');
      const pieces = await Promise.all(plan.rects.map((r, k) => bytes(plan.pieces[plan.order[k]], home + '/').then(b => loadImg(blobUrl(b)))));
      plan.rects.forEach((r, k) => g.drawImage(pieces[k], r.left, r.top, r.width, r.height));
      return canvasBlob(cv);
    }
    return raw;
  }

  // ================= البناء =================
  const DATA = global.MANGA_SOURCES_DATA || [];

  // ================= المصادر عن بُعد (sources/remote.json في المستودع) =================
  // فكرة XPManga وLNReader: تعريف المصادر ملفات تُجلب من المستودع، فيُصلَح الموقع المعطّل بلا APK ولا تحديث.
  // يحفظ التطبيق آخر نسخة في localStorage (mr.remote) وتُطبَّق هنا عند البدء:
  //   homes:   { id: 'https://نطاق-جديد' }   تغيير رابط مصدر مدمج (انتقال الموقع)
  //   sources: [{ id, name, home, tpl, base, p:{محددات}, listings, filters, plugin:'plugins/x.js' }]
  //            مصدر جديد، أو تعديل مصدر موجود بنفس id (p يُدمج فوق إعدادات القالب)
  //   off:     [id]  إخفاء مصدر معطّل
  // ملف plugin: جسم دالة JavaScript يستقبل (X, S, K) ويعيد محوّلًا {list, manga, chapter, isChapter, mangaOf}
  //   X أدوات الطلب والتحليل، S تعريف المصدر، K = {TPL, madara, chNum, cryptoJsDecrypt, md5}
  const PLUG = {};
  let REMOTE = null;
  try { REMOTE = JSON.parse(localStorage.getItem('mr.remote')); } catch (e) { REMOTE = null; }
  function applyRemote(R) {
    const d = R && R.data; if (!d) return;
    (d.sources || []).forEach(s => {
      if (!s || !s.id || (!s.home && !DATA.some(x => x.id === s.id))) return;
      const i = DATA.findIndex(x => x.id === s.id);
      const v = Object.assign({ listings: [], filters: [] }, i >= 0 ? DATA[i] : {}, s);
      if (i >= 0 && DATA[i].p && s.p) v.p = Object.assign({}, DATA[i].p, s.p);
      if (i >= 0) DATA[i] = v; else { v.remote = true; DATA.push(v); }
    });
    Object.keys(d.homes || {}).forEach(id => { const x = DATA.find(y => y.id === id); if (x && /^https?:\/\//.test(d.homes[id])) x.home = String(d.homes[id]).replace(/\/+$/, ''); });
    (d.off || []).forEach(id => { const i = DATA.findIndex(x => x.id === id); if (i >= 0) DATA.splice(i, 1); });
    Object.keys(R.code || {}).forEach(id => {
      try { PLUG[id] = new Function('X', 'S', 'K', '"use strict";\n' + R.code[id]); } catch (e) { console.warn('plugin ' + id + ': ' + e.message); }
    });
  }
  try { applyRemote(REMOTE); } catch (e) { console.warn('remote: ' + e.message); }

  const NOTE = {
    dilar: 'تُقرأ الفصول بفتح صفحة القارئ في المتصفح المدمج.',
    procomic: 'بعض الفصول قد تحتاج فتحها في الموقع مرة.',
    mangatales: '',
  };
  function build(S, ro) {
    const k = ro ? kit(ro) : K, C = k.C, TPL = k.TPL, P = k.P, madara = k.madara;
    const d = DATA.find(x => x.id === S.id);
    S = Object.assign({ listings: [], filters: [] }, d || {}, S);
    const tpl = S.tpl || (S.type === 'madara' ? 'madara' : S.type === 'mangathemesia' ? 'mangathemesia' : S.type === 'zeistmanga' ? 'zeistmanga' : null);
    let ad;
    const pp = Object.assign({ base: S.base || 'manga' }, S.ovr ? {} : (P[S.id] || {}), S.p || {});
    if (PLUG[S.id] && !S.ovr) {
      ad = PLUG[S.id](k.X, S, { TPL, madara, chNum: k.chNum, cryptoJsDecrypt: k.cryptoJsDecrypt, md5: k.md5, P: pp });
      if (!ad || typeof ad.list !== 'function' || typeof ad.manga !== 'function') throw new Error('plugin ' + S.id + ' لا يعيد محوّلًا صالحًا');
      ad.isChapter = ad.isChapter || (() => false);
      ad.mangaOf = ad.mangaOf || (() => null);
    }
    else if (C[S.id] && !S.ovr) ad = C[S.id](S);
    else if (tpl && TPL[tpl]) ad = TPL[tpl](S, pp);
    else ad = madara(S, pp); // مصدر أضافه المستخدم: نفترض Madara
    ad.id = S.id; ad.name = S.name; ad.home = S.home; ad.tpl = PLUG[S.id] && !S.ovr ? 'plugin' : (tpl || 'custom');
    ad.listings = ad.listings || (S.listings.length ? S.listings : [['latest', 'الأحدث']]);
    ad.filters = S.filters || [];
    ad.note = NOTE[S.id] || '';
    ad.owns = u => { try { return new URL(u).hostname.replace(/^www\./, '') === new URL(S.home).hostname.replace(/^www\./, ''); } catch (e) { return false; } };
    return ad;
  }

  global.MangaSources = {
    CATALOG: DATA.map(d => ({ id: d.id, name: d.name, home: d.home, tpl: d.tpl, base: d.base, remote: !!d.remote })),
    remote: () => REMOTE, plugins: () => Object.keys(PLUG),
    build, decode, X, _chNum: K.chNum, _cryptoJsDecrypt: K.cryptoJsDecrypt, _md5: K.md5,
  };
})(window);
