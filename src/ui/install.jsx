// Установка и обновление: баннеры, «Скачать APK», карточка обновления, экран «Обновите NEXA»
import { useEffect, useState } from "react";
import { updateCancel, updateOpenSettings, openUpdate, isDesktop } from "../native.js";
import { C, fontDisplay } from "./theme.js";
import { Icon } from "./icons.jsx";
import { mbText } from "../lib/format.js";
import { APK_URL, rememberApkDownload, useSiteApkUpdate, INSTALL_DISMISS_KEY, APK_DOWNLOADED_KEY, UPDATE_DISMISS_KEY, PC_DOWNLOADED_KEY, versionCode, useUpdState, updStart } from "../lib/updates.js";
import { installPlatform } from "../lib/hooks.js";
import { openExternal } from "../lib/desktop.js";
import { SectionTitle, SettingsGroup, SettingsRow, QrCode, btnReset, LogoMark, Logo } from "./base.jsx";
import { VERSION } from "../version.js";

// Три коротких шага с номерами в квадратиках
export function InstallSteps({ steps }) {
  return (
    <ol style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "grid", gap: 6 }}>
      {steps.map((st, i) => (
        <li key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, lineHeight: 1.35 }}>
          <span style={{
            width: 18, height: 18, flexShrink: 0, borderRadius: 10, border: `1px solid ${C.borderStrong}`,
            display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.text,
          }}>{i + 1}</span>
          <span>{st}</span>
        </li>
      ))}
    </ol>
  );
}

// Кнопка скачивания — обычная ссылка с атрибутом download
// version — какую версию качаем (по умолчанию — версия сайта);
// onDownload — что сделать после нажатия (например, спрятать баннер)
export function ApkButton({ label = "Скачать приложение", small, version = VERSION, onDownload }) {
  return (
    <a href={APK_URL} download="NEXA.apk" className="nx-primary"
      onClick={() => { rememberApkDownload(version); onDownload?.(); }}
      style={{
      display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", whiteSpace: "nowrap",
      padding: small ? "7px 14px" : "9px 18px", fontSize: small ? 12.5 : 13.5, fontWeight: 500, borderRadius: 999,
      color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
    }}>
      {Icon.download({ c: C.onFold, s: small ? 14 : 16 })} {label}
    </a>
  );
}

// Шаги для iPhone/iPad — вторая строка с нашей иконкой «Поделиться»
export const IOS_STEPS = [
  "Откройте этот сайт в Safari",
  <>Нажмите «Поделиться» <span style={{ display: "inline-flex", verticalAlign: "-3px", marginLeft: 2 }}>{Icon.shareUp({ c: C.mint, s: 16 })}</span></>,
  "Выберите «На экран Домой»",
];

export const ANDROID_STEPS = ["Скачайте файл NEXA.apk", "Откройте его из уведомления или папки «Загрузки»", "Разрешите установку из этого источника"];

// Группа «Приложение» в Настройках
/* Сайт на компьютере: что опубликовано для ПК (блок desktop в version.json, пишет
   npm run release:desktop). Нет блока — строки «NEXA для компьютера» нет */
function useDesktopRelease(enabled) {
  const [rel, setRel] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => { const d = v?.desktop; if (!stop && d && typeof d.version === "string") setRel(d); })
      .catch(() => {});
    return () => { stop = true; };
  }, [enabled]);
  return rel;
}

/* Таблетка «Приложение NEXA» на Главной компьютера, рядом с ассистентом (макет 2026-10).
   - Сайт на компьютере с этой системой: ещё не скачивали — «Быстрее и удобнее, чем в браузере»;
     скачали старую версию, а вышла новее — «Вышла NEXA X»; скачали последнюю — таблетки нет.
     Нажатие скачивает установщик.
   - Приложение для ПК, вышла новая версия — «Вышла NEXA X · Нажмите, чтобы обновить»:
     нажатие ставит обновление изнутри (тот же ход, что в Настройках), ход виден в подписи.
   Ничего не показываем — возвращает null, и ассистент занимает всю ширину */
