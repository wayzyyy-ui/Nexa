// Настройки → «Общий буфер обмена» (NEXA Flow как облачный буфер, src/lib/clipboardSync.js):
// переключатель этого устройства (по умолчанию выключен) с честным пояснением, срок хранения,
// последние записи с «Скопировать» и «Удалить», «Очистить всё»
import { useEffect, useState } from "react";
import { E2E_PASS_MIN } from "../lib/e2e.js";
import { isNative, isDesktop } from "../native.js";
import { CLIP_TTLS, clipLeft } from "../lib/clipsync.js";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { plural } from "../lib/format.js";
import { btnReset, SectionTitle, SettingsGroup, SettingsRow, Toggle } from "./base.jsx";

const pill = { ...btnReset, padding: "7px 14px", fontSize: 13, borderRadius: 999, border: `1px solid ${C.borderStrong}`, color: C.text, whiteSpace: "nowrap" };
const TTL_LABEL = { 1: "1 мин", 10: "10 мин", 60: "1 час" };

// Что делает переключатель — по-разному на ПК и на телефоне
const WHAT = isDesktop
  ? "Скопированный на этом компьютере текст уходит на ваши устройства, где буфер тоже включён. Пришедшее — уведомлением с кнопкой «Скопировать», само в буфер не попадает. Пароли из менеджеров паролей и похожее на пароль не отправляются"
  : "Когда вы открываете NEXA, она берёт текст из буфера телефона (система покажет, что буфер прочитан) и отправляет на ваши устройства, где буфер тоже включён. Пришедшее — уведомлением с кнопкой «Скопировать», само в буфер не попадает. Если NEXA закрыта, уведомление приходит через push-сервис телефона";

