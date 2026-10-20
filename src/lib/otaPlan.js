/* Правила обновления веб-части (OTA) без побочных действий — их проверяют тесты
   (tests/ota.test.mjs) и ими же пользуются скрипты выпуска (scripts/web-bundle.mjs).
   Сам ход обновления — src/lib/ota.js. */

// «0.12.10» > «0.12.9»: сравниваем по числам
export function cmpVersion(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0), pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  return 0;
}

/* Блок web из version.json → проверенный вид или null.
   base — наш сервер (API_BASE): архив только оттуда и только по https */
export function parseWeb(web, base) {
  if (!web || typeof web !== "object") return null;
  const version = String(web.version || "");
  if (!/^\d+\.\d+\.\d+$/.test(version)) return null;
  if (!/^[0-9a-f]{64}$/.test(String(web.sha256 || ""))) return null;
  let url;
  try {
    const own = new URL(base);
    const u = new URL(String(web.url || ""), own);
    if (u.protocol !== "https:" || u.origin !== own.origin || !/^\/ota\/web-[\d.]+\.zip$/.test(u.pathname)) return null;
    url = u.href;
  } catch { return null; }
  return {
    version, url, sha256: String(web.sha256),
    size: Number(web.size) || 0,
    nativeMin: Number(web.nativeMin) || 0,
    notes: Array.isArray(web.notes) ? web.notes.filter((x) => typeof x === "string").slice(0, 12) : [],
  };
}

/* Что делать с блоком web:
   → { act: "none" | "current" | "bad" | "needApk" | "wait" | "download", web }
   current — версия этой веб-части; build — versionCode APK; bad — версии, что не запустились;
   fail — { version, at } прошлой неудачной попытки: повтор не раньше every мс (кроме force) */
export function planOta({ web, current, build, bad = [], fail = null, force = false, now = Date.now(), every }) {
  if (!web) return { act: "none" };
  if (cmpVersion(web.version, current) <= 0) return { act: "current", web };
  if (bad.includes(web.version)) return { act: "bad", web };
  if (!(build >= web.nativeMin)) return { act: "needApk", web };
  if (!force && fail?.version === web.version && now - fail.at < every) return { act: "wait", web };
  return { act: "download", web };
}
