// Экран «О системе»: что умеет NEXA, обновления по версиям, планы.
import { useEffect, useState } from "react";
import { C, T } from "../ui/theme.js";
import { Icon } from "../ui/icons.jsx";
import { ABOUT_UPDATES } from "../lib/releaseHistory.js";
import { VERSION } from "../version.js";
import { API_BASE } from "../native.js";
import { BackCrumb } from "../ui/layout.jsx";
import { btnReset } from "../ui/base.jsx";

// Отдельный экран «Активность»: все события и «Очистить» с подтверждением
/* ═══ ЭКРАН «О СИСТЕМЕ» ═══════════════════════════════════════
   Что такое NEXA, что умеет, история обновлений и планы.
   Тексты — здесь, в списках ниже: автор правит их прямо тут.
   Открывается: «Подробнее о системе →» внизу Главной (компьютер и телефон),
   Настройки → «Система» → «О системе», поиск «о системе». «Назад», Esc и кнопка
   «Назад» Android возвращают туда, откуда пришли */
export const ABOUT_FEATURES = [
  { icon: Icon.phone, title: "Устройства вместе", text: "Телефон, компьютер, часы и наушники в одном списке: кто в сети, заряд, память и сеть — только настоящие данные. Подключение по коду или QR, Bluetooth-устройства — через приложение." },
  { icon: Icon.search, title: "Найти и защитить", text: "«Найти» звонит на потерянный телефон, даже если NEXA на нём закрыта. «Где устройство?» показывает место на карте — только если это разрешено на самом устройстве. Экран NEXA можно заблокировать удалённо." },
  { icon: Icon.shareUp, title: "NEXA Flow", text: "Общий буфер: текст и ссылки летят на другое ваше устройство за секунду. Пароли и ключи в историю не сохраняются." },
  { icon: Icon.folder, title: "Файлы в облаке", text: "Свои файлы и папки, фото на весь экран и плеер видео. На другое устройство — через облако или напрямую по Wi-Fi, без облака, до 1 ГБ." },
  { icon: Icon.sparkle, title: "AI-Ассистент", text: "Отвечает на вопросы, читает файлы (PDF, документы, картинки), выполняет команды: тема, расписание, устройства." },
  { icon: Icon.calendar, title: "Сегодня", text: "Расписание с напоминаниями и погода от Gismeteo. Виджеты на рабочем столе Android." },
  { icon: Icon.neuron, title: "NEXA mini-1", text: "Наша собственная нейросеть — работает прямо на устройстве, без интернета. Понимает простые просьбы ассистенту («открой файлы», «тёмная тема», «новая заметка») и дописывает слова в заметках, пока вы печатаете." },
  { icon: Icon.list, title: "Заметки", text: "Заметки с тегами, архивом, чек-листами и фото. Закреплённая — на виджете рабочего стола. ИИ помогает сократить, переписать или продолжить текст." },
  { icon: Icon.refresh, title: "Синхронизация", text: "Аккаунт по почте без пароля: устройства, диалоги, файлы и расписание одинаковые на сайте и в приложении. Без интернета всё работает и досылается потом." },
];


// Что в планах — честно «планы», без обещаний сроков. Автор правит этот список
const UPDATES_SHOWN = 3; // сколько последних версий видно сразу

export const ABOUT_PLANS = [
  "Приложение для iPhone",
];

