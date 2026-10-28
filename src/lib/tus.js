/* Загрузка с дозагрузкой (протокол TUS 1.0, его понимает Supabase Storage: /storage/v1/upload/resumable).
   Файл уходит кусками по 6 МБ (такой размер требует Supabase). Связь оборвалась — ждём сеть, спрашиваем
   сервер, сколько уже дошло (HEAD → Upload-Offset), и продолжаем с этого места, а не с начала.
   Адрес начатой загрузки помним (store) — после перезапуска NEXA та же загрузка продолжится
   (Supabase хранит её до 24 часов). Без библиотек; сеть передаётся снаружи (request) — так проще проверять. */

export const TUS_CHUNK = 6 * 1024 * 1024;
export const TUS_KEEP_MS = 23 * 60 * 60 * 1000;   // адрес загрузки у Supabase живёт сутки — берём с запасом
export const TUS_RETRY_MS = [1000, 3000, 8000, 15000, 30000]; // паузы перед повтором куска после обрыва

const b64 = (s) => {
  const bytes = new TextEncoder().encode(String(s));
  let bin = ""; for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin);
};
// Upload-Metadata: «ключ base64,ключ base64» (значения — base64 от UTF-8)
export const tusMetadata = (meta) => Object.entries(meta).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k} ${b64(v)}`).join(",");

// Сохранённая загрузка ещё годится: тот же размер, не старше суток, адрес — https с того же сервера
export function savedUsable(saved, { size, endpoint, now = Date.now() }) {
  if (!saved || typeof saved.url !== "string" || saved.size !== size || !(now - saved.at < TUS_KEEP_MS)) return false;
  try { return new URL(saved.url).origin === new URL(endpoint).origin; } catch { return false; }
}

class TusError extends Error {
  constructor(kind, status, text) { super(kind); this.kind = kind; this.status = status; this.text = text || ""; }
}

/* request({ method, url, headers, body, onProgress, signal }) → { status, header(name), text };
   сбой сети — исключение { network: true }, отмена — { abort: true }.
   auth() → заголовки входа (свежие на каждый запрос: длинная загрузка переживает обновление пропуска).
   wait(ms) — пауза (ждёт и сеть). Ответ: ничего; ошибка — TusError { kind: abort | network | status, status, text } */
export async function tusUpload({ endpoint, auth, file, meta, key, store, request, wait, onProgress, signal, retries = TUS_RETRY_MS }) {
  const size = file.size;
  const base = { "Tus-Resumable": "1.0.0" };
  const call = async (opt) => {
    if (signal?.aborted) throw new TusError("abort");
    try { return await request({ ...opt, signal, headers: { ...base, ...(await auth()), ...opt.headers } }); }
    catch (e) { throw e?.abort || signal?.aborted ? new TusError("abort") : new TusError("network"); }
  };
  // Сколько уже на сервере; null — загрузки там больше нет
  const offsetAt = async (url) => {
    const r = await call({ method: "HEAD", url });
    if (r.status === 200 || r.status === 204) {
      const o = Number(r.header("Upload-Offset"));
      return Number.isFinite(o) && o >= 0 && o <= size ? o : null;
    }
    if (r.status >= 500) throw new TusError("network", r.status);
    return null;
  };

  let url = null, offset = 0;
  const saved = store.get(key);
  if (savedUsable(saved, { size, endpoint })) {
    try { const o = await offsetAt(saved.url); if (o != null) { url = saved.url; offset = o; } }
    catch (e) { if (e.kind === "abort") throw e; } // сеть моргнула — начнём заново ниже (или упадём там)
  }
  if (!url) {
    store.del(key);
    const r = await call({ method: "POST", url: endpoint, headers: { "Upload-Length": String(size), "Upload-Metadata": tusMetadata(meta), "x-upsert": "false" } });
    if (r.status !== 201) throw new TusError(r.status >= 500 ? "network" : "status", r.status, r.text);
    const loc = r.header("Location");
    if (!loc) throw new TusError("status", r.status, "no location");
    url = new URL(loc, endpoint).href;
    store.set(key, { url, size, at: Date.now() });
  }

  onProgress?.(size ? offset / size : 0);
  let tries = 0;
  while (offset < size) {
    const chunk = file.slice(offset, Math.min(size, offset + TUS_CHUNK));
    try {
      const r = await call({
        method: "PATCH", url, body: chunk,
        headers: { "Upload-Offset": String(offset), "Content-Type": "application/offset+octet-stream" },
        onProgress: (loaded) => onProgress?.(Math.min(1, (offset + loaded) / size)),
      });
      if (r.status === 204 || r.status === 200) {
        const o = Number(r.header("Upload-Offset"));
        offset = Number.isFinite(o) && o > offset ? o : offset + chunk.size;
        tries = 0;
        onProgress?.(offset / size);
        continue;
      }
      if (r.status === 409) { const o = await offsetAt(url); if (o == null) throw new TusError("status", 410); offset = o; continue; } // сервер насчитал другое — сверяемся
      if (r.status === 404 || r.status === 410) { store.del(key); throw new TusError("status", r.status, r.text); }
      if (r.status < 500 && r.status !== 429) { store.del(key); throw new TusError("status", r.status, r.text); }
      throw new TusError("network", r.status); // 5xx / 429 — повторим
    } catch (e) {
      if (e.kind !== "network") throw e;
      if (tries >= retries.length) throw e; // адрес загрузки помним — следующая попытка продолжит отсюда
      await wait(retries[tries++]);
      if (signal?.aborted) throw new TusError("abort");
      try { const o = await offsetAt(url); if (o == null) { store.del(key); throw new TusError("status", 410); } offset = o; }
      catch (e2) { if (e2.kind !== "network") throw e2; }
    }
  }
  store.del(key);
  onProgress?.(1);
}
