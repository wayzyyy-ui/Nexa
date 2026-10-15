// Настройки → «Память ассистента»: включить/выключить, список записей (правка, удаление),
// добавить вручную, очистить всё. Логика — src/lib/memory.js, хранение — NexaApp (memoryApi)
import { useState, useRef, useEffect } from "react";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { SectionTitle, SettingsGroup, SettingsRow, Toggle, btnReset } from "./base.jsx";
import { MEMORY_MAX, MEMORY_ITEM_MAX, MEMORY_REFUSE, isStyleMemory } from "../lib/memory.js";
import { plural } from "../lib/format.js";

const pill = { ...btnReset, flexShrink: 0, borderRadius: 999, padding: "7px 14px", fontSize: 13, whiteSpace: "nowrap" };
const ghost = { ...pill, border: `1px solid ${C.borderStrong}`, color: C.text };
const field = { flex: "1 1 180px", minWidth: 0, fontSize: 14, padding: "8px 14px", borderRadius: 999, border: `1px solid ${C.borderStrong}`, background: "transparent", color: C.text, fontFamily: "inherit", outline: "none" };
const REFUSE = { ...MEMORY_REFUSE, same: "Такая запись уже есть" };

// Поле записи: Enter — сохранить, Esc — отмена
function MemoryField({ initial = "", onSave, onCancel, label, cta }) {
  const [v, setV] = useState(initial);
  const [err, setErr] = useState(null);
  const ref = useRef(null);
  useEffect(() => { if (onCancel) ref.current?.focus(); }, []);
  const save = () => {
    const r = onSave(v);
    if (r?.ok === false) setErr(REFUSE[r.reason] || REFUSE.empty); else { setV(""); setErr(null); }
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ width: "100%" }}
      onKeyDown={(e) => { if (e.key === "Escape" && onCancel) { e.stopPropagation(); onCancel(); } }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input ref={ref} value={v} maxLength={MEMORY_ITEM_MAX} onChange={(e) => { setV(e.target.value); setErr(null); }} aria-label={label}
          placeholder={onCancel ? "" : "Например: отвечай кратко, по пунктам"} className="nx-input" style={field} />
        <button type="submit" className="nx-ghost-btn" disabled={!v.trim()} style={{ ...ghost, color: v.trim() ? C.text : C.mutedSoft }}>{cta}</button>
        {onCancel && <button type="button" className="nx-ghost-btn" onClick={onCancel} style={ghost}>Отмена</button>}
      </div>
      {err && <div role="alert" style={{ fontSize: 12, color: C.red, marginTop: 6 }}>{err}</div>}
    </form>
  );
}

export function MemorySettings({ items, on, setOn, api, account, localOnly }) {
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const where = !account ? "Только в этом браузере — гостевая память никуда не отправляется"
    : localOnly ? "Пока только на этом устройстве — облако для памяти ещё не настроено"
    : "В вашем аккаунте — видна только вашим устройствам";
  return (
    <div id="nx-memory-settings" style={{ scrollMarginTop: 80 }}>
      <SectionTitle>Память ассистента</SectionTitle>
      <SettingsGroup>
        <SettingsRow icon={Icon.sparkle({ c: on ? C.mint : C.muted, s: 18 })} title="Учитывать память в ответах"
          subtitle={on
            ? "Ассистент помнит только то, что вы попросили: «Запомни: …». С вопросом уходят лишь подходящие записи"
            : "Выключено на этом устройстве — ассистент записи не видит, но они сохранены"}
          right={<Toggle on={on} onClick={() => setOn(!on)} label="Учитывать память в ответах" />} />
        {/* Добавить вручную: поле во всю ширину строки */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
          <span aria-hidden="true" className="nx-set-icon" style={{ width: 40, height: 40, borderRadius: 16, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {Icon.plus({ c: C.muted, s: 18 })}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <MemoryField label="Новая запись памяти" cta="Запомнить" onSave={(v) => api.add(v)} />
          </div>
        </div>
        {items.map((m) => (
          <SettingsRow key={m.id} icon={Icon.chat({ c: C.muted, s: 16 })} wrap
            title={editing === m.id
              ? <MemoryField initial={m.text} label="Изменить запись" cta="Сохранить" onCancel={() => setEditing(null)}
                  onSave={(v) => { const r = api.update(m.id, v); if (r.ok) setEditing(null); return r; }} />
              : <span style={{ fontSize: 14, overflowWrap: "anywhere" }}>{m.text}</span>}
            subtitle={editing === m.id ? null : isStyleMemory(m) ? "Учитывается в каждом ответе" : "Когда подходит к вопросу"}
            right={editing === m.id ? null : (
              <span style={{ display: "flex", gap: 6 }}>
                <button type="button" className="nx-icon-btn" onClick={() => setEditing(m.id)} aria-label={`Изменить «${m.text.slice(0, 30)}»`}
                  style={{ ...btnReset, width: 32, height: 32, borderRadius: "50%", border: `1px solid ${C.borderStrong}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {Icon.edit({ c: C.text, s: 14 })}
                </button>
                <button type="button" className="nx-icon-btn" onClick={() => api.remove(m.id)} aria-label={`Удалить «${m.text.slice(0, 30)}»`}
                  style={{ ...btnReset, width: 32, height: 32, borderRadius: "50%", border: `1px solid color-mix(in srgb, ${C.red} 50%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {Icon.trash({ c: C.red, s: 14 })}
                </button>
              </span>
            )} />
        ))}
        <SettingsRow last icon={Icon.trash({ c: items.length ? C.red : C.muted, s: 18 })}
          title={items.length ? `Записей: ${items.length} из ${MEMORY_MAX}` : "Память пуста"}
          subtitle={confirm ? "Удалить все записи? Ассистент перестанет их учитывать сразу" : where}
          right={!items.length ? null : confirm ? (
            <span style={{ display: "flex", gap: 6 }}>
              <button type="button" className="nx-ghost-btn" onClick={() => setConfirm(false)} style={ghost}>Отмена</button>
              <button type="button" className="nx-ghost-btn" onClick={() => { api.clear(); setConfirm(false); }} style={{ ...pill, border: `1px solid ${C.red}`, color: C.red }}>Очистить</button>
            </span>
          ) : (
            <button type="button" className="nx-ghost-btn" onClick={() => setConfirm(true)} style={{ ...pill, border: `1px solid color-mix(in srgb, ${C.red} 55%, transparent)`, color: C.red }}>Очистить всё</button>
          )} />
      </SettingsGroup>
      <div style={{ fontSize: 12, color: C.mutedSoft, margin: "-4px 4px 10px", lineHeight: 1.5, textAlign: "left" }}>
        Сам ассистент ничего не запоминает и не делает выводов о вас. Пароли, коды и номера карт не сохраняются. В диалоге: «Запомни: …», «Что ты обо мне помнишь?», «Забудь …», «Забудь всё»
        {items.length >= MEMORY_MAX ? ` · Память заполнена — удалите лишние ${plural(2, ["запись", "записи", "записей"])}` : ""}
      </div>
    </div>
  );
}