export function DesktopAppPill({ update }) {
  const site = installPlatform() === "desktop" && !isDesktop && /Windows/i.test(navigator.userAgent);
  const rel = useDesktopRelease(site);
  const st = useUpdState();
  const [got, setGot] = useState(() => { try { return localStorage.getItem(PC_DOWNLOADED_KEY) || ""; } catch { return ""; } });
  const look = (tag, kids, extra) => tag === "a"
    ? <a className="nx-row-btn nx-pill-card nx-app-pill nx-glass" {...extra}>{kids}</a>
    : <button type="button" className="nx-row-btn nx-pill-card nx-app-pill nx-glass" {...extra}>{kids}</button>;
  const body = (title, sub, icon = Icon.desktop) => (
    <>
      <span aria-hidden="true" className="nx-app-pill-icon">{icon({ c: C.mint, s: 30 })}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="nx-app-pill-title">{title}</span>
        <span className="nx-app-pill-sub">{sub}</span>
      </span>
    </>
  );

  // Приложение для ПК: обновление изнутри
  if (isDesktop) {
    if (!update) return null;
    const mine = st.version === update.version ? st : { state: "idle" };
    const pct = mine.total ? Math.min(100, Math.round((mine.loaded / mine.total) * 100)) : 0;
    const sub = mine.state === "downloading" ? (mine.total && mine.loaded >= mine.total ? "Проверяем подпись…" : `Скачиваем — ${pct}%`)
      : mine.state === "error" ? "Не получилось — нажмите, чтобы повторить"
      : "Нажмите, чтобы обновить";
    return look("button", body(`Вышла NEXA ${update.version}`, sub, Icon.refresh), {
      onClick: () => updStart(update), disabled: mine.state === "downloading",
      "aria-label": `Обновить NEXA до версии ${update.version}`,
    });
  }

  // Сайт: предложить установщик для ПК
  if (!rel) return null;
  const newer = got && versionCode(rel.version) > versionCode(got);
  if (got && !newer) return null;
  return look("a", body(newer ? `Вышла NEXA ${rel.version}` : "Приложение NEXA", newer ? "Скачайте и установите поверх" : "Быстрее и удобнее, чем в браузере"), {
    href: rel.exeUrl || "/nexa-setup.exe", download: "NEXA-setup.exe",
    "aria-label": newer ? `Скачать NEXA ${rel.version} для компьютера` : "Скачать приложение NEXA для компьютера",
    onClick: () => { try { localStorage.setItem(PC_DOWNLOADED_KEY, rel.version); } catch {} setTimeout(() => setGot(rel.version), 1200); },
  });
}

// Предупреждение системы при первом запуске установщика (у NEXA нет платной подписи кода)
const SMARTSCREEN_STEPS = [
  "Скачайте установщик и откройте его",
  "Если появится синее окно «…защитила ваш компьютер» — нажмите «Подробнее», затем «Выполнить в любом случае»",
  "Установка займёт несколько секунд, NEXA откроется сама",
];