export function ScreenAbout({ onBack, installed }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || document.querySelector('[role="dialog"], [role="menu"]')) return;
      onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);
  // Обновления: видно последние UPDATES_SHOWN, остальные — по кнопке
  const [allUpdates, setAllUpdates] = useState(false);
  const updates = allUpdates ? ABOUT_UPDATES : ABOUT_UPDATES.slice(0, UPDATES_SHOWN);
  const card = { border: `1px solid ${C.lineBright}`, borderRadius: 28, padding: "22px 24px", background: C.panel, boxSizing: "border-box" };
  const h2 = { fontSize: T.fs.section, fontWeight: 600, margin: "34px 0 14px" };
  return (
    <div className="ng-screen nx-about" style={{ padding: "28px 40px 40px", textAlign: "left", maxWidth: 980, marginInline: "auto" }}>
      <BackCrumb onClick={onBack} />

      {/* Шапка: что это такое */}
      <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap", margin: "26px 0 8px" }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div className="ng-display nx-page-title" style={{ fontSize: T.fs.page, fontWeight: 500, lineHeight: 1.1 }}>О системе</div>
          <div style={{ fontSize: 15, color: C.muted, lineHeight: 1.55, marginTop: 14, maxWidth: 560 }}>
            NEXA объединяет ваши обычные устройства — телефон, компьютер, часы, наушники — в одну систему.
            Видно, что с каждым из них, файлы и текст передаются в пару нажатий, потерянный телефон можно найти,
            а ассистент помогает с делами. Это дипломный проект: всё, что вы видите, — настоящие данные ваших устройств.
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13, color: C.muted }}>
        <span style={{ padding: "6px 14px", borderRadius: 999, border: `1px solid ${C.borderStrong}` }}>Версия {installed || VERSION}</span>
        <span style={{ padding: "6px 14px", borderRadius: 999, border: `1px solid ${C.borderStrong}` }}>Сайт и приложение для Android</span>
      </div>

      {/* Что умеет */}
      <div className="ng-display" style={h2}>Что умеет NEXA</div>
      <div className="nx-about-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {ABOUT_FEATURES.map((f) => (
          <div key={f.title} style={{ ...card, padding: "18px 20px", borderRadius: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: C.mintDark }}>
                {f.icon({ c: C.mint, s: 18 })}
              </span>
              <span style={{ fontSize: 16, fontWeight: 500 }}>{f.title}</span>
            </div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.55, marginTop: 10 }}>{f.text}</div>
          </div>
        ))}
      </div>

      {/* Обновления */}
      <div className="ng-display" style={h2}>Обновления</div>
      <div style={{ ...card, padding: "6px 24px" }}>
        {updates.map((u, i) => (
          <div key={u.v} className="nx-upd-row" style={{ display: "flex", gap: 18, padding: "14px 0", borderTop: i ? `1px solid ${C.border}` : "none" }}>
            <div className="nx-upd-v" style={{ width: 64, flexShrink: 0, fontSize: 14, fontWeight: 600, color: u.v === VERSION ? C.mint : C.text }}>{u.v}</div>
            <div className="nx-upd-items" style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
              {u.items.map((t) => <div key={t}>{t}</div>)}
            </div>
            {u.v === VERSION && <span className="nx-upd-now" style={{ alignSelf: "flex-start", fontSize: 11, color: C.mint, border: `1px solid ${C.mint}`, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap" }}>сейчас</span>}
          </div>
        ))}
        {ABOUT_UPDATES.length > UPDATES_SHOWN && (
          <button type="button" className="nx-ghost-btn nx-upd-more" onClick={() => setAllUpdates((v) => !v)} aria-expanded={allUpdates}
            style={{ ...btnReset, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", margin: "4px 0 14px",
              padding: "10px 16px", borderRadius: 999, border: `1px solid ${C.borderStrong}`, fontSize: 13, color: C.text }}>
            {allUpdates ? "Свернуть" : `Все обновления · ещё ${ABOUT_UPDATES.length - UPDATES_SHOWN}`}
            <span aria-hidden="true" style={{ display: "flex", transform: allUpdates ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 200ms ease" }}>{Icon.chevron({ c: C.muted, s: 13 })}</span>
          </button>
        )}
      </div>

      {/* Планы */}
      <div className="ng-display" style={h2}>В планах</div>
      <div style={{ ...card }}>
        {ABOUT_PLANS.map((p, i) => (
          <div key={p} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0", fontSize: 14, lineHeight: 1.5 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, marginTop: 7, flexShrink: 0, background: i % 2 ? C.blue : C.mint, clipPath: "polygon(0 0, 100% 50%, 0 100%)" }} />
            {p}
          </div>
        ))}
        <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 10 }}>Это планы, а не обещания: порядок и сроки могут меняться.</div>
      </div>

      {/* Какие данные хранит NEXA — страница сайта (в приложениях открывается во внешнем браузере) */}
      <a href={`${API_BASE}/privacy.html`} target="_blank" rel="noopener noreferrer"
        style={{ display: "inline-block", marginTop: 24, fontSize: 14, color: C.muted, textDecoration: "underline", textUnderlineOffset: 4 }}>
        Политика конфиденциальности
      </a>

      {/* Подпись студии — в самом низу страницы */}
      {/* Подпись студии (MadeBy) пока убрана — просьба автора 2026-10-28 */}
    </div>
  );
}

/* «О системе» с экрана входа (до входа в аккаунт): тот же экран поверх экрана входа, своим слоем.
   Esc, «Назад» на экране и «Назад» Android возвращают к входу */
export function GateAbout({ onBack, installed }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onBack(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onBack]);
  return (
    <div className="nx-gate-about nx-scroll" role="dialog" aria-modal="true" aria-label="О системе">
      <div className="nx-home-glow" aria-hidden="true" />
      <div style={{ position: "relative", zIndex: 1 }}>
        <ScreenAbout onBack={onBack} installed={installed} />
      </div>
    </div>
  );
}
