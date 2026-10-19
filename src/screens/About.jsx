// Экран «О системе»: что умеет NEXA, обновления по версиям, планы.
// При выпуске новой версии добавлять её в ABOUT_UPDATES
import { useEffect } from "react";
import { C, T } from "../ui/theme.js";
import { Icon } from "../ui/icons.jsx";
import { HomeFold } from "../ui/backdrop.jsx";
import { VERSION } from "../version.js";
import { Crumb } from "../ui/layout.jsx";

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
  { icon: Icon.folder, title: "Файлы в облаке", text: "Свои файлы и папки, отправка на другое устройство, фото на весь экран. Без сети загрузки ждут и уходят сами." },
  { icon: Icon.sparkle, title: "ИИ — Ассистент", text: "Отвечает на вопросы, читает файлы (PDF, документы, картинки), выполняет команды: тема, расписание, устройства." },
  { icon: Icon.calendar, title: "Сегодня", text: "Расписание с напоминаниями и погода от Gismeteo. Виджеты на рабочем столе Android." },
  { icon: Icon.refresh, title: "Синхронизация", text: "Аккаунт по почте без пароля: устройства, диалоги, файлы и расписание одинаковые на сайте и в приложении. Без интернета всё работает и досылается потом." },
];

// История обновлений — новые сверху. Добавляя версию, впишите её сюда (и в release-notes.md)
export const ABOUT_UPDATES = [
  { v: "0.11.3", items: ["Новая Главная", "Экран «Все устройства»", "Плавающая нижняя панель"] },
  { v: "0.11.2", items: ["Устройства добавляются сами — достаточно войти в ту же почту"] },
  { v: "0.11.1", items: ["После выхода из аккаунта — снова экран входа"] },
  { v: "0.11.0", items: ["Память ассистента — только то, что вы попросили запомнить", "Новый экран входа"] },
  { v: "0.10.4", items: ["Продолжить диалог или файл на другом своём устройстве", "Ассистент снова отвечает"] },
  { v: "0.10.3", items: ["Центр безопасности: устройства, входы, «Выйти на всех других устройствах»", "Нижняя панель больше не дёргается при смене разделов"] },
  { v: "0.10.2", items: ["Внутреннее обновление: код NEXA разложен по частям — новые функции будут появляться быстрее"] },
  { v: "0.10.1", items: ["Плавная смена разделов без рывков", "Город для погоды — через Яндекс"] },
  { v: "0.10.0", items: ["Экран «О системе»", "Переименование устройства — карандаш у названия", "Снова определение города для погоды"] },
  { v: "0.9.15", items: ["Погода от Gismeteo с подписью источника", "Уведомления — одной кнопкой", "Плавные переходы между разделами"] },
  { v: "0.9.14", items: ["Новый дизайн Главной и экрана устройства", "Новый экран «Обновите NEXA»"] },
  { v: "0.9.13", items: ["«Где устройство?» — на Яндекс Картах"] },
  { v: "0.9.12", items: ["Фото на весь экран", "Настройки уведомлений в аккаунте", "Без выдуманных демо-данных"] },
  { v: "0.9.11", items: ["Ассистент отвечает быстрее"] },
  { v: "0.9.10", items: ["Единый вид всех экранов"] },
  { v: "0.9.9", items: ["Обновление приложения прямо изнутри"] },
  { v: "0.9.8", items: ["Bluetooth-часы и наушники", "Поиск телефона при закрытом приложении"] },
  { v: "0.9.7", items: ["Единые уведомления с переходом к событию"] },
  { v: "0.9.6", items: ["Работа без интернета и честный статус синхронизации"] },
  { v: "0.9.5", items: ["Ассистент читает файлы"] },
  { v: "0.9.4", items: ["Быстрые действия (Ctrl + K)"] },
  { v: "0.9.3", items: ["NEXA Flow — общий буфер"] },
];

// Что в планах — честно «планы», без обещаний сроков. Автор правит этот список
export const ABOUT_PLANS = [
  "Приложение для компьютера: быстрые действия по сочетанию клавиш из любой программы",
  "Передача больших файлов напрямую между устройствами, без облака",
  "Приложение для iPhone",
  "Больше городов для погоды и прогноз по часам",
  "Сценарии: «пришёл домой» — телефон сам отправит файлы на компьютер",
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
  const card = { border: `1px solid ${C.lineBright}`, borderRadius: 28, padding: "22px 24px", background: C.panel, boxSizing: "border-box" };
  const h2 = { fontSize: T.fs.section, fontWeight: 600, margin: "34px 0 14px" };
  return (
    <div className="ng-screen nx-about" style={{ padding: "28px 40px 40px", textAlign: "left", maxWidth: 980 }}>
      <Crumb onClick={onBack}>{Icon.arrowLeft({ c: C.onFold, s: 14 })} Назад</Crumb>

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
        <div aria-hidden="true" style={{ flexShrink: 0 }}><HomeFold size={150} count={0} /></div>
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
        {ABOUT_UPDATES.map((u, i) => (
          <div key={u.v} style={{ display: "flex", gap: 18, padding: "14px 0", borderTop: i ? `1px solid ${C.border}` : "none" }}>
            <div style={{ width: 64, flexShrink: 0, fontSize: 14, fontWeight: 600, color: u.v === VERSION ? C.mint : C.text }}>{u.v}</div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
              {u.items.map((t) => <div key={t}>{t}</div>)}
            </div>
            {u.v === VERSION && <span style={{ alignSelf: "flex-start", fontSize: 11, color: C.mint, border: `1px solid ${C.mint}`, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap" }}>сейчас</span>}
          </div>
        ))}
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
    </div>
  );
}
