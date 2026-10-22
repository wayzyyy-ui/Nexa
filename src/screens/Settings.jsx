// Экран «Настройки»: это устройство, уведомления и все группы
import { useState, useEffect } from "react";
import { isNative, systemNotifyKind } from "../native.js";
import { thisDeviceKind, NO_DATA, KIND_LABEL, batteryText, netText, diskText } from "../lib/deviceInfo.js";
import { C, readTheme, switchTheme, T } from "../ui/theme.js";
import { Icon } from "../ui/icons.jsx";
import { sysTime } from "../lib/format.js";
import { readTilt, saveTilt, tiltNeedsPermission } from "../lib/hooks.js";
import { SectionTitle, SettingsGroup, SettingsRow, btnReset, Toggle } from "../ui/base.jsx";
import { AccountSettings } from "./auth.jsx";
import { NOTE_CATS } from "../lib/notes.js";
import { VERSION } from "../version.js";
import { InstallSettings } from "../ui/install.jsx";
import { DesktopSettings } from "../ui/desktop.jsx";
import { useEnterSends, touchLike } from "../lib/composer.js";

// ЭКРАН "НАСТРОЙКИ": аккаунт, тема, уведомления, приложение
/* «Это устройство» в Настройках: только настоящие сведения (src/lib/deviceInfo.js).
   Чего платформа не отдаёт — «Нет данных» и коротко почему */
export function ThisDeviceSettings({ sys }) {
  const kind = thisDeviceKind();
  const kindIcon = { phone: Icon.phone, tablet: Icon.tablet, computer: Icon.laptop }[kind];
  const why = isNative
    ? { battery: "система не сообщила заряд", net: "система не сообщила тип сети", disk: "система не сообщила объём" }
    : { battery: "этот браузер не сообщает заряд", net: "браузер не сообщает тип подключения", disk: "браузер не показывает память устройства" };
  const line = (value, reason) => (value === NO_DATA ? `${NO_DATA} — ${reason}` : value);
  const used = sys?.diskTotal ? (sys.diskTotal - sys.diskFree) / sys.diskTotal : null;
  return (
    <>
      <SectionTitle>Это устройство</SectionTitle>
      <SettingsGroup>
        <SettingsRow icon={kindIcon({ c: C.mint, s: 18 })} title={KIND_LABEL[kind]}
          subtitle={sys ? `Обновлено ${sysTime(sys.at)} · сведения раз в 30 секунд` : "Читаем сведения…"} />
        <SettingsRow icon={Icon.battery({ c: C.text, s: 18 })} title="Заряд" subtitle={sys ? line(batteryText(sys), why.battery) : "…"} />
        <SettingsRow icon={Icon.signal({ c: C.text, s: 18 })} title="Сеть" subtitle={sys ? line(netText(sys), why.net) : "…"} />
        <SettingsRow last icon={Icon.drive({ c: C.text, s: 18 })} title="Место на устройстве"
          subtitle={sys ? (
            used == null ? line(NO_DATA, why.disk) : (
              <>
                {diskText(sys)}
                <span className="nx-sys-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round(used * 100)}%`, background: used > 0.9 ? C.red : `linear-gradient(90deg, ${C.blue}, ${C.mint})` }} />
                </span>
              </>
            )
          ) : "…"} />
      </SettingsGroup>
    </>
  );
}

/* Настройки уведомлений — просто: один переключатель на категорию («уведомлять о …»)
   и один общий «Системные уведомления» (показывать ли их ещё и в системе, когда NEXA
   не на экране). Внутри прежние поля: prefs[кат] = { app, system } —
   выключенная категория молчит везде, системные идут только у включённых.
   Где системные невозможны, так и пишем, а не обещаем */
