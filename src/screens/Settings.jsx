// Экран «Настройки» (макет 2026-10-26): слева аккаунт и разделы, справа выбранный раздел; на телефоне — список разделов,
// раздел открывается на весь экран. Группы внутри разделов — прежние компоненты (этот файл и App.jsx)
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { isNative, isDesktop, systemNotifyKind } from "../native.js";
import { thisDeviceKind, NO_DATA, KIND_LABEL, batteryText, netText, diskText } from "../lib/deviceInfo.js";
import { C, readTheme, switchTheme, T, PHONE_MQ } from "../ui/theme.js";
import { Icon } from "../ui/icons.jsx";
import { sysTime } from "../lib/format.js";
import { readTilt, saveTilt, tiltNeedsPermission, useMediaQuery, useSwipeBack } from "../lib/hooks.js";
import { readLitePref, liteActive, liteAutoReason, setLitePref, LITE_EVENT } from "../lib/lite.js";
import { Crumb } from "../ui/layout.jsx";
import { SectionTitle, SettingsGroup, SettingsRow, btnReset, Toggle } from "../ui/base.jsx";
import { AccountSettings } from "./auth.jsx";
import { NOTE_CATS } from "../lib/notes.js";
import { VERSION } from "../version.js";
import { InstallSettings } from "../ui/install.jsx";
import { DesktopSettings } from "../ui/desktop.jsx";
import { WebPushRow } from "../ui/webpush.jsx";
import { Avatar, ProfileSettings } from "../ui/profile.jsx";
import { profileName } from "../lib/profile.js";
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
        <SettingsRow last={isNative || isDesktop} icon={Icon.bell({ c: C.muted, s: 18 })} title="Уведомления"
          subtitle={<>
            {on ? `Файлы, текст и ссылки, устройства, синхронизация, расписание, обновления. ${where}` : "Выключены — NEXA ничего не показывает"}
            {on && sysLine && <span style={{ display: "block", marginTop: 6 }}>{sysLine}</span>}
            {account && <span style={{ display: "block", marginTop: 6, color: C.mutedSoft }}>Одинаково на всех ваших устройствах</span>}
          </>}
          right={<Toggle on={on} onClick={flipAll} label="Уведомления" />} />
        {/* Сайт: «Вышла NEXA …» системным уведомлением и при закрытой вкладке (в приложениях строки нет) */}
        <WebPushRow last />
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

/* Разделы Настроек (макет 2026-10-26). account — открывается карточкой аккаунта, в списке его нет.
   notitle — в разделе первый заголовок группы повторяет название раздела: его прячем (класс nx-set-notitle) */
export const SETTINGS_SECTIONS = [
  { id: "appearance", title: "Внешний вид", icon: "palette" },
  { id: "security", title: "Безопасность", icon: "lock" },
  { id: "notes", title: "Уведомления", icon: "bell", notitle: true },
  { id: "assistant", title: "Память ассистента", icon: "sparkle", notitle: true },
  { id: "device", title: "Это устройство", icon: "laptop", notitle: true },
  { id: "apps", title: "Приложения", icon: "apps" },
];
const ACCOUNT = { id: "account", title: "Аккаунт", icon: "user", notitle: true };
const SEC_KEY = "nexa-settings-sec"; // какой раздел был открыт (компьютер, на эту вкладку)
const readSec = () => { try { const v = sessionStorage.getItem(SEC_KEY); return [...SETTINGS_SECTIONS, ACCOUNT].some((s) => s.id === v) ? v : "appearance"; } catch { return "appearance"; } };

// Имя для карточки аккаунта — своё (Настройки → Аккаунт → «Имя и фото»), иначе из почты
const accountName = profileName;