export function ClipboardSettings({ clip, e2e, account, onLogin }) {
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(null);
  const [, tick] = useState(0);
  // «ещё N мин» — раз в 30 с
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  const available = isDesktop || isNative;
  const items = clip?.items || [];
  const copy = async (it) => { if (await clip.copy(it)) { setCopied(it.id); setTimeout(() => setCopied((c) => (c === it.id ? null : c)), 2000); } };

  return (
    <div id="nx-clip-settings" style={{ scrollMarginTop: 80 }}>
      <SectionTitle>Общий буфер обмена</SectionTitle>
      <SettingsGroup>
        {!available ? (
          <SettingsRow last icon={Icon.clip({ c: C.muted, s: 18 })} title="Только в приложениях NEXA"
            subtitle="Буфер обмена синхронизируют приложение для телефона и приложение для компьютера — сайт к буферу доступа не имеет" />
        ) : !account ? (
          <SettingsRow last icon={Icon.clip({ c: C.muted, s: 18 })} title="Нужен вход в аккаунт"
            subtitle="Буфер передаётся только между устройствами одного аккаунта"
            right={<button type="button" className="nx-ghost-btn" onClick={onLogin} style={pill}>Войти</button>} />
        ) : (
          <>
            <SettingsRow wrap icon={Icon.clip({ c: clip.on ? C.mint : C.muted, s: 18 })} title="Синхронизировать буфер этого устройства"
              subtitle={<>
                {clip.on ? WHAT : "Выключено — это устройство буфер не читает, не отправляет и не принимает. Включается отдельно на каждом устройстве"}
                {clip.on && <span style={{ display: "block", marginTop: 6, color: C.mutedSoft }}>
                  {e2e?.status === "ready" ? "Текст шифруется на этом устройстве паролем — в облаке он лежит зашифрованным и прочитать его можете только вы"
                    : "Текст хранится в облаке аккаунта до конца срока и виден только вам. Чтобы облако его не видело вовсе — включите шифрование ниже"}</span>}
                {clip.note && <span role="status" style={{ display: "block", marginTop: 6, color: clip.note.kind === "error" ? C.red : C.muted }}>{clip.note.text}</span>}
              </>}
              right={<Toggle on={clip.on} label="Синхронизировать буфер этого устройства" onClick={() => clip.setPrefs((p) => ({ ...p, on: !p.on }))} />} />
            <SettingsRow wrap icon={Icon.calendar({ c: C.muted, s: 18 })} title="Сколько хранить"
              subtitle="Потом запись исчезает на всех устройствах и в облаке"
              right={
                <div role="radiogroup" aria-label="Сколько хранить скопированное" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {CLIP_TTLS.map((m) => {
                    const on = clip.prefs.ttl === m;
                    return (
                      <button key={m} type="button" role="radio" aria-checked={on} className="nx-ghost-btn"
                        onClick={() => clip.setPrefs((p) => ({ ...p, ttl: m }))}
                        style={{ ...pill, padding: "6px 12px", border: `1px solid ${on ? C.mint : C.borderStrong}`, color: on ? C.text : C.muted }}>{TTL_LABEL[m]}</button>
                    );
                  })}
                </div>
              } />
            {e2e && <E2eRow e2e={e2e} />}
            {items.map((it) => (
              <SettingsRow key={it.id} wrap icon={(it.mine ? Icon.shareUp : Icon.download)({ c: C.muted, s: 18 })}
                title={it.locked ? <span style={{ color: C.muted }}>Зашифровано — введите пароль шифрования выше</span>
                  : <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{it.text}</span>}
                subtitle={`${it.mine ? "Отсюда" : `С «${it.from_name}»`} · ${clipLeft(it.exp)}`}
                right={
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" className="nx-ghost-btn" disabled={it.locked} onClick={() => copy(it)} style={{ ...pill, borderColor: copied === it.id ? C.mint : C.borderStrong, opacity: it.locked ? 0.45 : 1 }}>
                      {copied === it.id ? "Скопировано" : "Скопировать"}</button>
                    <button type="button" className="nx-icon-btn" aria-label="Удалить" onClick={() => clip.remove(it.id)}
                      style={{ ...btnReset, width: 34, height: 34, borderRadius: 999, border: `1px solid ${C.borderStrong}`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      {Icon.trash({ c: C.text, s: 15 })}</button>
                  </div>
                } />
            ))}
            <SettingsRow last icon={Icon.trash({ c: C.text, s: 18 })} title="Очистить всё"
              subtitle={confirm ? "Удалить скопированное на всех устройствах и в облаке?" : items.length ? `${items.length} ${plural(items.length, ["запись", "записи", "записей"])}` : "Пусто"}
              right={confirm ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" className="nx-ghost-btn" onClick={() => setConfirm(false)} style={pill}>Отмена</button>
                  <button type="button" className="nx-ghost-btn" onClick={() => { clip.clear(); setConfirm(false); }} style={{ ...pill, border: `1px solid ${C.red}`, color: C.red }}>Очистить</button>
                </div>
              ) : (
                <button type="button" className="nx-ghost-btn" disabled={!items.length} onClick={() => setConfirm(true)} style={{ ...pill, color: items.length ? C.text : C.mutedSoft }}>Очистить</button>
              )} />
          </>
        )}
      </SettingsGroup>
    </div>
  );
}

/* Шифрование на устройствах (src/lib/e2e.js, e2eKey.js): пароль аккаунта; ключ хранится только на устройстве.
   none — выключено; locked — включено, здесь пароль не введён; ready — шифруем; loading — узнаём */
const field = { background: "transparent", color: C.text, border: `1px solid ${C.borderStrong}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "inherit" };
function E2eRow({ e2e }) {
  const [form, setForm] = useState(false);
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const reset = () => { setForm(false); setP1(""); setP2(""); setErr(null); setSure(false); };
  const run = async (fn) => { setBusy(true); setErr(null); try { const e = await fn(); if (e) setErr(e); else reset(); } finally { setBusy(false); } };
  const enable = () => {
    if (p1.length < E2E_PASS_MIN) return setErr(`Пароль — не короче ${E2E_PASS_MIN} знаков`);
    if (p1 !== p2) return setErr("Пароли не совпадают");
    run(() => e2e.setup(p1));
  };
  const s = e2e.status;
  const subtitle = s === "ready" ? "Включено. Пароль введён на этом устройстве — скопированное шифруется здесь же. На телефон с закрытой NEXA придёт без уведомления: сервер не видит текст"
    : s === "locked" ? "Включено для аккаунта, но на этом устройстве пароль не введён — отсюда буфер не отправляется, пришедшее не открывается"
    : s === "loading" ? "Проверяем…"
    : "Выключено. Включите — и текст буфера будут видеть только ваши устройства: облако получит его зашифрованным";
  const input = (v, set, label) => (
    <input type="password" value={v} onChange={(e) => { set(e.target.value); setErr(null); }} placeholder={label} aria-label={label}
      autoComplete="new-password" onKeyDown={(e) => { if (e.key === "Enter") (s === "locked" ? run(() => e2e.unlock(p1)) : enable()); }} style={field} />
  );
  return (
    <SettingsRow wrap icon={Icon.lock({ c: s === "ready" ? C.mint : C.muted, s: 18 })} title="Шифрование на устройствах"
      subtitle={<>
        {subtitle}
        {(form || s === "locked") && (
          <span style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {input(p1, setP1, s === "locked" ? "Пароль шифрования" : "Придумайте пароль")}
            {s !== "locked" && input(p2, setP2, "Повторите пароль")}
            {s !== "locked" && <span style={{ color: C.mutedSoft, lineHeight: 1.4 }}>Пароль не восстановить: забудете — зашифрованное не открыть. На каждом своём устройстве его нужно ввести один раз.</span>}
            <span style={{ display: "flex", gap: 6 }}>
              {s !== "locked" && <button type="button" className="nx-ghost-btn" onClick={reset} style={pill}>Отмена</button>}
              <button type="button" className="nx-ghost-btn" disabled={busy || !p1} onClick={() => (s === "locked" ? run(() => e2e.unlock(p1)) : enable())}
                style={{ ...pill, border: `1px solid ${C.mint}`, opacity: busy || !p1 ? 0.5 : 1 }}>{busy ? "Подождите…" : s === "locked" ? "Ввести" : "Включить"}</button>
            </span>
          </span>
        )}
        {s === "ready" && sure && <span style={{ display: "block", marginTop: 8, color: C.red }}>Выключить для всех устройств аккаунта? Дальше буфер пойдёт без шифрования</span>}
        {err && <span role="alert" style={{ display: "block", marginTop: 8, color: C.red }}>{err}</span>}
      </>}
      right={s === "none" && !form ? <button type="button" className="nx-ghost-btn" onClick={() => setForm(true)} style={pill}>Включить</button>
        : s === "ready" ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {sure ? <>
              <button type="button" className="nx-ghost-btn" onClick={() => setSure(false)} style={pill}>Нет</button>
              <button type="button" className="nx-ghost-btn" disabled={busy} onClick={() => run(() => e2e.disable())} style={{ ...pill, border: `1px solid ${C.red}`, color: C.red }}>Выключить</button>
            </> : <>
              <button type="button" className="nx-ghost-btn" onClick={() => e2e.forget()} style={pill} title="Пароль останется у аккаунта — здесь его нужно будет ввести снова">Забыть здесь</button>
              <button type="button" className="nx-ghost-btn" onClick={() => setSure(true)} style={pill}>Выключить</button>
            </>}
          </div>
        ) : null} />
  );
}