export function InstallSettings() {
  const platform = installPlatform();
  // Установщик собран только для ПК с этой системой — на других компьютерах строку не показываем
  const pcRelease = useDesktopRelease(platform === "desktop" && !isDesktop && /Windows/i.test(navigator.userAgent));
  if (platform === "installed") return null;
  return (
    <>
      <SectionTitle>Приложение</SectionTitle>
      <div id="nx-install">
      <SettingsGroup>
        {platform === "android" && (
          <>
            <SettingsRow wrap icon={Icon.phone({ c: C.mint, s: 18 })} title="NEXA на телефоне"
              subtitle="Около 7 МБ, без магазина приложений" right={<ApkButton />} />
            <SettingsRow last icon={Icon.list({ c: C.muted, s: 18 })} title="Как установить" subtitle={<InstallSteps steps={ANDROID_STEPS} />} />
          </>
        )}
        {platform === "ios" && (
          <>
            <SettingsRow icon={Icon.phone({ c: C.mint, s: 18 })} title="NEXA на экране «Домой»"
              subtitle="Откроется как приложение — на весь экран, без адресной строки" />
            <SettingsRow last icon={Icon.list({ c: C.muted, s: 18 })} title="Как добавить" subtitle={<InstallSteps steps={IOS_STEPS} />} />
          </>
        )}
        {platform === "desktop" && pcRelease && (
          <>
            <SettingsRow wrap icon={Icon.laptop({ c: C.mint, s: 18 })} title="NEXA для компьютера"
              subtitle={`Версия ${pcRelease.version}${pcRelease.size ? ` · ${mbText(pcRelease.size)}` : ""} · в трее, уведомления, запуск вместе с компьютером, обновляется сама`}
              right={<a className="nx-primary" href={pcRelease.exeUrl || "/nexa-setup.exe"} download="NEXA-setup.exe"
                style={{ ...btnReset, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: 13, fontWeight: 500, borderRadius: 999, color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`, textDecoration: "none", whiteSpace: "nowrap" }}>
                {Icon.download({ c: C.onFold, s: 14 })} Скачать</a>} />
            <SettingsRow icon={Icon.list({ c: C.muted, s: 18 })} title="Как установить" subtitle={<InstallSteps steps={SMARTSCREEN_STEPS} />} />
          </>
        )}
        {platform === "desktop" && (
          <SettingsRow last wrap icon={Icon.phone({ c: C.mint, s: 18 })} title="Приложение для телефона"
            subtitle="Откройте сайт на телефоне, чтобы установить приложение. Наведите камеру на код"
            right={<QrCode text={(isDesktop ? "https://nexa-link.ru" : window.location.origin) + "/"} size={112} />} />
        )}
      </SettingsGroup>
      </div>
    </>
  );
}

/* Тонкий баннер на Главной: значок, заголовок с подписью, действие и крестик.
   Закрыли — плашка «складывается» и место под ней схлопывается
   (см. .nx-banner-wrap в стилях), после чего вызывается onClosed.
   Без onClose и onClosed крестика нет — баннер закрыть нельзя.
   label — подпись для экранного диктора */
export function SlimBanner({ label, icon, title, sub, action, onClose, onClosed }) {
  const [closing, setClosing] = useState(false);
  const close = () => {
    onClose?.();
    // Без движения (так в системе) — убираем сразу
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) onClosed?.();
    else setClosing(true);
  };
  return (
    // Обёртка схлопывается по высоте — содержимое ниже плавно подтягивается вверх
    <div className={closing ? "nx-banner-wrap is-closing" : "nx-banner-wrap"}
      onAnimationEnd={(e) => { if (closing && e.target === e.currentTarget) onClosed?.(); }}>
    <div className="nx-pop nx-banner" role="region" aria-label={label} style={{
      display: "flex", alignItems: "center", gap: 10, padding: onClose || onClosed ? "10px 8px 10px 12px" : "10px 12px",
      border: `1px solid ${C.borderStrong}`, borderRadius: 18, background: C.bg,
    }}>
      <span style={{ display: "flex", flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.25 }}>{title}</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2, lineHeight: 1.25 }}>{sub}</div>
      </div>
      {action}
      {(onClose || onClosed) && (
        <button type="button" className="nx-icon-btn" onClick={close} aria-label="Скрыть" style={{
          ...btnReset, width: 30, height: 30, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {Icon.close({ c: C.muted, s: 15 })}
        </button>
      )}
    </div>
    </div>
  );
}

/* Баннер наверху Главной (только на телефоне, только в браузере).
   - Уже качали APK, а на сайте версия новее — «Вышла NEXA … · Обновить».
   - Ещё не качали — «Приложение NEXA · Быстрее и удобнее, чем в браузере».
     Нажали «Скачать» — баннер уходит; закрыли крестиком — больше не показываем.
   - Качали последнюю версию — ничего.
   onHowTo — для iPhone: перейти к инструкции в Настройках */
export function InstallBanner({ onHowTo }) {
  const platform = installPlatform();
  const siteUpdate = useSiteApkUpdate(platform === "android");
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(INSTALL_DISMISS_KEY) === "1" || (platform === "android" && !!localStorage.getItem(APK_DOWNLOADED_KEY)); } catch { return false; }
  });
  if (siteUpdate) return <SiteUpdateBanner update={siteUpdate} />;
  if (hidden || (platform !== "android" && platform !== "ios")) return null;
  return (
    <SlimBanner
      label="Установка приложения"
      icon={Icon.phone({ c: C.mint, s: 18 })}
      title="Приложение NEXA"
      sub={platform === "ios" ? "Удобнее с экрана «Домой»" : "Быстрее и удобнее, чем в браузере"}
      action={platform === "android" ? <ApkButton label="Скачать" small onDownload={() => setTimeout(() => setHidden(true), 1200)} /> : (
        <button type="button" className="nx-ghost-btn" onClick={onHowTo} style={{
          ...btnReset, flexShrink: 0, border: `1px solid ${C.borderStrong}`, borderRadius: 999, padding: "7px 14px", fontSize: 13,
        }}>
          Как?
        </button>
      )}
      onClose={() => { try { localStorage.setItem(INSTALL_DISMISS_KEY, "1"); } catch {} }}
      onClosed={() => setHidden(true)}
    />
  );
}

/* Баннер «Вышла новая версия» на сайте — для тех, кто раньше скачал APK.
   «Обновить» скачивает новый файл; закрыли — не показываем до следующей версии */
export function SiteUpdateBanner({ update }) {
  const [hiddenFor, setHiddenFor] = useState(() => {
    try { return localStorage.getItem(UPDATE_DISMISS_KEY); } catch { return null; }
  });
  const [started, setStarted] = useState(false);
  if (hiddenFor === update.version) return null;
  return (
    <SlimBanner
      key={update.version}
      label="Обновление приложения"
      icon={Icon.refresh({ c: C.mint, s: 18 })}
      title={`Вышла NEXA ${update.version}`}
      sub={started ? "Откройте скачанный файл — обновится поверх" : "Скачайте и установите поверх, данные сохранятся"}
      action={<ApkButton label="Обновить" small version={update.version} onDownload={() => setStarted(true)} />}
      onClose={() => { try { localStorage.setItem(UPDATE_DISMISS_KEY, update.version); } catch {} }}
      onClosed={() => setHiddenFor(update.version)}
    />
  );
}

// Кнопки и состояние обновления (общие для Главной, Настроек и экрана «Обновите»)
export function UpdateActions({ update, onLater, big }) {
  const st = useUpdState();
  const mine = st.version === update.version ? st : { state: "idle" };
  const pill = { ...btnReset, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", padding: big ? "12px 22px" : "8px 16px", fontSize: big ? 15 : 13, fontWeight: 500, borderRadius: 999 };
  const primary = (label, onClick, icon = Icon.download) => (
    <button type="button" className="nx-primary" onClick={onClick} style={{ ...pill, border: "1px solid transparent", color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})` }}>
      {icon({ c: C.onFold, s: big ? 16 : 14 })} {label}
    </button>
  );
  const ghost = (label, onClick) => <button type="button" className="nx-ghost-btn" onClick={onClick} style={{ ...pill, fontWeight: 400, border: `1px solid ${C.borderStrong}`, color: C.text }}>{label}</button>;
  const note = (text, color = C.mutedSoft) => <div style={{ fontSize: 13, color, lineHeight: 1.5, marginTop: 10 }}>{text}</div>;
  const row = (...kids) => <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, justifyContent: big ? "center" : "flex-start" }}>{kids}</div>;

  if (mine.state === "downloading") {
    const pct = mine.total ? Math.min(100, Math.round((mine.loaded / mine.total) * 100)) : 0;
    const checking = mine.total && mine.loaded >= mine.total;
    return (
      <div role="status" style={{ marginTop: 12, textAlign: "left" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, color: C.muted }}>
          <span>{checking ? (isDesktop ? "Проверяем подпись — затем NEXA перезапустится новой версией" : "Проверяем файл…") : `Скачиваем — ${pct}%`}</span>
          <span style={{ fontFamily: fontDisplay }}>{mine.total ? `${mbText(mine.loaded)} из ${mbText(mine.total)}` : mbText(mine.loaded)}</span>
        </div>
        <div style={{ height: 4, borderRadius: 10, marginTop: 8, overflow: "hidden", background: `color-mix(in srgb, ${C.text} 10%, transparent)` }}>
          <div style={{ height: "100%", width: `${Math.max(2, pct)}%`, background: `linear-gradient(90deg, ${C.blue}, ${C.mint})`, transition: "width 200ms linear" }} />
        </div>
        {/* На ПК отмены нет: файл маленький, а модуль обновлений Tauri прервать нельзя */}
        {!checking && !isDesktop && row(ghost("Отменить", updateCancel))}
      </div>
    );
  }
  if (mine.state === "error") return (
    <div role="alert">
      {note(mine.error, C.red)}
      {row(primary("Повторить", () => updStart(update), Icon.refresh),
        isDesktop && update.url && ghost("Скачать с сайта", () => openExternal(update.url)),
        onLater && ghost("Позже", onLater))}
    </div>
  );
  if (mine.state === "needPerm") return (
    <div>
      {note("Файл скачан. Чтобы установить его изнутри NEXA, Android должен разрешить ей устанавливать приложения. Нажмите «Открыть настройки», включите «Разрешить установку из этого источника» и вернитесь в NEXA — установка продолжится сама.", C.muted)}
      {row(primary("Открыть настройки", updateOpenSettings, Icon.gear))}
    </div>
  );
  if (mine.state === "installing") return (
    <div>
      {note("Открыто окно Android «Установить?» — нажмите «Установить». Это обычное подтверждение Android, без него обновление не ставится. NEXA перезапустится новой версией, данные сохранятся. Если Google Play Protect предложит проверку — нажмите «Подробнее» → «Установить без проверки» (NEXA ставится не из магазина).", C.muted)}
      {row(ghost("Открыть установщик ещё раз", () => updStart(update)))}
    </div>
  );
  if (mine.state === "signer") return (
    <div role="alert">
      {note("Новая версия подписана другим ключом — Android не поставит её поверх этой. Удалите NEXA и установите заново с сайта; после входа данные аккаунта вернутся из облака.", C.red)}
      {row(primary("Скачать в браузере", () => openUpdate(update.url)))}
    </div>
  );
  return (
    <div>
      {row(primary("Обновить", () => updStart(update)), onLater && ghost("Позже", onLater))}
      {note(isDesktop
        ? "NEXA скачает обновление, проверит подпись и поставит его поверх — потом откроется сама. Данные сохранятся."
        : "Android попросит подтвердить установку в своём окне — данные сохранятся.")}
    </div>
  );
}

// Блок «Доступно обновление»: версия, что нового, кнопки. variant: "home" (плашка) | "settings"
export function UpdateCard({ update, onLater, variant = "home" }) {
  const [more, setMore] = useState(false);
  if (!update) return null;
  const notes = update.notes || [];
  const shown = variant === "home" && !more ? notes.slice(0, 3) : notes;
  return (
    <div className="nx-update-card nx-pop" style={{
      textAlign: "left", padding: variant === "home" ? "16px 18px" : "14px 16px", boxSizing: "border-box",
      border: `1px solid ${variant === "home" ? C.borderStrong : "transparent"}`, borderRadius: variant === "home" ? 18 : 0, background: variant === "home" ? C.panel : "transparent",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 16, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {Icon.refresh({ c: C.mint, s: 18 })}
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 15, fontWeight: 500 }}>Доступно обновление</span>
          <span style={{ display: "block", fontSize: 13, color: C.mutedSoft, marginTop: 2 }}>
            NEXA {update.version}{update.size ? ` · ${mbText(update.size)}` : ""}{update.required ? " · эта версия скоро перестанет работать" : ""}
          </span>
        </span>
      </div>
      {shown.length > 0 && (
        <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 6 }}>
          {shown.map((n, i) => (
            <li key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
              <span aria-hidden="true" style={{ width: 8, height: 1, background: C.mint, marginTop: 9, flexShrink: 0 }} />{n}
            </li>
          ))}
        </ul>
      )}
      {variant === "home" && notes.length > 3 && (
        <button type="button" className="nx-link-btn" onClick={() => setMore((v) => !v)} style={{ ...btnReset, fontSize: 13, color: C.mutedSoft, marginTop: 6 }}>
          {more ? "Свернуть" : `И ещё ${notes.length - 3}`}
        </button>
      )}
      <UpdateActions update={update} onLater={update.required ? null : onLater} />
    </div>
  );
}