export function ScreenSettings({ onAbout, user, onLogin, onDeleteData, onApproveLogin, sys, flowBlock, noteBlock, memoryBlock, miniBlock, updateBlock, widgetBlock, backupBlock, securityBlock, request }) {
  const phone = useMediaQuery(PHONE_MQ);
  // Компьютер: выбранный раздел справа. Телефон: null — список, иначе открыт раздел на весь экран
  const [sec, setSecState] = useState(readSec);
  const [open, setOpen] = useState(null);
  // Телефон: раздел уезжает вправо (220 мс), потом убирается; «уменьшение движения» — сразу
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef(0);
  useEffect(() => () => clearTimeout(leaveTimer.current), []);
  const closeSection = () => {
    if (leaving) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setOpen(null); return; }
    setLeaving(true);
    leaveTimer.current = setTimeout(() => { setOpen(null); setLeaving(false); window.scrollTo(0, 0); }, 220);
  };
  // Раздел на телефоне смахивается вправо — к списку (экран уже уехал за пальцем — закрываем сразу)
  const pageRef = useRef(null);
  useSwipeBack(pageRef, () => { setOpen(null); window.scrollTo(0, 0); }, phone && !!open && !leaving, open);
  const setSec = (id) => { setSecState(id); try { sessionStorage.setItem(SEC_KEY, id); } catch { /* не страшно */ } };
  const choose = (id) => { setSec(id); if (phone) { setOpen(id); window.scrollTo(0, 0); } };

  // Переход «к этим настройкам» из других мест (уведомление, центр безопасности, ссылка): раздел + блок внутри
  useEffect(() => {
    if (!request?.sec) return;
    setSec(request.sec);
    if (phone) setOpen(request.sec);
    const t = setTimeout(() => {
      const el = request.anchor && document.getElementById(request.anchor);
      if (el) el.scrollIntoView({ block: "start", behavior: "smooth" }); else window.scrollTo(0, 0);
    }, 120);
    return () => clearTimeout(t);
  }, [request?.n]);

  // Телефон: открытый раздел закрывается Esc и «Назад» (у раздела role="dialog" — роутер даёт ему свою запись истории)
  useEffect(() => {
    if (!phone || !open) return;
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Поверх раздела открыто своё окно или меню — Esc сначала ему
      const top = [...document.querySelectorAll('[role="dialog"], [role="menu"]')].filter((el) => !el.classList.contains("nx-set-page"));
      if (top.length) return;
      closeSection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phone, open, leaving]);

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

  // Облегчённый режим (src/lib/lite.js): Авто / Вкл / Выкл; «Авто» включается сам на слабом телефоне и при экономии
  const [lite, setLite] = useState(() => ({ pref: readLitePref(), on: liteActive(), why: liteAutoReason() }));
  useEffect(() => {
    const sync = () => setLite({ pref: readLitePref(), on: liteActive(), why: liteAutoReason() });
    window.addEventListener(LITE_EVENT, sync);
    return () => window.removeEventListener(LITE_EVENT, sync);
  }, []);
  const liteBtn = (value, label) => (
    <button key={value} onClick={() => setLitePref(value)} style={{
      flex: 1, padding: "8px 14px", fontSize: 13, border: "none", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
      background: lite.pref === value ? `linear-gradient(90deg, ${C.blue}, ${C.mint})` : "transparent",
      color: lite.pref === value ? C.onAccent : C.muted, fontWeight: lite.pref === value ? 500 : 400,
    }}>{label}</button>
  );

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

  // Что лежит в каждом разделе (раскладку утвердил автор 2026-10-26)
  const content = (id) => {
    switch (id) {
      case "appearance": return (
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
              icon={<span style={{ display: "flex", transform: "rotate(-14deg)" }}>{Icon.phone({ c: C.muted, s: 18 })}</span>}
              title="Фон от наклона телефона"
              subtitle={tiltNeedsPermission() && !tilt ? "Нужно разрешить доступ к движению" : "Фон чуть сдвигается, когда наклоняете телефон"}
              right={<Toggle on={tilt} onClick={toggleTilt} />}
            />
          )}
          <SettingsRow
            last wrap
            icon={Icon.quick({ c: C.muted, s: 18 })}
            title="Облегчённый режим"
            subtitle={lite.pref === "auto"
              ? (lite.on ? `Включён сам: ${lite.why}. Без размытия и фоновых анимаций` : "Включится сам на слабом телефоне и при экономии заряда")
              : lite.on ? "Без размытия и фоновых анимаций — быстрее на слабых телефонах" : "Выключен: все эффекты как обычно"}
            right={
              <div className="nx-seg" style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: 999, overflow: "hidden" }}>
                {liteBtn("auto", "Авто")}{liteBtn("on", "Вкл")}{liteBtn("off", "Выкл")}
              </div>
            }
          />
        </SettingsGroup>
      );
      case "security": return <>{securityBlock}{backupBlock}</>;
      case "notes": return noteBlock;
      case "assistant": return <>{memoryBlock}{miniBlock}<AssistantInputSettings /></>;
      case "device": return <><ThisDeviceSettings sys={sys} />{flowBlock}{widgetBlock}</>;
      case "apps": return <>{updateBlock}<DesktopSettings /><InstallSettings /></>;
      case "account": return <>{user && <ProfileSettings user={user} />}<AccountSettings user={user} onLogin={onLogin} onDeleteData={onDeleteData} onApproveLogin={onApproveLogin} /></>;
      default: return null;
    }
  };
  const meta = (id) => [...SETTINGS_SECTIONS, ACCOUNT].find((s) => s.id === id) || SETTINGS_SECTIONS[0];

  const name = user ? accountName(user) : "Гость";
  const avatar = (size) => <Avatar user={user} size={size} />;
  // Список разделов (компьютер — с выбранным, телефон — просто строки).
  // Компьютер: мятная таблетка одна и переезжает к выбранному разделу (2026-10-27) — место и высота по самой строке
  const navRef = useRef(null);
  const [thumb, setThumb] = useState(null); // { y, h } или null
  useLayoutEffect(() => {
    const nav = navRef.current;
    const measure = () => {
      const el = nav?.querySelector(".nx-set-nav-item.is-active");
      const next = !phone && el ? { y: el.offsetTop, h: el.offsetHeight } : null;
      setThumb((t) => (t && next && t.y === next.y && t.h === next.h ? t : next));
    };
    measure();
    // Шрифт догрузился, окно поменяло размер (размеры в --mk) — строки сдвинулись, таблетку — следом
    const ro = nav && typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(nav);
    document.fonts?.ready?.then(measure).catch(() => {});
    return () => ro?.disconnect();
  }, [phone, sec]);
  const navList = (
    <nav ref={navRef} className={`nx-set-nav${thumb ? " has-thumb" : ""}`} aria-label="Разделы настроек">
      {thumb && <span aria-hidden="true" className="nx-set-thumb" style={{ height: thumb.h, transform: `translateY(${thumb.y}px)` }} />}
      {SETTINGS_SECTIONS.map((s) => {
        const active = !phone && sec === s.id;
        return (
          <button key={s.id} type="button" className={`nx-set-nav-item${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => choose(s.id)}>
            <span className="nx-set-nav-icon">{Icon[s.icon]({ c: active ? C.onAccent : C.text, s: 20 })}</span>
            <span>{s.title}</span>
            {phone && <span className="nx-set-nav-chev" aria-hidden="true">{Icon.chevron({ c: C.mutedSoft })}</span>}
          </button>
        );
      })}
    </nav>
  );
  const aboutCard = (
    <button type="button" className="nx-set-about nx-glass nx-glass-subtle" onClick={onAbout}>
      {Icon.info({ c: C.text, s: 20 })}
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15 }}>О системе</span>
        <span style={{ display: "block", fontSize: 12, color: C.muted, marginTop: 2 }}>NEXA {VERSION} · что умеет, обновления и планы</span>
      </span>
    </button>
  );

  /* ── Телефон ── */
  if (phone) {
    if (open) {
      const m = meta(open);
      return (
        // Уходящий раздел — без role="dialog": для «Назад» он уже закрыт
        <div ref={pageRef} className={`ng-screen nx-settings nx-set-page${leaving ? " is-leaving" : ""}`} role={leaving ? undefined : "dialog"} aria-label={m.title} data-no-swipe>
          <Crumb onClick={closeSection}>{Icon.arrowLeft({ c: C.onFold, s: 14 })} Назад</Crumb>
          <div className="ng-display nx-page-title nx-set-page-title">{m.title}</div>
          <div className={`nx-set-body${m.notitle ? " nx-set-notitle" : ""}`}>{content(open)}</div>
        </div>
      );
    }
    return (
      <div className="ng-screen nx-settings nx-set-phone">
        {/* QR — в body: у экрана есть сдвиги и анимации, внутри них fixed считался бы от экрана, а не от окна */}
        {user && onApproveLogin && createPortal(
          <button type="button" className="nx-icon-btn nx-set-qr" onClick={onApproveLogin} aria-label="Войти на другом устройстве по QR" title="Войти на другом устройстве">
            {Icon.qr({ c: C.text, s: 20 })}
          </button>, document.body
        )}
        <button type="button" className="nx-set-profile" onClick={() => (user ? choose("account") : onLogin?.())}>
          {avatar(84)}
          <span className="nx-set-name">{name}</span>
          <span className="nx-set-mail">{user ? user.email : "Войдите, чтобы данные были на всех устройствах"}</span>
        </button>
        <div className="nx-set-sheet nx-glass nx-glass-subtle">
          {navList}
          {/* «О системе» — такой же строкой, как разделы (макет 2026-10-27), без отдельной карточки */}
          <button type="button" className="nx-set-nav-item nx-set-about-row" onClick={onAbout}>
            <span className="nx-set-nav-icon">{Icon.info({ c: C.text, s: 20 })}</span>
            <span>О системе</span>
            <span className="nx-set-nav-chev" aria-hidden="true">{Icon.chevron({ c: C.mutedSoft })}</span>
          </button>
        </div>
      </div>
    );
  }

  /* ── Компьютер: слева аккаунт и разделы, справа выбранный раздел ── */
  const m = meta(sec);
  return (
    <div className="ng-screen nx-stagger nx-settings nx-set-desk">
      <div className="ng-display nx-page-title nx-settings-title">Настройки</div>
      <div className="nx-set-layout">
        <aside className="nx-set-side">
          <div className="ng-display nx-set-side-title">Аккаунт</div>
          <div className={`nx-set-account nx-glass nx-glass-subtle${sec === "account" ? " is-active" : ""}`}>
            {avatar(78)}
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="nx-set-name">{name}</span>
              <span className="nx-set-mail">{user ? user.email : "Вход по почте, без пароля"}</span>
            </span>
            {user ? (
              <button type="button" className="nx-icon-btn" onClick={() => setSec("account")} aria-label="Настройки аккаунта" title="Настройки аккаунта"
                style={{ ...btnReset, width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {Icon.gear({ c: C.text, s: 24 })}
              </button>
            ) : (
              <button type="button" className="nx-primary" onClick={onLogin}
                style={{ ...btnReset, borderRadius: 999, padding: "8px 16px", fontSize: 13, fontWeight: 500, color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`, flexShrink: 0 }}>Войти</button>
            )}
          </div>
          <div className="nx-set-navcard nx-glass nx-glass-subtle">{navList}</div>
          {aboutCard}
        </aside>
        <section className="nx-set-panel nx-glass nx-glass-subtle" aria-label={m.title}>
          <div className="ng-display nx-set-panel-title nx-glass">{m.title}</div>
          <div key={sec} className={`nx-set-body nx-pop${m.notitle ? " nx-set-notitle" : ""}`}>{content(sec)}</div>
        </section>
      </div>
    </div>
  );
}
