// يحذف النسخة الاحتياطية المؤقتة للفهرس إن مرّ عليها أكثر من 24 ساعة.
const repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN;
const h = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
(async () => {
  const r = await fetch(`https://api.github.com/repos/${repo}/releases/tags/backup`, { headers: h });
  if (!r.ok) return console.log('no backup release');
  const rel = await r.json();
  for (const a of rel.assets) {
    if (Date.now() - Date.parse(a.updated_at) > 24 * 3600e3) {
      await fetch(a.url, { method: 'DELETE', headers: h });
      console.log('deleted', a.name);
    }
  }
})();