export function NoteSettings({ prefs, setPrefs, perm, onAsk, account }) {
  const kind = systemNotifyKind();
  const sysOn = perm === "granted";
  // Один переключатель на все категории (по просьбе автора). Внутри прежние поля:
  // включено — app у всех категорий; системные — там, где их разрешило устройство
  const on = NOTE_CATS.some((c) => prefs[c.id]?.app);
  const flipAll = () => setPrefs(() => Object.fromEntries(NOTE_CATS.map((c) => [c.id, { app: !on, system: !on && sysOn }])));
  const where = kind === "desktop"
    ? "Ещё и системные — когда окно NEXA свёрнуто, закрыто в трей или не в фокусе. Выключить их можно и в настройках уведомлений компьютера"
    : kind === "none"
    ? "В браузере телефона — только внутри NEXA. Системные есть в приложении для Android"
    : kind === "web"
      ? "Ещё и системные — пока вкладка NEXA открыта (можно свёрнутой)"
      : "Ещё и системные. Напоминания о делах придут, даже если NEXA закрыта";
  const sysLine = kind === "none" ? null
    : perm === "granted" ? <span style={{ color: C.green }}>Системные разрешены</span>
    : perm === "denied" ? <span style={{ color: C.red }}>Системные запрещены — разрешите в настройках {kind === "app" ? "телефона" : "браузера"}</span>
    : <button type="button" className="nx-link-btn" onClick={onAsk} style={{ ...btnReset, fontSize: 13, color: C.mint, textDecoration: "underline", textUnderlineOffset: 3 }}>Разрешить системные</button>;
  return (
    <div id="nx-note-settings" style={{ scrollMarginTop: 80 }}>
      <SectionTitle>Уведомления</SectionTitle>
      <SettingsGroup>
        <SettingsRow last icon={Icon.bell({ c: C.muted, s: 18 })} title="Уведомления"
          subtitle={<>
            {on ? `Файлы, текст и ссылки, устройства, синхронизация, расписание, обновления. ${where}` : "Выключены — NEXA ничего не показывает"}
            {on && sysLine && <span style={{ display: "block", marginTop: 6 }}>{sysLine}</span>}
            {account && <span style={{ display: "block", marginTop: 6, color: C.mutedSoft }}>Одинаково на всех ваших устройствах</span>}
          </>}
          right={<Toggle on={on} onClick={flipAll} label="Уведомления" />} />
      </SettingsGroup>
    </div>
  );
}

/* «ИИ — Ассистент»: что делает Enter в поле ввода (src/lib/composer.js). По умолчанию —
   по устройству: компьютер отправляет, телефон ставит новую строку. Хранится на этом устройстве */
function AssistantInputSettings() {
  const [on, setOn] = useEnterSends();
  return (
    <>
      <SectionTitle>ИИ — Ассистент</SectionTitle>
      <SettingsGroup>
        <SettingsRow last icon={Icon.send({ c: on ? C.mint : C.muted, s: 18 })} title="Enter отправляет сообщение"
          subtitle={touchLike()
            ? (on ? "Клавиша ввода на клавиатуре отправляет сообщение" : "Клавиша ввода ставит новую строку, отправить — кнопкой")
            : (on ? "Новая строка — Shift + Enter. Ctrl + Enter тоже отправляет" : "Enter ставит новую строку, отправить — кнопкой или Ctrl + Enter")}
          right={<Toggle on={on} onClick={() => setOn(!on)} label="Enter отправляет сообщение" />} />
      </SettingsGroup>
    </>
  );
}

/* Виджет «NEXA · Заметки» (только приложение для Android): показывает закреплённую заметку.
   «Скрывать текст» — на виджете видно только, что заметка есть. Хранится на этом устройстве */
export function NotesWidgetSettings({ hide, setHide, onNotes }) {
  if (!isNative) return null;
  return (
    <>
      <SectionTitle>Виджет «Заметки»</SectionTitle>
      <SettingsGroup>
        <SettingsRow icon={Icon.pin({ c: C.mint, s: 18 })} title="Что показывает виджет"
          subtitle="Закреплённую заметку (из нескольких — изменённую последней). Закрепить — булавкой в «Заметках»"
          right={Icon.chevron({})} onClick={onNotes} />
        <SettingsRow last icon={Icon.lock({ c: hide ? C.mint : C.muted, s: 18 })} title="Скрывать текст на виджете"
          subtitle={hide ? "На экране «Домой» видно только, что заметка есть — откроется в NEXA" : "Заголовок и начало текста видны на экране «Домой». Похожее на пароли и ключи скрывается всегда"}
          right={<Toggle on={hide} onClick={() => setHide(!hide)} label="Скрывать текст на виджете" />} />
      </SettingsGroup>
    </>
  );
}

