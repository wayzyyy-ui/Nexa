// Настройки → «Общий буфер обмена» (NEXA Flow как облачный буфер, src/lib/clipboardSync.js):
// переключатель этого устройства (по умолчанию выключен) с честным пояснением, срок хранения,
// последние записи с «Скопировать» и «Удалить», «Очистить всё»
import { useEffect, useState } from "react";
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

export function ClipboardSettings({ clip, account, onLogin }) {
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
                  Текст хранится в облаке аккаунта до конца срока и виден только вам; шифрования на устройствах пока нет</span>}
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
            {items.map((it) => (
              <SettingsRow key={it.id} wrap icon={(it.mine ? Icon.shareUp : Icon.download)({ c: C.muted, s: 18 })}
                title={<span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{it.text}</span>}
                subtitle={`${it.mine ? "Отсюда" : `С «${it.from_name}»`} · ${clipLeft(it.exp)}`}
                right={
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" className="nx-ghost-btn" onClick={() => copy(it)} style={{ ...pill, borderColor: copied === it.id ? C.mint : C.borderStrong }}>
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
