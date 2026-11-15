# Kage Media — التحديثات

- `latest.json`: آخر نسخة (`code` = versionCode). التطبيق يقرؤه عند الفتح وكل 3 ساعات، ويعرض «تحديث متاح» إن كان `code` أعلى من نسخته.
- `KageMedia.apk`: ملف آخر نسخة (يُستبدل مع كل إصدار؛ `sha256` في latest.json يتحقق منه التطبيق).
- `control.json` (يُنشأ من لوحة المالك داخل التطبيق): رموز التفعيل، الإيقاف، التحديث الإجباري. لا تعدّله يدوياً.

رابط التحميل المباشر: https://raw.githubusercontent.com/youssefelkahri/kage-updates/main/media/KageMedia.apk
