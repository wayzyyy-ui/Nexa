// NEXA Flow: окно «Отправить в NEXA», история передач, настройки Flow
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { clipboardWrite, clipboardRead, isNative } from "../native.js";
import { safeUrl, TEXT_MAX } from "../lib/realtime.js";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { plural } from "../lib/format.js";
import { FLOW_STATUS, inboxTime, copyText } from "../lib/flow.js";
import { OutlineFold, btnReset, SkewTag, Spinner, StateButton, SectionTitle, SettingsGroup, SettingsRow, Toggle } from "./base.jsx";

// Шапка колонки внутри панели — как шапка списка «Устройства»
export const LinkColHead = ({ title, right }) => (
  <div className="nx-link-colhead" style={{
    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
    padding: "14px 18px", borderBottom: `1px solid ${C.border}`, minHeight: 22,
  }}>
    <span style={{ fontSize: 15, fontWeight: 500 }}>{title}</span>
    {right}
  </div>
);

// Пусто в колонке: контурная складка и короткая подсказка
export const LinkEmpty = ({ children }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0", fontSize: 13, color: C.mutedSoft, lineHeight: 1.5 }}>
    <OutlineFold s={40} /> <span>{children}</span>
  </div>
);

// Одна запись истории: направление и участники, тип, время, текст, статус, «Копировать» / «Открыть»
export function FlowItem({ item, link, selfName }) {
  const [copied, setCopied] = useState(false);
  const hidden = item.text == null; // секрет из прошлого запуска: текст не сохраняли
  const url = !hidden && safeUrl(item.text);
  const small = { ...btnReset, display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", fontSize: 12, borderRadius: 999, border: `1px solid ${C.borderStrong}`, color: C.text, textDecoration: "none" };
  const who = item.dir === "in"
    ? `«${item.from_name}» → «${selfName}»`
    : `«${selfName}» → «${item.to_name || "все устройства"}»`;
  const st = item.dir === "out" && FLOW_STATUS[item.status];
  return (
    <div className="nx-pop nx-inbox-item" style={{ padding: "12px 0", borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SkewTag active={!!url}>{hidden || item.sensitive ? "Скрыто" : url ? "Ссылка" : "Текст"}</SkewTag>
        {/* Откуда → куда и время; на узком экране переносится на вторую строку */}
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.mutedSoft, lineHeight: 1.35, overflowWrap: "anywhere" }} title={who}>
          {item.dir === "in" ? "Получено" : "Отправлено"} · {who} · {inboxTime(item.ts)}
        </span>
        <button type="button" className="nx-icon-btn" onClick={() => (item.dir === "in" ? link.removeInbox(item.id) : link.removeSent(item.id))} aria-label="Убрать из истории" style={{
          ...btnReset, width: 26, height: 26, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {Icon.close({ c: C.mutedSoft, s: 13 })}
        </button>
      </div>
      {/* Текст выводим только как текст — React сам экранирует всё, HTML не вставляется.
          Похожее на пароль или ключ — скрыто точками, в историю не сохраняется */}
      <div className="nx-scroll" style={{
        fontSize: 14, lineHeight: 1.45, marginTop: 8, whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 132, overflowY: "auto",
        color: hidden || item.sensitive ? C.mutedSoft : url ? C.mint : C.text,
      }}>
        {hidden ? "Скрыто: похоже на пароль или ключ — такое в истории не храним"
          : item.sensitive ? "•".repeat(Math.min(24, item.text.length)) + "  (похоже на пароль или ключ — в историю не сохранится)"
          : item.text}
      </div>
      {st && <div style={{ fontSize: 12, marginTop: 6, color: st[1] === "green" ? C.green : st[1] === "red" ? C.red : C.mutedSoft }}>{st[0]}</div>}
      {!hidden && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button type="button" className="nx-ghost-btn" onClick={async () => { if (await clipboardWrite(item.text) || await copyText(item.text)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }} style={small}>
            {copied ? Icon.check({ c: C.green, s: 13 }) : Icon.copy({ c: C.text, s: 13 })} {copied ? "Скопировано" : "Копировать"}
          </button>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="nx-ghost-btn" style={small}>
              {Icon.shareUp({ c: C.text, s: 13 })} Открыть
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// Поле «текст или ссылка» с кнопкой «Вставить скопированное» (буфер читаем только по нажатию)
export function FlowTextField({ value, onChange, label, onNote }) {
  const [busy, setBusy] = useState(false);
  const paste = async () => {
    setBusy(true);
    const r = await clipboardRead();
    setBusy(false);
    if (r.error) return onNote?.(r.error);
    if (!r.text.trim()) return onNote?.("В буфере обмена нет текста");
    onChange(r.text.slice(0, TEXT_MAX));
    onNote?.(null);
  };
  return (
    <>
      <textarea
        className="nx-input" value={value} rows={3} maxLength={TEXT_MAX}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Текст или ссылка"
        aria-label={label}
        style={{
          display: "block", width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 84,
          background: `color-mix(in srgb, ${C.panel2} 60%, transparent)`, color: C.text, fontSize: 15, fontFamily: "inherit", lineHeight: 1.45,
          border: `1px solid ${C.borderStrong}`, borderRadius: 14, padding: "11px 13px", outline: "none",
        }}
      />
      <button type="button" className="nx-ghost-btn" onClick={paste} disabled={busy} style={{
        ...btnReset, display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, padding: "6px 14px", fontSize: 13,
        borderRadius: 999, border: `1px solid ${C.borderStrong}`, color: C.text,
      }}>
        {busy ? <Spinner s={12} /> : Icon.copy({ c: C.mint, s: 13 })} Вставить скопированное
      </button>
    </>
  );
}

/* Окно «Отправить в NEXA»: из Настроек и из «Поделиться» Android.
   Текст (можно вставить скопированное), куда — устройства аккаунта в сети,
   потом настоящий статус: доставлено / не подтвердило / выключено */
export function FlowSendDialog({ initial, initialTo = null, link, devices, flowOn, user, onLogin, onClose }) {
  const [text, setText] = useState(initial || "");
  const [to, setTo] = useState(initialTo); // устройство, выбранное заранее (панель быстрых действий)
  const [note, setNote] = useState(null);
  const [sentId, setSentId] = useState(null);
  const [busy, setBusy] = useState(false);
  const targets = devices.filter((x) => x.real && !x.isSelf);
  const live = targets.filter((x) => x.online);
  const pick = to && live.find((x) => x.id === to) ? to : live[0]?.id || null;
  const target = live.find((x) => x.id === pick);
  const rec = sentId && link.sent.find((x) => x.id === sentId);
  const st = rec && FLOW_STATUS[rec.status];
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const send = async () => {
    if (!target || busy) return;
    setBusy(true); setNote(null);
    const res = await link.send(text, target.device_id, target.name);
    setBusy(false);
    if (res.ok) { setSentId(res.id); setText(""); } else setNote(res.error);
  };
  const why = !user ? "Войдите в аккаунт — передавать можно только между своими устройствами"
    : !flowOn ? "NEXA Flow выключен — включите его в Настройках"
    : link.status !== "online" ? "Нет связи — отправить не получится"
    : !targets.length ? "Других устройств нет. Подключите второе устройство кнопкой «Добавить устройство» на Главной"
    : !live.length ? "Ни одно устройство не в сети — откройте NEXA на нужном устройстве" : null;
  return createPortal(
    <div className="nx-viewer" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "var(--scrim)" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nx-flow-title" onClick={(e) => e.stopPropagation()} className="nx-pop nx-scroll" style={{
        width: "min(460px, 100%)", maxHeight: "calc(100% - 32px)", overflowY: "auto", boxSizing: "border-box",
        background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 20, padding: 20, textAlign: "left",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div id="nx-flow-title" className="ng-display" style={{ fontSize: 20, fontWeight: 600 }}>Отправить в NEXA</div>
          <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть" style={{ ...btnReset, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {Icon.close({ c: C.muted, s: 16 })}
          </button>
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 6, lineHeight: 1.45 }}>Текст или ссылка уйдёт на выбранное устройство вашего аккаунта</div>
        <div style={{ marginTop: 16 }}>
          <FlowTextField value={text} onChange={(v) => { setText(v); setNote(null); }} label="Текст или ссылка" onNote={setNote} />
        </div>
        {live.length > 0 && (
          <div role="radiogroup" aria-label="Куда отправить" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            {live.map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={x.id === pick} onClick={() => setTo(x.id)} className="nx-ghost-btn" style={{
                ...btnReset, display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", fontSize: 13, borderRadius: 999,
                border: `1px solid ${x.id === pick ? C.mint : C.borderStrong}`, color: C.text,
                background: x.id === pick ? `color-mix(in srgb, ${C.mint} 12%, transparent)` : "transparent",
              }}>
                {x.icon({ c: x.id === pick ? C.mint : C.text, s: 15 })} {x.name}
              </button>
            ))}
          </div>
        )}
        {why && <div style={{ fontSize: 13, color: C.mutedSoft, marginTop: 14, lineHeight: 1.45 }}>{why}</div>}
        {note && <div role="alert" style={{ fontSize: 13, color: C.red, marginTop: 10 }}>{note}</div>}
        {st && <div role="status" style={{ fontSize: 13, marginTop: 10, color: st[1] === "green" ? C.green : st[1] === "red" ? C.red : C.muted }}>«{rec.to_name}»: {st[0]}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          {!user ? (
            <StateButton variant="primary" onClick={onLogin} style={{ flex: 1, borderRadius: 999, padding: "11px 16px" }}>Войти</StateButton>
          ) : (
            <StateButton variant="primary" state={busy ? "loading" : "idle"} labels={{ loading: "Отправляем…" }}
              icon={Icon.send({ c: C.onFold, s: 14 })} disabled={!!why || !text.trim()} onClick={send}
              style={{ flex: 1, borderRadius: 999, padding: "11px 16px" }}>
              {target ? `Отправить на «${target.name}»` : "Отправить"}
            </StateButton>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* Настройки NEXA Flow (только у вошедшего): включение,
   окно «Отправить в NEXA» и очистка истории передач на этом устройстве */
export function FlowSettings({ flow, setFlow, count, onSend, onClear }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div id="nx-flow-settings" style={{ scrollMarginTop: 80 }}>
      <SectionTitle>NEXA Flow</SectionTitle>
      <SettingsGroup>
        <SettingsRow icon={Icon.send({ c: C.mint, s: 18 })} title="Передача текста и ссылок"
          subtitle={flow.on ? "Между вашими устройствами. Буфер обмена читаем только по нажатию «Вставить скопированное»" : "Выключено — это устройство не отправляет и не принимает"}
          right={<Toggle on={flow.on} label="Передача текста и ссылок" onClick={() => setFlow((f) => ({ ...f, on: !f.on }))} />} />
        <SettingsRow icon={Icon.shareUp({ c: C.text, s: 18 })} title="Отправить в NEXA"
          subtitle={isNative ? "Или из любого приложения: «Поделиться» → «Отправить в NEXA»" : "Текст или ссылку — на другое ваше устройство"}
          right={<button type="button" className="nx-ghost-btn" disabled={!flow.on} onClick={onSend} style={{ ...btnReset, padding: "7px 14px", fontSize: 13, borderRadius: 999, border: `1px solid ${C.borderStrong}`, color: C.text }}>Открыть</button>} />
        <SettingsRow last icon={Icon.trash({ c: C.text, s: 18 })} title="История передач"
          subtitle={confirm ? "Удалить историю на этом устройстве? На других она останется" : count ? `${count} ${plural(count, ["запись", "записи", "записей"])} на этом устройстве. Пароли и ключи не сохраняются` : "Пусто. Пароли и ключи в историю не сохраняются"}
          right={confirm ? (
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className="nx-ghost-btn" onClick={() => setConfirm(false)} style={{ ...btnReset, padding: "7px 12px", fontSize: 13, borderRadius: 999, border: `1px solid ${C.borderStrong}`, color: C.text }}>Отмена</button>
              <button type="button" className="nx-ghost-btn" onClick={() => { onClear(); setConfirm(false); }} style={{ ...btnReset, padding: "7px 12px", fontSize: 13, borderRadius: 999, border: `1px solid ${C.red}`, color: C.red }}>Очистить</button>
            </div>
          ) : (
            <button type="button" className="nx-ghost-btn" disabled={!count} onClick={() => setConfirm(true)} style={{ ...btnReset, padding: "7px 14px", fontSize: 13, borderRadius: 999, border: `1px solid ${C.borderStrong}`, color: count ? C.text : C.mutedSoft }}>Очистить</button>
          )} />
      </SettingsGroup>
    </div>
  );
}
