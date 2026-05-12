/**
 * حارس صفحات الإدارة — يُحمّل متزامناً (بدون type=module) لتجنب وميض المحتوى المحمي.
 * يُنسخ من public عند البناء — يجب أن يطابق مفتاح session.js (ADMIN_JWT_KEY).
 */
(function adminAuthGuard() {
  var KEY = "aw_admin_jwt";
  try {
    var path = (typeof location !== "undefined" && location.pathname) || "";
    if (/admin\/login\.html$/i.test(path)) return;
    if (!sessionStorage.getItem(KEY)) {
      location.replace("./login.html");
    }
  } catch (e) {
    location.replace("./login.html");
  }
})();
