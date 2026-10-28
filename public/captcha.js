/* Проверка «не робот» (hCaptcha, невидимая): сразу после загрузки запускает проверку,
   при необходимости hCaptcha сам показывает задание с картинками.
   Итог — сообщением окну NEXA, открывшему страницу: { nx: "captcha", type: "token", token } |
   "closed" (задание закрыли) | "expired" | "error" (code). Пропуск отдаём только окну
   из списка PARENTS (тот же список — CAPTCHA_PARENTS в src/lib/captcha.js, тест сверяет) */
(function () {
  var PARENTS = ["https://nexa-link.ru", "https://nexaru-ecosystem.vercel.app", "https://nexahub.ru", "http://localhost:3000", "http://localhost:5173", "https://localhost", "capacitor://localhost", "http://tauri.localhost", "https://tauri.localhost", "tauri://localhost"];
  var q = new URLSearchParams(location.search);
  var sitekey = q.get("k") || "";
  var parent = q.get("o") || "";
  var theme = q.get("t") === "light" ? "light" : "dark";
  document.body.setAttribute("data-theme", theme);
  // Чужой адрес окна или неверный ключ — ничего не делаем (страницу открыли не из NEXA)
  if (PARENTS.indexOf(parent) < 0 || window.parent === window) return;
  var send = function (msg) { msg.nx = "captcha"; window.parent.postMessage(msg, parent); };
  if (!/^[0-9a-f-]{20,40}$/i.test(sitekey)) { send({ type: "error", code: "sitekey" }); return; }

  // Скрипт hCaptcha не загрузился за 20 с — честно говорим (окно NEXA предложит другие способы входа)
  var loadTimer = setTimeout(function () { send({ type: "error", code: "load" }); }, 20000);
  window.nxCaptchaLoad = function () {
    clearTimeout(loadTimer);
    try {
      var id = window.hcaptcha.render("box", {
        sitekey: sitekey, size: "invisible", theme: theme,
        callback: function (token) { send({ type: "token", token: token }); },
        "expired-callback": function () { send({ type: "expired" }); },
        "chalexpired-callback": function () { send({ type: "expired" }); },
        "close-callback": function () { send({ type: "closed" }); },
        "error-callback": function (e) { send({ type: "error", code: String(e || "unknown").slice(0, 40) }); },
      });
      window.hcaptcha.execute(id);
      send({ type: "ready" });
    } catch (_e) { send({ type: "error", code: "render" }); }
  };
  var s = document.createElement("script");
  s.src = "https://js.hcaptcha.com/1/api.js?render=explicit&onload=nxCaptchaLoad&hl=ru&recaptchacompat=off";
  s.async = true;
  s.onerror = function () { clearTimeout(loadTimer); send({ type: "error", code: "load" }); };
  document.head.appendChild(s);
})();
