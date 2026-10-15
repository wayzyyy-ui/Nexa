// Центр безопасности и приватности: подключённые устройства, сеансы входа, выход на других
// устройствах, синхронизация, приватность, журнал безопасности; гостю — что доступно без входа.
// Вся работа с сеансами — src/lib/security.js; отключение устройства — disconnectDevice в NexaApp
import { useState, useEffect, useRef } from "react";
import { C, T } from "../ui/theme.js";
import { Icon } from "../ui/icons.jsx";
import { Crumb } from "../ui/layout.jsx";
import { SectionTitle, SettingsGroup, SettingsRow, Dot, btnReset } from "../ui/base.jsx";
import { listSessions, clientLabel, SECURITY_ERROR_TEXT } from "../lib/security.js";
import { lastSeenText, peerLabel } from "../lib/devices.js";

const dateTime = (ms) => (ms ? new Date(ms).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const pill = { ...btnReset, flexShrink: 0, borderRadius: 999, padding: "7px 14px", fontSize: 13, whiteSpace: "nowrap" };
const ghost = { ...pill, border: `1px solid ${C.borderStrong}`, color: C.text };
const danger = { ...pill, border: `1px solid color-mix(in srgb, ${C.red} 55%, transparent)`, color: C.red };

// Что это за устройство — без марок и моделей
function deviceKindText(d) {
  if (d.bt) return d.host_name ? `Bluetooth · через «${d.host_name}»` : "Bluetooth";
  if (d.kind) return peerLabel(d);
  return d.type === "laptop" ? "Компьютер" : "Телефон";
}

/* Подтверждение опасного действия прямо в строке: что будет, предупреждение и кнопки.
   Само действие начнётся через 5 секунд — «Отменить» будет во всплывающем */
function ConfirmBox({ title, text, warn, actions, onCancel }) {
  return (
    <div role="alert" className="nx-pop" style={{
      margin: "0 16px 14px", padding: "12px 14px", borderRadius: 16,
      border: `1px solid color-mix(in srgb, ${C.red} 45%, transparent)`,
      background: `color-mix(in srgb, ${C.red} 7%, transparent)`,
    }}>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{text}</div>
      {warn && <div style={{ fontSize: 12, color: C.red, marginTop: 6, lineHeight: 1.5 }}>{warn}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button type="button" className="nx-ghost-btn" onClick={onCancel} style={ghost}>Отмена</button>
        {actions}
      </div>
    </div>
  );
}

// Строка переименования: Enter — сохранить, Esc — отмена
function RenameField({ name, onSave, onCancel }) {
  const [v, setV] = useState(name);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const save = () => { const t = v.trim(); if (t && t !== name) onSave(t.slice(0, 40)); else onCancel(); };
  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } }}>
      <input ref={ref} value={v} maxLength={40} onChange={(e) => setV(e.target.value)} aria-label="Новое название"
        className="nx-input" style={{ flex: "1 1 160px", minWidth: 0, fontSize: 14, padding: "7px 14px", borderRadius: 999, border: `1px solid ${C.borderStrong}`, background: "transparent", color: C.text, fontFamily: "inherit", outline: "none" }} />
      <button type="submit" className="nx-primary" style={{ ...pill, border: "1px solid transparent", color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})` }}>Сохранить</button>
      <button type="button" className="nx-ghost-btn" onClick={onCancel} style={ghost}>Отмена</button>
    </form>
  );
}

export function ScreenSecurity({
  onBack, user, onLogin, online, devices, mySid, onRename, onDisconnect, onEndSession, onSignOutOthers,
  syncLine, locateBlock, flowOn, onOpenFlow, log,
}) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  // Esc — назад (если не открыто окно или идёт переименование — их Esc обрабатывают сами)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector('[role="dialog"], [role="menu"]')) return;
      if (document.activeElement?.closest?.(".nx-sec-rename")) return;
      onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  // Сеансы входа — с сервера (только свои, проверяет база)
  const [sessions, setSessions] = useState({ loading: true });
  const reqNo = useRef(0); // ответы могут прийти не по порядку — берём только последний запрос
  const reload = async () => {
    if (!user) return;
    const n = ++reqNo.current;
    setSessions((s) => ({ ...s, loading: true }));
    const r = await listSessions();
    if (n === reqNo.current) setSessions(r);
  };
  useEffect(() => { reload(); }, [user?.id, online]);

  const [confirm, setConfirm] = useState(null); // { type, id }
  const [renaming, setRenaming] = useState(null);
  const [busy, setBusy] = useState({}); // id → true, пока идёт отсчёт / выполнение
  const act = async (key, fn) => {
    setConfirm(null);
    setBusy((b) => ({ ...b, [key]: true }));
    try { await fn(); } finally {
      setBusy((b) => { const n = { ...b }; delete n[key]; return n; });
      reload();
    }
  };

  const h1 = (
    <div style={{ margin: "26px 0 8px" }}>
      <div className="ng-display nx-page-title" style={{ fontSize: T.fs.page, fontWeight: 500, lineHeight: 1.1 }}>Безопасность и приватность</div>
      <div style={{ fontSize: 15, color: C.muted, lineHeight: 1.55, marginTop: 12, maxWidth: 620 }}>
        Какие устройства подключены к аккаунту, где выполнен вход и как закрыть доступ, если устройство потерялось или больше не нужно.
      </div>
    </div>
  );

  // Гость: что можно без входа, а что только с аккаунтом
  if (!user) {
    return (
      <div className="ng-screen nx-security" style={{ padding: "28px 40px 40px", textAlign: "left", maxWidth: 920, marginInline: "auto", boxSizing: "border-box" }}>
        <Crumb onClick={onBack}>{Icon.arrowLeft({ c: C.onFold, s: 14 })} Назад</Crumb>
        {h1}
        <SectionTitle>Вы пользуетесь NEXA без аккаунта</SectionTitle>
        <SettingsGroup>
          <SettingsRow icon={Icon.check({ c: C.green, s: 18 })} title="Доступно гостю"
            subtitle="Тема, расписание, файлы и диалоги с ассистентом — всё хранится только в этом браузере и никуда не отправляется" />
          <SettingsRow icon={Icon.lock({ c: C.muted, s: 18 })} title="Только с аккаунтом"
            subtitle="Подключение устройств, синхронизация через облако, Flow, «Найти» и «Где устройство?», вход по QR. Здесь же появятся устройства и сеансы входа" />
          <SettingsRow last icon={Icon.alert({ c: C.muted, s: 18 })} title="Если браузер общий"
            subtitle="Данные гостя видит любой, кто откроет NEXA в этом браузере. Удалить их можно, очистив данные сайта в настройках браузера"
            right={onLogin && <button type="button" className="nx-primary" onClick={onLogin} style={{ ...pill, border: "1px solid transparent", color: C.onFold, fontWeight: 500, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})` }}>Войти</button>} />
        </SettingsGroup>
      </div>
    );
  }

  const others = devices.filter((d) => !d.isSelf);
  const self = devices.find((d) => d.isSelf);
  const sessOk = sessions.ok;
  // Сеанс → какое это устройство (по номеру сеанса в его строке)
  const deviceBySid = new Map(devices.flatMap((d) => (d.sids || []).map((s) => [s, d])));

  const deviceRow = (d, last) => {
    const key = `dev:${d.id}`;
    const status = d.bt ? (d.online ? "Подключено к телефону" : "Не подключено") : d.isSelf ? "Это устройство" : d.online ? "В сети" : lastSeenText(d.seenAt);
    const sub = [deviceKindText(d), status, d.createdAt ? `подключено ${dateTime(d.createdAt)}` : ""].filter(Boolean).join(" · ");
    const canRevoke = !d.bt && d.canRevoke;
    return (
      <div key={d.id}>
        <SettingsRow last={last && confirm?.id !== d.id}
          icon={(d.icon || Icon.phone)({ c: d.online || d.isSelf ? C.green : C.muted, s: 18 })}
          title={renaming === d.id
            ? <span className="nx-sec-rename"><RenameField name={d.name} onCancel={() => setRenaming(null)} onSave={(n) => { onRename(d.id, n); setRenaming(null); }} /></span>
            : <span style={{ display: "flex", alignItems: "center", gap: 8 }}>{d.name}{(d.online || d.isSelf) && <Dot color={C.green} />}</span>}
          subtitle={renaming === d.id ? null : busy[key] ? "Отключаем… (отменить — во всплывающем окне)" : sub}
          right={renaming === d.id || d.isSelf ? null : (
            <span style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button type="button" className="nx-icon-btn" onClick={() => setRenaming(d.id)} aria-label={`Переименовать «${d.name}»`} disabled={!!busy[key]}
                style={{ ...btnReset, width: 34, height: 34, borderRadius: "50%", border: `1px solid ${C.borderStrong}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {Icon.edit({ c: C.text, s: 15 })}
              </button>
              <button type="button" className="nx-ghost-btn" disabled={!!busy[key]} onClick={() => setConfirm({ type: "device", id: d.id })} style={danger}>Отключить</button>
            </span>
          )} />
        {confirm?.type === "device" && confirm.id === d.id && (
          <ConfirmBox
            onCancel={() => setConfirm(null)}
            title={`Отключить «${d.name}» от аккаунта?`}
            text={d.bt
              ? "Уберём его из списка. Своего входа у Bluetooth-устройства нет — доступ к аккаунту у него и так отсутствует"
              : canRevoke
                ? "Завершим вход на нём и уберём из списка. Если оно в сети — выйдет сразу, иначе старый пропуск перестанет действовать в течение часа. Подключить снова можно будет по коду"
                : "Мы не знаем его сеанс входа (давно не открывалось или старая версия), поэтому завершить вход именно на нём не получится"}
            warn={!d.bt && !canRevoke ? "Если просто убрать из списка, вход на нём останется рабочим. Чтобы точно закрыть доступ — «Выйти на всех других устройствах» ниже" : (!online && !d.bt ? "Нет связи — доступ сейчас не отозвать" : null)}
            actions={d.bt || canRevoke ? (
              <button type="button" className="nx-primary" disabled={!d.bt && !online} onClick={() => act(key, () => onDisconnect(d.id, "full"))}
                style={{ ...pill, border: `1px solid ${C.red}`, background: C.red, color: C.onFold, fontWeight: 500 }}>
                Отключить
              </button>
            ) : (
              <button type="button" className="nx-ghost-btn" onClick={() => act(key, () => onDisconnect(d.id, "list"))} style={danger}>
                Только убрать из списка
              </button>
            )} />
        )}
      </div>
    );
  };

  return (
    <div className="ng-screen nx-security" style={{ padding: "28px 40px 40px", textAlign: "left", maxWidth: 920, marginInline: "auto", boxSizing: "border-box" }}>
      <Crumb onClick={onBack}>{Icon.arrowLeft({ c: C.onFold, s: 14 })} Назад</Crumb>
      {h1}

      {/* Подключённые устройства */}
      <SectionTitle>Подключённые устройства</SectionTitle>
      <SettingsGroup>
        {self && deviceRow(self, !others.length)}
        {others.map((d, i) => deviceRow(d, i === others.length - 1))}
        {!devices.length && (
          <SettingsRow last icon={Icon.phone({ c: C.muted, s: 18 })} title="Пока ни одного"
            subtitle="Устройства подключаются кодом или QR: Главная → «Добавить устройство»" />
        )}
      </SettingsGroup>

      {/* Сеансы входа — только то, что сообщает сервер */}
      <SectionTitle>Сеансы входа</SectionTitle>
      <SettingsGroup>
        {sessions.loading && !sessOk && <SettingsRow last icon={Icon.refresh({ c: C.muted, s: 18 })} title="Загружаем…" />}
        {!sessions.loading && !sessOk && (
          <SettingsRow last icon={Icon.alert({ c: C.muted, s: 18 })} title="Сведения о входах недоступны"
            subtitle={SECURITY_ERROR_TEXT[sessions.kind] || SECURITY_ERROR_TEXT.server}
            right={sessions.kind !== "setup" && <button type="button" className="nx-ghost-btn" onClick={reload} style={ghost}>Повторить</button>} />
        )}
        {sessOk && sessions.items.map((s, i) => {
          const dev = deviceBySid.get(s.id);
          const label = dev?.name || clientLabel(s.ua);
          const key = `ses:${s.id}`;
          const current = s.current || s.id === mySid;
          const last = i === sessions.items.length - 1 && confirm?.id !== s.id;
          return (
            <div key={s.id}>
              <SettingsRow last={last}
                icon={Icon.user({ c: current ? C.green : C.muted, s: 18 })}
                title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}>{label}{current && <span style={{ fontSize: 12, color: C.green }}>это устройство</span>}</span>}
                subtitle={busy[key] ? "Завершаем… (отменить — во всплывающем окне)"
                  : [dev ? clientLabel(s.ua) : null, s.createdAt ? `вход ${dateTime(s.createdAt)}` : null, s.activeAt ? `активность ${dateTime(s.activeAt)}` : null].filter(Boolean).join(" · ")}
                right={current ? null : (
                  <button type="button" className="nx-ghost-btn" disabled={!!busy[key] || !online} onClick={() => setConfirm({ type: "session", id: s.id })} style={danger}>Завершить</button>
                )} />
              {confirm?.type === "session" && confirm.id === s.id && (
                <ConfirmBox onCancel={() => setConfirm(null)}
                  title={`Завершить сеанс «${label}»?`}
                  text="Устройство больше не сможет продлить вход. Если оно в сети — выйдет сразу, иначе старый пропуск перестанет действовать в течение часа"
                  actions={<button type="button" className="nx-primary" onClick={() => act(key, () => onEndSession(s.id, label))}
                    style={{ ...pill, border: `1px solid ${C.red}`, background: C.red, color: C.onFold, fontWeight: 500 }}>Завершить</button>} />
              )}
            </div>
          );
        })}
        {sessOk && !sessions.items.length && <SettingsRow last icon={Icon.user({ c: C.muted, s: 18 })} title="Сервер не вернул ни одного сеанса" />}
      </SettingsGroup>
      {sessOk && (
        <div style={{ fontSize: 12, color: C.mutedSoft, margin: "-4px 4px 10px", lineHeight: 1.5 }}>
          Это действующие входы по данным сервера. Завершённые и истёкшие здесь не показываются
        </div>
      )}

      {/* Выйти везде, кроме этого устройства */}
      <SectionTitle>Закрыть доступ</SectionTitle>
      <SettingsGroup>
        <SettingsRow last={confirm?.type !== "others"} icon={Icon.logout({ c: C.red, s: 18 })} title="Выйти на всех других устройствах"
          subtitle={busy.others ? "Выходим… (отменить — во всплывающем окне)" : !online ? "Нужен интернет" : "Если телефон потерян или вход был не ваш. Это устройство останется в аккаунте"}
          right={<button type="button" className="nx-ghost-btn" disabled={!!busy.others || !online} onClick={() => setConfirm({ type: "others" })} style={danger}>Выйти везде</button>} />
        {confirm?.type === "others" && (
          <ConfirmBox onCancel={() => setConfirm(null)}
            title="Выйти на всех других устройствах?"
            text="На всех других устройствах и в браузерах вход завершится — там придётся войти заново. Список устройств не изменится"
            actions={<button type="button" className="nx-primary" onClick={() => act("others", onSignOutOthers)}
              style={{ ...pill, border: `1px solid ${C.red}`, background: C.red, color: C.onFold, fontWeight: 500 }}>Выйти везде</button>} />
        )}
      </SettingsGroup>

      {/* Синхронизация */}
      <SectionTitle>Синхронизация</SectionTitle>
      <SettingsGroup>
        <SettingsRow last icon={Icon.refresh({ c: syncLine.ok ? C.green : C.muted, s: 18 })} title={syncLine.title} subtitle={syncLine.text} />
      </SettingsGroup>

      {/* Приватность: настройки, которые уже есть в NEXA (без копий) */}
      <SectionTitle>Приватность</SectionTitle>
      {locateBlock}
      <SettingsGroup>
        <SettingsRow last icon={Icon.send({ c: C.muted, s: 18 })} title="Flow — текст и ссылки"
          subtitle={flowOn ? "Принимает текст и ссылки с ваших устройств. Пароли и ключи в историю не пишутся" : "Выключен — с других устройств ничего не принимается"}
          right={<button type="button" className="nx-ghost-btn" onClick={onOpenFlow} style={ghost}>Настроить</button>} />
      </SettingsGroup>
      <div style={{ fontSize: 12, color: C.mutedSoft, margin: "-4px 4px 10px", lineHeight: 1.5 }}>
        Файлы, отправленные на устройство, лежат в вашем облаке и открываются только устройствами этого аккаунта
      </div>

      {/* Журнал */}
      <SectionTitle>Журнал безопасности</SectionTitle>
      <SettingsGroup>
        {log.length ? log.slice(0, 20).map((e, i, arr) => (
          <SettingsRow key={e.id} last={i === arr.length - 1} icon={Icon.lock({ c: C.muted, s: 16 })}
            title={<span style={{ fontSize: 14 }}>{e.title}</span>} subtitle={[dateTime(e.at), e.text].filter(Boolean).join(" · ")} />
        )) : (
          <SettingsRow last icon={Icon.lock({ c: C.muted, s: 16 })} title="Пока пусто" />
        )}
      </SettingsGroup>
      <div style={{ fontSize: 12, color: C.mutedSoft, margin: "-4px 4px 10px", lineHeight: 1.5 }}>
        Только то, что произошло в этом браузере: входы, подключения и отключения устройств, завершённые сеансы.
        Без кодов и паролей. При выходе из аккаунта журнал стирается вместе с остальными данными
      </div>
    </div>
  );
}