export function ScreenSettings({ onAbout, onSecurity, user, onLogin, onDeleteData, onApproveLogin, sys, flowBlock, noteBlock, memoryBlock, updateBlock, widgetBlock, backupBlock }) {

  // theme: какая тема выбрана сейчас, "light" или "dark".
  // setTheme меняет её плавно (см. switchTheme наверху файла).
  const [theme, setThemeState] = useState(readTheme);
  // Тему переключили в другой вкладке (или ассистент) — обновляем кнопки
  useEffect(() => {
    const sync = () => setThemeState(readTheme());
    window.addEventListener("nexa-theme-change", sync);
    return () => window.removeEventListener("nexa-theme-change", sync);
  }, []);
  const setTheme = (t) => {
    if (t === theme) return;
    switchTheme(t, () => setThemeState(t));
  };

  // Фон от наклона телефона: строку показываем только на сенсорных экранах
  const touch = window.matchMedia?.("(pointer: coarse)").matches;
  const [tilt, setTiltState] = useState(readTilt);
  const toggleTilt = async () => setTiltState(await saveTilt(!tilt));

  // Кнопка сегментированного переключателя темы
  const segBtn = (value, label) => (
    <button onClick={() => setTheme(value)} style={{
      flex: 1, padding: "8px 18px", fontSize: 13, border: "none", cursor: "pointer", whiteSpace: "nowrap",
      fontFamily: "inherit",
      background: theme === value ? `linear-gradient(90deg, ${C.blue}, ${C.mint})` : "transparent",
      color: theme === value ? C.onAccent : C.muted,
      fontWeight: theme === value ? 500 : 400,
    }}>{label}</button>
  );

  return (
    <div className="ng-screen nx-stagger nx-settings" style={{ padding: "28px 40px 40px", maxWidth: 920, marginInline: "auto", boxSizing: "border-box" }}>
      {/* Колонка настроек не шире 920px и стоит по центру свободного места:
          переключатели рядом с подписями, по краям — ровные поля.
          Поиск — значок в верхней строке (отдельное поле здесь его повторяло) */}
      <div className="nx-settings-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div className="ng-display nx-page-title" style={{ fontSize: T.fs.page, fontWeight: 500, lineHeight: 1.1 }}>Настройки</div>
        </div>

      <AccountSettings user={user} onLogin={onLogin} onDeleteData={onDeleteData} onApproveLogin={onApproveLogin} />

      {/* Центр безопасности: устройства, сеансы входа, приватность, журнал (экран ScreenSecurity) */}
      <SectionTitle>Безопасность и приватность</SectionTitle>
      <SettingsGroup>
        <SettingsRow last icon={Icon.lock({ c: C.mint, s: 18 })} title="Устройства, входы и приватность"
          subtitle={user ? "Где выполнен вход, отключить потерянное устройство, поиск этого устройства, журнал" : "Что доступно без аккаунта и что даёт вход"}
          right={Icon.chevron({})} onClick={onSecurity} />
      </SettingsGroup>

      <SectionTitle>Внешний вид</SectionTitle>
      <SettingsGroup>
        <SettingsRow
          last={!touch} wrap
          icon={
            // Мини-складка: меняет цвет вместе с темой
            <svg viewBox="0 0 24 24" width="18" height="18">
              <polygon points="4,14 12,4 12,20 7,22" fill={theme === "dark" ? C.blue : C.mint} />
            </svg>
          }
          title="Тема оформления"
          subtitle={theme === "dark" ? "Тёмная" : "Светлая"}
          right={
            <div className="nx-seg" style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: 999, overflow: "hidden" }}>
              {segBtn("light", "Светлая")}
              {segBtn("dark", "Тёмная")}
            </div>
          }
        />
        {touch && (
          <SettingsRow
            last
            icon={<span style={{ display: "flex", transform: "rotate(-14deg)" }}>{Icon.phone({ c: C.muted, s: 18 })}</span>}
            title="Фон от наклона телефона"
            subtitle={tiltNeedsPermission() && !tilt ? "Нужно разрешить доступ к движению" : "Фон чуть сдвигается, когда наклоняете телефон"}
            right={<Toggle on={tilt} onClick={toggleTilt} />}
          />
        )}
      </SettingsGroup>

      {noteBlock}

      <AssistantInputSettings />

      {memoryBlock}

      {flowBlock}

      {backupBlock}

      {widgetBlock}

      <ThisDeviceSettings sys={sys} />

      {updateBlock}

      <DesktopSettings />

      <InstallSettings />

      <SectionTitle>Система</SectionTitle>
      <SettingsGroup>
        <SettingsRow last icon={Icon.info({ c: C.text, s: 18 })} title="О системе" subtitle={`NEXA ${VERSION} · что умеет, обновления и планы`} right={Icon.chevron({})} onClick={onAbout} />
      </SettingsGroup>
    </div>
  );
}