/* Экран «Обновите приложение» — в Android-приложении и в приложении для ПК.
   Показывается поверх всего, если версия приложения старше минимальной
   из version.json (update.required): интерфейс виден, но размыт и не нажимается.
   Закрыть нельзя — только скачать новую.
   Без интернета проверка не проходит, и старая версия открывается как обычно */
export function ForceUpdateScreen({ update }) {
  // Макет 2026-10: сверху знак и NEXA, в середине объёмная сцена (тумбы с фото, складкой
  // и папкой), снизу шторка с текстом и кнопкой. Экран непрозрачный — под ним ничего не видно
  return (
    <div className="nx-force-update" role="alertdialog" aria-modal="true" aria-labelledby="nx-force-title" style={{
      position: "fixed", inset: 0, zIndex: 1000, background: C.bg, color: C.text,
      display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", overflow: "hidden",
    }}>
      {/* Лёгкий мятный свет сверху — как в макете */}
      <div aria-hidden="true" style={{ position: "absolute", inset: "0 0 auto 0", height: "45%", pointerEvents: "none",
        background: `radial-gradient(80% 60% at 50% 0%, color-mix(in srgb, ${C.mint} 12%, transparent), transparent 70%)` }} />
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 18, paddingTop: "calc(var(--sat) + 40px)" }}>
        <LogoMark s={44} />
        <Logo bare />
      </div>
      {/* Сцена занимает всё свободное место, низ уходит под шторку */}
      <div style={{ position: "relative", flex: 1, minHeight: 0, width: "100%", display: "flex", justifyContent: "center", alignItems: "flex-end", marginTop: 16 }}>
        {/* ПК: пока без объёмной сцены — свой макет экрана будет позже */}
        {!isDesktop && <img src="/art/update-stage.webp" alt="" draggable={false}
          style={{ height: "100%", maxHeight: 520, width: "auto", maxWidth: "88%", objectFit: "contain", objectPosition: "bottom", marginBottom: -40, pointerEvents: "none" }} />}
      </div>
      <div className="nx-force-sheet" style={{
        position: "relative", width: "100%", maxWidth: 520, boxSizing: "border-box",
        background: C.panel, borderRadius: "36px 36px 0 0", border: `1px solid ${C.border}`, borderBottom: "none",
        padding: "28px 28px calc(var(--sab) + 28px)",
      }}>
        <div id="nx-force-title" className="ng-display" style={{ fontSize: 24, fontWeight: 500, lineHeight: 1.2, marginBottom: 10 }}>Обновите NEXA</div>
        <div style={{ fontSize: 14, color: C.muted, maxWidth: 320, margin: "0 auto", lineHeight: 1.5 }}>
          {`Эта версия NEXA больше не работает. Установите ${update.version} поверх — данные сохранятся.`}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, color: C.muted, margin: "12px 0 18px" }}>
          {/* Щит — данные на месте */}
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
            <path d="M8 1.5 13 3.5v4c0 3.2-2.1 5.6-5 7-2.9-1.4-5-3.8-5-7v-4L8 1.5Z" stroke={C.mint} strokeWidth="1.3" strokeLinejoin="round" />
            <path d="m5.6 8 1.7 1.7 3.2-3.4" stroke={C.mint} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Ваши данные останутся на месте
        </div>
        <div style={{ width: "min(320px, 100%)", margin: "0 auto" }}><UpdateActions update={update} big /></div>
      </div>
    </div>
  );
}
