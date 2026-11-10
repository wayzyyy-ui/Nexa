# Структура и правила кода

> Подробности к CLAUDE.md (перенесены оттуда дословно 2026-11-11). Общие правила и оглавление — в CLAUDE.md.
> Гостевого режима нет с 2026-11-06: упоминания гостя ниже относятся только к сборке без настроек Supabase.

## Структура кода

Реорганизация 2026-10 (без изменения поведения): части бывшего App.jsx (~14 700 строк) перенесены в модули как есть. Зависимости идут сверху вниз: `lib` → `ui` → `screens` → `App.jsx`; модули не импортируют друг друга по кругу и никогда не импортируют `App.jsx`.

- `src/App.jsx` — `NexaApp`: состояние приложения, переходы (`navTransition`), связь устройств, синхронизация, уведомления (`notify`), окна поверх всего. Экраны получают данные пропсами.
- `src/version.js` — `VERSION`.
- `src/lib/` — без интерфейса:
  - `shared.js` — `useSharedState`, канал вкладок `syncChannel` (`nexa-sync`), `TAB_ID`, `logEvent`;
  - `hooks.js` — `useMediaQuery`, `useOnline`, `useLeave`/`LEAVE_MS`, `useModalLock`, `useKeyboardViewport`, `useSmoothScroll`/`scrollTopNow` (Lenis), `useBackdropMotion`, `usePullToRefresh` и др.;
  - `format.js` (склонения, размеры, время), `schedule.js` (расписание), `weather.js` (погода, место, `TODAY`), `ymaps.js` (загрузчик Яндекс Карт), `updates.js` (обновление приложения), `auth.js` (гость, сессия, выход, чаты гостя, вход по QR), `accountSettings.js`, `notes.js` (уведомления, `claimNote`), `devices.js` (устройства, статусы, `mergeSamePhone`), `activity.js`, `pairing.js`, `flow.js`, `fileStore.js` (сведения о файлах, `FILE_SCOPE`), `live.js` (потоковый ответ), `commands.js` (команды ассистента), `security.js` (сеансы и журнал безопасности), `continuity.js` (продолжение работы на другом устройстве), `memory.js` (память ассистента), `lifecycle.js` (возврат в NEXA после фона: `returnTracker`, `useReturnToApp`), `voiceOutput.js` + `speechText.js` (озвучка ответов), `router.js` (адреса и история), `ota.js` + `otaPlan.js` (обновление веб-части без APK), `platform.js` (сайт / Android / ПК), `desktop.js` (команды окна ПК), `keynav.js` (Ctrl+← / Ctrl+→), `deeplink.js` (ссылки nexa://), `clipsync.js` + `clipboardSync.js` (общий буфер обмена), `textcheck.js` (`safeUrl`, `isSensitive`), `net.js` (`fetchWithTimeout` — запрос с пределом ожидания), `devicePush.js` (когда слать «обновись» после отправки устройств), `userNotes.js` (заметки; `notes.js` — уведомления);
  - прежние модули без изменений: `sync.js`, `realtime.js`, `files.js`, `attach.js`, `deviceInfo.js`, `spectrum.js`, `supabase.js`, `allowedEmailDomains.js`; Android — `src/native.js`.
- `src/ui/` — общие элементы: `theme.js` (`C`, `T`, шрифты, `PHONE_MQ`/`DESKTOP_MQ`, `NAV_W`, `switchTheme` — тема применяется при загрузке модуля), `icons.jsx` (`Icon`), `base.jsx` (кнопки, `Logo`, `Toggle`, `SettingsRow`/`SettingsGroup`, `EmptyState`, `QrCode`…), `layout.jsx` (`Crumb`, `MediaLayout`), `backdrop.jsx` (фон, `HomeFold`), `navigation.jsx` (`NAV`, меню, нижняя панель, `useTabSwipe`), `appStyles.js` (`APP_CSS` — общий блок стилей), окна и панели: `QuickPanel`, `GlobalSearch`, `FileViewer`, `LocateMap`, `DevicePreview`, `notifications`, `toasts`, `sync`, `pull`, `overlays`, `pairing`, `flow`, `bluetooth`, `install`, `files`, `continuity`, `memory`, `clipboard` (общий буфер), `desktop` (настройки приложения для ПК).
- `src/screens/` — `Home`, `Today` (+ `today/Weather`), `Notes` (заметки), `Media`, `Files`, `Device`, `Activity`, `About`, `Security`, `Devices` («Все устройства»), `Settings`, `auth`, `assistant/` (`ScreenAssistant`, `ChatHistory`, `messages`, `visuals`).
- Переменные модуля, которые меняет другой модуль, — только через функцию-сеттер (импорт менять нельзя): `setFileScope` (fileStore.js), `setLiveAbort` (live.js).
- Новый код класть в подходящий модуль, а не в App.jsx. Проверка после переноса: сборка, `oxlint` с правилом `no-undef` (браузерное окружение) — сборка сама не ловит забытые импорты.

## Правила кода

- Скорость (замеры 2026-10-25, телефон 390×844, процессор ×4): при прокрутке и других частых событиях НЕ менять классы, атрибуты и CSS-переменные у `html` / `body` — браузер пересчитывает стили всей страницы. Так `nx-scrolled` у html давал рывок ~110 мс в «Заметках»; теперь класс — на самих `.ng-topbar` / `.nx-home-top` (`SCROLL_BARS` в navigation.jsx), `--vvh` / `--vvt` пишутся только при изменении. Размытие «тихого» стекла (`nx-glass-subtle`) на телефоне выключено — карточки лежат на неподвижном фоне. Замер: скрипты `perf.cjs` (запуск), `perf2.cjs` (перерисовки и кадры), `trace.cjs` (самые долгие задачи при прокрутке) — делать так же: сначала замер, потом правка, потом замер.
- Лаги на телефоне (2026-10-26, аудит и пять правок):
  - Облегчённый режим — `src/lib/lite.js`: класс `nx-lite` у html (меняется только при смене режима или заряда), Настройки → «Внешний вид» → «Облегчённый режим» Авто / Вкл / Выкл (`nexa-lite`). Авто: экономия трафика, слабый сенсорный телефон (≤ 3 ГБ памяти или ≤ 4 ядра), заряд ≤ 20 % без зарядки. Что выключает: размытие у `nx-glass` (плотное стекло 0,82, без внешней тени), ауры ассистента, бесконечный перелив приветствия, свечение `.nx-ai-glow`; спектр ассистента — один неподвижный кадр.
  - Аура за ответом двигается через `transform` (было left / top).
  - Переписка: `MessageRow` (memo) с постоянными обработчиками через ref — при наборе текста готовые сообщения не перерисовываются (замер: процессор ×4, 120 сообщений, 40 знаков — 2,6 → 1,35 с). Рисуются последние `MSG_PAGE` (40) сообщений, выше — «Показать раньше · ещё N» (место в переписке не прыгает).
  - Presence: `setPeers` в realtime.js не меняет список, если он тот же (сравнение JSON) — раньше каждый «sync» перерисовывал всё приложение.
  - «Файлы»: строки порциями по `FILES_PAGE` (60), следующая — при прокрутке к концу (IntersectionObserver); миниатюры `loading="lazy"`.
  - `useSharedState` (shared.js): большие значения (JSON ≥ 8000 знаков) пишутся в localStorage и рассылаются вкладкам через 300 мс после последнего изменения; при уходе в фон / закрытии / смене ключа / `clearLocalAccountData` / восстановлении копии — `flushSharedState()` дописывает сразу. Ключ сменился, а старый стёрт (выход) — старое не дописываем.
  - Редкие экраны — отдельные куски кода (`lazyScreen` в App.jsx): «Заметки», «О системе» (и `GateAbout`), «Безопасность», «Все устройства»; через 2,5 с после запуска подгружаются заранее (`preloadRareScreens`). Основной кусок — ~1,05 МБ (был ~1,5).
- Комментарии в коде пиши на русском, коротко и понятно для новичка.
- Никаких hex-цветов прямо в разметке. Только `C.*`, а если нужен новый цвет, добавь токен в `C` и задай его в обеих темах.
- Не дописывай прозрачность к токенам хвостом вроде `${C.blue}80`: с CSS-переменными это ломается. Используй `color-mix(in srgb, ${C.blue} 50%, transparent)`.
- Любую правку проверяй в обеих темах и на мобильной ширине 390×844.
- Не переписывай файл целиком, если просят поправить одно место. Меняй точечно.
- Перед крупной переделкой предложи сначала сделать коммит.
- Правила проекта лежат в двух одинаковых файлах: `CLAUDE.md` (читает Claude Code) и `AGENTS.md` (читает Codex — автор пользуется обоими). Меняешь один — сделай второй точной копией.
