// Общие стили NEXA: темы (цвета обеих тем), шкала размеров, мобильная раскладка, анимации.
// Вставляются один раз блоком <style> в NexaApp. Внутри — только постоянные значения
import { C, NAV_W, PHONE_MQ, DESKTOP_MQ } from "./theme.js";
import { LEAVE_MS } from "../lib/hooks.js";
import { REPLY_AURA_FADE } from "../screens/assistant/visuals.jsx";

export const APP_CSS = `
        /* Отступы под вырез камеры и системную полосу (safe area).
           В Android-приложении Capacitor передаёт их в --safe-area-inset-*,
           в браузере — через env(). Используйте var(--sat) и var(--sab) */
        :root {
          --sat: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
          --sab: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));

          /* ═══ ДИЗАЙН-СИСТЕМА NEXA: размеры, отступы, углы, движение ═══
             Цвета — ниже, в блоках тем (и объект C). Здесь — всё остальное, одно для обеих тем.
             В JS те же числа лежат в объекте T (рядом с C).

             Шрифт: заголовки — Space Grotesk (.ng-display), текст — Raleway, цифры — NexaNumbers.
             Шкала (px): 11 подпись-метка · 12 мелкая подпись · 13 вторичный текст · 14 основной
             · 15 заголовок строки · 16 крупная строка · 18 · 20 · 22 заголовок раздела
             · 24/30 · 40 заголовок экрана (на телефоне 26). Дробные размеры не использовать. */
          --fs-11: 11px; --fs-12: 12px; --fs-13: 13px; --fs-14: 14px; --fs-15: 15px;
          --fs-16: 16px; --fs-22: 22px; --fs-page: 40px;
          /* Отступы — шаг 4: 4, 8, 12, 16, 20, 24, 32, 40 */
          --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 20px; --sp-6: 24px; --sp-8: 32px; --sp-10: 40px;
          /* Углы: поля и мелкие плашки 10, средние карточки 14–16, крупные 18–20, кнопки — таблетки/круги */
          --r-sm: 10px; --r-md: 14px; --r-lg: 18px; --r-pill: 999px;
          /* Нажимаемая область на телефоне — не меньше 44px */
          --tap: 44px;
          /* Движение: быстрое (наведение, нажатие), обычное (появление), медленное (переход экрана) */
          --dur-1: 160ms; --dur-2: 240ms; --dur-3: 420ms;
          --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
        }
        /* В приложении: экран ассистента и панель истории закреплены сверху —
           сдвигаем их под статус-бар, а низ ассистента — над нижней полосой */
        /* Экран начинается с самого верха, а под статус-бар — отступ: так сплошной фон
           закрывает и полосу статус-бара, и линии фона страницы там не торчат обрывками */
        .nx-native .ng-assistant-wrapper { top: var(--vvt, 0px) !important; height: var(--vvh, 100%) !important; padding-top: var(--sat); box-sizing: border-box; }
        @media ${PHONE_MQ} {
        }
        /* Шрифты лежат в public/fonts — так они одинаковые на любом устройстве,
           даже если у человека они не установлены (раньше Raleway брался
           только из системы, и на чужих телефонах подменялся системным) */
        @font-face {
          font-family: 'Raleway';
          src: url('/fonts/Raleway-Variable.ttf') format('truetype');
          font-weight: 100 900;
          font-display: swap;
        }
        @font-face {
          font-family: 'Space Grotesk';
          src: url('/fonts/SpaceGrotesk-Variable.ttf') format('truetype');
          font-weight: 300 700;
          font-display: swap;
        }
        
        @font-face {
        font-family: 'NexaNumbers';
        src: url('/fonts/SpaceGrotesk-Regular.ttf') format('truetype');
        font-weight: 400;
        font-display: swap;
        unicode-range: U+0030-0039;
}
        @font-face {
        font-family: 'NexaNumbers';
        src: url('/fonts/SpaceGrotesk-Medium.ttf') format('truetype');
        font-weight: 500;
        font-display: swap;
        unicode-range: U+0030-0039;
}
        @font-face {
        font-family: 'NexaNumbers';
        src: url('/fonts/SpaceGrotesk-Bold.ttf') format('truetype');
        font-weight: 600 700;
        font-display: swap;
        unicode-range: U+0030-0039;
}

        body, button, input, textarea, select {
          font-family: 'NexaNumbers', 'Raleway', sans-serif;
        }
        * {
       -webkit-tap-highlight-color: transparent;
      }
        button, a, [role="button"] {
        -webkit-tap-highlight-color: transparent;
        -webkit-user-select: none;
        user-select: none;
        -webkit-touch-callout: none;
        touch-action: manipulation;
}
        .ng-display { font-family: 'Space Grotesk', sans-serif; }
        .ng-greeting {
        font-size: 28px !important;
        line-height: 1.3 !important;
        font-weight: 600 !important;
}
        input::placeholder { color: ${C.mutedSoft}; }

        /* ─── Переменные тем ────────────────────────────────────
           Тёмная тема по умолчанию. Светлая включается атрибутом
           data-theme="light" на <html>. Меняешь цвет здесь, и он
           меняется во всём приложении. */
        :root, :root[data-theme="dark"] {
          --bg: #01090F;  --panel: #0E1016;  --panel-2: #12141B;
          --border: #1C1E26;  --border-soft: #22242C;
          --text: #FFFFFF;  --text-strong: #FFFFFF;  --text-soft: #EAF2F7;
          --muted: #92A2AF;  --muted-soft: #6B6B72;
          --blue: #4A6FFF;  --blue-dark: #1A2454;  --blue-light: #7C97FF;
          --mint: #00FFDF;  --mint-dark: #0F3D38;  --mint-light: #7EF0E0;
          --green: #47DE8E;  --red: #DE4747;
          --on-accent: #07080C;  --chip: #2A2C34;
          --glass: rgba(20, 22, 28, 0.92);
          --glass-border: rgba(255, 255, 255, 0.08);
          --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          --hover: rgba(255, 255, 255, 0.05);  --pressed: rgba(255, 255, 255, 0.10);
          --input-glow: 0 0 60px color-mix(in srgb, #4A6FFF 50%, transparent);
          --border-strong: rgba(255, 255, 255, 0.28);
          --line-bright: rgba(255, 255, 255, 0.62);
          /* Свечение фона Главной (макет 2026-10): мятное слева сверху, синее справа */
          --home-glow-a: rgba(0, 180, 160, 0.14); --home-glow-b: rgba(40, 80, 255, 0.12);
          /* Фон Главной (макет 2026-10): от левого верхнего угла к правому нижнему */
          --home-bg-a: #01090F; --home-bg-b: #031B2C;
          /* Экран входа (макет 2026-10): тёмное «стекло» поверх рендера */
          /* Логотип NEXA и карточка «Активность» на телефоне (макет 2026-10: #0D1318) */
          --logo: #FFFFFF; --act-bg: #0D1318;
          --gate-card: rgba(38, 38, 40, 0.72); --gate-text: #ffffff; --gate-muted: rgba(255, 255, 255, 0.66);
          --gate-border: rgba(255, 255, 255, 0.4); --gate-field: rgba(20, 20, 22, 0.55); --gate-field-text: #ffffff; --gate-scene: #070708;
          --scrim: rgba(0, 0, 0, 0.6);
          --on-fold: #FFFFFF;  --photo-bg: #01060A;
          --fold-deep: #0B1F7A;  --fold-blue: #2563FF;  --fold-cyan: #22C7E8;
          --fold-mint: #19E3C8;  --fold-green: #0E8F62;
          /* Грани складки Главной (те же цвета, что в fold.svg) */
          --fold-hf-a1: #0C336D; --fold-hf-a2: #139CB4; --fold-hf-b1: #00FFDF; --fold-hf-b2: #2DD4BF; --fold-hf-c1: #9DB1FD; --fold-hf-c2: #042AA5;
          /* Объёмная складка (FoldArt, SVG автора): грани — --fold-hf-*, свечение и тень под гранями */
          --hf-glow: #0558FF; --hf-shade: #000000;
          color-scheme: dark;
        }
        :root[data-theme="light"] {
          /* Фон мягкий серо-голубой, а не чисто белый: меньше режет глаза.
             Панели чуть светлее фона, поэтому карточки читаются без теней. */
          --bg: #EDF1F5;  --panel: #F8FAFC;  --panel-2: #F1F4F8;
          --border: #D6DDE6;  --border-soft: #E2E7EE;
          /* Текст и подписи темнее, чем были: на светлом фоне серый «тает» */
          --text: #111933;  --text-strong: #0A1024;  --text-soft: #1B2340;
          --muted: #444E63;  --muted-soft: #667085;
          --blue: #4A6FFF;  --blue-dark: #DCE4FF;  --blue-light: #7C97FF;
          --mint: #10BFA8;  --mint-dark: #D3F2EC;  --mint-light: #7EE6D8;
          --green: #1C9E5E;  --red: #D23C3C;
          --on-accent: #07080C;  --chip: #CBD3DE;
          --glass: rgba(248, 250, 252, 0.9);
          --glass-border: rgba(24, 32, 58, 0.10);
          --glass-shadow: 0 6px 20px rgba(24, 32, 58, 0.10);
          --hover: rgba(24, 32, 58, 0.06);  --pressed: rgba(24, 32, 58, 0.12);
          --input-glow: none;
          --border-strong: rgba(24, 32, 58, 0.24);
          --line-bright: rgba(24, 32, 58, 0.34);
          --home-glow-a: rgba(0, 190, 170, 0.12); --home-glow-b: rgba(60, 100, 255, 0.08);
          --home-bg-a: #EDF1F5; --home-bg-b: #D6E4EE;
          /* Экран входа (макет 2026-10): серое «стекло» поверх светлого рендера, текст белый */
          /* Логотип в светлой теме — чёрный (макет); «Активность» — светлая карточка */
          --logo: #05070D; --act-bg: #F6F9FB;
          /* Светлая Главная: панель меню, «стекло» карточек, сплошная «Добавить» */
          --home-side: rgba(255, 255, 255, 0.62); --home-glass: rgba(140, 150, 166, 0.26); --home-glass-line: rgba(255, 255, 255, 0.7);
          --home-add: #F4F7FA; --home-gray: #8C96A6; --on-red: #FFFFFF;
          --gate-card: rgba(128, 128, 128, 0.62); --gate-text: #ffffff; --gate-muted: rgba(255, 255, 255, 0.82);
          --gate-border: rgba(255, 255, 255, 0.45); --gate-field: rgba(230, 230, 230, 0.86); --gate-field-text: #15181f; --gate-scene: #d9d9db;
          --scrim: rgba(10, 16, 36, 0.38);
          --on-fold: #FFFFFF;  --photo-bg: #070B12; /* фото и в светлой теме — на тёмном */
          --fold-deep: #0B1F7A;  --fold-blue: #2563FF;  --fold-cyan: #22C7E8;
          --fold-mint: #19E3C8;  --fold-green: #0E8F62;
          /* Грани складки Главной (те же цвета, что в fold.svg) */
          --fold-hf-a1: #0C336D; --fold-hf-a2: #139CB4; --fold-hf-b1: #00FFDF; --fold-hf-b2: #2DD4BF; --fold-hf-c1: #9DB1FD; --fold-hf-c2: #042AA5;
          /* Объёмная складка (FoldArt): те же цвета — грани полупрозрачны, на светлом фоне сами светлее */
          --hf-glow: #0558FF; --hf-shade: #000000;
          color-scheme: light;
        }
        body { transition: background-color 200ms ease, color 200ms ease; }

        html, body, #root {
        margin: 0; padding: 0; width: 100%; min-height: 100vh;
        background: var(--bg);
        color: var(--text);
}
        body { display: block !important; place-items: unset !important; }
        /* Главная на компьютере: высота почти на всё окно (минус футер
           и отступы), содержимое по центру по вертикали */
        .ng-home-desktop { display: block; }
        .ng-home-mobile { display: none; }

        /* ─── Десктопные показы ─────────────────────────────── */
        .ng-mobile-tabbar { display: none; }
        .ng-hamburger { display: none; }
        /* Главная (компьютер): плашка устройства — рамка 1px, скругление 10px,
           слева ячейка значка, отделённая линией (как в макете) */
        /* ═══ Карточки-«таблетки» мобильной Главной (макет 2026-10) ═══
           Устройство: обводка 1px, заливка цветом статуса — зелёная у тех, что в сети,
           красная у тех, что не в сети (слева гуще, к правому краю тает). */
        .nx-dev-pill {
          display: flex; align-items: center; gap: 8px; min-height: 72px; box-sizing: border-box;
          padding: 10px 14px 10px 12px !important; border-radius: 999px !important; border: 1px solid var(--line-bright) !important;
          background-image: linear-gradient(100deg, color-mix(in srgb, var(--green) 16%, transparent), color-mix(in srgb, var(--green) 3%, transparent) 75%) !important;
        }
        .nx-dev-pill[data-online="0"] { background-image: linear-gradient(100deg, color-mix(in srgb, var(--red) 22%, transparent), color-mix(in srgb, var(--red) 4%, transparent) 75%) !important; }
        .nx-dev-pill.is-add { border-style: dashed !important; background-image: none !important; padding-left: 22px !important; }
        .nx-dev-pill-icon { width: 30px; display: flex; justify-content: center; flex-shrink: 0; }
        /* Точка статуса со свечением (разрешено новым макетом) */
        .nx-status-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 8px 1px currentColor; }
        /* Крупные карточки-таблетки: ассистент, пустой список */
        .nx-pill-card { border: 1px solid var(--line-bright) !important; border-radius: 999px; }
        .nx-ai-pill { display: flex; align-items: center; gap: 14px; min-height: 88px; box-sizing: border-box; padding: 14px 22px 14px 18px !important; border-radius: 999px !important;
          background-image: linear-gradient(100deg, color-mix(in srgb, var(--blue) 10%, transparent), color-mix(in srgb, var(--mint) 6%, transparent)) !important; }
        .nx-act-pill > section { border-color: var(--line-bright) !important; border-radius: 32px !important; padding: 18px 22px 8px !important; }

        /* ═══ Главная, макет 2026-10 (второй вариант) ═══════════════════════
           Компьютер: знак NEXA сверху слева, карточка «Мои устройства» (плашки-таблетки),
           справа объёмная складка и ассистент со свечением, ниже «Активность» во всю ширину.
           Свечение ассистента и фона — по макету автора */
        .ng-home { position: relative; z-index: 1; }
        /* ═══ Главная, макет 2026-10 (второй вариант) ═══════════════════════
           Компьютер: все размеры — в долях макета шириной 1920 px: --mk = ширина окна / 1920
           (от 0,62 до 1,25 px; по высоте — «высота окна / 1080», берётся меньшее: Главная целиком влезает в окно). На любом экране пропорции те же, что на макете, ничего не «раздувается».
           Числа в calc(N * var(--mk)) — размеры прямо из макета */
        :root { --mk: 1px; }
        @media ${DESKTOP_MQ} { :root { --mk: clamp(0.62px, min(100vw / 1920, 100vh / 1080), 1.25px); } }
        /* Фон: градиент из макета (слева сверху → справа снизу) и мягкие мятно-синие пятна */
        .nx-home-glow {
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background: radial-gradient(42vw 38vh at 0% 0%, var(--home-glow-a), transparent 70%),
                      radial-gradient(36vw 40vh at 52% 0%, var(--home-glow-b), transparent 70%),
                      radial-gradient(30vw 28vh at 0% 100%, var(--home-glow-a), transparent 70%),
                      linear-gradient(135deg, var(--home-bg-a), var(--home-bg-b));
        }
        /* Боковое меню на Главной прозрачное — градиент виден и под ним (как в макете) */
        body:has(.nx-home-glow) .ng-sidebar { background: transparent !important; }
        .ng-home { position: relative; z-index: 1; }

        @media ${DESKTOP_MQ} {
          /* Главная занимает всю ширину окна (у других разделов колонка до 1440 px) */
          .ng-main-content:has(.ng-home) { max-width: none !important; }
          .ng-home { padding: calc(58 * var(--mk)) calc(158 * var(--mk)) calc(40 * var(--mk)) calc(74 * var(--mk)) !important; }
        }
        .nx-home-brand-desk { margin: 0 0 calc(52 * var(--mk)); }
        .nx-home-brand-desk > span { gap: calc(40 * var(--mk)) !important; }
        .nx-home-brand-desk > span > svg:first-child { width: calc(58 * var(--mk)) !important; height: auto !important; }
        .nx-home-brand-desk > span > svg:last-child { height: calc(32 * var(--mk)) !important; width: auto !important; }
        .nx-home-eco { font-size: max(12px, calc(20 * var(--mk))); letter-spacing: 0.3em; text-transform: uppercase; color: var(--text); margin-top: calc(18 * var(--mk)); padding-left: calc(3 * var(--mk)); }
        .nx-home-grid { display: grid; grid-template-columns: minmax(0, 1065fr) minmax(0, 505fr); gap: calc(22 * var(--mk)); align-items: stretch; }
        .nx-home-card {
          border: 1px solid var(--line-bright); border-radius: calc(48 * var(--mk)); box-sizing: border-box;
          padding: calc(40 * var(--mk)) calc(42 * var(--mk)) calc(20 * var(--mk));
          background: color-mix(in srgb, var(--panel) 35%, transparent);
        }
        .nx-home-card-title { font-size: max(14px, calc(21 * var(--mk))); margin-bottom: calc(30 * var(--mk)); }
        .nx-home-devices { display: flex; flex-direction: column; min-height: calc(490 * var(--mk)); }
        /* Две плашки и «Добавить» помещаются в карточку высотой 490 из макета — карточка не растёт */
        .nx-home-devices > .nx-stagger { gap: calc(20 * var(--mk)) !important; margin-bottom: calc(20 * var(--mk)); }
        .nx-home-all {
          align-self: center; margin-top: auto; height: calc(41 * var(--mk)); min-height: 30px; box-sizing: border-box;
          padding: 0 calc(16 * var(--mk)) !important; font-size: max(13px, calc(20 * var(--mk))) !important; border-radius: 999px !important;
          border: 1px solid var(--border-strong) !important; background: color-mix(in srgb, var(--text) 8%, transparent) !important; color: var(--text) !important;
        }
        /* Складка поднимается выше карточки устройств (как в макете) — правая колонка не растягивает карточку */
        .nx-home-side { display: flex; flex-direction: column; justify-content: flex-end; gap: calc(42 * var(--mk)); min-width: 0; margin-top: calc(-66 * var(--mk)); }
        .nx-home-fold { flex: 1; display: flex; align-items: center; justify-content: center; pointer-events: none; }
        /* Края картинки растворяются: свечение не обрывается прямоугольником на любом фоне */
        .nx-home-fold-art { height: calc(400 * var(--mk)); width: auto; display: block; user-select: none; overflow: visible; }
        /* Светлая тема: объёмная складка светлее и прозрачнее (макет) — рендер нарисован под тёмный фон */
        /* Светлая Главная (макет 2026-10): белая панель меню, «стеклянные» серые карточки,
           сплошная белая «Добавить устройство», насыщенная заливка «не в сети», ассистент от белого к мятному */
        :root[data-theme="light"] body:has(.nx-home-glow) .ng-sidebar { background: var(--home-side) !important; }
        :root[data-theme="light"] .nx-home-card, :root[data-theme="light"] .nx-home-act > section {
          background: var(--home-glass) !important; border-color: var(--home-glass-line) !important; }
        :root[data-theme="light"] .nx-dev-row.is-add { border-style: solid !important; border-color: transparent !important; background: var(--home-add) !important; }
        :root[data-theme="light"] .nx-dev-row[data-online="0"] { background-image: linear-gradient(100deg, color-mix(in srgb, var(--red) 52%, var(--home-gray)), color-mix(in srgb, var(--red) 34%, var(--home-gray)) 85%) !important; color: var(--on-red) !important; }
        :root[data-theme="light"] .nx-dev-row[data-online="0"] .nx-dev-row-sub { color: color-mix(in srgb, var(--on-red) 78%, transparent) !important; }
        :root[data-theme="light"] .nx-dev-row[data-online="1"] { background-image: linear-gradient(100deg, color-mix(in srgb, var(--green) 30%, var(--home-add)), color-mix(in srgb, var(--green) 12%, var(--home-add)) 85%) !important; }
        :root[data-theme="light"] .nx-ai-glow { background-image: linear-gradient(100deg, var(--home-add) 10%, color-mix(in srgb, var(--mint) 45%, var(--home-add))) !important; }
        /* «Сегодня», «Медиа», «Файлы» на компьютере: во всю ширину окна — содержимое слева (до 1120 px),
           складка прижата к правому краю окна (макет 2026-10) */
        @media ${DESKTOP_MQ} {
          .ng-main-content:has(.nx-media-grid) { max-width: none !important; }
          /* --desk-zoom (theme.js): 1 на ноутбуке, до 1,3 на большом мониторе — содержимое растёт
             пропорционально и заполняет окно, как на макете, а не жмётся в левый верхний угол */
          .nx-media-grid { grid-template-columns: minmax(0, calc(1120px * var(--desk-zoom, 1))) minmax(300px, 1fr) !important; }
          .nx-media-main { zoom: var(--desk-zoom, 1); }
          /* Ассистент на компьютере — фон (спектр) и под боковым меню: без тёмной полосы слева.
             Меню — над ним (прозрачное), содержимое ассистента — правее меню */
          .ng-assistant-wrapper { left: 0 !important; padding-left: ${NAV_W + 1}px; box-sizing: border-box; }
          .ng-sidebar { position: relative; z-index: 6; }
        }
        /* Складка справа на «Сегодня», «Медиа», «Файлах»: крупно, обрезана правым краем окна */
        .nx-media-fold { width: 600px; max-width: none; height: auto; display: block; margin-right: -130px; user-select: none; pointer-events: none; overflow: visible; }

        .nx-home-act { margin-top: calc(35 * var(--mk)); }
        .nx-home-act > section { border-color: var(--line-bright) !important; border-radius: calc(48 * var(--mk)) !important;
          padding: calc(28 * var(--mk)) calc(42 * var(--mk)) calc(18 * var(--mk)) !important; background: color-mix(in srgb, var(--panel) 35%, transparent) !important; }
        .nx-home-act > section > div:first-child > span { font-size: max(14px, calc(20 * var(--mk))) !important; font-weight: 400 !important; }
        .nx-home-act .nx-act-title { font-size: max(13px, calc(19 * var(--mk))) !important; }
        .nx-home-act .nx-act-time { font-size: max(11px, calc(14 * var(--mk))) !important; }
        /* Как в макете: три последних события (вся лента — «Вся активность →») */
        .nx-home-act > section > div:last-child > div:nth-child(n + 4) { display: none !important; }
        .nx-home-act > section > div:last-child > div { padding: calc(10 * var(--mk)) 0 !important; }
        .nx-home-about { font-size: max(12px, calc(14 * var(--mk))) !important; margin-top: calc(26 * var(--mk)); }
        /* Плашка устройства — «таблетка» во всю ширину карточки, заливка цветом статуса */
        .nx-dev-row {
          display: flex; align-items: center; gap: calc(26 * var(--mk)); min-height: max(46px, calc(82 * var(--mk))); box-sizing: border-box;
          padding: 0 calc(34 * var(--mk)) 0 calc(30 * var(--mk)) !important;
          border-radius: 999px !important; border: 1px solid var(--line-bright) !important;
          background-image: linear-gradient(100deg, color-mix(in srgb, var(--green) 14%, transparent), color-mix(in srgb, var(--green) 3%, transparent) 80%) !important;
          transition: border-color 160ms ease;
        }
        .nx-dev-row[data-online="0"] { background-image: linear-gradient(100deg, color-mix(in srgb, var(--red) 22%, transparent), color-mix(in srgb, var(--red) 5%, transparent) 80%) !important; }
        .nx-dev-row:hover { border-color: var(--mint) !important; }
        .nx-dev-row.is-add { border-style: dashed !important; background-image: none !important; }
        .nx-dev-row-icon { width: calc(40 * var(--mk)); display: flex; justify-content: center; flex-shrink: 0; }
        .nx-dev-row-icon svg { height: max(24px, calc(40 * var(--mk))) !important; width: auto !important; }
        .nx-dev-row-name { display: block; font-size: max(14px, calc(22 * var(--mk))); line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nx-dev-row-sub { display: block; font-size: max(11px, calc(12 * var(--mk))); color: var(--muted); margin-top: calc(5 * var(--mk)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nx-dev-row .nx-status-dot { width: max(9px, calc(15 * var(--mk))); height: max(9px, calc(15 * var(--mk))); }
        /* Ассистент: значок и заголовок; на компьютере — сине-мятное свечение вокруг (макет) */
        .nx-ai-pill-icon { width: 46px; height: 46px; border-radius: 50%; flex-shrink: 0; background: var(--mint-dark); display: flex; align-items: center; justify-content: center; }
        .nx-ai-pill-title { display: block; font-size: 20px; font-weight: 500; line-height: 1.2; }
        .nx-ai-glow { min-height: max(60px, calc(96 * var(--mk))) !important; padding: 0 calc(38 * var(--mk)) 0 calc(36 * var(--mk)) !important; gap: calc(18 * var(--mk)) !important;
          box-shadow: 0 0 calc(22 * var(--mk)) color-mix(in srgb, var(--mint) 28%, transparent), 0 0 calc(44 * var(--mk)) color-mix(in srgb, var(--blue) 22%, transparent); }
        .nx-ai-glow .nx-ai-pill-icon { width: max(30px, calc(42 * var(--mk))); height: max(30px, calc(42 * var(--mk))); }
        .nx-ai-glow .nx-ai-pill-title { font-size: max(14px, calc(20 * var(--mk))); font-weight: 400; }
        .nx-ai-glow .nx-ai-pill-sub { font-size: max(11px, calc(12 * var(--mk))) !important; }
        /* Верхняя строка (компьютер): поиск таблеткой, часы, значки — тоже в долях макета */
        /* Поиск-таблетка (макет): значок и слово ровно по центру, одна линия; «стекло» —
           сверху светлее, снизу темнее, светлая тонкая обводка */
        .nx-top-search { display: inline-flex; align-items: center; justify-content: center; gap: calc(12 * var(--mk)); box-sizing: border-box;
          width: calc(241 * var(--mk)); height: max(34px, calc(49 * var(--mk))); padding: 0 !important; line-height: 1;
          border-radius: 999px !important; border: 1px solid color-mix(in srgb, var(--text) 32%, transparent) !important;
          background: linear-gradient(180deg, color-mix(in srgb, var(--text) 18%, transparent), color-mix(in srgb, var(--text) 9%, transparent)) !important;
          box-shadow: inset 0 1px 0 color-mix(in srgb, var(--text) 14%, transparent);
          color: var(--text) !important; font-size: max(14px, calc(20 * var(--mk))) !important; font-family: inherit; cursor: pointer; }
        .nx-top-search svg { display: block; flex-shrink: 0; width: max(14px, calc(19 * var(--mk))); height: max(14px, calc(19 * var(--mk)));
          /* Слово «Поиск» — ровно по центру таблетки: значок вынесен влево на свою ширину и отступ */
          margin-left: calc(-1 * (max(14px, calc(19 * var(--mk))) + calc(12 * var(--mk)))); }
        .nx-top-search:hover { border-color: color-mix(in srgb, var(--text) 50%, transparent) !important; }
        .nx-top-search-icon { display: none; }
        @media ${DESKTOP_MQ} {
          .ng-topbar { gap: calc(46 * var(--mk)) !important; padding: max(20px, calc(40 * var(--mk))) calc(70 * var(--mk)) 0 0 !important; }
          .nx-tb-row :is(.nx-tb-user, .nx-tb-quick, .nx-tb-bell) svg { width: max(18px, calc(28 * var(--mk))) !important; height: max(18px, calc(28 * var(--mk))) !important; }
          .ng-timedate > div:first-child { font-size: max(14px, calc(20 * var(--mk))) !important; }
          .ng-timedate > div:last-child { font-size: max(11px, calc(17 * var(--mk))) !important; }
        }
        /* Телефон (макет 402 px): шапка Главной, поиск, таблетки */
        .nx-home-head { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; margin: 4px -6px 16px; }
        .nx-home-head > :first-child { justify-self: start; }
        .nx-home-search { display: flex !important; align-items: center; justify-content: center; gap: 7px; width: 100%; height: 31px; box-sizing: border-box;
          border-radius: 999px !important; border: 1px solid var(--border-strong) !important; background: color-mix(in srgb, var(--text) 8%, transparent) !important;
          color: var(--text) !important; font-size: 13px; font-family: inherit; cursor: pointer; }
        .nx-home-more { display: flex !important; align-items: center; justify-content: center; width: 100%; margin-top: 18px; min-height: 38px; box-sizing: border-box;
          font-size: 15px; color: var(--text) !important; background: transparent !important; font-family: inherit; cursor: pointer; }
        @media ${PHONE_MQ} {
          /* .nx-tb-fade — во время свайпа строка проявляется / гаснет за пальцем (useTabSwipe) */
          .ng-topbar[data-tab="home"]:not(.nx-tb-fade) { display: none !important; }
          .nx-top-search { display: none !important; }
          .nx-top-search-icon { display: inline-flex; }
          .ng-topbar { gap: 2px !important; }
          /* Все значки шапки одного размера; профиль на телефоне — в нижней панели */
          .ng-topbar :is(.nx-tb-quick, .nx-tb-bell, .nx-top-search-icon) svg, .nx-home-head :is(.nx-tb-quick, .nx-tb-bell) svg { width: 19px !important; height: 19px !important; }
          .ng-topbar .nx-tb-user { display: none !important; }
          /* Карточки ближе к заголовку раздела («Сегодня», «Медиа и файлы»…), но не вплотную */
          .nx-page-gap { height: 18px !important; }
          /* Ассистент: справа в шапке — поиск, уведомления, быстрые действия (общая верхняя строка) */
          .nx-ai-head { padding-right: 112px; padding-top: 11px; } /* на одной линии со значками справа */
          .nx-dev-pill { min-height: 78px; }
          .nx-ai-pill { min-height: 90px; }
          .nx-ai-pill-title { font-size: 19px; }
          .nx-act-pill > section { border-radius: 33px !important; min-height: 140px; padding: 18px 26px 10px !important; background: var(--act-bg) !important; }
          /* Макет: только заголовок «Активность» по центру. Ссылки «Вся активность →» не видно —
             её кнопка растянута невидимой на всю карточку: нажатие в любое место открывает ленту */
          .nx-act-pill > section { position: relative; }
          .nx-act-pill > section > div:first-child { justify-content: center !important; margin-bottom: 8px !important; }
          .nx-act-pill > section > div:first-child > span { font-size: 18px !important; font-weight: 400 !important; }
          .nx-act-pill > section > div:first-child > button { position: absolute !important; inset: 0; z-index: 1; padding: 0 !important; border: 0 !important;
            border-radius: inherit; font-size: 0 !important; color: transparent !important; background: transparent !important; cursor: pointer; -webkit-tap-highlight-color: transparent; }
          .nx-act-pill > section > div:first-child > button:focus-visible { outline: 2px solid var(--mint); outline-offset: 2px; }
          .nx-act-pill > section:active { background: color-mix(in srgb, var(--text) 4%, var(--bg)) !important; }
          .nx-dev-row { min-height: 66px; gap: 14px; padding: 0 20px 0 18px !important; }
          .nx-dev-row-name { font-size: 16px; }
          .nx-dev-row-icon { width: 30px; }
          .nx-dev-row-icon svg { height: 28px !important; }
        }
        /* Экран «Обновите NEXA» всегда тёмный: объёмная сцена из макета нарисована под тёмный фон
           (светлой версии макета нет). Цвета — те же, что у тёмной темы */
        .nx-force-update {
          --bg: #01090F; --panel: #0E1016; --border: #1C1E26; --border-soft: #22242C;
          --text: #FFFFFF; --muted: #92A2AF; --muted-soft: #6B6B72; --mint: #00FFDF; --logo: #FFFFFF;
          --border-strong: rgba(255, 255, 255, 0.28); --line-bright: rgba(255, 255, 255, 0.62);
          --hover: rgba(255, 255, 255, 0.05); --pressed: rgba(255, 255, 255, 0.10); color-scheme: dark;
        }
        .nx-dev-plate { border: 1px solid var(--border-strong) !important; border-radius: 16px !important; background: var(--panel) !important; min-height: 66px; transition: border-color 160ms ease; }
        .nx-dev-plate:hover { border-color: var(--mint) !important; }
        .nx-dev-plate.is-add { border-style: dashed !important; background: transparent !important; }
        .nx-dev-plate-icon { width: 66px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-right: 1px solid var(--border-strong); }
        /* Компьютер, история скрыта: кнопка, которая возвращает колонку */
        .ng-hamburger.is-shown { display: flex !important; }
        .nx-assistant-ver { display: none; }
        .ng-devices-list { display: block; }
        .ng-devices-mobile { display: none; }

        /* Спектральный фон ассистента (AssistantSpectrum): маленький холст,
           растянутый на весь экран. Мягкое свечение и размытие разрешены только
           здесь (см. CLAUDE.md). Без масок и фильтров: середину приглушает сам
           холст, браузеру остаётся только растянуть готовую картинку */
        .nx-spectrum {
          position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0;
          pointer-events: none; display: block;
        }
        /* Складка Главной (HomeFold): грани вращаются вокруг общего сгиба */
        .nx-homefold path { transform-box: view-box; transform-origin: 372px 663px; }
        .nx-homefold.is-intro .f-c { animation: nx-hf-c 860ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        .nx-homefold.is-intro .f-b { animation: nx-hf-b 860ms cubic-bezier(0.16, 1, 0.3, 1) 170ms both; }
        .nx-homefold.is-intro .f-a { animation: nx-hf-a 860ms cubic-bezier(0.16, 1, 0.3, 1) 340ms both; }
        @keyframes nx-hf-c { from { opacity: 0; transform: rotate(-38deg) scale(0.3); } 55% { opacity: 1; } to { opacity: 1; transform: none; } }
        @keyframes nx-hf-b { from { opacity: 0; transform: rotate(32deg) scale(0.3); } 55% { opacity: 1; } to { opacity: 1; transform: none; } }
        @keyframes nx-hf-a { from { opacity: 0; transform: rotate(-26deg) scale(0.35); } 55% { opacity: 1; } to { opacity: 1; transform: none; } }
        /* Новое устройство: грани коротко расходятся от сгиба и возвращаются */
        .nx-homefold.is-pulse .f-c { animation: nx-hp-c 640ms cubic-bezier(0.4, 0, 0.2, 1); }
        .nx-homefold.is-pulse .f-b { animation: nx-hp-b 640ms cubic-bezier(0.4, 0, 0.2, 1) 60ms; }
        .nx-homefold.is-pulse .f-a { animation: nx-hp-a 640ms cubic-bezier(0.4, 0, 0.2, 1) 120ms; }
        @keyframes nx-hp-c { 45% { transform: translate(-22px, -18px) rotate(-3deg); } }
        @keyframes nx-hp-b { 45% { transform: translate(22px, -16px) rotate(3deg); } }
        @keyframes nx-hp-a { 45% { transform: translate(18px, 20px) rotate(-2deg); } }
        /* Грани уступают место картинке с тенями */
        .nx-homefold.is-settle { opacity: 0; transition: opacity 300ms ease; }
        @media (prefers-reduced-motion: reduce) { .nx-homefold path { animation: none !important; } }

        /* Полоска заполнения (место на устройстве, хранилище) — тонкая, 4px */
        .nx-sys-bar {
          display: block; width: 200px; max-width: 100%; height: 4px; margin-top: 8px; overflow: hidden;
          border-radius: 10px; background: color-mix(in srgb, var(--text) 10%, transparent);
        }
        .nx-sys-bar > span { display: block; height: 100%; }
        .nx-sys-bar-wide { width: 100%; }
        .nx-storage-head + .nx-only-mobile .nx-sys-bar-wide { margin-top: 0; }

        /* ─── История диалогов (ChatHistory) ───────────────────
           Компьютер: постоянная колонка слева от чата */
        .nx-hist {
          width: 272px; flex-shrink: 0; min-height: 0; box-sizing: border-box;
          display: flex; flex-direction: column; gap: 10px;
          padding: 28px 16px 18px; border-right: 1px solid var(--border);
          background: color-mix(in srgb, var(--bg) 72%, transparent);
        }
        @media (max-width: 1100px) { .nx-hist { width: 232px; padding: 28px 12px 16px; } }
        /* Колонка истории (компьютер): выезжает слева, а чат плавно сдвигается — анимируем отступ.
           При скрытии — уезжает обратно (is-leaving), потом колонку убирают */
        @keyframes nx-hist-in { from { margin-left: -272px; opacity: 0; } to { margin-left: 0; opacity: 1; } }
        @keyframes nx-hist-out { from { margin-left: 0; opacity: 1; } to { margin-left: -272px; opacity: 0; } }
        .nx-hist-col { animation: nx-hist-in 280ms cubic-bezier(0.16, 1, 0.3, 1); }
        .nx-hist-col.is-leaving { animation: nx-hist-out 220ms cubic-bezier(0.4, 0, 1, 1) forwards; pointer-events: none; }
        @media (prefers-reduced-motion: reduce) { .nx-hist-col, .nx-hist-col.is-leaving { animation: none; } }
        /* Крестик на компьютере — маленький круг */
        @media ${DESKTOP_MQ} { .nx-hist-close { width: 28px !important; height: 28px !important; } }
        .nx-hist-head { display: flex; align-items: center; justify-content: space-between; min-height: 18px; }
        .nx-hist-label { font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--muted-soft); padding-left: 4px; }
        .nx-hist-new {
          display: flex; align-items: center; justify-content: center; gap: 8px; flex-shrink: 0;
          padding: 10px 14px; border: 1px solid var(--border-strong); background: var(--panel);
          color: var(--text); font: inherit; font-size: 14px; cursor: pointer;
        }
        .nx-hist-search {
          display: flex; align-items: center; gap: 8px; flex-shrink: 0; padding: 8px 10px;
          border: 1px solid var(--border); border-radius: 10px; background: var(--panel); cursor: text;
        }
        .nx-hist-search:focus-within { border-color: var(--border-strong); }
        .nx-hist-search input {
          flex: 1; min-width: 0; background: transparent; border: none; outline: none;
          color: var(--text); font: inherit; font-size: 13px; padding: 0;
        }
        .nx-hist-list { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; margin: 0 -4px; padding: 0 4px 4px; }
        .nx-hist-section + .nx-hist-section { margin-top: 10px; }
        .nx-hist-group {
          display: flex; align-items: center; gap: 6px; padding: 6px 10px 3px;
          font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted-soft);
        }
        .nx-hist-row {
          position: relative; display: flex; align-items: center;
          border: 1px solid transparent; border-radius: 10px;
        }
        .nx-hist-row:hover { background: var(--hover); }
        .nx-hist-row.is-active { background: var(--panel); border-color: var(--border); }
        /* Открытый диалог — тонкая мятная грань слева */
        .nx-hist-row.is-active::before {
          content: ""; position: absolute; left: -1px; top: 8px; bottom: 8px; width: 2px; background: var(--mint);
        }
        .nx-hist-open {
          flex: 1; min-width: 0; padding: 7px 4px 7px 10px; text-align: left;
          background: transparent; border: none; color: var(--text); font: inherit; font-size: 14px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;
        }
        .nx-hist-more {
          flex-shrink: 0; width: 28px; height: 28px; margin-right: 2px; padding: 0;
          display: flex; align-items: center; justify-content: center;
          border: none; border-radius: 50%; background: transparent; color: var(--muted); cursor: pointer; opacity: 0;
        }
        /* «⋯» видно при наведении, у открытого диалога и на сенсорных экранах */
        .nx-hist-row:hover .nx-hist-more, .nx-hist-row.is-active .nx-hist-more,
        .nx-hist-more:focus-visible, .nx-hist-more[aria-expanded="true"] { opacity: 1; }
        @media (hover: none) { .nx-hist-more { opacity: 1; } }
        .nx-hist-more:hover, .nx-hist-more[aria-expanded="true"] { background: var(--hover); color: var(--text); }
        .nx-hist-rename {
          flex: 1; min-width: 0; margin: 2px; padding: 5px 8px; outline: none;
          border: 1px solid var(--mint); border-radius: 10px; background: var(--bg); color: var(--text);
          font: inherit; font-size: 14px;
        }
        .nx-hist-empty { padding: 6px 10px; font-size: 13px; line-height: 1.5; color: var(--muted-soft); }
        .nx-hist-sync {
          display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; flex-shrink: 0;
          padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; font-size: 12px; color: var(--muted);
        }
        .nx-hist-account {
          display: flex; align-items: center; gap: 10px; width: 100%; flex-shrink: 0; box-sizing: border-box;
          padding: 9px 10px; border: 1px solid var(--border); border-radius: 18px; background: var(--panel);
          color: var(--text); font: inherit; text-align: left; cursor: pointer;
        }
        .nx-hist-account:hover { border-color: var(--border-strong); }
        .nx-hist-avatar {
          width: 32px; height: 32px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          border: 1px solid var(--border-strong); border-radius: 16px;
        }
        .nx-hist-email { display: block; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .nx-hist-sub { display: block; margin-top: 2px; font-size: 12px; color: var(--muted-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        /* Крестик шторки — круглая кнопка-значок */
        .nx-hist-close {
          width: 36px; height: 36px; padding: 0; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          border: 1px solid var(--border-strong); border-radius: 50%; background: transparent; cursor: pointer;
        }
        .nx-hist-close:active { background: var(--pressed); }
        .nx-hist-scrim { display: none; }
        /* Меню диалога: «Закрепить», «Переименовать», «Удалить» */
        .nx-hist-menu {
          z-index: 400; min-width: 184px; padding: 4px; box-sizing: border-box;
          background: var(--panel); border: 1px solid var(--border-strong); border-radius: 10px;
        }
        .nx-hist-menu > button {
          display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px;
          background: transparent; border: none; border-radius: 10px; color: var(--text);
          font: inherit; font-size: 14px; text-align: left; cursor: pointer;
        }
        .nx-hist-menu > button:hover, .nx-hist-menu > button:focus-visible { background: var(--hover); outline: none; }
        .nx-hist-menu > button.is-danger { color: var(--red); }
        @media (prefers-reduced-motion: reduce) {
          .nx-hist-drawer, .nx-hist-drawer.is-open, .nx-hist-scrim { transition: none !important; }
        }
        
        
        @keyframes ng-screen-in {
  0% {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.ng-screen-anim {
  animation: ng-screen-in 280ms cubic-bezier(0.16, 1, 0.3, 1);
  width: 100%;
  min-height: 100%;
}
  .ng-assistant-anim {
  animation: ng-screen-in 280ms cubic-bezier(0.16, 1, 0.3, 1);
}
  /* Раздел собран свайпом (сосед за краем) — он уже на экране, своё «появление» не проигрывает */
  .nx-panel[data-quiet] .ng-assistant-anim { animation: none !important; }
  /* Переход свайпом: новый раздел коротко въезжает сбоку (200 мс).
     next — пришёл справа (листали влево), prev — слева */
  body[data-swipe="next"] .ng-screen-anim, body[data-swipe="next"] .ng-assistant-anim { animation: nx-swipe-next 320ms cubic-bezier(0.16, 1, 0.3, 1); }
  body[data-swipe="prev"] .ng-screen-anim, body[data-swipe="prev"] .ng-assistant-anim { animation: nx-swipe-prev 320ms cubic-bezier(0.16, 1, 0.3, 1); }
  /* Телефон: горизонтальное движение пальца браузер отдаёт нам (вертикальная
     прокрутка и масштаб — как обычно). Горизонтальные списки — сами по себе */
  @media ${PHONE_MQ} { .ng-screen-anim, .ng-assistant-wrapper { touch-action: pan-y pinch-zoom; } }
  /* «Продолжить здесь?» на телефоне — над нижней панелью (68 px + системная полоса) */
  @media ${PHONE_MQ} { .nx-cont-offer { bottom: calc(76px + var(--sab) + 12px) !important; } body.kb-open .nx-cont-offer { bottom: 12px !important; } }
  /* ─── Экран первого запуска (AuthGate, макет 2026-10) ───────────────────
     Фон — рендер устройств под тему, справа «стеклянная» карточка. Размытие под
     карточкой разрешено только здесь (решение автора, см. CLAUDE.md «Визуальный язык»).
     Внутри карточки подменяем цвета текста и обводок — так шаги кода и входа по QR
     тоже получают вид макета, без отдельной вёрстки */
  .nx-auth-gate { position: fixed; inset: 0; z-index: 900; overflow-y: auto; overscroll-behavior: none; background: var(--gate-scene); color: var(--gate-text); }
  html:has(.nx-auth-gate), html:has(.nx-auth-gate) body { overscroll-behavior: none; }
  .nx-gate-scene { position: fixed; inset: 0; pointer-events: none; }
  .nx-gate-scene img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: left center; user-select: none; }
  :root[data-theme="dark"] .nx-gate-light, :root[data-theme="light"] .nx-gate-dark { display: none; }
  .nx-gate-card {
    --text: var(--gate-text); --muted: var(--gate-muted); --muted-soft: var(--gate-muted); --logo: var(--gate-text);
    --border: var(--gate-border); --border-strong: var(--gate-border); --border-soft: var(--gate-border);
    position: absolute; right: 8.3vw; top: 50%; transform: translateY(-50%);
    width: min(800px, 44vw); min-height: min(800px, 76vh); box-sizing: border-box;
    display: flex; flex-direction: column; justify-content: center;
    padding: clamp(28px, 3.4vw, 66px); border-radius: 56px; text-align: left;
    background: var(--gate-card); color: var(--gate-text);
    border: 1px solid color-mix(in srgb, var(--gate-text) 10%, transparent);
    -webkit-backdrop-filter: blur(28px) saturate(1.15); backdrop-filter: blur(28px) saturate(1.15);
  }
  .nx-gate-mtitle { display: none; }
  .nx-gate-hello { display: flex; flex-direction: column; align-items: center; text-align: center; }
  .nx-gate-logo { display: flex; align-items: center; gap: clamp(20px, 3vw, 64px); }
  .nx-gate-logo svg:first-child { width: clamp(56px, 5vw, 96px); height: auto; }
  .nx-gate-logo svg:last-child { height: clamp(28px, 2.6vw, 50px); width: auto; }
  .nx-gate-text { font-size: clamp(18px, 1.9vw, 36px); line-height: 1.28; margin-top: clamp(28px, 4.5vh, 64px); max-width: 640px; }
  .nx-gate-actions { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: clamp(28px, 5vh, 72px); }
  .nx-gate-enter {
    border: none; cursor: pointer; font-family: inherit; color: var(--on-fold);
    font-size: clamp(16px, 1.5vw, 28px); height: clamp(52px, 5.2vw, 100px); padding: 0 clamp(48px, 5.4vw, 104px); border-radius: 999px;
    background: linear-gradient(90deg, var(--fold-blue), var(--fold-cyan));
  }
  .nx-gate-qr {
    border: 1px solid var(--gate-border); cursor: pointer; background: color-mix(in srgb, var(--gate-text) 6%, transparent);
    width: clamp(52px, 5.2vw, 100px); height: clamp(52px, 5.2vw, 100px); border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
  }
  .nx-gate-qr svg { width: clamp(24px, 2.3vw, 44px); height: clamp(24px, 2.3vw, 44px); }
  .nx-gate-title { font-size: clamp(30px, 3.4vw, 64px); line-height: 1.1; }
  .nx-gate-sub { font-size: clamp(13px, 1vw, 19px); color: var(--gate-muted); margin: 8px 0 clamp(20px, 3.4vh, 44px); }
  .nx-gate-card .nx-input {
    background: var(--gate-field) !important; color: var(--gate-field-text) !important;
    border: 1px solid var(--mint) !important; border-radius: 22px !important;
    font-size: clamp(16px, 1.4vw, 26px) !important; padding: clamp(14px, 1.5vw, 26px) clamp(16px, 1.4vw, 28px) !important;
  }
  .nx-gate-card .nx-input::placeholder { color: color-mix(in srgb, var(--gate-field-text) 55%, transparent); }
  .nx-gate-card .nx-auth-step .nx-primary, .nx-gate-card .nx-auth-step .nx-ghost-btn {
    font-size: clamp(15px, 1.4vw, 26px) !important; min-height: clamp(48px, 5.2vw, 100px) !important;
  }
  .nx-gate-card .nx-auth-or { font-size: clamp(13px, 0.95vw, 18px) !important; }
  .nx-gate-card #nx-auth-hint, .nx-gate-card #nx-auth-code-hint, .nx-gate-card .nx-auth-note { font-size: clamp(13px, 1vw, 19px) !important; }
  .nx-gate-card .nx-auth-step .nx-ghost-btn svg { width: 1.1em; height: 1.1em; }
  .nx-sr-only { position: absolute !important; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  /* Телефон: сверху рендер (сцена с устройствами), снизу — шторка с карточкой */
  @media ${PHONE_MQ} {
    /* Вертикальный рендер на весь экран (gate-*-m.webp), устройства — в верхней половине */
    .nx-gate-scene img { object-position: center top; }
    .nx-gate-card {
      position: relative; right: auto; top: auto; transform: none; width: 100%; min-height: 42vh;
      margin-top: 58vh; border-radius: 32px 32px 0 0; padding: 30px 22px calc(var(--sab) + 28px);
      border-bottom: none; justify-content: flex-start;
    }
    .nx-gate-logo svg:first-child { width: 52px; } .nx-gate-logo svg:last-child { height: 26px; }
    .nx-gate-text { font-size: 17px; margin-top: 16px; }
    /* Телефон: заголовок «Вход в NEXA» вместо знака (макет) */
    .nx-gate-mtitle { display: block; font-size: 32px; line-height: 1.1; }
    .nx-gate-hello .nx-gate-logo { display: none; }
    .nx-gate-actions { margin-top: 26px; }
    .nx-gate-title { font-size: 30px; }
  }
  @keyframes nx-swipe-next { from { opacity: 0; transform: translateX(72px); } to { opacity: 1; transform: none; } }
  @keyframes nx-swipe-prev { from { opacity: 0; transform: translateX(-72px); } to { opacity: 1; transform: none; } }
  /* Без движения — экран просто меняется */
  @media (prefers-reduced-motion: reduce) {
    body[data-swipe] .ng-screen-anim, body[data-swipe] .ng-assistant-anim { animation: none; }
  }
          /* Приветствие: всплывает, цвет перетекает от синего к мятному */
        @keyframes nx-greet-in {
          0%   { opacity: 0; transform: translateY(14px); filter: blur(6px); }
          100% { opacity: 1; transform: translateY(0);    filter: blur(0); }
        }
        @keyframes nx-gradient-flow {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .nx-greeting-anim {
          background: linear-gradient(90deg, var(--text-strong) 0%, var(--blue-light) 30%, var(--mint) 50%, var(--blue-light) 70%, var(--text-strong) 100%);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
          animation: nx-greet-in 700ms cubic-bezier(0.16, 1, 0.3, 1) both,
                     nx-gradient-flow 5s linear infinite;
        }

        /* Новые сообщения мягко появляются снизу */
        @keyframes nx-msg-in {
          0%   { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .nx-msg { animation: nx-msg-in 320ms ease backwards; }

        /* Граница поля ввода перетекает, пока ассистент отвечает */
        @keyframes nx-border-flow {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        /* Скелетон ответа: серые полоски мягко пульсируют прозрачностью.
           Одна анимация, без свечения и градиентов. */
        @keyframes nx-skeleton-pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.45; }
        }
        /* Для тех, у кого в системе отключена анимация */
        /* ─── Плавная смена темы ──────────────────────────────
           Основной способ: View Transitions. Браузер делает снимок
           старого экрана и плавно растворяет его в новом. */
        ::view-transition-old(root),
        ::view-transition-new(root) {
          animation-duration: 380ms;
          animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }
        /* ─── Смена разделов (navTransition) ─────────────────────
           Двигается только область экрана; меню, нижняя панель и шапка — как есть.
           Старый снимок уезжает и тает (200 мс), новый въезжает с той же стороны (320 мс).
           Анимируются только transform и opacity — их рисует видеокарта, без рывков */
        html[data-nav-dir] .ng-main-content { view-transition-name: nx-screen; }
        html[data-nav-dir] .ng-sidebar { view-transition-name: nx-sidebar; }
        /* Ассистент закреплён на всё окно и в общий снимок экрана не попадал — браузер растягивал
           старый экран в новый. Свой снимок с тем же въездом / уходом, что у остальных разделов */
        html[data-nav-dir] .ng-assistant-wrapper { view-transition-name: nx-screen-ai; }
        html[data-nav-dir]::view-transition-group(nx-screen-ai) { animation: none; }
        /* Нижняя панель и строка синхронизации закреплены поверх экрана. Без своих снимков
           они попадали в общий снимок страницы, а он лежит ПОД уезжающим экраном —
           экран наезжал на панель и прятал её фон. Свои снимки рисуются над экраном и стоят на месте */
        html[data-nav-dir] .ng-mobile-tabbar { view-transition-name: nx-tabbar; }
        html[data-nav-dir] .nx-sync-status { view-transition-name: nx-syncbar; }
        html[data-nav-dir]::view-transition-group(nx-tabbar),
        html[data-nav-dir]::view-transition-group(nx-syncbar) { animation: none; z-index: 10; }
        html[data-nav-dir]::view-transition-old(nx-tabbar),
        html[data-nav-dir]::view-transition-old(nx-syncbar) { animation: none; opacity: 0; }
        html[data-nav-dir]::view-transition-new(nx-tabbar),
        html[data-nav-dir]::view-transition-new(nx-syncbar) { animation: none; }
        html[data-nav-dir]::view-transition-old(root), html[data-nav-dir]::view-transition-new(root) { animation: none; }
        html[data-nav-dir]::view-transition-group(nx-screen) { animation-duration: 320ms; }
        html[data-nav-dir="next"]::view-transition-old(nx-screen), html[data-nav-dir="next"]::view-transition-old(nx-screen-ai) { animation: nx-vt-out-left 200ms cubic-bezier(0.4, 0, 1, 1) both; }
        html[data-nav-dir="next"]::view-transition-new(nx-screen), html[data-nav-dir="next"]::view-transition-new(nx-screen-ai) { animation: nx-vt-in-right 320ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        html[data-nav-dir="prev"]::view-transition-old(nx-screen), html[data-nav-dir="prev"]::view-transition-old(nx-screen-ai) { animation: nx-vt-out-right 200ms cubic-bezier(0.4, 0, 1, 1) both; }
        html[data-nav-dir="prev"]::view-transition-new(nx-screen), html[data-nav-dir="prev"]::view-transition-new(nx-screen-ai) { animation: nx-vt-in-left 320ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        html[data-nav-dir="fade"]::view-transition-old(nx-screen), html[data-nav-dir="fade"]::view-transition-old(nx-screen-ai) { animation: nx-vt-fade-out 180ms ease both; }
        html[data-nav-dir="fade"]::view-transition-new(nx-screen), html[data-nav-dir="fade"]::view-transition-new(nx-screen-ai) { animation: nx-vt-fade-in 260ms ease both; }
        @keyframes nx-vt-out-left { to { opacity: 0; transform: translateX(-48px); } }
        @keyframes nx-vt-out-right { to { opacity: 0; transform: translateX(48px); } }
        @keyframes nx-vt-in-right { from { opacity: 0; transform: translateX(64px); } }
        @keyframes nx-vt-in-left { from { opacity: 0; transform: translateX(-64px); } }
        @keyframes nx-vt-fade-out { to { opacity: 0; } }
        @keyframes nx-vt-fade-in { from { opacity: 0; } }
        /* Въезжающий сбоку экран (запасной путь) не должен вылезать за край окна —
           иначе мелькает горизонтальная прокрутка и страница вздрагивает */
        .ng-main-content { overflow-x: clip; }
        /* Запасной способ для браузеров без View Transitions:
           на время смены у всех элементов плавно меняются цвета */
        .nx-theme-anim, .nx-theme-anim *, .nx-theme-anim *::before, .nx-theme-anim *::after {
          transition: background-color 380ms ease, color 380ms ease,
                      border-color 380ms ease, fill 380ms ease, stroke 380ms ease !important;
        }

        /* Светлая тема: тёмный текст на светлом фоне выглядит тоньше, чем
           светлый на тёмном. Делаем весь текст чуть плотнее, отключаем
           «утончающее» сглаживание, а самые тонкие цифры — потолще */
        :root[data-theme="light"] body {
          font-weight: 500;
          -webkit-font-smoothing: auto;
          -moz-osx-font-smoothing: auto;
        }
        :root[data-theme="light"] .nx-weather-value { font-weight: 400 !important; }

        /* В светлой теме карточки настроек чуть светлее фона страницы */
        :root[data-theme="light"] .nx-set-group { background: var(--panel); }
        /* ─── Глобальный поиск ─────────────────────────────── */
        .nx-search-row:hover { background-color: var(--hover) !important; }
        .nx-search-row:focus-visible { outline: 1px solid var(--mint); outline-offset: -2px; }
        /* ─── Уход окон: поиск, быстрые действия, колокольчик (useLeave) ─── */
        @keyframes nx-pop-out { to { opacity: 0; transform: translateY(-6px) scale(0.98); } }
        @keyframes nx-fade-in-k { from { opacity: 0; } }
        @keyframes nx-fade-out-k { to { opacity: 0; } }
        .nx-leaving { animation: nx-pop-out ${LEAVE_MS}ms cubic-bezier(0.4, 0, 1, 1) forwards !important; pointer-events: none; }
        .nx-fade-in { animation: nx-fade-in-k 180ms ease; }
        .nx-fade-leaving { animation: nx-fade-out-k ${LEAVE_MS}ms ease forwards; pointer-events: none; }
        /* Смена вкладки в окне подключения: подсветка переезжает, содержимое въезжает сбоку */
        .nx-seg-thumb { transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes nx-tab-r { from { opacity: 0; transform: translateX(18px); } }
        @keyframes nx-tab-l { from { opacity: 0; transform: translateX(-18px); } }
        .nx-tab-in-right { animation: nx-tab-r 240ms cubic-bezier(0.16, 1, 0.3, 1); }
        .nx-tab-in-left { animation: nx-tab-l 240ms cubic-bezier(0.16, 1, 0.3, 1); }
        /* Карта «где устройство»: в тёмной теме подложка затемнена, подписи — шрифтом NEXA */
        .nx-map { font-family: inherit; }
        /* Открыто окно — страница под ним стоит */
        html.nx-modal-open, html.nx-modal-open body { overflow: hidden !important; overscroll-behavior: none; }
        .nx-viewer, .nx-quick-overlay, .nx-search-overlay { overscroll-behavior: contain; }
        @media (prefers-reduced-motion: reduce) {
          .nx-leaving, .nx-fade-in, .nx-fade-leaving, .nx-tab-in-right, .nx-tab-in-left { animation: none !important; }
          .nx-seg-thumb { transition: none; }
        }
        /* ─── Панель быстрых действий (QuickPanel) ─────────── */
        .nx-quick-overlay {
          position: fixed; inset: 0; z-index: 400; box-sizing: border-box;
          display: flex; align-items: flex-start; justify-content: center; padding: 12vh 20px 20px;
          background: color-mix(in srgb, var(--bg) 75%, transparent);
        }
        .nx-quick-panel {
          width: min(560px, 100%); max-height: calc(100vh - 12vh - 20px); box-sizing: border-box;
          display: flex; flex-direction: column; overflow: hidden; text-align: left;
          background: var(--panel); border: 1px solid var(--border-strong); border-radius: 18px;
        }
        .nx-quick-step {
          display: flex; align-items: center; gap: 8px; padding: 10px 14px 0 10px;
          font-size: 13px; color: var(--muted);
        }
        .nx-quick-search { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--border); }
        .nx-quick-search input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: var(--text); font: inherit; font-size: 15px; padding: 0; }
        .nx-quick-kbd { font-size: 10px; letter-spacing: 0.06em; color: var(--muted-soft); border: 1px solid var(--border); border-radius: 10px; padding: 2px 6px; font-family: inherit; }
        .nx-quick-list { overflow-y: auto; overscroll-behavior: contain; padding: 6px; }
        .nx-quick-row {
          position: relative; display: flex; align-items: center; gap: 12px; min-height: 48px;
          padding: 7px 12px; border-radius: 14px; cursor: pointer; box-sizing: border-box;
        }
        /* Выбранное действие: подложка и мятная грань слева */
        .nx-quick-row.is-sel { background: var(--hover); }
        .nx-quick-row.is-sel::before { content: ""; position: absolute; left: 0; top: 10px; bottom: 10px; width: 2px; background: var(--mint); }
        .nx-quick-row:active { background: var(--pressed); }
        /* Недоступная строка (например, формат файла не поддерживается) */
        .nx-quick-row.is-off { cursor: default; }
        .nx-quick-row.is-off .nx-quick-title, .nx-quick-row.is-off .nx-quick-ico { opacity: 0.5; }
        .nx-quick-row.is-off:active { background: var(--hover); }
        .nx-quick-ico {
          width: 34px; height: 34px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          border: 1px solid var(--border); border-radius: 10px; overflow: hidden;
        }
        .nx-quick-title { display: block; font-size: 14px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nx-quick-sub { display: block; margin-top: 2px; font-size: 12px; color: var(--muted-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nx-quick-note { margin: 6px 12px 8px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 12px; line-height: 1.5; color: var(--muted-soft); }
        .nx-quick-foot {
          display: flex; justify-content: space-between; gap: 12px; padding: 9px 16px;
          border-top: 1px solid var(--border); font-size: 12px; color: var(--muted-soft);
        }
        /* Телефон: панель сверху на всю ширину, в пределах видимой области
           (над клавиатурой), строки крупнее — под палец */
        @media ${PHONE_MQ} {
          .nx-quick-overlay { padding: calc(var(--vvt, 0px) + var(--sat) + 10px) 10px 10px; }
          .nx-quick-panel { width: 100%; max-height: calc(var(--vvh, 100vh) - var(--sat) - 20px); }
          .nx-quick-search { padding: 8px 8px 8px 16px; }
          .nx-quick-search input { font-size: 16px; }
          .nx-quick-row { min-height: 56px; padding: 8px 12px; }
          .nx-quick-title { font-size: 15px; }
          .nx-quick-sub { font-size: 13px; }
        }
                /* ─── Системные уведомления (тосты) ──────────────────
           Плашка сверху справа, как системное уведомление телефона:
           иконка NEXA, заголовок, текст, крестик закрытия. */
        @keyframes nx-toast-in  { from { opacity: 0; transform: translateY(-14px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes nx-toast-out { to   { opacity: 0; transform: translateY(-8px) scale(0.98); } }
        .nx-toast-host {
          position: fixed; top: 16px; right: 16px; z-index: 500;
          display: flex; flex-direction: column; gap: 10px;
          width: 380px; max-width: calc(100vw - 32px);
          pointer-events: none;
        }
        .nx-toast {
          pointer-events: auto;
          background: var(--glass);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--glass-border);
          border-radius: 18px;
          padding: 12px 12px 12px 14px;
          display: flex; align-items: flex-start; gap: 12px;
          box-shadow: var(--glass-shadow);
          animation: nx-toast-in 260ms cubic-bezier(0.16, 1, 0.3, 1);
          touch-action: none; /* смахивание вверх (toasts.jsx) — страница под ним не прокручивается */
        }
        /* Разговор с ассистентом: точка «слушаю» мягко дышит — видно, что микрофон включён */
        @keyframes nx-conv-breath { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.5); opacity: 0.55; } }
        .nx-conv-dot.is-live { animation: nx-conv-breath 1.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .nx-conv-dot.is-live { animation: none; } }
        .nx-toast-icon {
          width: 34px; height: 34px; flex-shrink: 0; border-radius: 50%;
          background: linear-gradient(135deg, var(--blue-dark), var(--mint-dark));
          border: 1px solid color-mix(in srgb, var(--mint) 27%, transparent);
          display: flex; align-items: center; justify-content: center;
        }
        .nx-toast-body { flex: 1; min-width: 0; padding-top: 1px; text-align: left; }
        .nx-toast-title { font-size: 14px; font-weight: 500; line-height: 1.3; }
        .nx-toast-text {
          font-size: 13px; color: var(--muted); margin-top: 2px; line-height: 1.4;
          overflow: hidden; text-overflow: ellipsis;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        }
          .nx-toast-close {
          background: transparent; border: none; padding: 4px;
          cursor: pointer; flex-shrink: 0; display: flex; color: var(--muted);
          align-self: center;
        }
        @media ${PHONE_MQ} {
          .nx-toast-host {
            top: calc(var(--sat) + 10px);
            left: 10px; right: 10px; width: auto;
          }
        }
        @media ${PHONE_MQ} {
          .nx-search-overlay { padding: 6vh 12px 12px !important; }
          .nx-search-panel input { font-size: 16px !important; }
        }

        /* ─── Медиа и Файлы ─────────────────────────────────── */
        /* Блок мягко появляется: подробности хранилища, окно файла, список папки */
        @keyframes nx-pop-in {
          0%   { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .nx-pop { animation: nx-pop-in 220ms cubic-bezier(0.16, 1, 0.3, 1); }
        /* Ассистент на компьютере: справа закреплено меню (Новый диалог / Поиск /
           История) — сообщения пользователя не должны заезжать под него */
        @media ${DESKTOP_MQ} { .nx-msg-list { padding-right: 170px !important; } }
        /* «Раскрытие складкой»: элементы списка появляются по очереди —
           каждый чуть повёрнут от верхнего края и разворачивается к нам.
           Работает один раз при появлении (не повторяется).
           backwards, а не both: после анимации transform свободен,
           и нажатие/наведение на кнопки работают как обычно */
        @keyframes nx-unfold {
          from { opacity: 0; transform: perspective(700px) rotateX(-16deg) translateY(10px); }
          to   { opacity: 1; transform: none; }
        }
        .nx-stagger > * { animation: nx-unfold 560ms cubic-bezier(0.16, 1, 0.3, 1) backwards; transform-origin: 50% 0; }
        ${Array.from({ length: 14 }, (_, i) => `.nx-stagger > *:nth-child(${i + 2}) { animation-delay: ${(i + 1) * 45}ms; }`).join("\n        ")}
        /* Капли дождя: наклонены как складка, три раза пролетают вниз и замирают */
        .nx-drop { transform: rotate(28deg); transform-origin: 50% 0; }
        @keyframes nx-drop-fall {
          0%   { transform: rotate(28deg) translateY(-26px); opacity: 0; }
          25%  { opacity: 1; }
          100% { transform: rotate(28deg) translateY(30px); opacity: 0; }
        }
        .nx-drop { animation: nx-drop-fall 1100ms cubic-bezier(0.5, 0, 0.9, 0.6) 3; }
        @media (prefers-reduced-motion: reduce) { .nx-drop { animation: none !important; } }
        /* Баннер установки. Закрытие: плашка отклоняется от верхнего края и тает
           (как складка), а место под ней схлопывается */
        .nx-banner-wrap { display: grid; grid-template-rows: 1fr; margin-top: 18px; }
        .nx-banner-wrap > .nx-banner { min-height: 0; overflow: hidden; }
        @keyframes nx-banner-fold {
          to { opacity: 0; transform: perspective(600px) rotateX(-70deg) scale(0.96); }
        }
        @keyframes nx-banner-collapse {
          to { grid-template-rows: 0fr; margin-top: 0; }
        }
        .nx-banner-wrap.is-closing { animation: nx-banner-collapse 320ms cubic-bezier(0.4, 0, 0.2, 1) 180ms forwards; }
        .nx-banner-wrap.is-closing > .nx-banner {
          transform-origin: 50% 0;
          animation: nx-banner-fold 300ms cubic-bezier(0.4, 0, 1, 1) forwards;
        }
        /* Расписание: корзина видна при наведении на дело (на телефоне — всегда) */
        .nx-sched-del { opacity: 0; transition: opacity 160ms ease, background-color 160ms ease; }
        .nx-sched-item:hover .nx-sched-del, .nx-sched-del:focus-visible { opacity: 1; }
        @media (hover: none) { .nx-sched-del { opacity: 1; } }
        /* Значок часов у поля времени — под цвет темы */
        :root[data-theme="dark"] input[type="time"] { color-scheme: dark; }
        :root[data-theme="light"] input[type="time"] { color-scheme: light; }
        /* Запуск: интерфейс один раз проявляется — только прозрачность и небольшой
           сдвиг снизу. Без размытия и масштаба: всё чёткое на каждом кадре */
        @keyframes nx-intro {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: none; }
        }
        #root { animation: nx-intro 650ms cubic-bezier(0.16, 1, 0.3, 1); }
        /* В приложении: ждём, пока уйдёт заставка Android, и только тогда проявляемся */
        .nx-intro-wait #root { animation: none; opacity: 0; }
        .nx-intro-go #root { animation: nx-intro 750ms cubic-bezier(0.16, 1, 0.3, 1); }
        @media (prefers-reduced-motion: reduce) { #root, .nx-intro-go #root { animation: none; } .nx-intro-wait #root { opacity: 1; } }
        /* Аура нового диалога: по центру за приветствием и полем ввода.
           Края растворяются маской (не размытие). Приближение — по фокусу/тексту */
        .nx-aura {
          position: absolute; left: 50%; top: 50%; width: min(1120px, 150vw); height: 660px;
          pointer-events: none; z-index: 0;
          -webkit-mask-image: radial-gradient(ellipse 50% 50% at 50% 50%, black 30%, transparent 72%);
          mask-image: radial-gradient(ellipse 50% 50% at 50% 50%, black 30%, transparent 72%);
          opacity: 0.8; transform: translate(-50%, -50%) scale(1);
          transition: opacity 700ms ease, transform 900ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .nx-aura.is-active { opacity: 1; transform: translate(-50%, -50%) scale(1.06); }
        :root[data-theme="light"] .nx-aura { opacity: 0.38; }
        :root[data-theme="light"] .nx-aura.is-active { opacity: 0.55; }
        /* Появление: каждая грань разворачивается из центра складки, по очереди */
        @keyframes nx-aura-in {
          from { opacity: 0; transform: scale(0.35) rotate(-14deg); }
          to   { opacity: 1; transform: none; }
        }
        .nx-aura-facet { animation: nx-aura-in 1100ms cubic-bezier(0.16, 1, 0.3, 1) backwards; }
        /* Аура за ответом: слева внизу списка, за новым сообщением */
        .nx-reply-aura-pos {
          position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 0; pointer-events: none;
          transition: left 500ms cubic-bezier(0.16, 1, 0.3, 1), top 500ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .nx-reply-aura {
          position: absolute; left: -310px; top: -180px; width: 620px; height: 360px;
          pointer-events: none;
          -webkit-mask-image: radial-gradient(ellipse 50% 50% at 40% 55%, black 25%, transparent 72%);
          mask-image: radial-gradient(ellipse 50% 50% at 40% 55%, black 25%, transparent 72%);
          filter: blur(30px); opacity: 0.7; transform-origin: 30% 70%;
          transition: opacity ${REPLY_AURA_FADE}ms ease, transform ${REPLY_AURA_FADE}ms cubic-bezier(0.16, 1, 0.3, 1), filter ${REPLY_AURA_FADE}ms ease;
        }
        :root[data-theme="light"] .nx-reply-aura { opacity: 0.45; }
        /* Испаряется: разрастается, сильнее размывается и тает */
        .nx-reply-aura.is-fading { opacity: 0 !important; transform: scale(1.25) translateY(-20px); filter: blur(60px); }
        @keyframes nx-reply-aura-in {
          from { opacity: 0; transform: scale(0.6) rotate(-10deg); }
          to   { opacity: 1; transform: none; }
        }
        .nx-reply-aura-in { transform-origin: 47% 56%; animation: nx-reply-aura-in 800ms cubic-bezier(0.16, 1, 0.3, 1) backwards; }
        @media ${PHONE_MQ} { .nx-reply-aura { width: 440px; height: 300px; left: -220px; top: -150px; } }
        @media (prefers-reduced-motion: reduce) {
          .nx-reply-aura-in { animation: none !important; }
          .nx-reply-aura { transition: opacity 300ms ease !important; }
          .nx-reply-aura-pos { transition: none !important; }
          .nx-reply-aura.is-fading { transform: none; filter: blur(30px); }
        }
        /* Размытие граней (исключение из правил, см. CLAUDE.md) */
        .nx-aura-blur { filter: blur(34px); }
        @media ${PHONE_MQ} { .nx-aura { width: 520px; height: 400px; top: var(--aura-y, 50%) !important; } .nx-aura-blur { filter: blur(24px); } }
        @media (prefers-reduced-motion: reduce) {
          .nx-aura-facet { animation: none !important; }
          .nx-aura { transition: none !important; }
        }
        /* Все кнопки — скруглённые: кнопки с текстом — «таблетки», кнопки-значки — круги.
           Скошенные чипсы пути (складка), строки списков и карточки не трогаем */
        .nx-ghost-btn, .nx-primary, .nx-icon-btn, .nx-action { border-radius: 999px !important; }
        /* Палец больше курсора: на сенсорном экране у маленьких кнопок-значков
           и переключателей невидимая зона нажатия растёт до ~44px (--tap).
           Сама кнопка и раскладка не меняются — ::after выходит за края */
        @media (pointer: coarse) {
          .nx-icon-btn:not([style*="position"]), .nx-toggle:not([style*="position"]) { position: relative; }
          .nx-icon-btn::after, .nx-toggle::after { content: ""; position: absolute; inset: -5px; }
          .nx-toggle::after { inset: -10px -2px; }
          /* Полноэкранное фото: на сенсорном экране листают свайпом. Стрелки у краёв
             ловили палец в начале свайпа — там их нет */
          .nx-photo-arrow { display: none !important; }
        }
        /* Градиент — на всю кнопку вместе с рамкой. Иначе под прозрачной рамкой 1px
           браузер повторяет градиент с другого края: по бокам видны тонкие полоски
           чужого цвета (голубая слева, синяя справа) */
        .nx-primary, [style*="linear-gradient"] { background-origin: border-box !important; }
        /* Стрелка в строке чуть шагает вправо при наведении — «можно перейти» */
        .nx-chev { display: flex; transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1); }
        .nx-row-btn:hover .nx-chev { transform: translateX(3px); }
        /* Полоски "где хранится" вырастают слева направо */
        @keyframes nx-bar-in { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .nx-bar { transform-origin: left; animation: nx-bar-in 420ms cubic-bezier(0.16, 1, 0.3, 1); }
        /* Поиск устройства: квадратные волны расходятся от устройства
           и гаснут. Две волны на каждый из трёх сигналов, потом стоп */
        @keyframes nx-ping {
          from { transform: scale(1); opacity: 0.9; }
          to   { transform: scale(2.6); opacity: 0; }
        }
        .nx-ping {
          position: absolute; left: 50%; top: 50%;
          width: 76px; height: 76px; margin: -38px 0 0 -38px;
          box-sizing: border-box; border: 1.5px solid var(--mint); border-radius: 10px;
          opacity: 0; pointer-events: none;
          animation: nx-ping 1200ms cubic-bezier(0.16, 1, 0.3, 1) 2 both;
        }
        /* Подключение устройства: по серой складке один раз проходит
           мятная полоса — показывает, что идёт поиск связи */
        @keyframes nx-scan {
          from { transform: translateX(-140px) skewX(-18deg); opacity: 0; }
          20%  { opacity: 1; }
          80%  { opacity: 1; }
          to   { transform: translateX(140px) skewX(-18deg); opacity: 0; }
        }
        .nx-scan { animation: nx-scan 1400ms cubic-bezier(0.4, 0, 0.2, 1) 1 both; }
        /* Иконка устройства проявляется при подключении */
        @keyframes nx-icon-on {
          from { opacity: 0.3; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
        .nx-icon-on { animation: nx-icon-on 420ms cubic-bezier(0.16, 1, 0.3, 1) 1; }
        /* ═══ ЕДИНАЯ СИСТЕМА СОСТОЯНИЙ ═══════════════════════════
           Все нажимаемые элементы ведут себя одинаково:
             hover    — лёгкая подложка (--hover) или чуть ярче;
             pressed  — подложка плотнее (--pressed), элемент «вдавливается»;
             focus    — мятная рамка (управление с клавиатуры);
             disabled — бледный, не реагирует;
             loading  — aria-busy: не бледнеет, курсор «ждите».
           Чтобы новая кнопка вела себя так же, дай ей один из классов:
             nx-row-btn   — строка списка        nx-ghost-btn — кнопка с рамкой
             nx-icon-btn  — кнопка-иконка        nx-primary   — главная (градиент)
             nx-cat-card  — карточка             nx-link-btn  — текстовая ссылка
             nx-crumb, nx-seg-btn — скошенные складки (путь и хранилище)
           Состояния loading / success / error / empty — компоненты
           StateButton, StateNote и EmptyState. */
        .nx-row-btn, .nx-ghost-btn, .nx-icon-btn, .nx-primary, .nx-cat-card, .nx-link-btn, .nx-crumb {
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease,
                      transform 120ms ease, filter 160ms ease, opacity 200ms ease;
        }
        /* hover */
        .nx-row-btn:hover, .nx-ghost-btn:hover, .nx-icon-btn:hover { background-color: var(--hover) !important; }
        .nx-cat-card:hover { border-color: var(--muted-soft) !important; }
        .nx-link-btn:hover { color: var(--text) !important; }
        .nx-primary:hover, .nx-crumb:hover, .nx-seg-btn:hover { filter: brightness(1.12); }
        /* pressed */
        .nx-row-btn:active, .nx-ghost-btn:active, .nx-icon-btn:active { background-color: var(--pressed) !important; }
        .nx-ghost-btn:active, .nx-icon-btn:active, .nx-primary:active, .nx-cat-card:active { transform: scale(0.97); }
        .nx-row-btn:active { transform: scale(0.99); }
        .nx-primary:active, .nx-crumb:active, .nx-seg-btn:active { filter: brightness(0.9); }
        /* focus — рамка для управления с клавиатуры */
        .nx-row-btn:focus-visible, .nx-ghost-btn:focus-visible, .nx-icon-btn:focus-visible,
        .nx-primary:focus-visible, .nx-cat-card:focus-visible, .nx-link-btn:focus-visible {
          outline: 1px solid var(--mint); outline-offset: 2px;
        }
        /* Загрузка файла: полоска один раз заполняется слева направо */
        @keyframes nx-upload { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .nx-upload-bar { transform-origin: left; animation: nx-upload linear 1 both; }
        /* Поле ввода (название устройства): в фокусе рамка мятная, при ошибке остаётся красной */
        .nx-input { transition: border-color 160ms ease; }
        /* «Устройство ищут»: квадратные волны расходятся от центра */
        .nx-find-wave { animation: nx-find-wave 1.8s ease-out infinite; opacity: 0; }
        @keyframes nx-find-wave { from { transform: rotate(45deg) scale(0.5); opacity: 0.9; } to { transform: rotate(45deg) scale(1.25); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .nx-find-wave { animation: none; opacity: 0.5; } }
        /* Блок «Связь устройств»: три колонки на компьютере */
        .nx-msg-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); align-items: stretch; }
        /* Приложение: на самом верху страница не «пружинит» сама — у нас свой жест обновления.
           Только на html (вся страница)! На body нельзя: body у нас — отдельный
           прокручиваемый слой, и запрет на нём обрывает прокрутку страницы */
        html.nx-native { overscroll-behavior-y: contain; }
        /* Дни над расписанием: скруглённые плашки (не «таблетки»), подсветка при наведении */
        .nx-day-chip { transition: border-color 160ms ease; }
        /* «Сегодня» (макет 2026-10): дни — скруглённые квадраты с яркой обводкой, карточки погоды — радиус 40 */
        .nx-day-chip { border-radius: 14px !important; }
        .nx-day-chip[aria-selected="false"] { border-color: var(--line-bright) !important; }
        .nx-weather { border-radius: 40px !important; border-color: var(--line-bright) !important; }
        .nx-sched-add-row { display: none !important; }
        @keyframes nx-tb-flash { 0% { transform: scale(1); filter: none; } 35% { transform: scale(1.18); filter: drop-shadow(0 0 5px var(--mint)); color: var(--mint); } 100% { transform: scale(1); filter: none; } }
        @keyframes nx-tb-ring { 0%, 100% { transform: rotate(0); } 20% { transform: rotate(14deg); } 40% { transform: rotate(-11deg); } 60% { transform: rotate(7deg); } 80% { transform: rotate(-4deg); } }
        @keyframes nx-tb-nod { 0%, 100% { transform: translateY(0); } 35% { transform: translateY(-3px); } 65% { transform: translateY(1px); } }
        .nx-tb-quick svg, .nx-tb-bell svg, .nx-tb-user svg { transition: transform 160ms ease; }
        .nx-tb-bell svg { transform-origin: 50% 12%; }
        @media (prefers-reduced-motion: no-preference) {
          @media (hover: hover) {
            .nx-tb-quick:hover svg { animation: nx-tb-flash 520ms ease-out; }
            .nx-tb-bell:hover svg { animation: nx-tb-ring 620ms ease-in-out; }
            .nx-tb-user:hover svg { animation: nx-tb-nod 520ms ease-in-out; }
          }
          .nx-tb-quick:focus-visible svg, .nx-tb-quick:active svg { animation: nx-tb-flash 520ms ease-out; }
          .nx-tb-bell:focus-visible svg, .nx-tb-bell:active svg { animation: nx-tb-ring 620ms ease-in-out; }
          .nx-tb-user:focus-visible svg, .nx-tb-user:active svg { animation: nx-tb-nod 520ms ease-in-out; }
        }
        /* Микрофон ассистента во время диктовки: мятная подложка и мягко «дышащее» кольцо */
        .nx-mic.is-on { background: color-mix(in srgb, var(--mint) 16%, transparent) !important; border-radius: 50%; }
        .nx-mic.is-on::after { content: ""; position: absolute; inset: -3px; border-radius: 50%; border: 1px solid var(--mint); opacity: 0.6; animation: nx-mic-pulse 1.6s ease-in-out infinite; pointer-events: none; }
        @keyframes nx-mic-pulse { 0%, 100% { transform: scale(0.92); opacity: 0.25; } 50% { transform: scale(1.08); opacity: 0.7; } }
        @media (prefers-reduced-motion: reduce) { .nx-mic.is-on::after { animation: none; opacity: 0.6; } }
        /* Во время диктовки подпись под полем видна и при открытой клавиатуре */
        body.kb-open .ng-disclaimer.nx-voice-line { display: flex !important; }
        /* «Медиа» (макет 2026-10): лента недавних без рамок — подсветка при наведении */
        .nx-recent-row:hover { background: var(--hover); }
        .nx-month-day:hover:not([aria-pressed="true"]) { background: var(--hover) !important; }
        /* Полоса дней листается пальцем — полоса прокрутки под ней не нужна.
           Двойной класс: общее правило .nx-scroll (тонкая полоса) стоит ниже и иначе перебивает */
        .nx-day-strip.nx-scroll { scrollbar-width: none; }
        .nx-day-strip.nx-scroll::-webkit-scrollbar { display: none; }
        .nx-day-chip[aria-selected="false"]:hover { border-color: var(--mint) !important; }
        /* Колонки разделены тонкой линией, как строки в списке устройств */
        .nx-link-col + .nx-link-col { border-left: 1px solid ${C.border}; }
        .nx-inbox-list > .nx-inbox-item:first-child { border-top: none !important; }
        /* Колонки не раздвигаются длинным текстом — он переносится или обрезается */
        .nx-link-grid > * { min-width: 0; }
        /* Строка синхронизации аккаунта: на компьютере — внизу слева, у боковой панели */
        .nx-sync-status { left: ${NAV_W + 20}px; bottom: 20px; }
        /* Боковое меню: подсветка при наведении и заметный фокус с клавиатуры */
        .nx-nav-btn:not([aria-current]):hover { background: color-mix(in srgb, var(--text) 12%, transparent) !important; }
        .nx-nav-btn:focus-visible { outline: 2px solid var(--mint); outline-offset: 3px; }
        .nx-input:focus:not([aria-invalid="true"]) { border-color: var(--mint) !important; }
        /* У сегментов и чипсов края срезаны, рамку не видно — подчёркиваем подпись */
        .nx-seg-btn:focus-visible, .nx-crumb:focus-visible { outline: none; text-decoration: underline; }
        /* Складка хранилища: без прямоугольной рамки фокуса — с клавиатуры она просто ярче */
        .nx-sf:focus { outline: none; }
        .nx-sf:focus-visible { filter: brightness(1.25); }
        /* disabled — нельзя нажать */
        :is(.nx-row-btn, .nx-ghost-btn, .nx-icon-btn, .nx-primary, .nx-cat-card, .nx-link-btn):disabled {
          opacity: 0.45; cursor: default !important; transform: none !important;
          filter: none !important; background-color: transparent !important;
        }
        .nx-primary:disabled { background-color: initial !important; }
        /* loading — кнопка занята, но не бледнеет */
        :is(.nx-ghost-btn, .nx-primary)[aria-busy="true"] { opacity: 1; cursor: progress !important; }

        /* Индикатор загрузки: у квадрата крутится одна мятная грань */
        @keyframes nx-spin { to { transform: rotate(360deg); } }
        .nx-spin { animation: nx-spin 800ms linear infinite; }
        /* Ошибка: элемент один раз коротко вздрагивает */
        @keyframes nx-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); } 75% { transform: translateX(4px); }
        }
        .nx-shake { animation: nx-shake 260ms ease 1; }
        /* Строка пути прокручивается, но свой скроллбар не рисует:
           вместо него тонкая полоска под чипсами */
        .nx-no-scrollbar { scrollbar-width: none; }
        /* Блоки только для телефона (на телефоне становятся flex-строкой) */
        .nx-only-mobile { display: none; }
        @media ${PHONE_MQ} { .nx-hide-mobile { display: none !important; } }
        @media ${PHONE_MQ} { .nx-only-mobile { display: flex !important; } }
        .nx-no-scrollbar::-webkit-scrollbar { display: none; }
        /* Складка справа на "Медиа" и "Файлах" — только на широком экране */
        /* На средних экранах складки уже — подписи на них чуть мельче */
        @media (max-width: 1360px) {
          .nx-seg-label span { font-size: 10.5px !important; }
        }
        /* Прогноз на 2 недели: на широком экране — панель справа (.nx-fc-aside),
           на узком — список под кнопкой (.nx-fc-inline). Стрелка кнопки:
           на узком при открытии смотрит вниз, на широком — влево («закрыть») */
        .nx-fc-chev { transition: transform 200ms ease; }
        .nx-fc-chev.is-open { transform: rotate(90deg); }
        @media (min-width: 1101px) {
          .nx-fc-inline { display: none; }
          .nx-today-grid.is-fc { grid-template-columns: minmax(0, 1fr) minmax(0, 356px) minmax(0, 330px) !important; column-gap: 28px !important; }
          .nx-fc-chev.is-open { transform: rotate(180deg); }
        }
        /* Панель выезжает слева направо — из-под колонки погоды */
        @keyframes nx-fc-in {
          from { opacity: 0; transform: translateX(-14px); }
          to   { opacity: 1; transform: none; }
        }
        .nx-fc-slide { animation: nx-fc-in 260ms cubic-bezier(0.16, 1, 0.3, 1); }
        @media (prefers-reduced-motion: reduce) { .nx-fc-slide { animation: none; } }
        @media (max-width: 1100px) {
          .nx-fc-aside { display: none !important; }
          .nx-media-grid { grid-template-columns: minmax(0, 1fr) !important; }
          .nx-media-art { display: none !important; }
        }

        @media (prefers-reduced-motion: reduce) {
          .nx-greeting-anim, .nx-msg { animation: none !important; }
          .nx-pop, .nx-bar { animation: none !important; }
          .nx-stagger > * { animation: none !important; }
          .nx-chev { transition: none !important; }
          .nx-tab-move { transition: none !important; }
          .nx-ping, .nx-scan { display: none; }
          .nx-icon-on, .nx-shake { animation: none !important; }
          /* Разрыв без движения: грани сразу встают на место, меняется только цвет */
          .nx-facet { transition: background 200ms ease !important; }
          .nx-spin { animation-duration: 2400ms; }
          .nx-row-btn:active, .nx-ghost-btn:active, .nx-icon-btn:active,
          .nx-primary:active, .nx-cat-card:active { transform: none; }
        }

        /* ─── Фирменный скроллбар NEXA ──────────────────────── */
        /* Мятный ползунок везде: у страницы и у всех прокручиваемых блоков.
           scrollbar-color передаётся по наследству, поэтому хватает html —
           и новые блоки сами получат мятный ползунок */
        html {
          scrollbar-color: color-mix(in srgb, var(--mint) 70%, transparent) transparent;
        }
        .nx-scroll { scrollbar-width: thin; }
        /* Для браузеров, которые не понимают scrollbar-color (старый Safari) */
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, var(--mint) 70%, transparent);
          border-radius: 999px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: var(--mint);
          background-clip: padding-box;
        }

        /* ─── Планшет ──────────────────────────────────────── */
        @media (max-width: 960px) {
          .ng-home-grid { grid-template-columns: 1fr !important; }
          .ng-cat-grid { grid-template-columns: repeat(2, 1fr) !important; }
          /* Пятая категория («Другое») — во всю ширину под четырьмя */
          .ng-cat-grid > :nth-child(5) { grid-column: 1 / -1; }
        }

        /* ─── Мобильный ────────────────────────────────────── */
                @media ${PHONE_MQ} {
          /* Навигация */
          .ng-sidebar { display: none !important; }
          .ng-home-desktop { display: none !important; }
          .ng-home-mobile { display: block !important; }
          .ng-mobile-tabbar { display: block !important; }
          .ng-hamburger { display: flex !important; }
          .ng-menu-block { display: none !important; }

          /* Отступ снизу под таб-панель */
          .ng-main-content { padding-bottom: 110px; }

          /* Скрыть время/дату */
          .ng-timedate { display: none !important; }

          /* Все заголовки-дисплеи меньше */
          .ng-display { font-size: 20px !important; } /* заголовок раздела на телефоне; заголовок экрана — 24px, ниже */
          .ng-display.nx-home-hero { font-size: 24px !important; } /* главный заголовок Главной — крупнее разделов */

          /* Экран настроек на телефоне */
          .ng-display.nx-section-title { font-size: 20px !important; margin-bottom: 10px !important; }
          .nx-settings-search { display: none !important; }
          .nx-pair-body { flex-direction: column; align-items: flex-start !important; }
          .nx-pair-or { display: none !important; }
          /* Связь устройств — одной колонкой */
          .nx-msg-grid { grid-template-columns: 1fr !important; }
          .nx-quick-actions { grid-template-columns: 1fr 1fr !important; }
          /* Длинные подписи («Заблокировать экран») переносятся, а не обрезаются */
          .nx-quick-actions > button { white-space: normal !important; text-align: center; line-height: 1.25; padding: 9px 10px !important; }
          .nx-link-col + .nx-link-col { border-left: none !important; border-top: 1px solid ${C.border}; }
          /* Строка синхронизации — над нижней панелью */
          .nx-sync-status { left: 16px !important; bottom: calc(var(--sab) + 96px) !important; }
          /* Строка с переключателем темы: переключатель уходит под текст
             и растягивается на всю ширину, чтобы ничего не обрезалось */
          .nx-set-row { padding: 12px 14px !important; gap: 12px !important; }
          .nx-set-icon { width: 36px !important; height: 36px !important; }
          .nx-set-title { font-size: 15px !important; }
          .nx-set-sub { font-size: 13px !important; }
          /* Переключатель темы уходит на отдельную строку под текстом
             и растягивается на всю ширину карточки */
          .nx-set-row-wrap { flex-wrap: wrap; row-gap: 12px !important; }
          .nx-set-row-wrap .nx-set-right { flex-basis: 100%; }
          .nx-set-row-wrap .nx-seg { width: 100%; }
          .nx-seg button { padding: 10px 0 !important; font-size: 14px !important; }
          .nx-settings-head { margin-bottom: 20px !important; }
          .nx-set-group { margin-bottom: 22px !important; }

          /* Единый padding для всех экранов */
          .ng-screen {
            max-width: 100% !important;
            overflow-x: hidden !important;
            box-sizing: border-box !important;
            padding: 16px 16px 24px !important;
          }

           /* Складка меньше */
          .ng-fold-wrapper img {
            width: 140px !important;
            height: 140px !important;
          }
          .ng-home-hero {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
          }
          .ng-home-hero-text { flex: 1 !important; min-width: 0 !important; }
          .ng-home-hero-art { flex-shrink: 0 !important; }

           /* ─── Логотип NEXA — опустить и уменьшить ──────────── */
  .ng-home-logo {
    margin-top: 12px !important;
    margin-bottom: 20px !important;
  }
  .ng-home-logo img {
    height: 20px !important;
    margin: 0 !important;
  }
  .ng-home-logo > div {
    font-size: 10px !important;
    letter-spacing: 0.12em !important;
    margin-top: 2px !important;
  }

          /* Дисклеймер с переносом */
          .ng-disclaimer {
            white-space: normal !important;
            max-width: 100% !important;
            padding: 0 8px !important;
            line-height: 1.4 !important;
          }

          /* Заголовок страницы в одну строку с иконками поиска и профиля.
             Справа оставляем место под эти иконки, подзаголовок прячем */
          .ng-display.nx-page-title {
            /* 24px: «Медиа и файлы» помещается в одну строку рядом с четырьмя значками */
            font-size: 24px !important; line-height: 1.15 !important;
            margin: 12px 0 20px !important;
            padding-right: 168px; /* место под молнию, колокольчик, поиск и профиль */
          }
          /* Панель уведомлений на телефоне — по ширине экрана */
          .nx-notes { position: fixed !important; top: 70px !important; left: 12px !important; right: 12px !important; width: auto !important; }
          .nx-page-sub { display: none !important; }

          /* Хранилище: те же складки в один ряд, только меньше.
             Заголовок "Хранилище" стоит над карточкой (.nx-storage-head) */
          .nx-storage-label { display: none !important; }
          .ng-crumbs > button { height: 34px !important; font-size: 13px !important; padding: 0 20px 0 18px !important; }
          .nx-storage-box { padding: 14px 14px !important; margin-bottom: 28px !important; border-radius: 40px !important; }
          .ng-cat-grid .nx-cat-card { border-radius: 48px !important; height: 112px !important; padding: 14px 20px 16px 24px !important; }
          .ng-storage-folds { height: 92px !important; }
          /* Подпись ближе к левому краю складки, чтобы поместилась в узкие */
          .ng-storage-folds .nx-seg-label span:nth-child(1) { font-size: 10.5px !important; }
          .ng-storage-folds .nx-seg-label span:nth-child(2) { font-size: 10px !important; }
          /* «Документы» и «Музыка» на узкой ленте стояли в одной строке и налезали —
             подпись музыки опускаем ниже, в нижнюю часть её грани */
          .ng-storage-folds .nx-seg-label[data-cat="music"] { top: 60% !important; }
          .ng-storage-folds .nx-seg-label span:nth-child(3) { display: none !important; }

          /* ─── Сегодня на телефоне ─── */
          /* Блоки друг под другом: погода, расписание, завтра, прогноз */
          .nx-today-grid {
            grid-template-columns: minmax(0, 1fr) !important;
            grid-template-areas: "sched" "now" "next" "month" !important;
            grid-template-rows: auto !important;
            gap: 28px !important;
          }
          /* Карточка погоды на телефоне — как на компьютере (заголовок, дата,
             город, температура и состояние в строку, детали с разделителями),
             только отступы внутри чуть меньше */
          .nx-weather { padding: 18px 20px !important; border-radius: 32px !important; }
          /* Расписание — карточка (макет 2026-10): заголовок по центру, под днями «Календарь» и «+ Добавить» */
          .nx-sched { border-radius: 32px !important; padding: 16px 16px 20px !important; }
          .nx-sched-head { font-size: 17px !important; margin-bottom: 12px !important; justify-content: center; }
          .nx-sched-add-top { display: none !important; }
          .nx-sched-add-row { display: flex !important; }
          .nx-sched .nx-day-chip { min-width: 44px !important; padding: 6px 8px 5px !important; }
          .nx-sched .nx-day-chip span:first-child { font-size: 10px !important; }
          .nx-sched .nx-day-num { font-size: 20px !important; }
          .nx-sched-tools button { font-size: 12px !important; padding: 6px 10px !important; }
          .nx-sched-head > svg { display: none; } /* только значок календаря, плюс в кнопке остаётся */
          .nx-sched-list { --dot-x: 62px !important; } /* 46 время + 4 отступ + 12 половина кружка */
          .nx-sched-item {
            grid-template-columns: 46px 24px minmax(0, 1fr) !important;
            grid-template-areas: "time dot box" !important;
            column-gap: 4px !important;
          }
          .nx-sched-time { align-self: center; margin-bottom: 0 !important; font-size: 13px !important; }
          .nx-sched-title { font-size: 15px !important; }
          .nx-sched-form input { font-size: 16px !important; } /* iPhone не приближает страницу */
          .nx-sched-hint { visibility: hidden; } /* Enter/Esc на телефоне не нужны — место под кнопки остаётся */
          .nx-sched-until { margin-bottom: 16px !important; }
          /* Файлы: поиск под путём на всю ширину, список без своей прокрутки */
          .nx-files-top { flex-direction: column !important; align-items: stretch !important; gap: 18px !important; }
          .nx-files-search { width: 100% !important; margin-top: 0 !important; }
          .nx-files-search input { font-size: 16px !important; }
          /* Кнопки "Новая папка" / "Добавить файл" — под заголовком, поровну */
          .nx-files-head { flex-direction: column; align-items: stretch !important; }
          .nx-files-actions > button { flex: 1 1 0; padding: 11px 12px !important; }
          /* «Передать на…»: на телефоне только значок, кнопка покрупнее для пальца */
          .nx-transfer-label { display: none; }
          .nx-transfer-btn { padding: 9px !important; }
          /* Экран устройства: сцена ниже, статус и настройки одной колонкой */
          .nx-device-stage { height: 360px !important; border-radius: 32px !important; }
          .nx-device-photo { left: 8% !important; height: 104% !important; }
          .nx-dev-card { border-radius: 28px !important; padding: 18px !important; }
          /* На телефоне складка шире — за устройством, по центру сцены */
          .nx-device-fold { width: 86% !important; left: 7% !important; margin-top: calc(86% * -0.35) !important; }
          .nx-device-info { grid-template-columns: minmax(0, 1fr) !important; }
          .nx-device-title { font-size: 24px !important; } /* как заголовок экрана */
          /* Фон на телефоне: на весь экран, грани в обоих углах — поменьше
             и бледнее, чтобы не спорить с текстом на узком экране */
          .nx-backdrop { left: 0 !important; }
          .nx-bd-tl, .nx-bd-br { opacity: 0.75; }
          .nx-backdrop svg { width: 210px; height: 188px; }
          /* Номера строк сетки слева на узком экране налезают на заголовки */
          .nx-bd-row { display: none; }
          .nx-files-list { max-height: none !important; min-height: 0 !important; overflow: visible !important; padding-right: 0 !important; }
          /* Подробности хранилища: кнопка "Открыть в файлах" на всю ширину */
          .nx-storage-detail { gap: 16px !important; }
          .nx-storage-detail > button { width: 100%; text-align: center !important; padding: 12px 14px !important; }

          /* Окно просмотра файла на телефоне — шторка снизу */
          .nx-viewer { align-items: flex-end !important; padding: 0 !important; }
          .nx-viewer-panel {
            width: 100% !important;
            max-height: 90vh !important;
            border-left: none !important;
            border-right: none !important;
            border-bottom: none !important;
            padding-bottom: var(--sab);
          }
          .nx-viewer-preview > div { height: 180px !important; }
          .nx-viewer-actions > button { flex: 1 1 auto; justify-content: center; }

          /* Крошки в файлах */
          .ng-crumbs {
            justify-content: flex-start !important;
            white-space: nowrap !important;
          }

          /* Ассистент: переписке — всё место между шапкой и полем ввода.
             Снизу запас ровно под нижнюю панель: она плавает (64 px + отступ 10 px
             + системная полоса --sab) + 6 px. Клавиатура открыта — панели нет, запас минимальный */
          .ng-assistant-wrapper { left: 0 !important; }
          .ng-assistant-inner {
            --chat-bottom: calc(80px + var(--sab));
            padding: 8px 14px var(--chat-bottom) 14px !important;
          }
          body.kb-open .ng-assistant-inner { --chat-bottom: 6px; }
          /* Шапка: одна строка «ИИ — Ассистент», версия мелко рядом, без описания */
          .ng-assistant-inner .nx-assistant-title {
            font-size: 20px !important; line-height: 1.2 !important;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          }
          .nx-assistant-ver {
            display: inline !important; margin-left: 6px;
            font-family: 'NexaNumbers', 'Raleway', sans-serif; font-size: 11px; font-weight: 400; color: var(--muted-soft); letter-spacing: 0;
          }
          .ng-assistant-inner .nx-assistant-subtitle { display: none !important; }
          .ng-hamburger { width: 40px; height: 40px; margin-left: -8px; }
          /* Переписка вплотную к шапке и полю ввода; сообщения чуть плотнее */
          .nx-chat-area { margin: 6px 0 0 !important; }
          .nx-msg-col { gap: 14px !important; padding-bottom: 22px !important; }
          /* Закреплённая область ввода: фон экрана и мягкий переход в переписку
             сверху — последние строки не обрываются на краю. Переход не ловит
             нажатия, а внизу переписки под него оставлен запас (padding выше) */
          /* Подложка — на всю ширину экрана и вниз до самой нижней панели
             (тот же запас --chat-bottom), чтобы не было краёв и полос */
          .nx-chat-dock {
            position: relative; gap: 4px !important;
            margin: 0 -14px calc(-1 * var(--chat-bottom));
            padding: 0 14px calc(2px + var(--chat-bottom)) !important;
            background: var(--bg);
          }
          .nx-chat-dock::before {
            content: ""; position: absolute; left: 0; right: 0; bottom: 100%; height: 22px;
            background: linear-gradient(to top, var(--bg), transparent);
            pointer-events: none;
          }
          /* Сине-мятная обводка поля остаётся, внешнее свечение на телефоне убираем */
          .nx-input-ring { box-shadow: none !important; }
          .ng-disclaimer { font-size: 11px !important; }
          /* Клавиатура открыта — подпись под полем убираем: место нужнее переписке */
          body.kb-open .ng-disclaimer { display: none !important; }
          /* …и быстрые вопросы по файлу: при клавиатуре место нужнее переписке */
          body.kb-open .nx-file-asks { display: none !important; }

          /* История — шторка слева на 85% ширины, поверх нижней панели.
             Высота — видимая область (над клавиатурой, когда пишем в поиск) */
          .nx-hist-drawer {
            position: fixed; top: var(--vvt, 0px); left: 0; height: var(--vvh, 100%);
            width: 85%; max-width: 380px; margin: 0; z-index: 310;
            padding: calc(var(--sat) + 18px) 14px calc(var(--sab) + 12px);
            background: var(--bg); border-right: 1px solid var(--border-strong);
            transform: translateX(-102%); visibility: hidden;
            transition: transform 280ms cubic-bezier(0.4, 0, 0.2, 1), visibility 0s linear 280ms;
          }
          .nx-hist-drawer.is-open {
            transform: translateX(0); visibility: visible;
            transition: transform 280ms cubic-bezier(0.4, 0, 0.2, 1), visibility 0s;
          }
          /* Панель идёт за пальцем — без плавности */
          .nx-hist-drawer.is-dragging { transition: none; }
          .nx-hist-scrim {
            display: block; position: fixed; inset: 0; z-index: 305; background: var(--scrim);
            opacity: 0; pointer-events: none; transition: opacity 240ms ease;
          }
          .nx-hist-scrim.is-open { opacity: 1; pointer-events: auto; }
          .nx-hist-head { padding-left: 2px; min-height: 36px; }
          .nx-hist-open { font-size: 15px; padding: 10px 4px 10px 10px; }
          .nx-hist-more { width: 34px; height: 34px; }
          /* 16px — чтобы iPhone не приближал страницу при вводе */
          .nx-hist-search input, .nx-hist-rename { font-size: 16px; }
          .nx-hist-new { padding: 12px 14px; }

          /* Футер на мобильном скрываем */
          .ng-footer { display: none !important; }

          /* Защита от горизонтальной прокрутки */
          html, body {
            overflow-x: hidden !important;
            max-width: 100vw !important;
          }

          /* TopBar — поверх контента справа сверху */
          .ng-topbar {
            position: absolute !important;
            top: 0 !important;
            right: 0 !important;
            padding: 22px 16px 0 0 !important;
            z-index: 50 !important;
            gap: 2px !important;
          }
          /* Макет 2026-10: поиск и профиль — крупнее; молния и колокольчик — меньше (по просьбе автора) */


           /* Поле ввода: 16px, чтобы iPhone не приближал страницу при вводе */
          .ng-assistant-inner input {
            font-size: 16px !important;
          }
     body {
    padding-top: var(--sat);
    padding-bottom: var(--sab);
    background: var(--bg);
  }

    /* Убираем скроллбар страницы, когда открыт Ассистент.
     Внутренние блоки всё равно скроллятся, если нужно.
     Высота — ровно видимое окно (100%), а не 100vh: 100vh на телефоне
     не уменьшается от клавиатуры и адресной строки, да ещё прибавлялись
     отступы под системные полосы — страница выходила длиннее экрана,
     и браузер «подтягивал» её к полю ввода, сдвигая всё вверх. */
  body:has(.ng-assistant-wrapper) {
    overflow: hidden !important;
    height: 100%; min-height: 0; box-sizing: border-box;
  }
  html:has(.ng-assistant-wrapper) {
    overflow: hidden !important;
    height: 100%; min-height: 0;
  }
      /* Приветствие, подзаголовок и сообщения в чате на телефоне */
          .ng-assistant-inner .ng-greeting { font-size: 24px !important; }
          /* Пустой экран ассистента: поле внизу, подсказки над ним, приветствие по центру */
          .nx-empty-col { justify-content: flex-end !important; gap: 12px !important; padding-bottom: 6px !important; }
          .nx-empty-greet { margin: auto 0; }
          .nx-chips { order: 1; }
          .nx-dock { order: 2; }
          /* Подсказки — компактная строка, листается вбок, справа мягко гаснет */
          .nx-chips {
            flex-wrap: nowrap !important; justify-content: flex-start !important; overflow-x: auto; gap: 6px !important;
            width: calc(100% + 32px); margin: 0 -16px; padding: 0 16px; box-sizing: border-box;
            -webkit-mask-image: linear-gradient(90deg, black 82%, transparent);
            mask-image: linear-gradient(90deg, black 82%, transparent);
          }
          .nx-chips button { padding: 6px 11px !important; font-size: 12px !important; gap: 5px !important; }
          .ng-input-field { font-size: 16px !important; }
          /* Подсказка в пустом поле — в одну строку (поле уже из-за кнопок): иначе пустое поле выше, чем после отправки */
          .ng-input-field::placeholder { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .nx-bubble-text { font-size: 16px !important; line-height: 1.5 !important; }
          .nx-user-bubble, .nx-msg-file { max-width: 88% !important; }
          .nx-ai-col { max-width: calc(100% - 48px) !important; }
          }
            /* Клавиатура открыта — панель прячется сразу, без анимации:
               иначе она мелькает поверх клавиатуры. Появляется — плавно */
            body.kb-open .ng-mobile-tabbar {
            transform: translateY(120%);
            opacity: 0;
            pointer-events: none;
            transition: none;
          }
            .ng-mobile-tabbar {
            transition: transform 220ms ease, opacity 220ms ease;
}
        
`;
