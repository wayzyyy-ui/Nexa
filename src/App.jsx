import { useState, useEffect, useLayoutEffect, useRef } from "react";
// flushSync — смена раздела внутри View Transition (navTransition): экран обновляется сразу
import { flushSync } from "react-dom";
// Всё, что нужно только внутри Android-приложения (на сайте ничего не делает)
import { isNative, isDesktop, checkForUpdate, startIntro, updateCleanup, canScanQr, scanQr, API_BASE, widgetsSetSchedule, widgetsSetCity, widgetsFlush, onWidgetTab, widgetsSetNote, onWidgetNote, nativeSaveLarge, clipboardWrite, onSharedText, onDesktopQuickPanel, systemNotifyPermission, systemNotify, scheduleReminders, onSystemNoteOpen, btAvailable, btBonded, onBtChange, pushToken, onPushOpen } from "./native.js";
import { App as CapApp } from "@capacitor/app";
// Стили плавной прокрутки Lenis (сам хук — useSmoothScroll в lib/hooks.js)
import "lenis/dist/lenis.css";
// Аккаунты: клиент Supabase
import { supabase, authAvailable } from "./lib/supabase.js";
// Синхронизация устройств и чатов аккаунта с облаком
import { useCloudList, CHAT_ROWS, DEVICE_ROWS, SCHEDULE_ROWS, newId, deleteAllMine, isLocalPin, isMissingTable } from "./lib/sync.js";
import { useThisDeviceSys, sameSys, thisDeviceKind } from "./lib/deviceInfo.js";
// Связь устройств в реальном времени: кто онлайн, передача текста и ссылок
import { useDeviceLink, safeUrl, PAIR_CODE_RE, cleanSys, isHw } from "./lib/realtime.js";
import { useReturnToApp } from "./lib/lifecycle.js";
import { useOta, otaStart, otaCheck, otaApplyNow } from "./lib/ota.js";
import { bootRoute, navigate, onRoute, titleOf, canGoBack, goBack, layerCount, pressEscape } from "./lib/router.js";
// Содержимое файлов: облако (Supabase Storage) у вошедшего, IndexedDB у гостя
import { fileProblem, safeFileName, uploadToCloud, removeFromCloud, flushTrash, forgetUrl, rememberLocal, cacheDel, cacheKey, cachePut, fileBlob, cacheClearScope, FILE_ROWS, FOLDER_ROWS, enqueueUpload, readUploadQueue, patchUploadQueue, dequeueUpload, queuedBlob, trashCount } from "./lib/files.js";
// Свои модули: lib — логика без интерфейса, ui — общие элементы, screens — экраны
import { useSharedState, TAB_ID } from "./lib/shared.js";
import { C, fontBody, PHONE_MQ, switchTheme } from "./ui/theme.js";
import { Icon } from "./ui/icons.jsx";
import { readManualCity, TODAY } from "./lib/weather.js";
import { plural, toMb, fileBytes, formatSize, mmss, hhmm } from "./lib/format.js";
import { SCHEDULE_KEY, dayKey, dayFromKey, sortSchedule, itemsOn, nextScheduleItem, scheduleDayLabel, SCHEDULE_MIGRATED_KEY, scheduleMigrated, loadSchedule } from "./lib/schedule.js";
import { updResume } from "./lib/updates.js";
import { CHATS_KEY, loadChats, chatMigration, readGuest, saveGuest, useAuth, takeManualSignOut, clearLocalAccountData } from "./lib/auth.js";
import { sessionIdOf, securityKey, loadSecurity, SECURITY_MAX, clientLabel, checkOwnSession, revokeSession, signOutOthers } from "./lib/security.js";
import { needsSignal } from "./lib/devicePush.js";
import { deviceType, uniqueDeviceName, DEVICES_KEY, loadDeviceStore, devicesToList, devicesFromList, deviceStatus, mergeSamePhone, peerLabel } from "./lib/devices.js";
import { ACTIVITY_MAX, loadActivity } from "./lib/activity.js";
import { PAIR_TTL_MS, PAIR_MAX_TRIES, PAIR_LOCK_MS, PAIR_ANSWER_MS, parseNexaQr, makePairCode, readPairLock, savePairLock } from "./lib/pairing.js";
import { loadFlow, copyText } from "./lib/flow.js";
import { useOnline, useModalLock, useSheetSwipe, useKeyboardViewport, scrollTopNow, useSmoothScroll, usePullToRefresh } from "./lib/hooks.js";
import { IconBtn, Toggle, SectionTitle, SettingsRow, SettingsGroup, btnReset } from "./ui/base.jsx";
import { BackdropFolds, BackdropGrid } from "./ui/backdrop.jsx";
import { NAV, MobileTabBar, Sidebar, TopBar, SWIPE_ORDER, useTabSwipe } from "./ui/navigation.jsx";
import { arrowNavTarget, isEditable } from "./lib/keynav.js";
import { onDesktopOpen, desktopDeviceInfo, desktopSaveFile } from "./lib/desktop.js";
import { buildBackup, readBackup, planRestore, backupSummary, ownerTag, backupFileName, SETTINGS_KEYS } from "./lib/backup.js";
import { BackupSettings } from "./ui/backup.jsx";
import { parseNexaLink } from "./lib/deeplink.js";
import { useClipSync } from "./lib/clipboardSync.js";
import { desktopNotifyClip } from "./lib/desktop.js";
import { ClipboardSettings } from "./ui/clipboard.jsx";
import { userNotesKey, loadUserNotes, writeUserNotes, applyEdit, NOTE_ROWS, USER_NOTES_MAX, widgetNote } from "./lib/userNotes.js";
import { ScreenNotes } from "./screens/Notes.jsx";
import { ToastHost } from "./ui/toasts.jsx";
import { SyncStatus, SyncDetails } from "./ui/sync.jsx";
import { PullIndicator } from "./ui/pull.jsx";
import { LockOverlay, FIND_RING_MS, FindOverlay } from "./ui/overlays.jsx";
import { FlowSendDialog, FlowSettings } from "./ui/flow.jsx";
import { BluetoothPicker } from "./ui/bluetooth.jsx";
import { QUICK_EVENT, QuickBtn, QuickPanel } from "./ui/QuickPanel.jsx";
import { ApproveLoginModal, AuthGate, AuthModal } from "./screens/auth.jsx";
import { PairModal, PairStatusDialog } from "./ui/pairing.jsx";
import { NOTES_KEY, NOTES_MAX, loadNotes, NOTE_CATS, NOTE_PREFS_KEY, loadNotePrefs, claimNote } from "./lib/notes.js";
import { FOLDERS, FILES_KEY, loadFileStore, catFromFile, withWhen, uploadDevice, folderName, sortByRecent, catOf, fileMeta, FILE_SCOPE, setFileScope } from "./lib/fileStore.js";
import { VERSION } from "./version.js";
import { NotificationBell, TimeDate } from "./ui/notifications.jsx";
import { ScreenAbout } from "./screens/About.jsx";
import { ScreenSecurity } from "./screens/Security.jsx";
import { ScreenDevices } from "./screens/Devices.jsx";
import { MemorySettings } from "./ui/memory.jsx";
import { memoryKey, memoryOnKey, loadMemory, loadMemoryOn, MEMORY_ROWS, MEMORY_MAX, checkMemoryText, findSameMemory, isStyleMemory } from "./lib/memory.js";
import { ContinueDialog, ContinueOffer } from "./ui/continuity.jsx";
import { CONT_TTL_MS, CONT_ACK_MS, CONT_CONNECT_MS, CONT_FAIL, contDone, contWhat, contFresh } from "./lib/continuity.js";
import { ActivityBlock, ScreenActivity } from "./screens/Activity.jsx";
import { ScreenToday } from "./screens/Today.jsx";
import { FileThumb } from "./ui/files.jsx";
import { FileViewer, openFileContent, RECEIVED_MS, TransferMenu, FoldFlight } from "./ui/FileViewer.jsx";
import { ScreenMedia } from "./screens/Media.jsx";
import { RealDeviceActions, PhoneParts, DeviceScreen } from "./screens/Device.jsx";
import { GlobalSearch } from "./ui/GlobalSearch.jsx";
import { ScreenAssistant } from "./screens/assistant/ScreenAssistant.jsx";
import { UpdateCard, ForceUpdateScreen } from "./ui/install.jsx";
import { useAccountSettings } from "./lib/accountSettings.js";
import { NoteSettings, NotesWidgetSettings, ScreenSettings } from "./screens/Settings.jsx";
import { ScreenHome } from "./screens/Home.jsx";
import { ScreenFiles } from "./screens/Files.jsx";
import { APP_CSS } from "./ui/appStyles.js";


/* ---------- 6. APP — корневой компонент ----------
   tab хранит id текущего открытого раздела (по умолчанию "home").
   setTab меняется при клике по иконке в Sidebar — от этого зависит,
   какой из шести экранов показывается ниже. */
export default function NexaApp() {
  /* С какого экрана начинаем — по адресу (src/lib/router.js): прямая ссылка /files
     открывает «Файлы», перезагрузка — тот же экран. Приложение (Android) и корень
     сайта всегда начинают с Главной */
  const [boot] = useState(bootRoute);
  const [tab, setTab] = useState(boot.tab);
  // Раньше раздел помнился в nexa-tab — теперь его хранит адрес, старые ключи не нужны
  useEffect(() => { try { localStorage.removeItem("nexa-tab"); sessionStorage.removeItem("nexa-tab"); } catch {} }, []);

  // Экранная клавиатура: размер видимой области и признак kb-open
  useKeyboardViewport();
  // Открыто окно (aria-modal) — страница под ним не прокручивается и не «оттягивается», фон не двигается
  useModalLock();
  useSheetSwipe(PHONE_MQ); // окна-шторки на телефоне смахиваются вниз

  // Аккаунт: кто вошёл (Supabase), выбран ли гостевой режим, открыто ли окно входа
  const auth = useAuth();
  /* Демо-режима нет: и у гостя, и у аккаунта — только настоящее (свои файлы,
     подключённые устройства). У аккаунта своё хранилище в браузере — ключи с id
     пользователя (nexa-devices@…), у гостя — без суффикса */
  const scope = auth.user ? `@${auth.user.id}` : "";

  // Общие данные для "Медиа" и "Файлов": список файлов, фильтр по категории
  // и файл, открытый в окне просмотра.
  // Добавленные файлы, удаления, новые имена и папки запоминаем в браузере
  // useSharedState: сохраняется в браузере и делится с другими вкладками
  const [fileStore, setFileStore] = useSharedState(FILES_KEY + scope, loadFileStore);

  /* Диалоги ассистента. У гостя — «nexa-chats», как раньше; у аккаунта —
     свои (nexa-chats@id) и в облаке. setChats ставит updatedAt изменённым
     диалогам — по нему решается, какая версия новее */
  const [chats, setChatsStore] = useSharedState(CHATS_KEY + scope, loadChats);
  const setChats = (upd) => setChatsStore((prev) => {
    const next = typeof upd === "function" ? upd(prev) : upd;
    const old = new Map(prev.map((c) => [c.id, c]));
    return next.map((c) => (old.get(c.id) === c ? c : { ...c, updatedAt: Date.now() }));
  });
  // Чьи файлы на экране — для миниатюр и окна файла (см. FILE_SCOPE)
  setFileScope(auth.user?.id || "guest");
  // Загрузки: [{ id, fileId, name, folder, progress 0…1, status "uploading" | "error", error, file }]
  const [uploads, setUploads] = useState([]);
  // Папки: основные (Фото, Видео, Документы…) и созданные самим человеком
  const folders = [...FOLDERS.filter((f) => !f.parent), ...fileStore.folders];
  // Файлы — только загруженные (выдуманных демо-файлов больше нет)
  const files = fileStore.added
    .map((f) => ({ ...withWhen(f), uploaded: true }))
    .map((f) => ({ ...f, name: fileStore.renamed[f.id] ?? f.name }));
  const [filesFilter, setFilesFilter] = useState(null);
  const [openFile, setOpenFile] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFolder, setSearchFolder] = useState(null);
  const [searchChatId, setSearchChatId] = useState(null);
    // Системные уведомления (тосты). Живут в корне — любой экран
  // может показать сообщение через onToast = showToast.
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  // Центр уведомлений: последние 20 событий (общие для всех вкладок)
  const [notes, setNotes] = useSharedState(NOTES_KEY, loadNotes);
  // Запись: время события, источник (какое устройство), категория и куда перейти по нажатию
  const addNote = (n) => setNotes((s) => ({
    ...s,
    items: [{ id: `n${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: n.at || Date.now(), title: n.title, text: n.text || "",
      cat: n.cat, source: n.source || "", target: n.target || null, key: n.key || null }, ...s.items].slice(0, NOTES_MAX),
  }));
  // logEvent из любого места: в колокольчик — только события с категорией (без всплывающего)
  useEffect(() => {
    const onLog = (e) => { if (e.detail?.cat) notifyRef.current({ ...e.detail, toast: false }); };
    window.addEventListener("nexa-log", onLog);
    return () => window.removeEventListener("nexa-log", onLog);
  }, []);

  /* ── Уведомления: notify({ cat, title, text, toastText, source, at, key, target, action, system, toast }) ──
     cat — категория NOTE_CATS (без неё — просто всплывающее, в колокольчик не пишем);
     text — что запомнить в колокольчике (без содержимого личных сообщений и файлов);
     toastText — что показать во всплывающем сейчас (если отличается);
     key — ключ события: второй сигнал о том же событии ничего не покажет;
     target — куда ведёт нажатие ({ tab } | { device } | { sync } | { update } | { activity });
     system — false, если системное уже показала сама система (напоминания Android).
     Системное — когда NEXA не на экране (или «в приложении» выключено) и человек его разрешил */
  const [notePrefs, setNotePrefs] = useSharedState(NOTE_PREFS_KEY, loadNotePrefs);
  const notePrefsRef = useRef(notePrefs); notePrefsRef.current = notePrefs;
  const [notePerm, setNotePerm] = useState("unsupported");
  const notePermRef = useRef(notePerm); notePermRef.current = notePerm;
  useEffect(() => {
    const check = () => systemNotifyPermission().then(setNotePerm);
    check();
    // Разрешение могли поменять в настройках телефона или браузера
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);
  const eventAt = (ts) => (Number.isFinite(ts) && Math.abs(Date.now() - ts) < 10 * 60000 ? ts : Date.now());
  const notify = async (n) => {
    if (!NOTE_CATS.some((c) => c.id === n.cat)) { showToast(n); return; }
    if (!(await claimNote(n.key))) return; // это событие уже показывали
    const pref = notePrefsRef.current[n.cat] || {};
    const at = n.at || Date.now();
    // Устройство-источник не нашлось в списке — ведём на Главную, а не в никуда
    if (n.target && "device" in n.target && !n.target.device) n = { ...n, target: { tab: "home" } };
    // Приложение для ПК: окно может быть открыто, но за другими окнами — тогда тоже уведомление Windows
    const away = document.visibilityState === "hidden" || (isDesktop && !document.hasFocus());
    if (pref.app) {
      addNote({ ...n, at });
      if (!away && n.toast !== false) {
        showToast({ title: n.title, text: n.toastText ?? n.text, duration: n.duration || (n.action ? 8000 : 5000),
          action: n.action || (n.target ? { label: "Открыть", onClick: () => openTargetRef.current?.(n.target) } : undefined) });
      }
    }
    if (pref.system && n.system !== false && notePermRef.current === "granted" && (away || !pref.app)) {
      systemNotify({ cat: n.cat, title: n.title, body: n.systemText ?? n.text, target: n.target, key: n.key || `${n.cat}:${at}` });
    }
  };
  const notifyRef = useRef(notify); notifyRef.current = notify;
  // «Разрешить» в Настройках: спрашиваем систему; разрешили — включаем системные для всех категорий
  // (человек сам об этом попросил; отдельные категории можно выключить)
  const askNotePerm = async () => {
    const p = await systemNotifyPermission(true);
    setNotePerm(p);
    if (p === "granted") setNotePrefs((prev) => Object.fromEntries(NOTE_CATS.map((c) => [c.id, { ...prev[c.id], system: !!prev[c.id]?.app }])));
  };
  // Переключатель уведомлений один: если система их разрешила (в том числе раньше, без нашей кнопки),
  // системные идут вместе с уведомлениями в NEXA — system = app
  useEffect(() => {
    if (notePerm !== "granted") return;
    setNotePrefs((prev) => NOTE_CATS.some((c) => !!prev[c.id]?.system !== !!prev[c.id]?.app)
      ? Object.fromEntries(NOTE_CATS.map((c) => [c.id, { ...prev[c.id], system: !!prev[c.id]?.app }]))
      : prev);
  }, [notePerm, notePrefs]);
  const openTargetRef = useRef(null); // ставится ниже, когда готовы переходы
  const realRowRef = useRef(() => null); // запись устройства по device_id — ставится ниже

  /* Связь устройств: свой закрытый канал аккаунта (src/lib/realtime.js).
     Пришёл текст — короткое уведомление (только как текст); остальные события
     (подключение, сцены, поиск) разбирает handleLinkEvent ниже */
  const uid = auth.user?.id || null;
  const logSecurityRef = useRef(null); // журнал безопасности — для обработчиков, объявленных выше него
  const contHandlers = useRef({}); // продолжение работы — обработчики событий канала (объявлены ниже)
  const memorySyncRef = useRef(null); // синхронизация памяти (объявлена ниже обработчиков)
  const notesSyncRef = useRef(null); // синхронизация заметок (объявлена ниже обработчиков)
  const peerIdsRef = useRef(new Set()); // кто сейчас в канале аккаунта (для проверок в обработчиках)
  /* NEXA Flow на этом устройстве: { on, autoCopy } (у каждого аккаунта своё) */
  const [flow, setFlow] = useSharedState("nexa-flow" + scope, loadFlow);
  const flowRef = useRef(flow); flowRef.current = flow;
  const [flowSend, setFlowSend] = useState(null); // открыто окно «Отправить в NEXA»: { text }
  const link = useDeviceLink(uid, {
    flowOn: () => flowRef.current.on,
    onText: (item) => {
      // Похожее на пароль или ключ — в уведомление не выводим и сами не копируем.
      // Сам текст — только во всплывающем на экране; в колокольчике и системном — без содержимого
      const isLink = !item.sensitive && !!safeUrl(item.text);
      const from = item.from_name || "Устройство";
      const show = (copied) => notifyRef.current({
        cat: "flow", key: `text:${item.id}`, at: eventAt(item.ts), source: `«${from}»`,
        title: `${isLink ? "Ссылка" : "Текст"} с устройства «${from}»${copied ? " · скопировано" : ""}`,
        text: item.sensitive ? "Скрытое содержимое — похоже на пароль или ключ" : isLink ? `Ссылка · ${new URL(safeUrl(item.text)).hostname}` : "Откройте устройство, чтобы посмотреть",
        toastText: item.sensitive ? "Скрытое содержимое — похоже на пароль или ключ" : item.text.length > 80 ? item.text.slice(0, 80) + "…" : item.text,
        systemText: "Откройте NEXA, чтобы посмотреть",
        target: { device: realRowRef.current(item.from_device)?.id },
        ...(!copied && !item.sensitive ? { action: { label: "Копировать", onClick: () => clipboardWrite(item.text).then((ok) => ok || copyText(item.text)) }, duration: 9000 } : {}),
      });
      // Автокопирования больше нет (переключатель убран из Настроек): полученное копируют кнопкой.
      // Старое значение autoCopy из хранилища ничего не включает
      show(false);
      // В ленту — без содержимого сообщения
      onTextActivity.current?.(item);
    },
    onEvent: (event, payload) => handleLinkEvent(event, payload),
  });
  const peerIds = new Set(link.peers.map((d) => d.device_id));
  const peerById = new Map(link.peers.map((p) => [p.device_id, p]));
  // Последние сведения от каждого устройства (обновляются с каждым Presence):
  // когда устройство пропадёт, сохраним именно их, а не снимок на момент подключения
  const lastPeerSys = useRef({});
  link.peers.forEach((p) => { if (p.sys) lastPeerSys.current[p.device_id] = p.sys; });
  /* Настоящие сведения об этом устройстве (заряд, сеть, место) — для Настроек
     и карточки «это устройство»; вошедший делится ими через Presence
     (не чаще раза в 30 секунд и только когда изменились — см. useDeviceLink) */
  const thisSys = useThisDeviceSys();
  const thisSysRef = useRef(thisSys); thisSysRef.current = thisSys;
  useEffect(() => { if (uid && thisSys) link.shareSys(thisSys); }, [thisSys, uid]);
  const onTextActivity = useRef(null); // ставится ниже, когда готова лента

  // Всплывающее уведомление (только на экране). В колокольчик пишет notify — по категориям
  const showToast = (t) => {
    const id = ++toastIdRef.current;
    setToasts((list) => [...list, { id, ...t }]);
    setTimeout(
      () => setToasts((list) => list.filter((x) => x.id !== id)),
      t.duration || 3800
    );
  };
  const dismissToast = (id) => setToasts((list) => list.filter((x) => x.id !== id));

  // Устройства: в сети ли и положение переключателей. Запоминаем в браузере,
  // чтобы после перезагрузки всё осталось как было
  // Здесь же — добавленные и удалённые устройства (см. loadDeviceStore)
  const [deviceStore, setDeviceStore] = useSharedState(DEVICES_KEY + scope, loadDeviceStore);
  /* Общий буфер обмена (src/lib/clipboardSync.js): только приложения, включается на каждом устройстве.
     Push — приложениям на телефонах, где буфер включён (state.clip в их записи), а NEXA закрыта.
     Пришедшее — уведомление; на ПК вне фокуса — системное с кнопкой «Скопировать» */
  const clipOnline = useOnline();
  const clip = useClipSync({
    uid, link, online: clipOnline,
    pushTargets: () => Object.values(deviceStore.state)
      .filter((st) => st?.real && st.clip && st.kind === "app" && st.device_id && st.device_id !== link.self?.device_id && !peerIdsRef.current.has(st.device_id))
      .map((st) => st.device_id),
    onIncoming: (item) => {
      const from = item.from_name || "Устройство";
      const preview = item.text.replace(/\s+/g, " ").trim().slice(0, 140);
      // В колокольчике — без самого текста (как у Flow); текст — только во всплывающем на экране
      notifyRef.current({ cat: "flow", key: `clip:${item.id}`, at: item.at, source: `«${from}»`, target: { clip: true },
        title: `Скопировано на «${from}»`, text: "Текст в общем буфере — откройте NEXA, чтобы скопировать", toastText: preview,
        action: { label: "Скопировать", onClick: () => clipRef.current?.copy(item) }, duration: 10000, system: false });
      // ПК не в фокусе (свёрнут, в трее, за другими окнами) — уведомление системы с кнопкой «Скопировать»
      if (isDesktop && !document.hasFocus() && notePrefsRef.current.flow?.app) desktopNotifyClip(`Скопировано на «${from}»`, item.text);
    },
  });
  const clipRef = useRef(clip); clipRef.current = clip;
  // Итоговый список — только настоящие: подключённые по коду/QR (real) и Bluetooth (bt).
  // Выдуманные (старый мастер «демо-устройство») в списке не показываем — в данных они
  // могут остаться у тех, кто добавлял их раньше, но на экраны не попадают
  const devices = deviceStore.added
    .map((d) => ({ ...d, icon: deviceType(d.type).icon }))
    .map((d) => ({ ...d, ...deviceStore.state[d.id] }))
    // Пометки real / bt лежат в состоянии устройства — фильтруем, когда оно уже подставлено
    .filter((d) => d.real || d.bt)
    // Реальные устройства (подключены по коду): «в сети» — по Presence
    // Сведения: своё — прямо с устройства; онлайн — из Presence; не в сети — последние сохранённые
    .map((d) => {
      if (d.bt) return { ...d, online: !!d.connected, battery: d.battery ?? null };
      if (!d.real) return d;
      const isSelf = d.device_id === link.self?.device_id, online = peerIds.has(d.device_id);
      const saved = cleanSys(d.sys);
      return { ...d, online, isSelf, sys: (isSelf && thisSys) || (online && peerById.get(d.device_id)?.sys) || saved };
    })
    .reduce(mergeSamePhone, []);
  // Названия реальных устройств по device_id — для блока «Связь устройств»
  const realNames = Object.fromEntries(devices.filter((d) => d.real).map((d) => [d.device_id, d.name]));
  const patchDevice = (id, patch) => setDeviceStore((s) => ({
    ...s, state: { ...s.state, [id]: { ...s.state[id], ...patch } },
    updated: { ...s.updated, [id]: Date.now() },
  }));

  /* Расписание на сегодня: можно добавлять свои дела и удалять.
     Хранится в браузере (общее для вкладок), по умолчанию — пример.
     TODAY.schedule — то же самое для ассистента и превью часов */
  // У аккаунта своё расписание (nexa-schedule@id) и копия в облаке — общая
  // для сайта и приложения (таблица schedule). У гостя — только этот браузер.
  // setSchedule ставит updatedAt изменённым делам: по нему решается, что новее
  const [schedule, setScheduleStore] = useSharedState(SCHEDULE_KEY + scope, loadSchedule);
  const setSchedule = (upd) => setScheduleStore((prev) => {
    const next = typeof upd === "function" ? upd(prev) : upd;
    const old = new Map(prev.map((it) => [it.id, it]));
    return next.map((it) => (old.get(it.id) === it ? it : { ...it, updatedAt: Date.now(), createdAt: it.createdAt || Date.now() }));
  });
  // Ассистент, превью часов и сводка «что у меня сегодня» видят только сегодняшние дела
  TODAY.schedule = itemsOn(schedule, dayKey());
  /* Виджеты рабочего стола (только приложение): то же расписание — при запуске
     и при каждом изменении; при уходе в фон — ещё раз и перерисовать виджеты.
     Город для виджета погоды — выбранный в NEXA (не выбран — Казань) */
  useEffect(() => { widgetsSetSchedule(schedule); }, [schedule]);
  useEffect(() => {
    widgetsSetCity(readManualCity());
    const away = () => { if (document.visibilityState === "hidden") widgetsFlush(); };
    document.addEventListener("visibilitychange", away);
    return () => document.removeEventListener("visibilitychange", away);
  }, []);
  const dayLabel = (k) => (k === dayKey() ? "" : `${dayFromKey(k).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}, `);
  const addScheduleItem = (it) => {
    setSchedule((list) => sortSchedule([...list, { id: newId(), ...it }]));
    showToast({ title: "Дело добавлено", text: `${dayLabel(it.date)}${it.time} · ${it.title}`, kind: "schedule" });
  };
  const removeScheduleItem = (it) => {
    setSchedule((list) => list.filter((x) => !(x.date === it.date && x.time === it.time && x.title === it.title)));
    showToast({ title: "Дело удалено", text: `${dayLabel(it.date)}${it.time} · ${it.title}`, kind: "schedule" });
  };
  // Удаление нескольких устройств сразу. Исходные запоминаем в removed,
  // добавленные просто убираем; их настройки тоже стираем
  const removeDevices = (ids0, { quiet = false } = {}) => {
    // У склеенного устройства (сайт + приложение одного телефона) удаляем все его записи
    const ids = [...new Set(ids0.flatMap((id) => devices.find((d) => d.id === id)?.members || [id]))];
    setDeviceStore((s) => {
      const state = { ...s.state };
      ids.forEach((id) => delete state[id]);
      return {
        ...s, state,
        added: s.added.filter((d) => !ids.includes(d.id)),
      };
    });
    if (ids.includes(openDeviceId)) setOpenDeviceId(null);
    if (ids.includes(filesDevice)) setFilesDevice(null);
    if (!quiet) showToast({
      title: ids.length === 1 ? "Устройство удалено" : `Удалено ${ids.length} ${plural(ids.length, ["устройство", "устройства", "устройств"])}`,
      text: `${ids.length === 1 ? "Его" : "Их"} можно подключить заново через «Добавить устройство»`,
    });
  };

  /* Облако аккаунта: устройства и чаты (src/lib/sync.js). Гостю — ничего не меняется.
     syncState — что сейчас с синхронизацией у каждой таблицы */
  const [syncState, setSyncState] = useState({});
  useEffect(() => { setSyncState({}); }, [uid]);
  /* Конфликты, которые сводка решила сама (см. mergeLists в sync.js), — честно
     говорим, что выбрали. Больше двух сразу — одно общее уведомление, подробности в центре уведомлений */
  const CONFLICT_WHAT = { devices: "устройство", chats: "диалог", files: "файл", file_folders: "папка", schedule: "дело", notes: "заметка" };
  const conflictNote = (table, rowsDef) => (all) => {
    const list = table === "devices" ? all.filter((c) => c.kind === "deletedHere" || c.kind === "deletedThere") : all;
    if (!list.length) return;
    const texts = list.map(({ kind, item }) => {
      const name = `«${rowsDef.label?.(item) || CONFLICT_WHAT[table]}»`;
      return {
        merged: `${name} дописали здесь и на другом устройстве — сообщения объединены, ничего не потерялось`,
        keptHere: `${name} изменили здесь и на другом устройстве — оставлена более новая версия, с этого устройства`,
        keptThere: `${name} изменили здесь и на другом устройстве — оставлена более новая версия, с другого устройства`,
        deletedHere: `${name} удалили здесь без сети, а на другом устройстве изменили — удаление отменено`,
        deletedThere: `${name} удалили на другом устройстве, а здесь изменили — версия с этого устройства сохранена`,
      }[kind];
    });
    const base = { cat: "sync", source: "Облако NEXA", target: table === "chats" ? { tab: "assistant" } : table === "schedule" || table === "notes" ? { tab: "today" } : table.startsWith("file") ? { tab: "files" } : { tab: "home" } };
    const many = texts.length > 2;
    list.forEach(({ id, kind }, i) => notifyRef.current({ ...base, key: `conflict:${table}:${id}:${kind}:${Math.floor(Date.now() / 60000)}`, title: `Конфликт: ${CONFLICT_WHAT[table]}`, text: texts[i], toast: !many, duration: 9000 }));
    if (many) showToast({ title: `Конфликтов при синхронизации: ${texts.length}`, text: "Решены автоматически — подробности в уведомлениях", duration: 9000 });
  };
  const deviceStoreRef = useRef(deviceStore); deviceStoreRef.current = deviceStore;
  const deviceSigs = useRef(new Map()); // id → отпечаток устройства при прошлом сигнале «обновись»
  const devicesSync = useCloudList({
    uid, table: "devices", value: deviceStore, setValue: setDeviceStore,
    toList: devicesToList, fromList: devicesFromList, rows: DEVICE_ROWS,
    onStatus: (st) => setSyncState((s) => ({ ...s, devices: st })),
    onConflict: conflictNote("devices", DEVICE_ROWS),
    // Правки ушли в облако — остальные устройства аккаунта перечитают их сразу.
    // Только заметные правки: одни «был в сети» и сведения о заряде / сети сигнала не дают (devicePush.js)
    onPushed: (sent) => { if (needsSignal(sent, devicesToList(deviceStoreRef.current), deviceSigs.current)) link.emit("sync.changed", { table: "devices" }); },
  });
  /* Это устройство само записывает себя в список устройств аккаунта.
     Раньше в список попадал только тот, кто ВВОДИЛ код, а устройство, показавшее код,
     не попадало никогда — из двух устройств в списке оставалось одно. Теперь любое
     устройство, где выполнен вход, есть в списке (вход в тот же аккаунт и есть доступ).
     Ждём первую сводку с облаком — иначе можно создать запись, которая уже есть там.
     Своя запись: тип (смартфон / планшет / компьютер), вид (сайт / приложение) — по факту;
     название, если его меняли, не трогаем */
  const devicesLoaded = !!uid && !!syncState.devices && !syncState.devices.loading;
  // Приложение для ПК: имя компьютера и ноутбук ли он (есть батарея) — из Windows (desktop.rs).
  // undefined — ещё спрашиваем, null — не узнали (тогда «Компьютер» и ноутбук по умолчанию)
  const [pcInfo, setPcInfo] = useState(isDesktop ? undefined : null);
  useEffect(() => { if (isDesktop) desktopDeviceInfo().then((i) => setPcInfo(i || null)); }, []);
  useEffect(() => {
    const me = link.self;
    if (!devicesLoaded || !me?.device_id || pcInfo === undefined) return;
    const type = me.kind === "pc" ? (pcInfo?.form === "desktop" ? "desktop" : "laptop")
      : { phone: "phone", tablet: "tablet", computer: "laptop" }[thisDeviceKind()] || "phone";
    setDeviceStore((s) => {
      const now = Date.now();
      // clip — включён ли здесь общий буфер (другие шлют push только таким телефонам)
      const info = { real: true, device_id: me.device_id, kind: me.kind, platform: me.platform, clip: !!clip.on, ...(isHw(me.hw) ? { hw: me.hw } : {}) };
      const old = s.added.find((d) => s.state[d.id]?.device_id === me.device_id);
      if (old) {
        const st = s.state[old.id] || {};
        const same = st.real && st.kind === info.kind && st.platform === info.platform && !!st.clip === info.clip && old.type === type && (!info.hw || st.hw === info.hw);
        if (same) return s;
        // ПК, записанный раньше как сайт (до приложения для ПК), — имя по умолчанию меняем на имя компьютера
        const pcRename = info.kind === "pc" && /^Сайт на компьютере( \d+)?$/.test(old.name || "");
        return {
          ...s, added: s.added.map((d) => (d.id === old.id ? { ...d, type, ...(pcRename ? { name: pcInfo?.name || "Компьютер" } : {}) } : d)),
          state: { ...s.state, [old.id]: { ...st, ...info } }, updated: { ...s.updated, [old.id]: now },
        };
      }
      const label = me.kind === "app" ? (type === "tablet" ? "Приложение на планшете" : "Приложение")
        : me.kind === "pc" ? pcInfo?.name || (type === "desktop" ? "Компьютер" : "Ноутбук")
        : type === "tablet" ? "Сайт на планшете" : me.name;
      const d = { id: newId(), type, name: uniqueDeviceName(label, s.added.map((x) => x.name)), createdAt: now, battery: null, memory: deviceType(type).memory, online: false, lastSeen: "" };
      return { ...s, added: [...s.added, d], state: { ...s.state, [d.id]: info }, updated: { ...s.updated, [d.id]: now } };
    });
  }, [devicesLoaded, uid, link.self?.device_id, pcInfo, clip.on]);
  /* Повторы одного устройства (одинаковый device_id в нескольких записях — оставались после
     старых подключений). Оставляем самую раннюю запись, лишние убираем — и в облаке тоже */
  const dupKey = deviceStore.added.map((d) => `${d.id}:${deviceStore.state[d.id]?.device_id || ""}`).join(",");
  useEffect(() => {
    if (!devicesLoaded) return;
    const seen = new Map(), extra = [];
    [...deviceStore.added].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).forEach((d) => {
      const dev = deviceStore.state[d.id]?.real && deviceStore.state[d.id]?.device_id;
      if (!dev) return;
      if (seen.has(dev)) extra.push(d.id); else seen.set(dev, d.id);
    });
    if (!extra.length) return;
    setDeviceStore((s) => {
      const state = { ...s.state }; extra.forEach((id) => delete state[id]);
      return { ...s, state, added: s.added.filter((d) => !extra.includes(d.id)) };
    });
  }, [devicesLoaded, dupKey]);
  const chatsSync = useCloudList({
    uid, table: "chats", value: chats, setValue: setChatsStore,
    toList: (list) => list.map((c) => ({ ...c, updatedAt: c.updatedAt || c.createdAt || 0 })),
    // Облако не прислало pinned (миграция chats-pinned.sql ещё не запущена) —
    // оставляем закрепление, которое было в браузере. Миграцию только что
    // запустили (в облаке pinned = false), а закрепили здесь до неё —
    // возвращаем закрепление и отправляем в облако (новое время → уйдёт само)
    fromList: (list, prev) => {
      const was = new Map((prev || []).map((c) => [c.id, c]));
      return list.map((c) => {
        if (!was.get(c.id)?.pinned || c.pinned) return c;
        if (c.pinned === undefined) return { ...c, pinned: true };
        return isLocalPin(c.id) ? { ...c, pinned: true, updatedAt: Date.now() } : c;
      });
    },
    rows: CHAT_ROWS,
    // Первый вход: в облаке пусто, а в браузере есть гостевые диалоги — переносим один раз
    migrate: {
      ...chatMigration(uid),
    },
    onStatus: (st) => setSyncState((s) => ({ ...s, chats: st })),
    onConflict: conflictNote("chats", CHAT_ROWS),
    onPushed: () => link.emit("sync.changed", { table: "chats" }),
  });
  /* Сведения о файлах и папки аккаунта — в облако (таблицы files и file_folders).
     Сами байты лежат в Storage, сюда не попадают */
  const filesSync = useCloudList({
    uid, table: "files", value: fileStore, setValue: setFileStore,
    toList: (st) => st.added.map((f) => ({
      id: f.id, name: f.name, cat: f.cat, folder: f.folder ?? null, device: f.device, mime: f.mime || "",
      size: f.size ?? Math.round((f.mb || 0) * 1e6), path: f.path || null,
      createdAt: f.addedAt || 0, updatedAt: f.updatedAt || f.addedAt || 0,
    })),
    fromList: (list, prev) => ({
      ...prev,
      added: list.map((i) => ({
        id: i.id, name: i.name, cat: i.cat, folder: i.folder, device: i.device, mime: i.mime, size: i.size,
        mb: toMb(i.size || 0), path: i.path, addedAt: i.createdAt, updatedAt: i.updatedAt,
      })),
    }),
    rows: FILE_ROWS,
    onStatus: (st) => setSyncState((s) => ({ ...s, files: st })),
    onConflict: conflictNote("files", FILE_ROWS),
    onPushed: () => link.emit("sync.changed", { table: "files" }),
  });
  const foldersSync = useCloudList({
    uid, table: "file_folders", value: fileStore, setValue: setFileStore,
    toList: (st) => st.folders.map((f) => ({ ...f, createdAt: f.createdAt || 0, updatedAt: f.updatedAt || f.createdAt || 0 })),
    fromList: (list, prev) => ({ ...prev, folders: list }),
    rows: FOLDER_ROWS,
    onStatus: (st) => setSyncState((s) => ({ ...s, folders: st })),
    onConflict: conflictNote("file_folders", FOLDER_ROWS),
    onPushed: () => link.emit("sync.changed", { table: "file_folders" }),
  });
  /* Расписание аккаунта — в облако (таблица schedule). Пока schedule.sql не
     запущен, облака нет — тихо работаем локально, без строки «не настроено».
     Первый вход: в облаке пусто, а в браузере есть расписание без входа —
     копируем один раз (nexa-schedule-migrated) */
  const scheduleSync = useCloudList({
    uid, table: "schedule", value: schedule, setValue: setScheduleStore,
    toList: (list) => list.map((it) => ({ ...it, createdAt: it.createdAt || 0, updatedAt: it.updatedAt || it.createdAt || 0 })),
    fromList: (list) => sortSchedule(list),
    rows: SCHEDULE_ROWS,
    migrate: {
      // Один раз на аккаунт: дела этого браузера (уже взятые в loadSchedule)
      // уходят в облако вместе со сводкой. Пустой список — тоже «перенос сделан»
      prepare: (local, cloudRows) => {
        if (!uid || scheduleMigrated().includes(uid)) return null;
        if (local.length || cloudRows.length) return local;
        return loadSchedule(SCHEDULE_KEY).map((it) => ({ ...it, id: newId(), createdAt: Date.now(), updatedAt: Date.now() }));
      },
      migrated: () => { try { localStorage.setItem(SCHEDULE_MIGRATED_KEY, JSON.stringify([...new Set([...scheduleMigrated(), uid])])); } catch {} },
    },
    // Таблицы расписания нет — дела живут только здесь: не «ошибка» и не «ждёт отправки»
    onStatus: (st) => setSyncState((s) => ({ ...s, schedule: st.error && isMissingTable(st.error) ? { ok: true, pending: 0, localOnly: true } : st })),
    onConflict: conflictNote("schedule", SCHEDULE_ROWS),
    onPushed: () => link.emit("sync.changed", { table: "schedule" }),
  });
  /* ── Память ассистента (src/lib/memory.js): только то, что человек сам попросил запомнить.
     Гость — этот браузер, вошедший — ещё и облако (таблица memory). Включено ли — у каждого устройства своё */
  const [memory, setMemoryStore] = useSharedState(memoryKey(uid), loadMemory);
  const [memoryOn, setMemoryOn] = useSharedState(memoryOnKey(uid), loadMemoryOn);
  const memoryRef = useRef(memory); memoryRef.current = memory;
  const memorySync = useCloudList({
    uid, table: "memory", value: memory, setValue: setMemoryStore,
    toList: (list) => list.map((m) => ({ ...m, createdAt: m.createdAt || 0, updatedAt: m.updatedAt || m.createdAt || 0 })),
    fromList: (list) => MEMORY_ROWS.sort(list),
    rows: MEMORY_ROWS,
    // Таблицы памяти ещё нет (memory.sql не запущен) — память живёт только здесь, это не ошибка
    onStatus: (st) => setSyncState((s) => ({ ...s, memory: st.error && isMissingTable(st.error) ? { ok: true, pending: 0, localOnly: true } : st })),
    onConflict: conflictNote("memory", MEMORY_ROWS),
    onPushed: () => link.emit("sync.changed", { table: "memory" }),
  });
  memorySyncRef.current = memorySync;
  /* ── Заметки (src/lib/userNotes.js, экран src/screens/Notes.jsx). Гость — этот браузер,
     вошедший — ещё и облако (таблица notes, supabase/notes.sql). Запись в браузер — сразу
     и с проверкой (writeUserNotes): «Сохранено» показываем, только если запись правда прошла */
  const [userNotes, setNotesStore] = useSharedState(userNotesKey(uid), loadUserNotes);
  const notesRef = useRef(userNotes); notesRef.current = userNotes;
  const notesSync = useCloudList({
    uid, table: "notes", value: userNotes, setValue: setNotesStore,
    toList: (list) => list.map((n) => ({ ...n, createdAt: n.createdAt || 0, updatedAt: n.updatedAt || n.createdAt || 0 })),
    // Колонок tags / archived в базе ещё нет (облако их не прислало) — оставляем то, что было здесь
    fromList: (list) => NOTE_ROWS.sort(list.map((n) => {
      if ("tags" in n && "archived" in n) return n;
      const old = notesRef.current.find((x) => x.id === n.id);
      return { ...n, tags: n.tags ?? old?.tags ?? [], archived: n.archived ?? !!old?.archived };
    })),
    rows: NOTE_ROWS,
    // Таблицы заметок ещё нет (notes.sql не запущен) — заметки живут только здесь, это не ошибка
    onStatus: (st) => setSyncState((s) => ({ ...s, notes: st.error && isMissingTable(st.error) ? { ok: true, pending: 0, localOnly: true } : st })),
    onConflict: conflictNote("notes", NOTE_ROWS),
    onPushed: () => link.emit("sync.changed", { table: "notes" }),
  });
  notesSyncRef.current = notesSync;
  // Правка заметки: { ok } — записалось ли в браузер; full — больше USER_NOTES_MAX нельзя
  const notesApi = {
    save: (id, patch) => {
      const cur = notesRef.current;
      if (!cur.some((n) => n.id === id) && cur.length >= USER_NOTES_MAX) return { ok: false, full: true };
      const next = applyEdit(cur, id, patch);
      if (next === cur) return { ok: true };
      if (!writeUserNotes(userNotesKey(uid), next)) return { ok: false };
      notesRef.current = next;
      setNotesStore(next);
      return { ok: true };
    },
    remove: (id) => {
      const next = notesRef.current.filter((n) => n.id !== id);
      if (!writeUserNotes(userNotesKey(uid), next)) return { ok: false };
      notesRef.current = next;
      setNotesStore(next);
      return { ok: true };
    },
    retry: () => notesSync.retry(),
  };
  // Действия с памятью — для ассистента (команды «Запомни» / «Забудь»), Настроек и центра безопасности
  const memoryApi = {
    add: (raw) => {
      const c = checkMemoryText(raw);
      if (!c.ok) return { ok: false, reason: c.reason };
      const same = findSameMemory(memoryRef.current, c.text);
      if (same) return { ok: false, reason: "same", item: same };
      if (memoryRef.current.length >= MEMORY_MAX) return { ok: false, reason: "full" };
      const item = { id: newId(), text: c.text, always: isStyleMemory({ text: c.text }), createdAt: Date.now(), updatedAt: Date.now() };
      memoryRef.current = [item, ...memoryRef.current];
      setMemoryStore((list) => [item, ...list]);
      return { ok: true, item };
    },
    update: (id, raw) => {
      const c = checkMemoryText(raw);
      if (!c.ok) return { ok: false, reason: c.reason };
      const same = findSameMemory(memoryRef.current.filter((m) => m.id !== id), c.text);
      if (same) return { ok: false, reason: "same", item: same };
      setMemoryStore((list) => list.map((m) => (m.id === id ? { ...m, text: c.text, updatedAt: Date.now() } : m)));
      return { ok: true };
    },
    setAlways: (id, always) => setMemoryStore((list) => list.map((m) => (m.id === id ? { ...m, always, updatedAt: Date.now() } : m))),
    remove: (id) => { memoryRef.current = memoryRef.current.filter((m) => m.id !== id); setMemoryStore((list) => list.filter((m) => m.id !== id)); },
    clear: () => { memoryRef.current = []; setMemoryStore([]); },
    // Вернуть удалённое (кнопка «Отменить» после «Забудь …»): те же id — без повторов
    restore: (items) => setMemoryStore((list) => [...items.filter((x) => !list.some((m) => m.id === x.id)), ...list].slice(0, MEMORY_MAX)),
  };

  // Удаления из хранилища, которые не прошли без сети, — повторяем при входе и когда связь вернулась
  useEffect(() => {
    if (!uid) return;
    flushTrash(uid);
    const again = () => flushTrash(uid);
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, [uid]);

  const syncLoading = !!uid && Object.values(syncState).some((st) => st?.loading);
  const syncError = uid ? Object.values(syncState).find((st) => st?.text)?.text : null;
  const retrySync = () => { devicesSync.retry(); chatsSync.retry(); filesSync.retry(); foldersSync.retry(); scheduleSync.retry(); memorySync.retry(); notesSync.retry(); runUploadQueue("all"); };
  // Сколько изменений ещё не подтверждено облаком (по всем таблицам) и что с повторами
  const syncPending = uid ? Object.values(syncState).reduce((n, st) => n + (st?.pending || 0), 0) : 0;
  const syncNextAt = uid ? Math.min(Infinity, ...Object.values(syncState).map((st) => st?.nextAt || Infinity)) : Infinity;
  const syncGaveUp = !!uid && Object.values(syncState).some((st) => st?.gaveUp);
  const online = useOnline();
  const [syncOpen, setSyncOpen] = useState(false); // окно «Связь и синхронизация»

  /* Потянули экран вниз в приложении: облако аккаунта, погода, проверка обновления */
  const pullRefresh = async () => {
    retrySync();
    window.dispatchEvent(new Event("nexa-refresh"));
    try { await checkUpdate(true); } catch {}
  };
  usePullToRefresh(isNative, pullRefresh); // насколько протянули — читает сам PullIndicator

  /* ── События канала (кроме текста) ── */
  const handleLinkEvent = (event, p) => {
    if (clipRef.current?.handle(event, p)) return; // общий буфер обмена — clip.new / clip.del / clip.clear
    if (event === "pair.claim") return answerClaim(p);
    if (event === "pair.ok" || event === "pair.fail") return onPairAnswer(event, p);
    // Список устройств изменился (могли отключить и это устройство) — заодно проверяем свой сеанс:
    // вторая возможность, если сигнал session.check потерялся
    if (event === "devices.changed") { verifySessionRef.current?.(true); return refreshDevicesSoon(); }
    // На другом устройстве что-то поменяли и уже отправили в облако — перечитываем эту таблицу
    if (event === "sync.changed") return refreshTableSoon(p.table);
    if (event === "find.ring") {
      if (p.target_device_id === link.self?.device_id) setFinding({ from: p.from_name || "Устройство" });
      return;
    }
    if (event === "find.stop") return onFindStop(p);
    if (event === "locate.request") {
      if (p.target_device_id === link.self?.device_id) answerLocate(p, realNames[p.from_device] || p.from_name || "Устройство");
      return;
    }
    if (event === "locate.reply") {
      if (p.to_device !== link.self?.device_id) return;
      setLocateState((m) => {
        const key = Object.keys(m).find((k) => m[k]?.id === p.id);
        if (!key) return m;
        clearTimeout(locateTimers.current[key]);
        return { ...m, [key]: p.status === "ok" ? { state: "ok", id: p.id, lat: p.lat, lon: p.lon, acc: p.acc, at: p.at } : { state: p.status, id: p.id } };
      });
      return;
    }
    const me = link.self?.device_id;
    const from = realNames[p.from_device] || p.from_name || "Устройство";
    // Центр безопасности: сигналу не верим — сеанс проверяем у сервера
    if (event === "session.check") {
      if (p.target_device_id === me) verifySessionRef.current?.(true);
      return;
    }
    // Продолжение работы: только адресованное этому устройству
    if (event === "continue.offer" || event === "continue.reply" || event === "continue.cancel") {
      if (p.to_device !== me) return;
      if (event === "continue.offer") contHandlers.current.offer?.(p);
      else if (event === "continue.reply") contHandlers.current.reply?.(p);
      else contHandlers.current.cancel?.(p);
      return;
    }
    if (event === "lock.on") {
      if (p.target_device_id === me) { setLocked({ from }); logActivityOnce(`lock:${p.id}`, "lock", `«${from}» заблокировало экран NEXA`, "Демонстрация"); }
      return;
    }
    if (event === "lock.off") {
      setLockState((st) => {
        if (!st[p.target_device_id]) return st;
        notifyRef.current({ cat: "devices", key: `unlock:${p.target_device_id}:${p.ts}`, at: eventAt(p.ts), source: `«${from}»`, title: `«${from}» разблокировали`, text: "Экран NEXA снова открыт", target: { device: realRowRef.current(p.target_device_id)?.id } });
        const n = { ...st }; delete n[p.target_device_id]; return n;
      });
      return;
    }
    if (event === "file.send") {
      if (p.to_device !== me || !uid) return;
      refreshTableSoon("files"); // запись о файле — в общий список «Файлов»
      logActivityOnce(`file:${p.id}:${p.ts}`, "file", `Получен файл «${safeFileName(p.name)}»`, `От «${from}» · ${formatSize(p.size / 1e6)}`);
      // Ключ — файл и время отправки: тот же сигнал дважды отсекаем, а новую отправку того же файла — нет
      notifyRef.current({ cat: "files", key: `file-in:${p.id}:${p.ts}`, at: eventAt(p.ts), source: `«${from}»`, title: `Файл от «${from}»`, text: safeFileName(p.name),
        systemText: "Новый файл в «Файлах»", target: { tab: "files" }, duration: 10000,
        action: { label: "Открыть", onClick: () => openReceivedFile(p) } });
      return;
    }
    if (event === "link.open") {
      const safe = p.to_device === me && safeUrl(p.url);
      if (!safe) return;
      const host = new URL(safe).hostname;
      logActivityOnce(`link:${p.id}`, "link", `Ссылка от «${from}»`, host);
      notifyRef.current({ cat: "flow", key: `link:${p.id}`, at: eventAt(p.ts), source: `«${from}»`, title: `Ссылка от «${from}»`, text: `Ссылка · ${host}`,
        systemText: "Откройте NEXA, чтобы посмотреть", duration: 12000, action: { label: "Открыть", onClick: () => openUrl(safe) } });
    }
  };
  // Список устройств поменялся на другом устройстве — перечитываем из облака
  const refreshDevicesSoon = () => setTimeout(() => devicesSync.retry(), 300);
  // Несколько сигналов подряд (например, ответ ассистента) — перечитываем один раз
  const refreshTimers = useRef({});
  const refreshTableSoon = (table) => {
    if (table === "settings") return settingsSync.pull(); // категории уведомлений поменяли на другом устройстве
    clearTimeout(refreshTimers.current[table]);
    const hook = { chats: chatsSync, files: filesSync, file_folders: foldersSync, schedule: scheduleSync, memory: memorySyncRef.current, notes: notesSyncRef.current }[table] || devicesSync;
    refreshTimers.current[table] = setTimeout(() => hook.retry(), 400);
  };

  // Категории уведомлений — общие для аккаунта (см. useAccountSettings)
  const settingsSync = useAccountSettings(auth.user?.id || null, notePrefs, setNotePrefs,
    () => link.emit("sync.changed", { table: "settings" }));

  /* ── Подключение: это устройство выдаёт код ── */
  const pairRef = useRef(null);                  // { code, expiresAt, used, wrong, lockedUntil } — только в памяти
  const [pairView, setPairView] = useState(null); // копия для окна
  const [pairOpen, setPairOpen] = useState(false);
  const newPairCode = () => {
    const sess = { code: makePairCode(), expiresAt: Date.now() + PAIR_TTL_MS, used: false, wrong: 0, lockedUntil: 0 };
    pairRef.current = sess; setPairView({ ...sess });
  };
  const openPair = () => { newPairCode(); setPairOpen(true); };
  const closePair = () => { pairRef.current = null; setPairView(null); setPairOpen(false); };
  // «Добавить устройство»: вошли — подключение по коду, гость — демо-мастер
  // Подключить можно только настоящее устройство — по коду/QR, а это нужен аккаунт.
  // Гость — сначала вход (после входа окно подключения откроется по той же кнопке)
  const onAddDevice = () => {
    if (auth.user) return openPair();
    showToast({ title: "Подключение устройств — с аккаунтом", text: "Войдите по почте: устройства аккаунта видят друг друга" });
    setAuthOpen(true);
  };

  // Реальное устройство в списке (повторное подключение — обновляем, не дублируем)
  const addRealDevice = (p) => setDeviceStore((s) => {
    const now = Date.now();
    const old = s.added.find((d) => s.state[d.id]?.device_id === p.device_id);
    const info = { real: true, device_id: p.device_id, kind: p.kind, platform: p.platform, ...(isHw(p.hw) ? { hw: p.hw } : {}) };
    if (old) return { ...s, state: { ...s.state, [old.id]: { ...s.state[old.id], ...info } }, updated: { ...s.updated, [old.id]: now } };
    const type = p.platform === "mobile" ? "phone" : "laptop";
    const d = {
      id: newId(), type, name: uniqueDeviceName(p.name || "Устройство", s.added.map((x) => x.name)),
      createdAt: now, battery: null, memory: deviceType(type).memory, online: false, lastSeen: "только что",
    };
    return { ...s, added: [...s.added, d], state: { ...s.state, [d.id]: info }, updated: { ...s.updated, [d.id]: now } };
  });

  // Пришёл код: сверяем здесь, на выдавшем устройстве. Код нигде не логируем
  const answerClaim = (p) => {
    const sess = pairRef.current;
    if (!sess) return; // окна с кодом нет — отвечает не это устройство
    const fail = (reason, left) => link.emit("pair.fail", { device_id: p.device_id, reason, ...(left != null ? { left } : {}) });
    const now = Date.now();
    if (sess.lockedUntil > now) return fail("locked");
    if (sess.used) return fail("used");
    if (now > sess.expiresAt) return fail("expired");
    if (p.code !== sess.code) {
      sess.wrong += 1;
      if (sess.wrong >= PAIR_MAX_TRIES) { sess.wrong = 0; sess.lockedUntil = now + PAIR_LOCK_MS; setPairView({ ...sess }); return fail("locked"); }
      setPairView({ ...sess });
      return fail("wrong", PAIR_MAX_TRIES - sess.wrong);
    }
    sess.used = true; // код сразу недействителен
    addRealDevice(p);
    logSecurityRef.current?.("device-on", `Подключено «${p.name || "Устройство"}»`, "По коду с этого устройства");
    link.emit("pair.ok", { device_id: p.device_id, name: p.name || "Устройство" });
    notifyRef.current({ cat: "devices", key: `newdev:${p.device_id}`, source: "Это устройство", title: "Подключено новое устройство", text: p.name || "Устройство", target: { tab: "home" } });
    closePair();
    // Когда новое устройство уйдёт в облако — пусть остальные перечитают список
    setTimeout(() => link.emit("devices.changed", {}), 2500);
  };

  /* ── Подключение: это устройство вводит код ── */
  const [claim, setClaim] = useState(null); // { phase: "waiting" | "ok" | "error", text }
  const claimTimer = useRef(null);
  const claimPair = async (raw) => {
    const code = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!PAIR_CODE_RE.test(code)) return setClaim({ phase: "error", text: "Код — это 6 букв и цифр с экрана другого устройства. Проверьте, нет ли опечатки." });
    const lock = readPairLock();
    if (lock.until > Date.now()) return setClaim({ phase: "error", text: `Слишком много неверных попыток. Попробуйте через ${mmss(lock.until - Date.now())}.` });
    if (link.status !== "online") return setClaim({ phase: "error", text: "Нет связи — подключиться не получится. Проверьте интернет и попробуйте снова." });
    setClaim({ phase: "waiting" });
    const me = link.self;
    const sent = await link.emit("pair.claim", { code, device_id: me.device_id, name: me.name, kind: me.kind, platform: me.platform, ...(me.hw ? { hw: me.hw } : {}) });
    if (!sent) return setClaim({ phase: "error", text: "Не отправилось — попробуйте ещё раз." });
    clearTimeout(claimTimer.current);
    claimTimer.current = setTimeout(() => setClaim((c) => (c?.phase === "waiting"
      ? { phase: "error", text: "Ответа нет. Проверьте, что окно с кодом открыто на другом устройстве и там вход с той же почтой." }
      : c)), PAIR_ANSWER_MS);
  };
  const onPairAnswer = (event, p) => {
    if (p.device_id !== link.self?.device_id) {
      // Подключили другое устройство — обновим список
      if (event === "pair.ok") refreshDevicesSoon();
      return;
    }
    if (event === "pair.ok") {
      clearTimeout(claimTimer.current);
      savePairLock({ wrong: 0, until: 0 });
      setClaim({ phase: "ok" });
      setTimeout(() => devicesSync.retry(), 2800); // к этому времени устройство уже в облаке
      return;
    }
    setClaim((c) => {
      if (c?.phase === "ok") return c; // другое окно уже ответило «подключено»
      clearTimeout(claimTimer.current);
      if (p.reason === "wrong") {
        const lock = readPairLock(); const wrong = lock.wrong + 1;
        if (wrong >= PAIR_MAX_TRIES) { savePairLock({ wrong: 0, until: Date.now() + PAIR_LOCK_MS }); return { phase: "error", text: "Неверный код. Попыток больше нет — подождите минуту." }; }
        savePairLock({ wrong, until: 0 });
        return { phase: "error", text: `Неверный код. Осталось попыток: ${Math.min(PAIR_MAX_TRIES - wrong, p.left ?? 5)}.` };
      }
      return { phase: "error", text: {
        expired: "Код истёк. Нажмите «Новый код» на другом устройстве.",
        used: "Этот код уже использован. Нужен новый.",
        locked: "Слишком много неверных попыток. Подождите минуту.",
      }[p.reason] };
    });
  };

  // Открыли сайт по QR (?pair=КОД): запоминаем код и сразу убираем его из адреса
  const [pendingPair, setPendingPair] = useState(() => {
    try {
      const u = new URL(window.location.href);
      if (!u.searchParams.has("pair")) return null;
      const c = (u.searchParams.get("pair") || "").toUpperCase();
      u.searchParams.delete("pair");
      window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
      return PAIR_CODE_RE.test(c) ? c : null;
    } catch { return null; }
  });
  useEffect(() => {
    if (!pendingPair || !auth.ready) return;
    if (!auth.user) { if (!showGate) setAuthOpen(true); return; } // сначала вход
    if (link.status === "online") { claimPair(pendingPair); setPendingPair(null); return; }
    if (link.status === "offline" || link.status === "denied") {
      setClaim({ phase: "error", text: "Нет связи — подключиться не получится. Откройте ссылку ещё раз, когда появится интернет." });
      setPendingPair(null);
    }
  }, [pendingPair, auth.ready, auth.user?.id, link.status]);

  /* ── Вход по QR: это устройство разрешает вход на другом ── */
  const [approve, setApprove] = useState(null); // { code } — открыто окно «Войти на другом устройстве»
  const openApprove = (code) => setApprove({ code: code || null, n: Date.now() });
  // Открыли сайт по QR входа (?login=КОД) камерой телефона: запоминаем и убираем из адреса
  const [pendingLogin, setPendingLogin] = useState(() => {
    try {
      const u = new URL(window.location.href);
      if (!u.searchParams.has("login")) return null;
      const c = (u.searchParams.get("login") || "").toUpperCase();
      u.searchParams.delete("login");
      window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
      return PAIR_CODE_RE.test(c) ? c : null;
    } catch { return null; }
  });
  useEffect(() => {
    if (!pendingLogin || !auth.ready) return;
    if (!auth.user) { if (!showGate) setAuthOpen(true); return; } // подтвердить может только вошедший
    openApprove(pendingLogin); setPendingLogin(null);
  }, [pendingLogin, auth.ready, auth.user?.id]);

  /* ── Сканер QR в приложении: QR подключения (?pair=КОД) или входа (?login=КОД) ── */
  const scanAndHandle = async () => {
    const res = await scanQr();
    if (!res) return; // закрыли сканер
    if (res.error) { showToast({ title: "Сканер недоступен", text: res.error }); return; }
    const found = parseNexaQr(res);
    if (found?.pair) return claimPair(found.pair);
    if (found?.login) return openApprove(found.login);
    showToast({ title: "Это не код NEXA", text: "Наведите камеру на QR в окне NEXA" });
  };

  /* ── Лента «Активность»: только этот браузер, последние 50 ── */
  const [activity, setActivity] = useSharedState(`nexa-activity${scope}`, loadActivity);
  const logActivity = (kind, title, text = "") => setActivity((list) =>
    [{ id: `a${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), kind, title, text }, ...list].slice(0, ACTIVITY_MAX));
  const [activityOpen, setActivityOpen] = useState(boot.sub === "activity");
  const [aboutOpen, setAboutOpen] = useState(boot.sub === "about"); // экран «О системе»
  const [devicesOpen, setDevicesOpen] = useState(boot.sub === "devices"); // экран «Все устройства»
  const [notesOpen, setNotesOpen] = useState(boot.sub === "notes"); // экран «Заметки» (из «Сегодня»)
  // То же событие ещё раз (повтор сигнала, вторая вкладка этого браузера) — в ленту не пишем
  const logActivityOnce = (key, ...args) => claimNote(`act:${key}`).then((ok) => ok && logActivity(...args));
  onTextActivity.current = (item) => logActivityOnce(`text:${item.id}`, "text", `Получен текст от «${realNames[item.from_device] || item.from_name || "Устройство"}»`, safeUrl(item.text) ? "Ссылка" : "Сообщение");

  /* ── «Был в сети»: Presence говорит, кто онлайн сейчас; время последней
     активности пишем в state.seenAt реального устройства (уходит в облако).
     - своё устройство отмечает себя при действиях человека — не чаще раза в 5 минут и при уходе в фон;
     - когда устройство пропало из Presence, его время ставят те, кто это увидел ── */
  const SEEN_GAP_MS = 5 * 60000;
  const seenAt = useRef({}); // id строки → когда последний раз писали lastSeen
  // Не чаще раза в 5 минут (SEEN_GAP_MS): каждая отметка — запись в облако. Уход в фон и пропажа
  // устройства из Presence отмечаются всегда (там seenAt.current сбрасывается / своё значение)
  const markSeen = (row, at = Date.now()) => {
    if (!row || at - (seenAt.current[row.id] || 0) < SEEN_GAP_MS) return;
    seenAt.current[row.id] = at;
    patchDevice(row.id, { seenAt: at });
  };
  // Последние достоверные сведения (заряд, сеть, место) — в state.sys строки устройства,
  // чтобы их было видно, когда оно не в сети. Пишем, только если они отличаются от сохранённых
  const keepSys = (row, sys) => {
    if (!row || !sys) return;
    if (sameSys(cleanSys(deviceStore.state[row.id]?.sys), sys) && deviceStore.state[row.id]?.sys?.at) return;
    patchDevice(row.id, { sys });
  };
  // Записи реальных устройств «как есть» (без склейки сайта и приложения):
  // время «был в сети», сведения и отпечаток пишутся в свою запись
  const realRowOf = (deviceId) => deviceStore.added.find((d) => deviceStore.state[d.id]?.real && deviceStore.state[d.id]?.device_id === deviceId);
  realRowRef.current = realRowOf;
  const selfRow = realRowOf(link.self?.device_id);
  /* Отпечаток телефона (state.hw) — в запись каждого устройства в сети и своего:
     так склеиваются сайт и приложение, подключённые ещё до появления отпечатка */
  const hwKey = link.peers.map((p) => `${p.device_id}:${p.hw || ""}`).join(",") + "|" + (link.self?.hw || "");
  useEffect(() => {
    if (!uid) return;
    const known = [...link.peers.map((p) => [p.device_id, p.hw]), [link.self?.device_id, link.self?.hw]];
    for (const [id, hw] of known) {
      if (!id || !isHw(hw)) continue;
      const row = realRowOf(id);
      if (row && deviceStore.state[row.id]?.hw !== hw) patchDevice(row.id, { hw });
    }
  }, [hwKey, uid, deviceStore.added.length]);
  const selfRowRef = useRef(selfRow); selfRowRef.current = selfRow;
  useEffect(() => {
    if (!uid) return;
    const active = () => { if (document.visibilityState !== "hidden") markSeen(selfRowRef.current); };
    const away = () => {
      if (document.visibilityState !== "hidden") return;
      seenAt.current = {};
      markSeen(selfRowRef.current);
      keepSys(selfRowRef.current, thisSysRef.current); // ушли в фон — сохраняем свои сведения
    };
    active();
    window.addEventListener("pointerdown", active, { passive: true });
    window.addEventListener("keydown", active);
    document.addEventListener("visibilitychange", away);
    return () => {
      window.removeEventListener("pointerdown", active);
      window.removeEventListener("keydown", active);
      document.removeEventListener("visibilitychange", away);
    };
  }, [uid, !!selfRow]);

  /* ── Центр безопасности (src/lib/security.js, экран ScreenSecurity) ──
     mySid — номер сеанса этого устройства (из его пропуска). Устройство пишет его в свою
     строку (state.sid) — так «Отключить устройство» завершает именно его вход */
  const mySid = sessionIdOf(auth.session);
  const [securityOpen, setSecurityOpen] = useState(boot.sub === "security");
  const [secLog, setSecLog] = useSharedState(uid ? securityKey(uid) : "nexa-security-guest", loadSecurity);
  const logSecurity = (kind, title, text = "", extra = {}) => {
    if (!uid) return;
    setSecLog((list) => [{ id: `s${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), kind, title, text, ...extra }, ...list].slice(0, SECURITY_MAX));
  };
  logSecurityRef.current = logSecurity;
  // Вход на этом устройстве — одна запись на сеанс (и на все вкладки браузера).
  // Вход был давно (журнала тогда ещё не было) — так и пишем, время входа не выдумываем
  useEffect(() => {
    if (!uid || !mySid || secLog.some((e) => e.sid === mySid)) return;
    claimNote(`sec-login:${mySid}`).then((ok) => {
      if (!ok) return;
      const signedAt = Date.parse(auth.user?.last_sign_in_at || "") || 0;
      const fresh = Date.now() - signedAt < 5 * 60000;
      logSecurity("login", fresh ? "Вход на этом устройстве" : "Журнал начат — вход на этом устройстве был раньше", clientLabel(navigator.userAgent), { sid: mySid });
    });
  }, [uid, mySid]);
  // Свой сеанс — в свою строку устройства (уходит в облако вместе с остальным)
  const selfSid = selfRow ? deviceStore.state[selfRow.id]?.sid : null;
  useEffect(() => {
    if (uid && mySid && selfRow && selfSid !== mySid) patchDevice(selfRow.id, { sid: mySid });
  }, [uid, mySid, selfRow?.id, selfSid]);
  /* Жив ли сеанс этого устройства — спрашиваем сервер: при входе, возвращении в NEXA
     (не чаще раза в минуту), возврате связи и по сигналу session.check. Завершён —
     выходим здесь; дальше — как при любом выходе не по кнопке (см. ниже) */
  const sessionCheckedAt = useRef(0);
  const verifySession = async (force) => {
    if (!uid || (!force && Date.now() - sessionCheckedAt.current < 60000)) return;
    sessionCheckedAt.current = Date.now();
    if ((await checkOwnSession()) === "revoked") { try { await supabase?.auth.signOut({ scope: "local" }); } catch {} }
  };
  const verifySessionRef = useRef(verifySession); verifySessionRef.current = verifySession;
  useEffect(() => {
    if (!uid) return;
    verifySessionRef.current(true);
    const again = () => { if (document.visibilityState === "visible") verifySessionRef.current(false); };
    document.addEventListener("visibilitychange", again);
    window.addEventListener("online", again);
    // Страховка, если сигналы потерялись: раз в 10 минут, пока NEXA на экране
    const timer = setInterval(() => { if (document.visibilityState === "visible") verifySessionRef.current(true); }, 10 * 60000);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", again); window.removeEventListener("online", again); };
  }, [uid]);
  /* Вышли не по кнопке «Выйти» (сеанс завершили с другого устройства или он истёк) —
     стираем данные аккаунта с этого устройства, как при обычном выходе, и говорим почему */
  const prevUidRef = useRef(uid);
  useEffect(() => {
    const was = prevUidRef.current;
    prevUidRef.current = uid;
    if (!was || uid) return;
    if (takeManualSignOut()) return;
    setSecurityOpen(false);
    setTimeout(() => clearLocalAccountData(was), 400);
    showToast({ title: "Сеанс этого устройства завершён", text: "Вход отозван с другого устройства или истёк. Данные аккаунта убраны отсюда — в облаке они на месте", duration: 9000 });
  }, [uid]);
  /* Опасное действие — через 5 секунд, с «Отменить» во всплывающем.
     run() возвращает результат; отменили — { ok: false, kind: "cancelled" } */
  const runCritical = ({ title, text, run }) => new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(async () => { done = true; resolve(await run()); }, 5000);
    showToast({ title, text, duration: 5000, action: { label: "Отменить", onClick: () => {
      if (done) return;
      done = true; clearTimeout(timer);
      resolve({ ok: false, kind: "cancelled" });
      showToast({ title: "Отменено", text: "Ничего не изменилось" });
    } } });
  });
  // Сеансы, которые можно завершить у устройства (у склеенного — у всех его записей)
  const deviceRows = (id) => {
    const d = devices.find((x) => x.id === id);
    return d ? (d.members || [id]).map((rid) => ({ rid, st: deviceStore.state[rid] || {} })) : [];
  };
  const deviceSids = (id) => deviceRows(id).map((r) => r.st.sid).filter((s) => s && s !== mySid);
  /* Отключить устройство от аккаунта:
     1) завершить его сеанс(ы) в базе (nexa_revoke_session — только свои, проверяет база);
     2) попросить его проверить сеанс (если в сети — выйдет сразу, но только убедившись у сервера);
     3) убрать из списка.
     mode "full" — без отзыва сеанса не убираем (возвращаем причину); "list" — человек
     согласился только убрать из списка. Bluetooth-устройства своего входа не имеют */
  const disconnectDevice = async (id, mode = "full") => {
    const d = devices.find((x) => x.id === id);
    if (!d) return { ok: false, kind: "gone" };
    const rows = deviceRows(id);
    if (rows.some((r) => r.st.device_id && r.st.device_id === link.self?.device_id)) return { ok: false, kind: "self" };
    let revoked = 0;
    const full = mode === "full" && !d.bt;
    if (full) {
      const sids = deviceSids(id);
      if (!sids.length) return { ok: false, kind: "nosid" };
      for (const sid of sids) {
        const r = await revokeSession(sid);
        if (r.ok) revoked++;
        else if (r.kind !== "gone") return { ok: false, kind: r.kind };
      }
    }
    rows.forEach((r) => { if (r.st.device_id) link.emit("session.check", { target_device_id: r.st.device_id }); });
    removeDevices([id], { quiet: true });
    setTimeout(() => link.emit("devices.changed", {}), 2000);
    logSecurity("device-off", `Отключено «${d.name}»`,
      d.bt ? "Убрано из списка" : full ? (revoked ? "Вход на нём завершён" : "Его сеанс уже был завершён") : "Только убрано из списка — вход на нём не отозван");
    return { ok: true, revoked, listOnly: !full, bt: !!d.bt };
  };
  const DISCONNECT_FAIL = {
    offline: "Нет связи — доступ не отозван. Попробуйте, когда вернётся интернет",
    network: "Сервер не ответил — доступ не отозван. Попробуйте ещё раз",
    setup: "Завершение сеансов ещё не настроено (security-sessions.sql) — доступ не отозван",
    auth: "Ваш вход устарел — войдите заново",
    denied: "Нет прав завершить этот сеанс — доступ не отозван",
    server: "Не получилось — доступ не отозван",
    nosid: "Неизвестно, какой у него сеанс (давно не открывалось) — доступ не отозван",
    self: "Это устройство — для него есть «Выйти»",
  };
  const disconnectWithUndo = async (id, mode = "full") => {
    const d = devices.find((x) => x.id === id);
    if (!d) return { ok: false, kind: "gone" };
    const r = await runCritical({
      title: `Отключаем «${d.name}» через 5 секунд`,
      text: d.bt || mode !== "full" ? "Уберём из списка" : "Завершим вход на нём и уберём из списка",
      run: () => disconnectDevice(id, mode),
    });
    if (r.kind === "cancelled") return r;
    if (r.ok) showToast({
      title: r.listOnly && !r.bt ? `«${d.name}» убрано из списка` : `«${d.name}» отключено`,
      text: r.bt ? "Его можно добавить снова" : r.listOnly
        ? "Вход на нём не отозван — завершите его сеанс в «Сеансах входа» или выйдите на всех других устройствах"
        : "Вход завершён. В сети — выйдет сразу; иначе старый пропуск перестанет действовать в течение часа",
      duration: 7000,
    });
    else showToast({ title: `Не удалось отключить «${d.name}»`, text: DISCONNECT_FAIL[r.kind] || DISCONNECT_FAIL.server, duration: 7000 });
    return r;
  };
  // Завершить сеанс из списка «Сеансы входа»
  const endSessionWithUndo = async (sid, label) => {
    const r = await runCritical({ title: `Завершаем «${label}» через 5 секунд`, text: "Это устройство больше не продлит вход", run: () => revokeSession(sid) });
    if (r.kind === "cancelled") return r;
    if (r.ok || r.kind === "gone") {
      const rows = deviceStore.added.filter((x) => deviceStore.state[x.id]?.sid === sid);
      const ping = () => rows.forEach((x) => { const dev = deviceStore.state[x.id]?.device_id; if (dev) link.emit("session.check", { target_device_id: dev }); });
      ping(); setTimeout(ping, 2500); // ещё раз — сообщение канала может потеряться
      logSecurity("revoke", `Завершён сеанс «${label}»`, r.ok ? "Устройство больше не продлит вход" : "Сеанс уже был завершён");
      showToast({ title: "Сеанс завершён", text: "В сети — выйдет сразу; иначе старый пропуск перестанет действовать в течение часа", duration: 7000 });
      return { ok: true };
    }
    showToast({ title: "Сеанс не завершён", text: DISCONNECT_FAIL[r.kind] || DISCONNECT_FAIL.server, duration: 7000 });
    return r;
  };
  const signOutOthersWithUndo = async () => {
    const r = await runCritical({ title: "Выходим на всех других устройствах через 5 секунд", text: "Это устройство останется в аккаунте", run: signOutOthers });
    if (r.kind === "cancelled") return r;
    if (r.ok) {
      // «Проверь свой сеанс» — каждому устройству, и ещё раз через 2,5 с (сообщение канала может потеряться)
      const targets = devices.filter((x) => x.real && !x.isSelf)
        .flatMap((x) => (x.members || [x.id]).map((rid) => deviceStore.state[rid]?.device_id)).filter(Boolean);
      const ping = () => targets.forEach((dev) => link.emit("session.check", { target_device_id: dev }));
      ping(); setTimeout(ping, 2500);
      logSecurity("others", "Выход на всех других устройствах", "Их входы завершены");
      showToast({ title: "Готово", text: "На других устройствах вход завершён. В сети — выйдут сразу; иначе в течение часа", duration: 7000 });
    } else showToast({ title: "Не получилось", text: DISCONNECT_FAIL[r.kind] || DISCONNECT_FAIL.server, duration: 7000 });
    return r;
  };

  /* ── Продолжение работы на другом устройстве (src/lib/continuity.js, src/ui/continuity.jsx) ──
     Отправитель: contSend — открытое окно { kind, ref, title }; contJob — текущая попытка
     { id, device_id, name, item, status, reason, exp }. Получатель: contOffer — карточка «Продолжить здесь?» */
  const [contSend, setContSend] = useState(null);
  const [contJob, setContJob] = useState(null);
  const [contOffer, setContOffer] = useState(null);
  const contTimers = useRef({});
  const linkStatusRef = useRef(link.status); linkStatusRef.current = link.status;
  const contJobRef = useRef(contJob); contJobRef.current = contJob;
  const contOfferRef = useRef(contOffer); contOfferRef.current = contOffer;
  const chatsRef = useRef(chats); chatsRef.current = chats;
  const filesRef = useRef(files); filesRef.current = files;
  // Объект своего аккаунта по номеру: диалог из chats, файл — только загруженный в облако
  const contFind = (kind, ref) => kind === "chat"
    ? chatsRef.current.find((c) => c.id === ref)
    : filesRef.current.find((f) => f.id === ref && f.path);
  const contTitle = (kind, obj) => (kind === "chat" ? obj?.title : obj?.name);
  peerIdsRef.current = peerIds;
  /* Куда можно продолжить: свои устройства из списка и те, что сейчас в сети в канале аккаунта,
     но в списке их нет (например, устройство, которое выдавало код подключения, само в список не попадает) */
  const contTargets = (() => {
    const known = new Set(devices.flatMap((d) => (d.parts || [d]).map((x) => x.device_id)).filter(Boolean));
    const extra = link.peers.filter((p) => p.device_id && p.device_id !== link.self?.device_id && !known.has(p.device_id))
      .map((p) => ({ id: `peer:${p.device_id}`, device_id: p.device_id, name: p.name || "Устройство", kind: p.kind, platform: p.platform,
        type: p.platform === "desktop" ? "laptop" : "phone", icon: p.platform === "desktop" ? Icon.laptop : Icon.phone, real: true, online: true, isSelf: false }));
    return [...devices, ...extra];
  })();
  const clearContTimers = (id) => { clearTimeout(contTimers.current[id]); delete contTimers.current[id]; };
  // Попытка закончилась. Окно закрыто — говорим итог всплывающим
  const finishJob = (id, status, reason) => {
    const j = contJobRef.current;
    if (!j || j.id !== id || contDone(j.status)) return;
    clearContTimers(id);
    const next = { ...j, status, reason };
    setContJob(next);
    if (status === "opened") logActivity("sent", `Продолжено на «${j.name}»`, contWhat(j.item.kind, j.item.title));
    if (!contSendRef.current) showToast(status === "opened"
      ? { title: `Открыто на «${j.name}»`, text: contWhat(j.item.kind, j.item.title), kind: "device" }
      : { title: `Не удалось продолжить на «${j.name}»`, text: CONT_FAIL[reason] || CONT_FAIL.send, duration: 6000 });
  };
  const contSendRef = useRef(contSend); contSendRef.current = contSend;
  const startContinue = async (card, item) => {
    const target = actTarget(card); // у сайта и приложения одного телефона — та часть, что в сети
    if (!target?.device_id) return;
    const id = newId(), exp = Date.now() + CONT_TTL_MS;
    setContJob({ id, device_id: target.device_id, name: card.name, item, status: linkStatusRef.current === "online" ? "sending" : "connecting", exp });
    contJobRef.current = { id, device_id: target.device_id, name: card.name, item, status: "connecting", exp };
    // Канал ещё не подключён — подождём, но недолго
    const t0 = Date.now();
    while (linkStatusRef.current !== "online" && Date.now() - t0 < CONT_CONNECT_MS) await new Promise((r) => setTimeout(r, 400));
    if (contJobRef.current?.id !== id) return; // отменили, пока ждали
    if (linkStatusRef.current !== "online") return finishJob(id, "failed", "offline");
    setContJob((j) => (j?.id === id ? { ...j, status: "sending" } : j));
    const ok = await link.emit("continue.offer", { id, to_device: target.device_id, kind: item.kind, ref: item.ref, exp });
    if (!ok) return finishJob(id, "failed", "send");
    contTimers.current[id] = setTimeout(() => finishJob(id, "failed", "noanswer"), CONT_ACK_MS);
  };
  const cancelContinue = () => {
    const j = contJobRef.current;
    if (!j || contDone(j.status)) return;
    clearContTimers(j.id);
    link.emit("continue.cancel", { id: j.id, to_device: j.device_id });
    setContJob(null);
    showToast({ title: "Передача отменена", text: contWhat(j.item.kind, j.item.title) });
  };
  // Устройство пропало из сети, пока ждали ответа
  useEffect(() => {
    const j = contJobRef.current;
    if (j && !contDone(j.status) && link.status === "online" && !peerIds.has(j.device_id)) finishJob(j.id, "failed", "left");
  }, [[...peerIds].sort().join(",")]);
  // Ответ получателя (только от того устройства, которому предлагали)
  const onContReply = (p) => {
    const j = contJobRef.current;
    if (!j || j.id !== p.id || p.from_device !== j.device_id || contDone(j.status)) return;
    if (p.status === "shown") {
      clearContTimers(j.id);
      setContJob({ ...j, status: "shown" });
      contTimers.current[j.id] = setTimeout(() => finishJob(j.id, "failed", "expired"), Math.max(1000, j.exp - Date.now()));
      return;
    }
    if (p.status === "opened") return finishJob(j.id, "opened");
    finishJob(j.id, "failed", p.status);
  };
  /* Получатель. Предложение принимаем только от своего подключённого устройства и только
     если сам объект есть в этом аккаунте (по номеру; содержимое по каналу не идёт) */
  const contReply = (p, status) => link.emit("continue.reply", { id: p.id, to_device: p.from_device, status });
  const onContOffer = async (p) => {
    // Принимаем только от устройства, которое сейчас в закрытом канале аккаунта (Presence):
    // туда пускает только этот же аккаунт (правила realtime-policies.sql). Имени не верим
    if (!peerIdsRef.current.has(p.from_device)) return;
    if (!contFresh(p.exp)) return contReply(p, "expired");
    const cur = contOfferRef.current;
    if (cur && cur.id !== p.id && cur.exp > Date.now()) return contReply(p, "busy");
    let obj = contFind(p.kind, p.ref);
    if (!obj) {
      // Возможно, ещё не синхронизировалось — перечитываем из облака и смотрим ещё раз
      refreshTableSoon(p.kind === "chat" ? "chats" : "files");
      await new Promise((r) => setTimeout(r, 3000));
      obj = contFind(p.kind, p.ref);
      if (!obj) return contReply(p, "missing");
    }
    const from = realNames[p.from_device] || link.peers.find((x) => x.device_id === p.from_device)?.name || p.from_name || "Устройство";
    setContOffer({ id: p.id, from_device: p.from_device, fromName: from, kind: p.kind, ref: p.ref, exp: p.exp, title: contTitle(p.kind, obj) });
    contReply(p, "shown");
    clearContTimers(`in:${p.id}`);
    contTimers.current[`in:${p.id}`] = setTimeout(() => setContOffer((o) => (o?.id === p.id ? null : o)), Math.max(1000, p.exp - Date.now()));
  };
  const onContCancel = (p) => {
    const o = contOfferRef.current;
    if (!o || o.id !== p.id || o.from_device !== p.from_device) return;
    clearContTimers(`in:${p.id}`);
    setContOffer(null);
    showToast({ title: "Предложение отменено", text: `На «${o.fromName}» передумали` });
  };
  const [chatOpenReq, setChatOpenReq] = useState(null); // { id, n } — открыть диалог на экране ассистента
  const acceptContinue = () => {
    const o = contOfferRef.current;
    if (!o) return;
    clearContTimers(`in:${o.id}`);
    setContOffer(null);
    const obj = contFind(o.kind, o.ref);
    if (!obj || !contFresh(o.exp)) { contReply(o, obj ? "expired" : "missing"); showToast({ title: "Не получилось открыть", text: obj ? "Время предложения вышло" : "Этого больше нет в аккаунте" }); return; }
    contReply(o, "opened");
    if (o.kind === "chat") {
      setSearchChatId(o.ref); // если экран ассистента ещё не открыт — откроется сразу с этим диалогом
      navTransition(navDir("assistant"), () => goTab("assistant"));
      setChatOpenReq({ id: o.ref, n: Date.now() });
    } else setOpenFile({ id: o.ref });
    logActivity("text", `Продолжено с «${o.fromName}»`, contWhat(o.kind, o.title));
  };
  const declineContinue = () => {
    const o = contOfferRef.current;
    if (!o) return;
    clearContTimers(`in:${o.id}`);
    setContOffer(null);
    contReply(o, "declined");
  };
  contHandlers.current = { offer: onContOffer, reply: onContReply, cancel: onContCancel };
  // Текущий диалог ассистента (для «Продолжить на устройстве» из быстрых действий)
  const currentChatRef = useRef(null);

  // Кто подключился / отключился: сравниваем Presence с прошлым разом.
  // Первые 3 секунды после подключения к каналу не считаем — это просто «кто уже был»
  const presenceReady = useRef(false);
  const prevPeers = useRef(new Map());
  const peerKey = link.peers.map((x) => x.device_id).sort().join(",");
  useEffect(() => {
    if (link.status !== "online") { presenceReady.current = false; return; }
    const now = new Map(link.peers.map((x) => [x.device_id, x]));
    if (!presenceReady.current) {
      const t = setTimeout(() => { presenceReady.current = true; }, 3000);
      prevPeers.current = now;
      return () => clearTimeout(t);
    }
    const self = link.self?.device_id;
    for (const [id, peer] of now) {
      if (id !== self && !prevPeers.current.has(id)) logActivityOnce(`conn:${id}:${Math.floor(Date.now() / 60000)}`, "connect", `«${realNames[id] || peer.name}» подключилось`, peerLabel(peer));
    }
    for (const [id, peer] of prevPeers.current) {
      if (id === self || now.has(id)) continue;
      logActivityOnce(`disc:${id}:${Math.floor(Date.now() / 60000)}`, "disconnect", `«${realNames[id] || peer.name}» отключилось`);
      const row = realRowOf(id);
      markSeen(row);
      keepSys(row, lastPeerSys.current[id] || peer.sys); // последние сведения, которые устройство успело прислать
    }
    prevPeers.current = now;
  }, [peerKey, link.status]);

  /* ── Push (приложение): свой адрес — в таблицу push_tokens (только свои строки, RLS).
     Таблицы нет (push-tokens.sql не запущен) или Firebase не настроен — тихо пропускаем ── */
  useEffect(() => {
    if (!isNative || !uid || !supabase || !link.self?.device_id) return;
    let off = false;
    (async () => {
      const r = await pushToken();
      if (off || !r.token) return;
      const key = `nexa-push-token@${uid}`;
      try { if (localStorage.getItem(key) === r.token) return; } catch {}
      const { error } = await supabase.from("push_tokens").upsert({ device_id: link.self.device_id, token: r.token, updated_at: new Date().toISOString() });
      if (!error) { try { localStorage.setItem(key, r.token); } catch {} }
    })();
    return () => { off = true; };
  }, [uid, link.self?.device_id]);
  // Нажали на «Устройство ищут» — значит, нашли: ответим «Нашёл», как только будет связь
  const pendingFound = useRef(null);
  useEffect(() => onPushOpen((e) => {
    if (e?.type !== "find") return;
    pendingFound.current = e;
    setFinding(null); // экран «Устройство ищут» внутри NEXA тоже закрываем — уже нашли
    showToast({ title: "Нашлось", text: `Сообщим «${e.from || "устройству"}», что телефон нашли` });
  }), []);
  useEffect(() => {
    if (link.status !== "online" || !pendingFound.current || !link.self?.device_id) return;
    const e = pendingFound.current; pendingFound.current = null;
    link.emit("find.stop", { target_device_id: link.self.device_id, found: true });
    logActivityOnce(`found-push:${e.id}`, "found", "Телефон нашли по уведомлению", e.from ? `Искали с «${e.from}»` : "");
  }, [link.status, link.self?.device_id]);

  /* ── Демонстрационная блокировка экрана NEXA ── */
  const [locked, setLocked] = useState(null);    // меня заблокировали: { from }
  const [lockState, setLockState] = useState({}); // я заблокировал: { device_id: "locked" }
  const lockDevice = async (d) => {
    const ok = await link.emit("lock.on", { target_device_id: d.device_id, id: newId() });
    if (!ok) { showToast({ title: "Не получилось заблокировать", text: "Нет связи — попробуйте ещё раз", kind: "error" }); return; }
    setLockState((st) => ({ ...st, [d.device_id]: "locked" }));
    logActivity("lock", `Экран NEXA на «${d.name}» заблокирован`, "Демонстрация, не системная блокировка");
  };
  const unlockSelf = () => {
    const from = locked?.from;
    setLocked(null);
    link.emit("lock.off", { target_device_id: link.self.device_id });
    logActivity("lock", "Экран NEXA разблокирован", from ? `Блокировали с «${from}»` : "");
  };

  /* ── Отправить файл на устройство: настоящий файл через облачное хранилище.
     Загружаем в корзину аккаунта (как в «Файлах»), запись уходит в таблицу files,
     получателю — событие file.send с id; он открывает файл по своей подписанной ссылке ── */
  const [sendState, setSendState] = useState({}); // device_id → { state, progress, name, error }
  const sendCtl = useRef({});
  const sendFileTo = (d, file) => {
    const key = d.device_id;
    const set = (v) => setSendState((st) => ({ ...st, [key]: v && { ...st[key], ...v } }));
    const problem = fileProblem(file);
    const name = safeFileName(file.name);
    if (problem) { setSendState((st) => ({ ...st, [key]: { state: "error", name, error: `«${name}»: ${problem.toLowerCase()}` } })); return; }
    if (!uid) { setSendState((st) => ({ ...st, [key]: { state: "error", name, error: "Отправлять файлы можно только с аккаунтом" } })); return; }
    const id = newId();
    setSendState((st) => ({ ...st, [key]: { state: "uploading", progress: 0, name } }));
    const ctl = uploadToCloud({ uid, id, file, onProgress: (pr) => set({ progress: pr }) });
    sendCtl.current[key] = ctl;
    ctl.promise.then(async ({ path }) => {
      rememberLocal(uid, id, file);
      const now = Date.now();
      setFileStore((s0) => ({ ...s0, added: [...s0.added, {
        id, name, cat: catFromFile(file), folder: null, device: link.self?.name || uploadDevice(),
        mb: toMb(file.size), size: file.size, mime: file.type || "", path, addedAt: now, updatedAt: now,
      }] }));
      const ok = await link.emit("file.send", { id, to_device: key, name, size: file.size, mime: file.type || "" });
      if (!ok) {
        set({ state: "error", error: "Файл в «Файлах», но устройство не получило уведомление — нет связи" });
        notifyRef.current({ cat: "files", key: `file-fail:${id}`, source: "Это устройство", title: `Файл не отправлен на «${d.name}»`, text: `«${name}» лежит в «Файлах» — нет связи`, target: { device: d.id } });
        return;
      }
      set({ state: "done" });
      logActivity("sent", `Файл «${name}» отправлен на «${d.name}»`);
      notifyRef.current({ cat: "files", key: `file-sent:${id}`, source: "Это устройство", title: `Файл отправлен на «${d.name}»`, text: name, target: { device: d.id } });
      setTimeout(() => setSendState((st) => (st[key]?.state === "done" ? { ...st, [key]: null } : st)), 5000);
    }).catch((err) => {
      if (err?.kind === "abort") { setSendState((st) => ({ ...st, [key]: null })); return; }
      set({ state: "error", error: err?.text || "Не отправилось — попробуйте ещё раз" });
      notifyRef.current({ cat: "files", key: `file-fail:${id}`, source: "Это устройство", title: `Файл не отправлен на «${d.name}»`, text: err?.text || "Не загрузился — попробуйте ещё раз", target: { device: d.id } });
    }).finally(() => { delete sendCtl.current[key]; });
  };
  const cancelSend = (d) => sendCtl.current[d.device_id]?.abort();

  /* ── Открыть ссылку на устройстве ── */
  const openLinkOn = async (d, url) => {
    const safe = safeUrl(url);
    if (!safe) return false;
    const ok = await link.emit("link.open", { id: newId(), to_device: d.device_id, url: safe });
    if (ok) {
      showToast({ title: `Ссылка отправлена на «${d.name}»`, text: new URL(safe).hostname, kind: "device" });
      logActivity("sent", `Ссылка отправлена на «${d.name}»`, new URL(safe).hostname);
    }
    return ok;
  };
  // Открыть пришедшую ссылку / файл (только по нажатию человека)
  const openUrl = (url) => {
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click(); a.remove();
  };
  const openReceivedFile = async (p) => {
    const ok = await openFileContent({ id: p.id, path: `${uid}/${p.id}`, name: p.name, mime: p.mime }, uid, false).catch(() => false);
    if (!ok) showToast({ title: "Файл недоступен", text: "Нет связи или файл уже удалили", kind: "error" });
    if (ok === "blocked") showToast({ title: "Такой файл NEXA не открывает", text: "Это может быть программа — откройте «Файлы» и сохраните его, если доверяете" });
  };

  /* ── «Где устройство?» ──
     Спрашиваем по каналу (locate.request), отвечает само устройство (locate.reply),
     если на нём это разрешено (nexa-locate@<id>, по умолчанию выключено).
     Координаты только в памяти этого экрана — не в облаке и не в истории */
  const [locateState, setLocateState] = useState({}); // device_id → { state, lat, lon, acc, at, id }
  const locateTimers = useRef({});
  const locateDevice = async (d) => {
    const id = newId(), key = d.device_id;
    setLocateState((m) => ({ ...m, [key]: { state: "asking", id } }));
    const ok = await link.emit("locate.request", { target_device_id: key, id });
    if (!ok) { setLocateState((m) => ({ ...m, [key]: { state: "timeout", id } })); return; }
    clearTimeout(locateTimers.current[key]);
    locateTimers.current[key] = setTimeout(() => setLocateState((m) => (m[key]?.id === id && m[key].state === "asking" ? { ...m, [key]: { state: "timeout", id } } : m)), 25000);
    logActivity("sent", `Спросили, где «${d.name}»`);
  };
  const [locateAllow, setLocateAllow] = useSharedState("nexa-locate" + scope, () => {
    try { return JSON.parse(localStorage.getItem("nexa-locate" + scope)) || { allow: false }; } catch { return { allow: false }; }
  });
  const locateAllowRef = useRef(locateAllow); locateAllowRef.current = locateAllow;
  // Меня спросили: разрешено — определяем место и отвечаем; нет — честно «выключено»
  const answerLocate = (p, from) => {
    const reply = (extra) => link.emit("locate.reply", { id: p.id, to_device: p.from_device, ...extra });
    if (!locateAllowRef.current.allow) { reply({ status: "off" }); return; }
    if (!navigator.geolocation) { reply({ status: "error" }); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        reply({ status: "ok", lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, at: pos.timestamp || Date.now() });
        // Человек у этого устройства должен знать, что его место показали
        notifyRef.current({ cat: "devices", key: `locate:${p.id}`, source: `«${from}»`, title: `Местоположение показано «${from}»`, text: "По запросу «Где устройство?»", target: { tab: "settings", notes: true } });
        logActivityOnce(`locate:${p.id}`, "link", `Показали местоположение «${from}»`);
      },
      (err) => reply({ status: err?.code === 1 ? "denied" : "error" }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };
  // Включили в Настройках: сразу спрашиваем разрешение системы, чтобы потом не ждать
  /* Включить «Показывать, где это устройство». Раньше переключатель ждал, пока телефон найдёт
     место (до 10–15 с после «Разрешить»). Теперь включается сразу: место здесь не нужно — его
     определяют только по запросу «Где устройство?». Запрос места остаётся лишь для того, чтобы
     Android / браузер спросили разрешение; отказали — переключатель возвращаем. Долго не
     находится место (нет спутников, помещение) — это не отказ, оставляем включённым */
  const toggleLocateAllow = () => {
    if (locateAllow.allow) { setLocateAllow({ allow: false }); return; }
    if (!navigator.geolocation) { showToast({ title: "Геолокация недоступна", text: "Это устройство не умеет определять место" }); return; }
    setLocateAllow({ allow: true });
    navigator.geolocation.getCurrentPosition(
      () => {},
      (err) => {
        if (err?.code !== 1) return; // не отказ — просто место пока не нашлось
        setLocateAllow({ allow: false });
        showToast({ title: "Нет доступа к геолокации", text: "Разрешите доступ к местоположению в настройках телефона или браузера" });
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: Infinity },
    );
  };

  /* ── Найти устройство ── */
  const [finding, setFinding] = useState(null);     // меня ищут: { from }
  const [findState, setFindState] = useState({});   // ищем мы: { device_id: "ringing" | "found" | "timeout" }
  const findStateRef = useRef(findState); findStateRef.current = findState;
  const findTimers = useRef({});
  const clearFindLater = (id) => setTimeout(() => setFindState((st) => { const n = { ...st }; delete n[id]; return n; }), 5000);
  // Push в приложение на том телефоне (api/push.js): дойдёт, даже если NEXA там закрыта
  const pushFind = async (d, id) => {
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch(`${API_BASE}/api/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
        body: JSON.stringify({ action: "find", target_device_id: d.device_id, id, from_device: link.self?.device_id }),
      });
      return (await r.json().catch(() => ({}))) || {};
    } catch { return { sent: false, reason: "network" }; }
  };
  const canPush = (d) => d.real && (d.kind === "app" || d.kind === "both");
  const findDevice = async (d) => {
    if (!d.real || d.isSelf || (!d.online && !canPush(d))) return;
    setFindState((st) => ({ ...st, [d.device_id]: "ringing" }));
    const ringId = newId();
    // Не в сети — только push; в сети — канал связи, а приложению ещё и push (вдруг экран выключен)
    if (!d.online || canPush(d)) {
      pushFind(d, ringId).then((r) => {
        if (r.sent) { if (!d.online) showToast({ title: `«${d.name}»: отправили уведомление`, text: "Телефон зазвонит, даже если NEXA на нём закрыта, — если на нём разрешены уведомления NEXA и приложение не остановлено в настройках" }); return; }
        if (d.online) return; // в сети — сигнал и так пришёл по каналу
        setFindState((st) => ({ ...st, [d.device_id]: "timeout" })); clearFindLater(d.device_id);
        showToast({ title: "Не получилось позвать устройство", text: {
          not_configured: "Push-уведомления NEXA ещё не настроены (нужен Firebase) — найти можно, только когда NEXA открыта на том телефоне",
          no_token: "На том телефоне нет push-адреса — откройте на нём новую версию NEXA хотя бы раз",
          network: "Нет связи — попробуйте ещё раз",
        }[r.reason] || "Не отправилось — попробуйте ещё раз" });
      });
      if (!d.online) {
        clearTimeout(findTimers.current[d.device_id]);
        findTimers.current[d.device_id] = setTimeout(() => {
          setFindState((st) => (st[d.device_id] === "ringing" ? { ...st, [d.device_id]: "timeout" } : st));
          clearFindLater(d.device_id);
        }, FIND_RING_MS + 5000);
        return;
      }
    }
    const ok = await link.emit("find.ring", { target_device_id: d.device_id, id: ringId });
    if (!ok) {
      setFindState((st) => ({ ...st, [d.device_id]: "timeout" })); clearFindLater(d.device_id);
      showToast({ title: "Не получилось позвать устройство", text: "Нет связи — попробуйте ещё раз" });
      return;
    }
    clearTimeout(findTimers.current[d.device_id]);
    // Не ответило за минуту с запасом — «Не ответило»
    findTimers.current[d.device_id] = setTimeout(() => {
      setFindState((st) => (st[d.device_id] === "ringing" ? { ...st, [d.device_id]: "timeout" } : st));
      clearFindLater(d.device_id);
    }, FIND_RING_MS + 5000);
  };
  const onFindStop = (p) => {
    // «Нашлось» — только тому, кто искал (find.stop видят все устройства аккаунта)
    const searched = !!findStateRef.current[p.target_device_id];
    setFindState((st) => (st[p.target_device_id] ? { ...st, [p.target_device_id]: p.found ? "found" : "timeout" } : st));
    clearTimeout(findTimers.current[p.target_device_id]);
    clearFindLater(p.target_device_id);
    if (p.found && searched) {
      notifyRef.current({ cat: "devices", key: `found:${p.target_device_id}:${p.ts}`, at: eventAt(p.ts), source: `«${p.from_name || "Устройство"}»`, title: `«${realNames[p.target_device_id] || p.from_name || "Устройство"}» нашлось`, text: "Там нажали «Нашёл»", target: { device: realRowRef.current(p.target_device_id)?.id } });
      logActivityOnce(`found:${p.target_device_id}:${p.ts}`, "found", `«${realNames[p.target_device_id] || p.from_name || "Устройство"}» нашлось`);
    }
  };
  // Меня нашли (или минута прошла): выключаем сигнал и сообщаем
  const stopFinding = (found) => {
    setFinding(null);
    link.emit("find.stop", { target_device_id: link.self.device_id, found });
  };
  // Переименовать реальное устройство
  const renameDevice = (id, name) => {
    const ids = devices.find((d) => d.id === id)?.members || [id]; // склеенное — все записи
    setDeviceStore((s) => ({
      ...s, added: s.added.map((d) => (ids.includes(d.id) ? { ...d, name } : d)),
      updated: { ...s.updated, ...Object.fromEntries(ids.map((x) => [x, Date.now()])) },
    }));
    showToast({ title: "Название сохранено", text: name, kind: "device" });
    setTimeout(() => link.emit("devices.changed", {}), 2000);
  };

  // «Удалить мои данные»: облако → потом всё локальное этого аккаунта.
  // Возвращает текст ошибки или null
  const deleteMyData = async () => {
    if (!uid) return null;
    try {
      await deleteAllMine(uid);
    } catch (e) {
      return navigator.onLine === false || /fetch|network/i.test(String(e?.message))
        ? "Нет связи — удалить не получилось. Попробуйте, когда появится интернет."
        : "Не получилось удалить. Попробуйте ещё раз чуть позже.";
    }
    setDeviceStore({ v: 2, state: {}, added: [], removed: [], updated: {} });
    setChatsStore([]);
    setFileStore({ added: [], removed: [], renamed: {}, folders: [] });
    cacheClearScope(uid);
    setOpenDeviceId(null);
    showToast({ title: "Данные удалены", text: "Устройства и чаты аккаунта стёрты" });
    return null;
  };
  /* ── Bluetooth (приложение Android): сопряжённые часы, наушники… ──
     Карточка — обычная запись устройств (уходит в облако аккаунта), в state:
     bt, bt_id (отпечаток адреса), host (device_id телефона, где сопряжено), connected, battery, checkedAt.
     Подключено ли — знает только телефон-хозяин: он обновляет запись при изменении */
  const [btOpen, setBtOpen] = useState(false);
  const btIds = deviceStore.added.map((d) => deviceStore.state[d.id]?.bt && deviceStore.state[d.id]?.bt_id).filter(Boolean);
  const addBtDevice = (it) => {
    const now = Date.now();
    const id = newId();
    const t = deviceType(it.type);
    setDeviceStore((s) => (s.added.some((d) => s.state[d.id]?.bt_id === it.id) ? s : {
      ...s,
      added: [...s.added, { id, type: it.type, name: uniqueDeviceName(t.name, s.added.map((x) => x.name)), createdAt: now, battery: null, memory: t.memory, online: false, lastSeen: "" }],
      state: { ...s.state, [id]: { bt: true, bt_id: it.id, host: link.self?.device_id || "local", host_name: link.self?.name || "Этот телефон", connected: !!it.connected, battery: it.battery ?? null, checkedAt: now } },
      updated: { ...s.updated, [id]: now },
    }));
    showToast({ title: "Добавлено", text: `${t.name} — по Bluetooth` });
  };
  const btRef = useRef({}); btRef.current = { store: deviceStore, self: link.self?.device_id };
  useEffect(() => {
    if (!btAvailable) return;
    const refresh = async () => {
      const { store, self } = btRef.current;
      const mine = store.added.filter((d) => store.state[d.id]?.bt && [self, "local"].includes(store.state[d.id]?.host));
      if (!mine.length) return;
      const r = await btBonded();
      if (r.error) return;
      const byId = new Map((r.devices || []).map((x) => [x.id, x]));
      for (const d of mine) {
        const st = store.state[d.id], now = byId.get(st.bt_id);
        const connected = !!now?.connected, battery = now?.battery ?? null;
        // Пишем только изменения — лишние правки не гоняем в облако
        if (st.connected !== connected || st.battery !== battery) patchDevice(d.id, { connected, battery, checkedAt: Date.now() });
      }
    };
    refresh();
    const off = onBtChange(refresh);
    const t = setInterval(refresh, 60000);
    return () => { off(); clearInterval(t); };
  }, [btIds.join(",")]);
  const uploadInputRef = useRef(null);                      // выбор файлов по команде ассистента
  const [openDeviceId, setOpenDeviceId] = useState(boot.dev); // чей экран устройства открыт (/device/<id>)

  /* Передача файла на устройство.
     transfer — открытое меню { file, card, anchor, sendingId }:
       card — где карточка файла (откуда полетит), anchor — где кнопка;
     flight — идущий полёт карточки { file, from, to, device };
     received — у каких устройств отметка «Получен файл» { id: { name } } */
  const [transfer, setTransfer] = useState(null);
  const [flight, setFlight] = useState(null);
  const [received, setReceived] = useState({});
  const receivedTimers = useRef({});
  useEffect(() => () => Object.values(receivedTimers.current).forEach(clearTimeout), []);
  const openTransfer = (file, cardEl, btnEl) => {
    setTransfer({ file, card: cardEl.getBoundingClientRect(), anchor: btnEl.getBoundingClientRect(), sendingId: null });
  };
  // Файл «дошёл»: уведомление и отметка у устройства, которая сама пропадает
  const finishTransfer = (file, device) => {
    showToast({ title: `Отправлено на ${device.name}`, text: file.name });
    setReceived((r) => ({ ...r, [device.id]: { name: file.name } }));
    clearTimeout(receivedTimers.current[device.id]);
    receivedTimers.current[device.id] = setTimeout(() => {
      setReceived(({ [device.id]: _, ...rest }) => rest);
    }, RECEIVED_MS);
  };
  const pickTransfer = (device, targetEl) => {
    const t = transfer;
    if (!t) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Без анимации (так настроено в системе) — сразу уведомление
    if (reduce || !targetEl) {
      setTransfer(null);
      finishTransfer(t.file, device);
      return;
    }
    setTransfer({ ...t, sendingId: device.id });
    setFlight({ file: t.file, from: t.card, to: targetEl.getBoundingClientRect(), device });
  };
  const endFlight = () => {
    if (flight) finishTransfer(flight.file, flight.device);
    setFlight(null);
    setTransfer(null);
  };
  const openDevice = devices.find((d) => d.id === openDeviceId);
  // Открыли адрес /device/<id>, а такого устройства нет (удалено, чужая ссылка, гость) —
  // когда список устройств уже известен, возвращаемся на раздел
  const devicesKnown = auth.ready && (!uid || devicesLoaded);
  useEffect(() => { if (devicesKnown && openDeviceId && !openDevice) setOpenDeviceId(null); }, [devicesKnown, openDeviceId, !!openDevice]);
  /* Склеенный телефон (сайт + приложение): куда отправлять действия.
     По умолчанию — приложение, если оно в сети; человек может выбрать сайт */
  const [partPick, setPartPick] = useState({}); // id карточки → id части
  const livePart = (card) => {
    if (!card?.parts) return null;
    const live = card.parts.filter((p) => p.online && !p.isSelf);
    return live.find((p) => p.id === partPick[card.id]) || live.find((p) => p.kind === "app") || live[0] || null;
  };
  const actTarget = (card) => {
    const p = livePart(card);
    return p ? { ...card, device_id: p.device_id, online: true, sys: p.sys, isSelf: false } : card;
  };
  const [filesDevice, setFilesDevice] = useState(null);     // отбор файлов по устройству
  const onDeviceFile = (d) => (f) => f.device === d.name || f.device === d.alias;

  // Переход по меню всегда открывает "Файлы" без фильтра

  // Плавная прокрутка колёсиком — на всех экранах, кроме ассистента
  useSmoothScroll(tab !== "assistant");

  // Переход по меню закрывает и экран устройства
  const goTab = (t) => { setFilesFilter(null); setFilesDevice(null); setOpenDeviceId(null); setActivityOpen(false); setAboutOpen(false); setSecurityOpen(false); setDevicesOpen(false); setNotesOpen(false); setTab(t); };
  // «Подробнее о системе» — с любого экрана (ассистент — через Главную, как «Активность»)
  const openAbout = () => { if (tab === "assistant") setTab("home"); setOpenDeviceId(null); setActivityOpen(false); setSecurityOpen(false); setAboutOpen(true); };
  // Центр безопасности открывается из Настроек поверх раздела (как «О системе»)
  // «Поиск этого устройства» — в центре безопасности (раньше был отдельной группой в Настройках)
  const locateBlock = uid ? (
    <SettingsGroup>
      <SettingsRow last icon={Icon.pin({ c: C.muted, s: 18 })} title="Показывать, где это устройство"
        subtitle="Только вашим устройствам и только по кнопке «Где устройство?». Место определяется один раз на запрос и нигде не хранится. Пока NEXA открыта или свёрнута"
        right={<Toggle on={!!locateAllow.allow} onClick={toggleLocateAllow} label="Показывать, где это устройство" />} />
    </SettingsGroup>
  ) : null;
  const openAllDevices = () => { if (tab === "assistant") setTab("home"); setOpenDeviceId(null); setActivityOpen(false); setAboutOpen(false); setSecurityOpen(false); setDevicesOpen(true); scrollTopNow(); };
  // «Заметки» — поверх «Сегодня» (кнопка там же); «Назад» возвращает в «Сегодня»
  // req — сразу открыть редактор: { create: true } (быстрые действия) или { id } (глобальный поиск)
  const [notesReq, setNotesReq] = useState(null);
  useEffect(() => { if (!notesOpen) setNotesReq(null); }, [notesOpen]); // «Вперёд» браузера не откроет старую просьбу снова
  const openNotes = (req) => {
    setTab("today"); setOpenDeviceId(null); setActivityOpen(false); setAboutOpen(false); setSecurityOpen(false); setDevicesOpen(false); setNotesOpen(true); scrollTopNow();
    setNotesReq(req?.create || req?.id ? { ...req, n: Date.now() } : null);
  };
  const openSecurity = () => { setOpenDeviceId(null); setActivityOpen(false); setAboutOpen(false); setSecurityOpen(true); scrollTopNow(); };
  // Открыли устройство, «Активность» или «О системе» (например, из уведомления) — центр закрывается
  useEffect(() => { if (openDeviceId || activityOpen || aboutOpen) setSecurityOpen(false); }, [openDeviceId, activityOpen, aboutOpen]);
  // «Все устройства» закрывается, когда открыли что-то другое поверх раздела (кроме экрана устройства — с него «Назад» вернёт к списку)
  useEffect(() => { if (activityOpen || aboutOpen || securityOpen) setDevicesOpen(false); }, [activityOpen, aboutOpen, securityOpen]);
  // «Заметки» закрываются, когда поверх открыли что-то другое (устройство из уведомления и т. п.)
  useEffect(() => { if (openDeviceId || activityOpen || aboutOpen || securityOpen || devicesOpen) setNotesOpen(false); }, [openDeviceId, activityOpen, aboutOpen, securityOpen, devicesOpen]);
  // Переход по меню (боковое на компьютере, нижняя панель на телефоне): новый раздел
  // въезжает с той стороны, где он стоит в меню — как при свайпе (тот же body[data-swipe])
  /* Плавная смена экрана без рывков. Браузер делает снимок старого экрана и держит его,
     пока рисуется новый (тяжёлый экран больше не «съедает» кадры анимации), потом снимок
     уезжает, а новый экран въезжает — двигается только область экрана (.ng-main-content),
     меню и нижняя панель стоят. Прокрутка обнуляется до снимка нового экрана — без прыжка
     посреди анимации. dir: "next" | "prev" | null (просто растворение).
     Нет View Transitions или «уменьшение движения» — прежний въезд сбоку (body[data-swipe]) или без движения */
  const navTransition = (dir, update) => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduce || document.hidden) {
      if (!reduce && dir) setSwipeDir(dir);
      update(); scrollTopNow();
      return;
    }
    const root = document.documentElement;
    root.dataset.navDir = dir || "fade";
    const t = document.startViewTransition(() => {
      flushSync(update);
      scrollTopNow();
      // Своё появление нового экрана (ng-screen-in) не нужно — его показывает переход.
      // Ставим прямо на элемент, чтобы оно не запустилось, когда пометка навигации снимется
      document.querySelectorAll(".ng-screen-anim, .ng-assistant-anim").forEach((el) => { el.style.animation = "none"; });
    });
    t.ready?.catch(() => {});
    (t.finished || Promise.resolve()).catch(() => {}).finally(() => { if (root.dataset.navDir) delete root.dataset.navDir; });
  };
  const navDir = (t) => {
    const order = matchMedia(PHONE_MQ).matches ? SWIPE_ORDER : NAV.map((n) => n.id);
    const a = order.indexOf(tab), b = order.indexOf(t);
    return a >= 0 && b >= 0 && a !== b ? (b > a ? "next" : "prev") : null;
  };
  const navTo = (t) => {
    if (t === tab && !openDeviceId && !activityOpen && !aboutOpen && !securityOpen && !devicesOpen && !notesOpen) return;
    navTransition(navDir(t), () => goTab(t));
  };
  // Ctrl+← / Ctrl+→ — соседний раздел бокового меню (компьютер: сайт и приложение для ПК).
  // Правила — arrowNavTarget (src/lib/keynav.js); окна, меню, экран входа и блокировка — не трогаем
  const navToRef = useRef(navTo); navToRef.current = navTo;
  const tabRef = useRef(tab); tabRef.current = tab;
  useEffect(() => {
    const onKey = (e) => {
      if (matchMedia(PHONE_MQ).matches) return;
      const blocked = !!document.querySelector('[aria-modal="true"], [role="menu"], .nx-auth-gate, [data-nx-noback]');
      const t = arrowNavTarget({ key: e.key, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, metaKey: e.metaKey,
        repeat: e.repeat, editable: isEditable(document.activeElement), blocked, order: NAV.map((n) => n.id), tab: tabRef.current });
      if (!t) return;
      e.preventDefault();
      navToRef.current(t);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  /* Ctrl+V с файлами (скопированными в проводнике или снимок экрана) вне полей ввода — в «Файлы».
     В поле ассистента вставка прикладывает файл к вопросу (ScreenAssistant), в других полях — как обычно */
  const addFilesRef = useRef(null);
  const showToastRef = useRef(showToast); showToastRef.current = showToast;
  useEffect(() => {
    const onPaste = (e) => {
      const files = [...(e.clipboardData?.files || [])];
      if (!files.length || isEditable(e.target) || tabRef.current === "assistant") return;
      if (document.querySelector('[aria-modal="true"], .nx-auth-gate')) return;
      e.preventDefault();
      addFilesRef.current?.(files, null);
      showToastRef.current?.({ title: files.length === 1 ? "Файл из буфера — в «Файлы»" : `Файлов из буфера: ${files.length} — в «Файлы»`, text: files.length === 1 ? files[0].name : "Загружаются",
        action: { label: "Открыть", onClick: () => navToRef.current?.("files") } });
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);
  // «Поделиться» → «Отправить в NEXA» из другого приложения (Android)
  useEffect(() => onSharedText((text) => setFlowSend({ text })), []);
  // Нажали на виджет рабочего стола: «Расписание» → «Сегодня», «Погода» → Главная
  const goTabRef = useRef(goTab); goTabRef.current = goTab;
  /* Свайп между разделами. Ассистент: вправо — открыть историю диалогов
     (а не «Сегодня»), влево — Главная. Открытую шторку истории закрывает
     свайп влево (по самой шторке — её собственный жест, по затемнению — здесь) */
  const [swipeDir, setSwipeDir] = useState(null); // откуда въезжает новый экран: "next" | "prev"
  // Свайп ведёт пальцем: соседний раздел собирается за краем (peek) и после жеста становится текущим
  const [peek, setPeek] = useState(null);   // { tab, dir } — сосед на время жеста
  const [quiet, setQuiet] = useState(null); // раздел, пришедший свайпом, — без своего «появления»
  useTabSwipe(
    () => ({ tab, sub: !!openDeviceId || activityOpen || aboutOpen || securityOpen || devicesOpen || notesOpen }),
    { onPeek: (t, dir) => setPeek(t ? { tab: t, dir } : null),
      // Тот же собранный экран становится текущим — в одном кадре: раздел, адрес, прокрутка к началу
      onCommit: (t) => { flushSync(() => { setQuiet(t); setPeek(null); goTab(t); }); scrollTopNow(); },
      onSwipe: (dir) => {
      if (tab === "assistant") {
        if (document.querySelector(".nx-hist-drawer.is-open")) {
          if (dir === "next") window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
          return; // при открытой истории разделы не переключаем
        }
        if (dir === "prev") { window.dispatchEvent(new Event("nexa-open-history")); return; }
      }
      const i = SWIPE_ORDER.indexOf(tab) + (dir === "next" ? 1 : -1);
      if (i < 0 || i >= SWIPE_ORDER.length) return; // крайняя вкладка — дальше некуда
      navTransition(dir, () => goTab(SWIPE_ORDER[i]));
    } },
  );
  // Направление — пометка у body (до отрисовки нового экрана): по ней CSS
  // выбирает въезд сбоку вместо обычного появления
  useLayoutEffect(() => {
    if (swipeDir) document.body.dataset.swipe = swipeDir;
    else delete document.body.dataset.swipe;
  }, [swipeDir]);
  // Направление нужно только для въезда нового экрана — потом сбрасываем
  useEffect(() => {
    if (!swipeDir) return;
    const t = setTimeout(() => setSwipeDir(null), 340);
    return () => clearTimeout(t);
  }, [swipeDir, tab]);
  useEffect(() => onWidgetTab((t) => goTabRef.current(t)), []);

  // Аккаунт: кто вошёл (Supabase) — см. начало NexaApp. Гостевой режим и окно входа
  const [guest, setGuest] = useState(readGuest);
  const [authOpen, setAuthOpen] = useState(false);
  // Экран входа при первом запуске: аккаунты доступны, Supabase ответил,
  // никто не вошёл и «без аккаунта» ещё не выбирали
  const showGate = authAvailable && auth.ready && !auth.user && !guest;
  /* Виджет «Заметки» (Android): одна закреплённая заметка этого аккаунта (widgetNote).
     Пока не знаем, кто вошёл, — ничего не шлём (иначе на миг ушли бы заметки гостя);
     вышли из аккаунта — виджет очищается. Нажатия на виджет открывают заметку / новую / список */
  const [widgetHide, setWidgetHide] = useState(() => { try { return localStorage.getItem("nexa-note-widget-hide") === "1"; } catch { return false; } });
  const changeWidgetHide = (on) => { setWidgetHide(on); try { localStorage.setItem("nexa-note-widget-hide", on ? "1" : "0"); } catch {} };
  useEffect(() => {
    if (authAvailable && !auth.ready) return;
    widgetsSetNote(widgetNote(userNotes, { hide: widgetHide, signedOut: showGate }));
  }, [userNotes, widgetHide, showGate, authAvailable, auth.ready]);
  const showGateRef = useRef(showGate); showGateRef.current = showGate;
  const openNotesRef = useRef(null); openNotesRef.current = openNotes;
  useEffect(() => onWidgetNote((req) => { if (!showGateRef.current) openNotesRef.current(req); }), []);
  // Вошли — гостевой режим больше не нужен, окно входа закрываем.
  // Вышли — снова экран входа (решение автора): гостем после выхода не остаёмся
  const prevUser = useRef(null);
  const authSettled = useRef(false); // первый ответ Supabase уже был (вход из прошлого раза — не новость)
  useEffect(() => {
    if (!auth.ready) return;
    const was = prevUser.current, now = auth.user;
    if (now && !was) {
      saveGuest(false); setGuest(false); setAuthOpen(false);
      if (authSettled.current) showToast({ title: "Вы вошли", text: now.email, kind: "success" });
    } else if (!now && was) {
      saveGuest(false); setGuest(false); setAuthOpen(false);
      showToast({ title: "Вы вышли из аккаунта", text: "Данные аккаунта остались в облаке — войдите снова, чтобы их увидеть", kind: "info" });
    }
    prevUser.current = now;
    authSettled.current = true;
  }, [auth.ready, auth.user?.id]);

  // В приложении: убрать заставку и проявить интерфейс (см. startIntro)
  // Сначала обновление веб-части (src/lib/ota.js): «запустились» и, если скачанная ждёт, —
  // перезагрузка под логотипом. Иначе — обычное появление интерфейса
  useEffect(() => { otaStart().then((r) => { if (!r) startIntro(); }, () => startIntro()); }, []);
  const ota = useOta();

  // Новая версия приложения: проверяем при запуске и когда приложение
  // снова открыли из фона (на сайте checkForUpdate сразу возвращает null)
  const [appUpdate, setAppUpdate] = useState(null);
  const [updateCheckedAt, setUpdateCheckedAt] = useState(0);
  // Какая версия стоит — спрашиваем у Android (versionName из build.gradle), а не у кода сайта
  const [installedVersion, setInstalledVersion] = useState(VERSION);
  useEffect(() => { if (isNative) CapApp.getInfo().then((i) => i?.version && setInstalledVersion(i.version)).catch(() => {}); }, []);
  // При запуске и при возврате в приложение; сам сайт спрашиваем не чаще раза в 6 часов
  // (между проверками — последний ответ из памяти, см. checkForUpdate)
  // Тот же ответ version.json решает и про APK, и про веб-часть (otaCheck его не скачивает второй раз)
  const checkUpdate = (force) => checkForUpdate({ force }).then((u) => { setAppUpdate(u); setUpdateCheckedAt(Date.now()); otaCheck({ force }); });
  useEffect(() => {
    // Приложение для ПК: при запуске, раз в 30 минут (NEXA может неделями жить в трее) и при
    // возврате в окно; сам сайт всё равно спрашивается не чаще раза в 6 часов
    if (isDesktop) {
      checkUpdate(false);
      const t = setInterval(() => checkUpdate(false), 30 * 60000);
      const onFocus = () => checkUpdate(false);
      window.addEventListener("focus", onFocus);
      return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
    }
    if (!isNative) return;
    updateCleanup(); // скачанный в прошлый раз файл больше не нужен (обновление уже стоит или брошено)
    checkUpdate(false);
    const sub = CapApp.addListener("resume", () => { checkUpdate(false); updResume(); });
    return () => { sub.then((h) => h.remove()); };
  }, []);
  // «Позже» прячет блок на Главной для этой версии (в Настройках он остаётся — там можно передумать)
  const [updateLater, setUpdateLater] = useState(() => { try { return localStorage.getItem("nexa-update-later") || ""; } catch { return ""; } });
  const laterUpdate = () => { if (!appUpdate) return; setUpdateLater(appUpdate.version); try { localStorage.setItem("nexa-update-later", appUpdate.version); } catch {} };
  const homeUpdate = appUpdate && !appUpdate.required && appUpdate.version === updateLater ? null : appUpdate;

  /* ── Адрес и история (src/lib/router.js) ──
     Какой экран на виду: раздел, экран поверх него («Активность», «О системе»…) и устройство */
  const screenSub = securityOpen ? "security" : aboutOpen ? "about" : activityOpen ? "activity" : devicesOpen ? "devices" : notesOpen ? "notes" : null;
  const screenKey = `${tab}|${screenSub || ""}|${openDeviceId || ""}`;
  // Экран сменился (нажатие, свайп, «Назад» на экране) — подстраиваем адрес и историю
  useEffect(() => { navigate({ tab, sub: screenSub, dev: openDeviceId }); }, [screenKey]);
  // Назад / Вперёд браузера (и кнопка «Назад» Android) — показываем экран из истории.
  // Обработчик подключается один раз, свежие значения — через ref
  const routeRef = useRef(null);
  routeRef.current = (s) => {
    const apply = () => {
      if (s.tab !== tab) { setFilesFilter(null); setFilesDevice(null); }
      // Вернулись к ассистенту — открываем тот же диалог, что был
      if (s.tab === "assistant" && tab !== "assistant") setSearchChatId(currentChatRef.current);
      setTab(s.tab); setOpenDeviceId(s.dev || null);
      setActivityOpen(s.sub === "activity"); setAboutOpen(s.sub === "about");
      setSecurityOpen(s.sub === "security"); setDevicesOpen(s.sub === "devices"); setNotesOpen(s.sub === "notes");
    };
    if (`${s.tab}|${s.sub || ""}|${s.dev || ""}` === screenKey) return;
    // В приложении «Назад» между разделами — с тем же въездом, что у панели; на сайте браузер
    // часто сам показывает жест «назад» — второй анимации поверх не нужно
    const plain = !s.sub && !s.dev && !screenSub && !openDeviceId;
    if (isNative && plain && s.tab !== tab) navTransition(navDir(s.tab), apply);
    else { apply(); scrollTopNow(); }
  };
  useEffect(() => onRoute((s) => routeRef.current?.(s)), []);
  // Заголовок вкладки браузера — по экрану
  useEffect(() => { document.title = titleOf({ tab, sub: screenSub, dev: openDeviceId }, openDevice?.name); }, [screenKey, openDevice?.name]);

  // Свежие значения для обработчика «Назад» (он подключается один раз)
  const backState = useRef({});
  backState.current = { tab, blocked: !!appUpdate?.required, plain: !screenSub && !openDeviceId, locked: !!locked };
  useEffect(() => {
    if (!isNative) return;
    const sub = CapApp.addListener("backButton", () => {
      // 0) Версия устарела — экран обновления не закрывается, просто сворачиваем
      if (backState.current.blocked) { CapApp.minimizeApp(); return; }
      // Экран первого запуска на приветствии — сворачиваем. На шаге входа (почта, код, QR)
      // Esc вернёт на шаг назад: с кода — к почте, с почты или QR — к приветствию
      const gate = document.querySelector(".nx-auth-gate");
      if (gate) { if (gate.querySelector(".nx-gate-hello")) CapApp.minimizeApp(); else pressEscape(); return; }
      // Экран NEXA заблокирован (демонстрация) — «Назад» только сворачивает
      if (backState.current.locked) { CapApp.minimizeApp(); return; }
      // Карточки, пришедшие сами («Продолжить здесь?», «Устройство ищут»), своей записи
      // в истории не имеют — закрываем их Esc
      if (document.querySelector(".nx-cont-offer, .nx-find-overlay")) { pressEscape(); return; }
      // 1) Есть куда вернуться по истории: окно, шторка, экран устройства, раздел → Главная
      if (canGoBack()) { goBack(); return; }
      // 2) Запасной путь: окно без записи в истории — закрываем Esc; не Главная — на Главную
      if (layerCount()) { pressEscape(); return; }
      const { tab: cur, plain } = backState.current;
      if (cur !== "home" || !plain) { goTabRef.current("home"); return; }
      // 3) На Главной — сворачиваем приложение (как обычно на Android)
      CapApp.minimizeApp();
    });
    return () => { sub.then((h) => h.remove()); };
  }, []);
  // Открыть экран устройства. С «Ассистента» (там своя раскладка) — через Главную
  const showDevice = (id) => {
    if (tab === "assistant") setTab("home");
    setOpenDeviceId(id);
  };
  // Из "Медиа" в "Файлы" с фильтром по категории (null — без фильтра)
  const openCategory = (cat) => { setFilesFilter(cat); setFilesDevice(null); setTab("files"); };
  // Из окна устройства в "Файлы" с отбором по этому устройству
  const openDeviceFiles = (id) => {
    setFilesFilter(null);
    setFilesDevice(id);
    setOpenDeviceId(null);
    setTab("files");
  };
  const openFolderFromSearch = (folderId) => {
    setFilesFilter(null);
    setFilesDevice(null);
    setSearchFolder(folderId);
    setTab("files");
  };
  // Открыть конкретный диалог ассистента из глобального поиска
  const openChatFromSearch = (chatId) => {
    setSearchChatId(chatId);
    setTab("assistant");
  };
  /* Удаление: демо-файл запоминаем в removed, настоящий убираем из списка
     и вместе с содержимым — из облака (без сети — удалим, когда связь вернётся)
     и из этого браузера */
  const deleteFile = (f) => {
    setFileStore((s) => {
      const renamed = { ...s.renamed };
      delete renamed[f.id];
      return {
        ...s, renamed,
        added: s.added.filter((x) => x.id !== f.id),
        removed: f.uploaded ? s.removed : [...s.removed, f.id],
      };
    });
    if (f.uploaded) {
      forgetUrl(FILE_SCOPE, f.id);
      cacheDel(cacheKey(FILE_SCOPE, f.id));
      if (uid && f.path) removeFromCloud(uid, [f.path]);
    }
    setOpenFile(null);
  };
  // Переименование меняет только сведения: в хранилище файл лежит под своим id
  const renameFile = (id, name) => {
    const clean = safeFileName(name);
    setFileStore((s) => (s.added.some((f) => f.id === id)
      ? { ...s, added: s.added.map((f) => (f.id === id ? { ...f, name: clean, updatedAt: Date.now() } : f)) }
      : { ...s, renamed: { ...s.renamed, [id]: clean } }));
  };
  // Новая папка внутри parent (null — в корне). Возвращает её id
  const createFolder = (name, parent) => {
    const now = Date.now();
    const id = uid ? newId() : `u-${now}`;
    setFileStore((s) => ({ ...s, folders: [...s.folders, { id, name: safeFileName(name), parent, createdAt: now, updatedAt: now }] }));
    return id;
  };
  /* Загрузка файлов в папку folder.
     Вошедший: байты — в облако (Supabase Storage, с настоящим процентом и отменой),
     сведения — в список (он сам уйдёт в таблицу files). Гость: байты — в этот браузер.
     Файл появляется в списке только после того, как содержимое сохранено */
  const uploadCtl = useRef({}); // id загрузки → { abort }
  const guestSeq = useRef(0);
  const uploadUid = useRef(uid); // кто вошёл сейчас — поздний ответ загрузки сверяет с ним
  uploadUid.current = uid;
  /* Вышли или сменили аккаунт — идущие загрузки прежнего отменяем и убираем их строки.
     Иначе загрузка, закончившись позже, записала бы файл прежнего аккаунта в список нового */
  useEffect(() => () => {
    Object.values(uploadCtl.current).forEach((c) => { try { c?.abort?.(); } catch {} });
    uploadCtl.current = {};
    setUploads([]);
  }, [uid]);
  addFilesRef.current = (...a) => addFiles(...a);
  const addFiles = (fileList, folder) => {
    const picked = Array.from(fileList || []);
    if (!picked.length) return;
    const rejected = [];
    picked.forEach((file) => {
      const problem = fileProblem(file);
      if (problem) rejected.push(`«${safeFileName(file.name)}» — ${problem.toLowerCase()}`);
      else startUpload(file, folder);
    });
    if (rejected.length) {
      showToast({ title: rejected.length === 1 ? "Файл не добавлен" : `Не добавлено: ${rejected.length}`, text: rejected.slice(0, 2).join("; "), kind: "error" });
    }
  };
  const startUpload = (file, folder, fileId) => {
    const upId = `up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    // У гостя id — число (как у демо-файлов), у аккаунта — uuid (как в облаке)
    const id = fileId ?? (uid ? newId() : Date.now() * 100 + (guestSeq.current++ % 100));
    const name = safeFileName(file.name);
    const meta = {
      id, name, cat: catFromFile(file), folder, device: uploadDevice(),
      mb: toMb(file.size), size: file.size, mime: file.type || "", addedAt: Date.now(),
    };
    const patch = (fields) => setUploads((list) => list.map((u) => (u.id === upId ? { ...u, ...fields } : u)));
    const fail = (text) => patch({ status: "error", error: text });
    const done = (extra) => {
      setUploads((list) => list.filter((u) => u.id !== upId));
      delete uploadCtl.current[upId];
      if (uploadUid.current !== uid) return; // пока грузилось, вошёл другой (или вышли) — не его файл
      // Уже есть (догрузила очередь в другой вкладке) — не дублируем
      setFileStore((s) => (s.added.some((f) => f.id === id) ? s : { ...s, added: [...s.added, { ...meta, ...extra, updatedAt: meta.addedAt }] }));
      showToast({ title: "Файл добавлен", text: `${name} → ${folderName(folders, folder)}` });
    };
    setUploads((list) => [...list, { id: upId, fileId: id, name, folder, progress: 0, status: "uploading", file }]);

    if (!uid) {
      // Гость: содержимое — только в этот браузер
      rememberLocal("guest", id, file);
      patch({ progress: 1 });
      setTimeout(() => done({}), 250);
      return;
    }
    // Нет сети — сразу в очередь: загрузится, когда связь вернётся (пока NEXA открыта)
    const toQueue = async () => {
      const ok = await enqueueUpload(uid, { ...meta, addedAt: meta.addedAt, attempts: 0, status: "queued" }, file);
      setUploads((list) => list.filter((u) => u.id !== upId));
      if (!ok) { showToast({ title: "Файл не сохранился для отправки", text: `«${name}»: в браузере не хватило места — добавьте его, когда появится сеть`, kind: "error" }); return; }
      loadQueueRows();
    };
    if (navigator.onLine === false) { toQueue(); return; }
    // Страховка на время загрузки: копия в очереди (status "active" этой вкладки — очередь её не трогает).
    // Android выгрузил NEXA посреди загрузки — при следующем открытии файл догрузится из очереди
    // (через ACTIVE_STALE_MS; тот же id — без дублей). Не сохранилась копия — загружаем всё равно
    const backup = enqueueUpload(uid, { ...meta, attempts: 0, status: "active", owner: TAB_ID, nextAt: Date.now() + ACTIVE_STALE_MS }, file).catch(() => false);
    const dropBackup = () => backup.then(() => dequeueUpload(uid, id)).catch(() => {});
    const ctl = uploadToCloud({ uid, id, file, onProgress: (pr) => patch({ progress: pr }) });
    uploadCtl.current[upId] = ctl;
    ctl.promise
      .then(({ path }) => { rememberLocal(uid, id, file); done({ path }); dropBackup(); })
      .catch((err) => {
        delete uploadCtl.current[upId];
        if (err?.kind === "abort") { setUploads((list) => list.filter((u) => u.id !== upId)); dropBackup(); }
        else if (err?.kind === "network") backup.then(toQueue); // связь оборвалась посреди загрузки
        else { fail(err?.text || "Не загрузилось — попробуйте ещё раз"); dropBackup(); }
      });
  };

  /* ── Очередь загрузок без сети (src/lib/files.js) ──
     Строки очереди в списке загрузок: status "queued" (ждёт сети или повтора),
     "uploading", "error" (повторы кончились или ошибка, которую повтор не исправит).
     Повторы: 3 раза с паузами 5, 20 и 60 с, потом — только «Повторить».
     Перед отправкой проверяем, что вошёл тот же человек, чей файл в очереди */
  const QUEUE_DELAYS = [5000, 20000, 60000];
  // Копия идущей загрузки другой вкладки / прошлого запуска считается брошенной через 2 минуты
  const ACTIVE_STALE_MS = 120000;
  const ownActive = (it) => it.status === "active" && it.owner === TAB_ID; // её сейчас грузит эта вкладка
  const queueBusy = useRef(false);
  const queueTimer = useRef(null);
  const loadQueueRows = () => {
    if (!uid) return;
    const q = readUploadQueue(uid).filter((it) => !ownActive(it));
    setUploads((list) => [
      ...list.filter((u) => !u.queued),
      ...q.map((it) => ({ id: `q-${it.id}`, fileId: it.id, name: it.name, folder: it.folder, queued: true,
        progress: 0, status: it.status === "error" ? "error" : "queued", error: it.error, nextAt: it.nextAt || null })),
    ]);
  };
  // reset: "all" — «Повторить» (и упавшие тоже), "waiting" — связь вернулась (только ждущие, без пауз)
  const runUploadQueue = async (reset = null) => {
    if (!uid || queueBusy.current || navigator.onLine === false) return;
    queueBusy.current = true; clearTimeout(queueTimer.current);
    try {
      if (reset) readUploadQueue(uid).forEach((it) => {
        if (!ownActive(it) && (reset === "all" || it.status === "queued")) patchUploadQueue(uid, it.id, { status: "queued", attempts: reset === "all" ? 0 : it.attempts, error: null, nextAt: null });
      });
      for (const it of readUploadQueue(uid)) {
        if (it.status === "error" || ownActive(it) || (it.nextAt && it.nextAt > Date.now())) continue;
        // Сессия того же аккаунта — иначе не отправляем (вышли / вошли другим)
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user?.id !== uid) break;
        const blob = await queuedBlob(uid, it.id);
        if (!blob) { patchUploadQueue(uid, it.id, { status: "error", error: "Содержимое файла не сохранилось — добавьте его заново" }); continue; }
        setUploads((list) => list.map((u) => (u.fileId === it.id && u.queued ? { ...u, status: "uploading", progress: 0 } : u)));
        try {
          const { path } = await uploadToCloud({ uid, id: it.id, file: blob,
            onProgress: (pr) => setUploads((list) => list.map((u) => (u.fileId === it.id && u.queued ? { ...u, progress: pr } : u))) }).promise
            .catch((e) => { if (e?.kind === "exists") return { path: `${uid}/${it.id}` }; throw e; }); // уже в облаке — не дублируем
          rememberLocal(uid, it.id, blob);
          const { attempts, status, error, nextAt, owner, ...meta } = it;
          setFileStore((st) => (st.added.some((f) => f.id === it.id) ? st
            : { ...st, added: [...st.added, { ...meta, path, updatedAt: Date.now() }] }));
          await dequeueUpload(uid, it.id);
          notify({ cat: "files", key: `upload:${it.id}`, source: "Это устройство", title: "Файл загружен", text: owner ? `«${it.name}» — загрузка продолжилась после перезапуска NEXA` : `«${it.name}» — после восстановления связи`, target: { tab: "files" } });
        } catch (e) {
          const n = (it.attempts || 0) + 1;
          if ((e?.kind === "network" || e?.kind === "server") && n < QUEUE_DELAYS.length + 1) {
            patchUploadQueue(uid, it.id, { status: "queued", attempts: n, nextAt: Date.now() + QUEUE_DELAYS[n - 1], error: e?.text });
          } else {
            patchUploadQueue(uid, it.id, { status: "error", attempts: n, nextAt: null,
              error: e?.kind === "network" || e?.kind === "server" ? `Не загрузилось после ${n} попыток — нажмите «Повторить»` : e?.text || "Не загрузилось" });
          }
        }
      }
    } finally {
      queueBusy.current = false;
      loadQueueRows();
      // Ближайший повтор по расписанию
      const next = Math.min(Infinity, ...readUploadQueue(uid).filter((it) => (it.status === "queued" || (it.status === "active" && !ownActive(it))) && it.nextAt).map((it) => it.nextAt));
      if (next < Infinity) queueTimer.current = setTimeout(() => runUploadQueue(), Math.max(500, next - Date.now()));
    }
  };
  const runQueueRef = useRef(runUploadQueue); runQueueRef.current = runUploadQueue;
  const loadQueueRef = useRef(loadQueueRows); loadQueueRef.current = loadQueueRows;
  // Вернулись в NEXA после фона (30 с и дольше, не чаще раза в 30 с): пока NEXA была «заморожена»,
  // другие устройства могли что-то поменять, а соединение — оборваться. Перечитываем облако
  // (заодно уйдёт неотправленное), проверяем канал связи и очередь загрузок — один раз, без дублей
  useReturnToApp(() => {
    if (!uid) return;
    devicesSync.retry(); chatsSync.retry(); filesSync.retry(); foldersSync.retry(); scheduleSync.retry(); memorySync.retry(); notesSync.retry();
    link.refresh();
    runQueueRef.current("waiting");
    clipRef.current?.refresh();
  }, { native: isNative, appPlugin: CapApp });
  // Вошли / перезапуск: строки очереди на экран, есть сеть — отправляем; связь вернулась — тоже
  useEffect(() => {
    if (!uid) return;
    loadQueueRef.current();
    const t = setTimeout(() => runQueueRef.current(), 1500); // после сводки с облаком
    const again = () => runQueueRef.current("waiting");
    window.addEventListener("online", again);
    return () => { clearTimeout(t); clearTimeout(queueTimer.current); window.removeEventListener("online", again); };
  }, [uid]);
  // Отменить идущую загрузку, повторить неудачную или убрать строку с ошибкой
  const uploadAction = (upId, action) => {
    const u = uploads.find((x) => x.id === upId);
    if (!u) return;
    // Строка очереди: «Повторить» — сразу снова; «Убрать» / «Отменить» — убрать из очереди
    if (u.queued) {
      if (action === "retry") { patchUploadQueue(uid, u.fileId, { status: "queued", attempts: 0, nextAt: null, error: null }); loadQueueRows(); runUploadQueue(); }
      else dequeueUpload(uid, u.fileId).then(loadQueueRows);
      return;
    }
    if (action === "cancel") { uploadCtl.current[upId]?.abort(); return; }
    setUploads((list) => list.filter((x) => x.id !== upId));
    if (action === "retry") startUpload(u.file, u.folder, u.fileId);
  };
  const closeViewer = () => setOpenFile(null);

  // Отдельный эффект для скрытия скролла на ассистенте
  useEffect(() => {
    document.body.style.overflow = tab === "assistant" ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [tab]);

  // Сбрасываем «заказы» при уходе с соответствующего экрана,
  // чтобы при следующем заходе они не сработали повторно
  useEffect(() => {
    if (tab !== "files") setSearchFolder(null);
    if (tab !== "assistant") setSearchChatId(null);
  }, [tab]);

  /* ── Куда ведёт уведомление (колокольчик, всплывающее, системное) ── */
  const openTarget = (t) => {
    if (!t) return;
    // Диалог ассистента и файл — из ссылок nexa:// (приложение для ПК). Нет такого — честно говорим
    if (t.chat) {
      if (!chats.some((c) => c.id === t.chat)) { showToast({ title: "Диалог не найден", text: "Его нет в этом аккаунте или он ещё не синхронизировался" }); return; }
      setSearchChatId(t.chat);
      navTransition(navDir("assistant"), () => goTab("assistant"));
      setChatOpenReq({ id: t.chat, n: Date.now() });
      return;
    }
    if (t.file) {
      if (!files.some((f) => f.id === t.file)) { showToast({ title: "Файл не найден", text: "Его нет в «Файлах» этого аккаунта" }); return; }
      setOpenFile({ id: t.file });
      return;
    }
    if (t.device) {
      const card = devices.find((d) => d.id === t.device || d.members?.includes(t.device));
      if (card) { setActivityOpen(false); showDevice(card.id); return; }
      goTab("home"); return;
    }
    if (t.sync) { setSyncOpen(true); return; }
    // Общий буфер обмена — Настройки, сразу к его блоку
    if (t.clip) { goTab("settings"); setTimeout(() => document.getElementById("nx-clip-settings")?.scrollIntoView({ block: "start", behavior: "smooth" }), 150); return; }
    if (t.activity) { openActivity(); return; }
    if (t.update) { goTab("settings"); return; }
    if (t.tab) {
      goTab(t.tab);
      // Настройки уведомлений — сразу к своему разделу
      if (t.notes) setTimeout(() => document.getElementById("nx-note-settings")?.scrollIntoView({ block: "start", behavior: "smooth" }), 120);
    }
  };
  openTargetRef.current = openTarget;
  // Нажали на системное уведомление (Android или браузер)
  useEffect(() => onSystemNoteOpen((t) => openTargetRef.current?.(t)), []);
  // Приложение для ПК: ссылки nexa:// и нажатия на уведомления Windows (src/lib/deeplink.js).
  // Неизвестные ссылки молча пропускаем; ссылка только открывает экран, ничего не делает
  useEffect(() => onDesktopOpen((url) => {
    const t = parseNexaLink(url);
    if (t) openTargetRef.current?.(t);
  }), []);

  /* ── Синхронизация: «не удалось» — когда повторы кончились или сессия закончилась;
     «восстановлено» — только если до этого был сбой или без сети ждали изменения,
     и облако подтвердило, что всё сохранено. Ключ — по 10-минутке: одно на все вкладки ── */
  const syncAlarm = useRef({ failed: false, waited: false });
  useEffect(() => {
    if (!uid) { syncAlarm.current = { failed: false, waited: false }; return; }
    const a = syncAlarm.current;
    const authLost = Object.values(syncState).some((st) => st?.kind === "auth");
    const bucket = Math.floor(Date.now() / 600000);
    if (!online && syncPending > 0) a.waited = true;
    if ((syncGaveUp || authLost) && !a.failed) {
      a.failed = true;
      notify({ cat: "sync", key: `sync-fail:${uid}:${bucket}`, source: "Облако NEXA", target: { sync: true },
        title: authLost ? "Сессия закончилась" : "Не удалось сохранить в облако",
        text: authLost ? "Изменения на устройстве — войдите заново" : `${syncError || "Облако не отвечает"}${syncPending ? ` · ждут: ${syncPending}` : ""}` });
    }
    if ((a.failed || a.waited) && online && !syncLoading && !syncError && syncPending === 0) {
      a.failed = false; a.waited = false;
      notify({ cat: "sync", key: `sync-ok:${uid}:${bucket}`, source: "Облако NEXA", target: { sync: true },
        title: "Связь восстановлена", text: "Изменения сохранены в облаке" });
    }
  }, [uid, online, syncLoading, syncError, syncPending, syncGaveUp]);

  /* ── Новое устройство в аккаунте: появилось в списке, подтверждённом облаком.
     Какие устройства уже знаем — nexa-known-devices@<id>; первый раз запоминаем молча ── */
  const realIds = deviceStore.added.map((d) => deviceStore.state[d.id]?.real && deviceStore.state[d.id]?.device_id).filter(Boolean);
  const realKey = realIds.join(",");
  useEffect(() => {
    if (!uid || !syncState.devices?.ok) return;
    const k = `nexa-known-devices@${uid}`;
    let known = null;
    try { known = JSON.parse(localStorage.getItem(k)); } catch {}
    const save = (ids) => { try { localStorage.setItem(k, JSON.stringify(ids)); } catch {} };
    if (!Array.isArray(known)) { save(realIds); return; }
    const fresh = realIds.filter((id) => !known.includes(id) && id !== link.self?.device_id);
    for (const id of fresh) {
      const row = realRowOf(id);
      notify({ cat: "devices", key: `newdev:${id}`, source: "Аккаунт NEXA", title: "Новое устройство в аккаунте", text: row?.name || "Устройство", target: { device: row?.id } });
    }
    if (fresh.length) save([...new Set([...known, ...realIds])]);
  }, [uid, syncState.devices?.ok, realKey]);

  /* ── Расписание: за 15 минут до дела ──
     В приложении с включёнными системными — напоминания заранее ставит Android
     (придут и при закрытом приложении); тогда здесь только запись в колокольчик.
     Иначе — проверка раз в 30 с, пока NEXA открыта */
  const REMIND_MIN = 15;
  const startOf = (it) => { const t = new Date(`${it.date || dayKey()}T${it.time}:00`).getTime(); return Number.isFinite(t) ? t : null; };
  const nativeReminders = isNative && notePrefs.schedule?.system && notePerm === "granted";
  const remindKey = (it) => `sched:${it.id}:${it.date}T${it.time}`;
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      for (const it of schedule) {
        const start = startOf(it);
        if (!start || now < start - REMIND_MIN * 60000 || now >= start) continue;
        const left = Math.max(1, Math.round((start - now) / 60000));
        notify({ cat: "schedule", key: remindKey(it), source: "Расписание", target: { tab: "today" },
          title: `Через ${left} мин: ${it.title}`, text: `Начало в ${it.time}`,
          ...(nativeReminders ? { system: false, toast: false } : {}) });
      }
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [schedule, nativeReminders]);
  useEffect(() => {
    if (!isNative) return;
    if (!nativeReminders) { scheduleReminders([]); return; }
    const week = Date.now() + 7 * 86400000;
    scheduleReminders(schedule.map((it) => ({ it, start: startOf(it) }))
      .filter(({ start }) => start && start < week)
      // Android может показать напоминание позже (экономия заряда, телефон был выключен) —
      // поэтому без «через 15 мин»: «Скоро» и точное время начала
      .map(({ it, start }) => ({ key: remindKey(it), at: start - REMIND_MIN * 60000, title: `Скоро: ${it.title}`, body: `Начало в ${it.time}`, target: { tab: "today" } })));
  }, [schedule, nativeReminders]);

  /* ── Обновление приложения: один раз на версию ── */
  useEffect(() => {
    if (!appUpdate?.version) return;
    notify({ cat: "updates", key: `update:${appUpdate.version}`, source: "NEXA", target: { update: true },
      title: `Вышла NEXA ${appUpdate.version}`, text: appUpdate.required ? "Эта версия больше не поддерживается — обновите" : "Можно обновить — займёт минуту" });
  }, [appUpdate?.version]);

  /* ── Панель быстрых действий (QuickPanel) ──
     Открывается: молния в верхней строке, Ctrl/⌘ + K, событие QUICK_EVENT,
     в будущей EXE-версии — глобальное сочетание (onDesktopQuickPanel).
     Не открывается поверх другого окна, экрана входа и экрана «Обновите» */
  const [quickOpen, setQuickOpen] = useState(false);
  const quickCloseRef = useRef(null); // плавное закрытие панели (ставит QuickPanel)
  const [searchQuery, setSearchQuery] = useState("");
  const openSearch = (q = "") => { setSearchQuery(q); setSearchOpen(true); };
  const quickBlocked = useRef(false);
  quickBlocked.current = !!appUpdate?.required || showGate || !!locked;
  useEffect(() => {
    const open = () => {
      // Уходящее окно (анимация закрытия) уже не считается открытым
      if (quickBlocked.current || document.querySelector('[role="dialog"]:not(.nx-hist-drawer):not(.nx-leaving):not(.nx-cont-offer), .nx-auth-gate')) return;
      setQuickOpen(true);
    };
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.code !== "KeyK") return;
      e.preventDefault(); // в браузере Ctrl+K иначе прыгает в адресную строку
      if (document.querySelector(".nx-quick-panel")) (quickCloseRef.current ? quickCloseRef.current() : setQuickOpen(false)); else open();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(QUICK_EVENT, open);
    const offDesktop = onDesktopQuickPanel(open);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(QUICK_EVENT, open); offDesktop(); };
  }, []);
  // Отправить файл, который уже лежит в облаке аккаунта: тот же file.send, что и
  // после загрузки (получатель открывает его по своей ссылке <uid>/<id>)
  const sendStoredFile = async (d, f) => {
    if (!uid || !f.path) return;
    const name = safeFileName(f.name);
    const ok = await link.emit("file.send", { id: f.id, to_device: d.device_id, name, size: fileBytes(f), mime: f.mime || "" });
    if (!ok) { notify({ cat: "files", key: `file-fail:${f.id}:${Date.now()}`, source: "Это устройство", title: `Файл не отправлен на «${d.name}»`, text: "Нет связи — попробуйте ещё раз", target: { device: d.id } }); return; }
    notify({ cat: "files", key: `file-sent:${f.id}:${d.device_id}:${Date.now()}`, source: "Это устройство", title: `Файл отправлен на «${d.name}»`, text: name, target: { device: d.id } });
    logActivity("sent", `Файл «${name}» отправлен на «${d.name}»`);
  };
  // Файл с этого устройства: обычный выбор файла, дальше — sendFileTo, как на экране устройства
  const quickFileRef = useRef(null);
  const quickFileTo = useRef(null);
  const openActivity = () => { if (tab === "assistant") setTab("home"); setOpenDeviceId(null); setActivityOpen(true); };
  const newChatQuick = () => {
    setSearchChatId(null); goTab("assistant");
    setTimeout(() => window.dispatchEvent(new Event("nexa-new-chat")), 60);
  };
  // Только то, что сейчас можно сделать; почему чего-то нет — одной строкой внизу
  const quick = (() => {
    const online = link.status === "online";
    const live = devices.filter((d) => d.real && !d.isSelf && d.online);
    const others = devices.some((d) => d.real && !d.isSelf);
    const canLink = !!uid && online && live.length > 0;
    const pickDevice = (title, run) => ({
      title, placeholder: "Найти устройство…", empty: "Устройства больше не в сети",
      items: live.map((d) => ({ id: d.id, title: d.name, sub: deviceStatus(d), icon: d.icon, run: () => run(d) })),
    });
    const next = nextScheduleItem(schedule);
    const cloudFiles = sortByRecent(files.filter((f) => f.uploaded && f.path));
    const syncText = !online ? `Нет сети${syncPending ? ` · ждут отправки: ${syncPending}` : ""}`
      : syncLoading ? "Синхронизация: загружаем данные…" : syncError ? `Синхронизация: ${syncError}`
      : syncPending ? `Отправляем: ${syncPending}` : "Сохранено в облаке";
    const list = [
      { id: "chat", title: "Новый диалог с ассистентом", sub: "ИИ-ассистент NEXA", icon: Icon.sparkle,
        keywords: ["ассистент", "ии", "чат", "диалог", "вопрос", "спросить"], run: newChatQuick },
      // Продолжить диалог на другом своём устройстве: сначала какой (открытый сейчас — первым), потом окно выбора устройства
      !!uid && online && contTargets.some((d) => d.real && !d.isSelf && !d.bt && d.online) && chats.length > 0 && { id: "continue", title: "Продолжить диалог на другом устройстве", sub: "Откроется там после «Открыть»", icon: Icon.chat,
        keywords: ["продолжить", "continuity", "диалог", "чат", "на телефоне", "на компьютере", "другом устройстве"],
        pick: { title: "Какой диалог?", placeholder: "Найти диалог…", empty: "Диалогов нет",
          items: [...chats].sort((p, q) => (q.id === currentChatRef.current) - (p.id === currentChatRef.current) || (q.updatedAt || 0) - (p.updatedAt || 0)).slice(0, 30)
            .map((c) => ({ id: c.id, title: c.title || "Без названия", sub: c.id === currentChatRef.current ? "Открыт сейчас" : `${c.messages?.length || 0} сообщ.`, icon: Icon.chat,
              run: () => setContSend({ kind: "chat", ref: c.id, title: c.title }) })) } },
      canLink && flow.on && { id: "flow", title: "Передать текст или ссылку", sub: "NEXA Flow · на устройство в сети", icon: Icon.shareUp,
        keywords: ["flow", "буфер", "текст", "ссылка", "передать", "отправить", "скопировать"],
        pick: pickDevice("Куда передать?", (d) => setFlowSend({ text: "", to: d.id })) },
      canLink && { id: "file", title: "Отправить файл", sub: "На устройство в сети", icon: Icon.send,
        keywords: ["файл", "отправить", "передать", "документ", "фото"],
        pick: { ...pickDevice("Куда отправить?", null), items: live.map((d) => ({
          id: d.id, title: d.name, sub: deviceStatus(d), icon: d.icon,
          pick: { title: "Какой файл?", placeholder: "Найти файл…", empty: "", items: [
            { id: "__local", title: "Выбрать на этом устройстве…", sub: "До 50 МБ, загрузится в облако аккаунта", icon: Icon.plus,
              run: () => { quickFileTo.current = d; quickFileRef.current?.click(); } },
            ...cloudFiles.map((f) => ({ id: f.id, title: f.name, sub: fileMeta(f), keywords: [catOf(f)?.label],
              thumb: <FileThumb file={f} w={34} h={34} iconSize={14} radius={0} />, run: () => sendStoredFile(d, f) })),
          ] },
        })) } },
      { id: "note", title: "Новая заметка", sub: uid ? "Сохранится в аккаунте" : "Сохранится в этом браузере", icon: Icon.edit,
        keywords: ["заметка", "заметки", "записать", "запись", "список", "чек-лист", "идея", "мысль"], run: () => openNotes({ create: true }) },
      { id: "files", title: "Открыть «Файлы»", sub: files.length ? `${files.length} ${plural(files.length, ["файл", "файла", "файлов"])}` : "Пока пусто — можно добавить",
        icon: Icon.folder, keywords: ["файлы", "папки", "документы", "раздел"], run: () => goTab("files") },
      canLink && { id: "find", title: "Найти устройство", sub: "Подать сигнал на устройство в сети", icon: Icon.signal,
        keywords: ["найти", "поиск", "где", "телефон", "сигнал", "позвонить"],
        pick: pickDevice("Какое устройство найти?", (d) => { findDevice(d); showDevice(d.id); }) },
      { id: "next", title: "Ближайшее дело", icon: Icon.calendar,
        sub: next ? `${scheduleDayLabel(next.date)}, ${next.time} · ${next.title}` : "Ближайших дел нет — открыть расписание",
        keywords: ["расписание", "сегодня", "дело", "событие", "встреча", "календарь", "план"], run: () => goTab("today") },
      uid && { id: "activity", title: "Активность и синхронизация", sub: syncText, icon: Icon.refresh,
        keywords: ["активность", "лента", "события", "синхронизация", "облако", "статус"], run: openActivity },
      uid && syncError && { id: "resync", title: "Повторить синхронизацию", sub: syncError, icon: Icon.refresh,
        keywords: ["синхронизация", "облако", "повторить"], run: retrySync },
      { id: "search", title: "Глобальный поиск", sub: "Файлы, папки, диалоги, заметки, устройства, настройки", icon: Icon.search,
        keywords: ["поиск", "найти", "искать"], run: () => openSearch() },
    ].filter(Boolean);
    const note = !uid ? "Передача текста и файлов, поиск устройств и активность — после входа в аккаунт"
      : !online ? "Нет связи — передача, отправка файлов и поиск устройств вернутся вместе со связью"
      : !others ? "Подключите второе устройство — появятся передача, отправка файлов и поиск устройств"
      : !live.length ? "Другие устройства не в сети — передача, файлы и поиск появятся, когда на них откроют NEXA"
      : !flow.on ? "Передача текста выключена: Настройки → NEXA Flow" : null;
    return { list, note };
  })();

  /* ── Резервная копия (src/lib/backup.js — что входит и проверки, окна — src/ui/backup.jsx) ──
     Копия — данные того, кто сейчас в NEXA (аккаунт или гость). Восстановление: сначала файлы
     (каждый — проверка CRC, загрузка в свою корзину или в браузер гостя), потом списки — только
     если не отменили; список пишется в браузер сразу и с проверкой, в облако уходит обычной
     синхронизацией. Неудача части — остальное не трогаем, в отчёте честно что и почему */
  const backupScopeKey = `nexa-backup-last${scope}`;
  // Когда делали последнюю копию на этом устройстве (у гостя и у каждого аккаунта — своя отметка)
  const [backupLast, setBackupLast] = useState(null);
  useEffect(() => { try { setBackupLast(JSON.parse(localStorage.getItem(backupScopeKey))); } catch { setBackupLast(null); } }, [backupScopeKey]);
  const backupApi = {
    guest: !uid,
    online,
    last: backupLast,
    counts: {
      notes: userNotes.length, chats: chats.length, schedule: schedule.length, memory: memory.length,
      files: files.length, folders: fileStore.folders.length, filesBytes: files.reduce((s, f) => s + (f.size || 0), 0),
      settings: SETTINGS_KEYS.filter((k) => { try { return localStorage.getItem(k) !== null; } catch { return false; } }).length,
    },
    create: async ({ parts, withContent, signal, onProgress }) => {
      const settings = {};
      for (const k of SETTINGS_KEYS) { try { const v = localStorage.getItem(k); if (v !== null) settings[k] = v; } catch {} }
      const res = await buildBackup({
        uid, appVersion: VERSION, platform: isDesktop ? "pc" : isNative ? "android" : "web",
        data: { notes: userNotes, chats, schedule, memory, folders: fileStore.folders, files, settings },
        parts, withContent, signal, onProgress,
        // Нет копии на устройстве и нет сети — честно «не скачался», а не «нет содержимого»
        getBlob: async (f, sig) => {
          const blob = await fileBlob(f, uid || "guest", sig);
          if (!blob && uid && f.path && navigator.onLine === false) throw new Error("offline");
          return blob;
        },
      });
      return { ...res, name: backupFileName() };
    },
    // Сохранить готовый файл копии: ПК — окно «Сохранить как», Android — в «Загрузки» по кускам, сайт — загрузка браузера
    save: async (blob, name, { signal, onProgress, manifest }) => {
      let r;
      if (isDesktop) r = await desktopSaveFile(blob, name);
      else if (isNative) r = await nativeSaveLarge(blob, { name, mime: "application/octet-stream", signal, onProgress }); // с типом ZIP Android дописал бы к имени «.zip»
      else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        r = "started";
      }
      if (r !== "cancelled") {
        const last = { at: Date.now(), complete: !!manifest?.complete, size: blob.size };
        try { localStorage.setItem(backupScopeKey, JSON.stringify(last)); } catch {}
        setBackupLast(last);
      }
      return r;
    },
    read: async (file, { signal } = {}) => {
      const b = await readBackup(file, { signal });
      return { ...b, summary: backupSummary(b), sameOwner: b.manifest.source?.owner === (await ownerTag(uid)) };
    },
    plan: (b, { parts, mode }) => planRestore({
      current: { notes: userNotes, chats, schedule, memory, folders: fileStore.folders, files },
      backup: b.data, parts, mode, sameOwner: b.sameOwner,
      newId: (kind) => (kind === "file" && !uid ? Date.now() * 100 + (guestSeq.current++ % 100) : kind === "folders" && !uid ? `u-${Date.now()}-${guestSeq.current++}` : newId()),
    }),
    apply: async (b, plan, { parts, mode, signal, onProgress }) => {
      const out = { written: [], failed: [], files: { done: 0, queued: 0, failed: [] }, cancelled: false };
      const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
      // 1. Папки — сразу (их только добавляем, ничего не удаляется): файлам нужны их id
      if (plan.next.folders) {
        const cur = loadFileStore(FILES_KEY + scope);
        const st = { ...cur, folders: plan.next.folders };
        if (write(FILES_KEY + scope, st)) { setFileStore((s) => ({ ...s, folders: plan.next.folders })); out.written.push("folders"); }
        else out.failed.push({ part: "folders", text: "в браузере не хватило места" });
      }
      // 2. Файлы по одному: настоящий прогресс по байтам, отмена между файлами (уже загруженные остаются)
      const add = plan.files.filter((x) => x.action === "add");
      const total = Math.max(1, add.reduce((s, x) => s + (x.meta.size || 0), 0));
      let done = 0;
      for (let i = 0; i < add.length; i++) {
        if (signal?.aborted) { out.cancelled = true; break; }
        const m = add[i].meta;
        const label = `Файл ${i + 1} из ${add.length}: ${m.name}`;
        onProgress?.({ done, total, text: label });
        try {
          const blob = await b.contentOf(m.content, { signal });
          const file = new File([blob], safeFileName(m.name), { type: m.mime || "" });
          const problem = fileProblem(file);
          if (problem) throw new Error(problem);
          const meta = { id: m.id, name: safeFileName(m.name), cat: m.cat, folder: m.folder, device: m.device || uploadDevice(),
            mb: toMb(file.size), size: file.size, mime: m.mime || "", addedAt: m.addedAt || Date.now() };
          if (!uid) {
            // Гость: содержимое — только в этот браузер (IndexedDB хранит до 25 МБ на файл)
            const ok = await cachePut(cacheKey("guest", m.id), file);
            if (ok === null) throw new Error("больше 25 МБ — без входа в аккаунт такой файл не сохранить");
            setFileStore((s) => (s.added.some((f) => f.id === m.id) ? s : { ...s, added: [...s.added, { ...meta, updatedAt: Date.now() }] }));
            out.files.done++;
          } else if (navigator.onLine === false) {
            // Нет сети — в обычную очередь загрузок: уйдёт, когда связь вернётся
            const ok = await enqueueUpload(uid, { ...meta, attempts: 0, status: "queued" }, file);
            if (!ok) throw new Error("не сохранился для отправки — в браузере нет места");
            out.files.queued++;
          } else {
            const { path } = await uploadToCloud({ uid, id: m.id, file, onProgress: (p) => onProgress?.({ done: done + p * file.size, total, text: label }) }).promise
              .catch((e) => { if (e?.kind === "exists") return { path: `${uid}/${m.id}` }; throw e; });
            rememberLocal(uid, m.id, file);
            setFileStore((s) => (s.added.some((f) => f.id === m.id) ? s : { ...s, added: [...s.added, { ...meta, path, updatedAt: Date.now() }] }));
            out.files.done++;
          }
        } catch (e) {
          if (signal?.aborted || e?.code === "abort" || e?.kind === "abort") { out.cancelled = true; break; }
          out.files.failed.push({ name: m.name, text: e?.text || e?.message || "не восстановился" });
        }
        done += m.size || 0;
      }
      if (out.files.queued) loadQueueRows();
      // 3. Списки — только если не отменили (при отмене прежние данные остаются как были)
      if (!out.cancelled) {
        onProgress?.({ done: total, total, text: "Записываем заметки, диалоги и расписание" });
        /* План считали, когда выбрали файл копии, — с тех пор (загрузка файлов, раздумья над
           окном) списки могли измениться: сводка с облаком, правка на другом устройстве.
           Пересчитываем по тому, что лежит сейчас, — иначе свежая правка молча пропала бы */
        const now = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v : fallback; } catch { return fallback; } };
        if (mode) plan = planRestore({
          current: { notes: now(userNotesKey(uid), userNotes), chats: now(CHATS_KEY + scope, chats), schedule: now(SCHEDULE_KEY + scope, schedule), memory: now(memoryKey(uid), memory), folders: plan.next.folders || fileStore.folders, files },
          backup: b.data, parts, mode, sameOwner: b.sameOwner,
          newId: () => newId(),
        });
        const lists = [
          ["notes", userNotesKey(uid), (v) => { notesRef.current = v; setNotesStore(v); }],
          ["chats", CHATS_KEY + scope, (v) => setChatsStore(v)],
          ["schedule", SCHEDULE_KEY + scope, (v) => setScheduleStore(v)],
          ["memory", memoryKey(uid), (v) => setMemoryStore(v)],
        ];
        for (const [part, key, set] of lists) {
          if (!plan.next[part]) continue;
          const value = part === "schedule" ? sortSchedule(plan.next[part]) : plan.next[part];
          if (write(key, value)) { set(value); out.written.push(part); }
          else out.failed.push({ part, text: "в браузере не хватило места — эта часть не восстановлена" });
        }
        if (parts.has("settings") && b.data.settings) {
          let n = 0;
          for (const [k, v] of Object.entries(b.data.settings)) { try { localStorage.setItem(k, v); n++; } catch {} }
          if (b.data.settings["nexa-theme"] === "dark" || b.data.settings["nexa-theme"] === "light") switchTheme(b.data.settings["nexa-theme"]);
          if (n) out.written.push("settings");
        }
      }
      return out;
    },
  };

  /* Содержимое раздела t. Раньше раздел рисовался прямо по tab (key={tab}): при каждой смене
     старый экран удалялся, новый собирался с нуля и проигрывал своё появление — свайп выглядел как
     перезагрузка. Теперь каждый раздел — свой блок с ключом (tabPanels): во время свайпа рядом
     собирается соседний, и после свайпа он же становится текущим, без пересоздания */
  const screenFor = (t) => (t === "assistant" ? (
      <ScreenAssistant
        initialChatId={searchChatId}
        openRequest={chatOpenReq}
        onCurrentChat={(id) => { currentChatRef.current = id; }}
        memory={memory} memoryOn={memoryOn} memoryApi={memoryApi}
        onContinueChat={uid ? (c) => setContSend({ kind: "chat", ref: c.id, title: c.title }) : null}
        chats={chats}
        setChats={setChats}
        onToast={showToast}
        tab={t}
        setTab={goTab}
        devices={devices}
        onAddDevice={onAddDevice}
        onUploadFiles={() => uploadInputRef.current?.click()}
        files={files}
        uid={uid}
        onAddFiles={(list) => addFiles(list, null)}
        account={auth.user ? { email: auth.user.email || "" } : null}
        sync={{ loading: syncLoading && online, text: !online ? `Нет сети${syncPending ? ` · ждут отправки: ${syncPending}` : ""}` : syncError, onRetry: online ? retrySync : null }}
        />
  ) : (
    <>
        {t === "home" && (
          <ScreenHome
            devices={devices}
            received={received}
            update={homeUpdate}
            onUpdateLater={laterUpdate}
            onNavigate={goTab}
            onOpenDevice={showDevice}
            onAddDevice={onAddDevice}
            onAbout={openAbout}
            onAllDevices={openAllDevices}
            onSearch={() => openSearch()}
            bell={<NotificationBell notes={notes} onSeen={() => setNotes((s) => ({ ...s, seenAt: Date.now() }))} onClear={() => setNotes({ items: [], seenAt: Date.now() })} onOpen={(t) => openTargetRef.current?.(t)} onSettings={() => openTargetRef.current?.({ tab: "settings", notes: true })} />}
            activityBlock={uid ? <ActivityBlock items={activity} onOpen={() => { setActivityOpen(true); setOpenDeviceId(null); }} /> : null}
            findState={findState}
            onFind={findDevice}
          />
        )}
        {t === "today" && <ScreenToday schedule={schedule} onAddItem={addScheduleItem} onRemoveItem={removeScheduleItem} onNotes={() => openNotes()} notesCount={userNotes.filter((n) => !n.archived).length} />}
        {t === "media" && <ScreenMedia files={files} uid={uid} onOpenFile={setOpenFile} onOpenCategory={openCategory} onTransfer={openTransfer} />}
        {t === "files" && (
          <ScreenFiles
            key={`files-${searchFolder || "root"}`}
            files={files}
            filter={filesFilter}
            device={devices.find((d) => d.id === filesDevice)}
            initialFolder={searchFolder}
            onClearFilter={() => { setFilesFilter(null); setFilesDevice(null); }}
            onOpenFile={setOpenFile}
            folders={folders}
            uploads={uploads}
            onAddFiles={addFiles}
            onUploadAction={uploadAction}
            onCreateFolder={createFolder}
            onTransfer={openTransfer}
          />
        )}
        {t === "settings" && <ScreenSettings onAbout={openAbout}
          noteBlock={<NoteSettings prefs={notePrefs} setPrefs={setNotePrefs} perm={notePerm} onAsk={askNotePerm} account={!!auth.user} />}
          widgetBlock={<NotesWidgetSettings hide={widgetHide} setHide={changeWidgetHide} onNotes={() => openNotes()} />}
          backupBlock={<BackupSettings api={backupApi} />}
          updateBlock={isDesktop ? (
            <>
              <SectionTitle>Обновление</SectionTitle>
              <SettingsGroup>
                {/* Приложение для ПК: новая версия — карточка с установкой, иначе — что стоит и «Проверить» */}
                {appUpdate ? <UpdateCard variant="settings" update={appUpdate} /> : (
                  <SettingsRow last icon={Icon.check({ c: C.green, s: 18 })} title={`Приложение для ПК · NEXA ${VERSION}`}
                    subtitle={updateCheckedAt ? `Последняя версия · проверено в ${hhmm(new Date(updateCheckedAt))}` : "Проверяем…"}
                    right={<button type="button" className="nx-ghost-btn" onClick={() => checkUpdate(true)} style={{ ...btnReset, fontSize: 13, padding: "7px 14px", border: `1px solid ${C.borderStrong}`, color: C.text }}>Проверить</button>} />
                )}
              </SettingsGroup>
            </>
          ) : isNative && (
            <>
              <SectionTitle>Обновление</SectionTitle>
              <SettingsGroup>
                {/* Приложение (APK): новая версия — карточка с установкой, иначе — что стоит */}
                {appUpdate ? <UpdateCard variant="settings" update={appUpdate} /> : (
                  <SettingsRow icon={Icon.check({ c: C.green, s: 18 })} title={`Приложение · NEXA ${installedVersion}`}
                    subtitle={updateCheckedAt ? `Последняя версия · проверено в ${hhmm(new Date(updateCheckedAt))} · сайт спрашиваем не чаще раза в 6 часов` : "Проверяем…"} />
                )}
                {/* Интерфейс (веб-часть) — обновляется без нового APK, применяется при следующем запуске */}
                <SettingsRow last wrap
                  icon={ota.status === "error" || ota.status === "needApk" ? Icon.alert({ c: ota.status === "error" ? C.red : C.muted, s: 18 })
                    : ota.status === "downloading" || ota.status === "ready" ? Icon.download({ c: C.mint, s: 18 })
                    : Icon.check({ c: C.green, s: 18 })}
                  title={`Интерфейс · NEXA ${VERSION}`}
                  subtitle={{
                    idle: "Проверяем…", checking: "Проверяем…",
                    current: `Актуальный${updateCheckedAt ? ` · проверено в ${hhmm(new Date(updateCheckedAt))}` : ""}`,
                    downloading: `Скачиваем ${ota.version} — ${ota.percent} %. Работе не мешает`,
                    ready: `Скачано ${ota.version} — применится при следующем запуске NEXA`,
                    needApk: `Для ${ota.version} нужна новая версия приложения${appUpdate ? " — обновите выше" : ""}`,
                    error: ota.text,
                  }[ota.status]}
                  right={ota.status === "ready"
                    ? <button type="button" className="nx-ghost-btn" onClick={() => otaApplyNow()} style={{ ...btnReset, fontSize: 13, padding: "7px 14px", border: `1px solid ${C.mint}`, color: C.text }}>Перезапустить</button>
                    : <button type="button" className="nx-ghost-btn" disabled={ota.status === "downloading"} onClick={() => checkUpdate(true)} style={{ ...btnReset, fontSize: 13, padding: "7px 14px", border: `1px solid ${C.borderStrong}`, color: C.text, opacity: ota.status === "downloading" ? 0.5 : 1 }}>Проверить</button>} />
              </SettingsGroup>
            </>
          )}
          onSecurity={openSecurity} user={auth.user}
          memoryBlock={<MemorySettings items={memory} on={memoryOn} setOn={setMemoryOn} api={memoryApi} account={!!uid} localOnly={!!syncState.memory?.localOnly} />} onLogin={() => setAuthOpen(true)} onDeleteData={deleteMyData} onApproveLogin={() => openApprove(null)} sys={thisSys}
          flowBlock={<>{uid && <FlowSettings flow={flow} setFlow={setFlow} count={link.inbox.length + link.sent.length}
            onSend={() => setFlowSend({ text: "" })} onClear={() => { link.clearFlow(); showToast({ title: "История передач очищена", text: "На этом устройстве" }); }} />}<ClipboardSettings clip={clip} account={!!uid} onLogin={() => setAuthOpen(true)} /></>} />}
    </>
  ));
  /* Блоки разделов: текущий и (во время свайпа) соседний за краем экрана — его двигает useTabSwipe.
     quiet — раздел, пришедший свайпом: своё «появление» ему не нужно (он уже на экране) */
  const tabPanels = () => [tab, peek?.tab].filter((t, i, all) => t && all.indexOf(t) === i).map((t) => {
    const isPeek = t !== tab;
    const quietHere = isPeek || quiet === t;
    return (
      <div key={`tab-${t}`} data-panel={t} data-quiet={quietHere ? "" : undefined}
        className={t === "assistant" ? "nx-panel" : "ng-screen-anim nx-panel"}
        aria-hidden={isPeek || undefined} inert={isPeek || undefined}
        style={isPeek ? { position: "absolute", top: 0, left: 0, width: "100%", visibility: "hidden", pointerEvents: "none", animation: "none" }
          : quietHere ? { animation: "none" } : undefined}>
        {screenFor(t)}
      </div>
    );
  });

  return (
    <div style={{
      display: "flex",
      // ВАЖНО про размер на весь экран: "100vh" — это ровно высота окна
      // браузера. Если у тебя всё равно остаются пустые поля по краям,
      // скорее всего дело не в этом файле, а в стандартных стилях Vite
      // (файл src/index.css), которые по умолчанию центрируют и обрезают
      // содержимое страницы — см. пояснение в чате, как это убрать.
      minHeight: "100vh", width: "100%",
      background: C.bg, color: C.text,
      fontFamily: fontBody,
    }}>
            <style>{APP_CSS}</style>
      {/* Фон за содержимым: на «Настройках» — сетка-чертёж, на остальных — грани складки */}
      {tab === "settings" && !openDevice ? <BackdropGrid /> : <BackdropFolds />}
      {/* Главная (макет 2026-10): мягкое мятно-синее свечение фона — на весь экран, и под боковым меню */}
      {/* Фон из макета 2026-10 — на Главной, «Сегодня», «Медиа», «Файлах» и под меню у ассистента */}
      {/* Общий фон-градиент: разделы и экраны поверх них («Активность», «О системе», безопасность) */}
      {!openDevice && (["home", "today", "media", "files", "assistant"].includes(tab) || aboutOpen || activityOpen || securityOpen) && <div className="nx-home-glow" aria-hidden="true" />}
      {/* Версия приложения запрещена — поверх всего экран «Обновите» */}
      {appUpdate?.required && <ForceUpdateScreen update={appUpdate} />}
      {/* Приложение: «потяните, чтобы обновить» */}
      <PullIndicator />
      {/* Синхронизация аккаунта: «Загружаем…» или «Нет связи, работаем локально» */}
      {/* На экране ассистента строка живёт внутри панели истории — не перекрывает чат */}
      {tab !== "assistant" && (
        <SyncStatus online={online} uid={uid} loading={syncLoading} pending={syncPending} queued={uploads.filter((u) => u.queued).length}
          text={syncError} nextAt={syncNextAt} gaveUp={syncGaveUp} onRetry={retrySync} onOpen={() => setSyncOpen(true)} />
      )}
      {syncOpen && <SyncDetails online={online} uid={uid} syncState={syncState} uploads={uploads} trash={uid ? trashCount(uid) : 0}
        onRetry={retrySync} onUploadAction={uploadAction} onLogin={() => { setSyncOpen(false); setAuthOpen(true); }} onClose={() => setSyncOpen(false)} />}
      {/* Первый запуск: экран входа (гостевого входа на нём нет — решение автора) */}
      {showGate && <AuthGate />}
      {authOpen && !auth.user && <AuthModal onClose={() => { setAuthOpen(false); setPendingPair(null); setPendingLogin(null); }}
        hint={pendingPair ? "Войдите той же почтой, что и на другом устройстве, — потом подключим это устройство"
          : pendingLogin ? "Чтобы разрешить вход на другом устройстве, сначала войдите здесь" : null} />}
      {/* Подключение по коду: окно с кодом и окно «Подключаем…» */}
      {btOpen && <BluetoothPicker added={btIds} onAdd={addBtDevice} onClose={() => setBtOpen(false)} />}
      {pairOpen && <PairModal session={pairView} online={link.status === "online"} onNewCode={newPairCode} onBt={() => { closePair(); setBtOpen(true); }}
        onClose={closePair}
        onClaim={claimPair} onScan={canScanQr ? scanAndHandle : null} />}
      {claim && <PairStatusDialog claim={claim} onClose={() => setClaim(null)} />}
      {approve && auth.user && <ApproveLoginModal key={approve.n} initialCode={approve.code} onClose={() => setApprove(null)} onScan={canScanQr ? scanAndHandle : null}
        onApproved={() => logSecurity("approve", "Разрешён вход на новом устройстве", "По QR-коду или коду с экрана")} />}
      {/* Это устройство ищут */}
      {locked && <LockOverlay from={locked.from} onUnlock={unlockSelf} />}
      {finding && <FindOverlay from={finding.from} onFound={() => stopFinding(true)} onTimeout={() => stopFinding(false)} />}
      <Sidebar active={tab} onChange={navTo} />
          <MobileTabBar active={tab} onChange={navTo} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
        {/* Одна и та же строка на всех разделах (и у ассистента): место и порядок кнопок не меняются */}
          <TopBar tab={tab}>
            {/* Компьютер (макет 2026-10): поиск таблеткой, часы, уведомления, быстрые действия, профиль.
                Телефон: поиск значком (таблетка спрятана стилями); на мобильной Главной строки нет — там своя шапка */}
            <button type="button" className="nx-ghost-btn nx-top-search nx-glass" onClick={() => openSearch()} aria-label="Поиск">
              {Icon.search({ c: C.text, s: 16 })} <span className="nx-search-word">Поиск</span>
            </button>
            <TimeDate />
            <NotificationBell notes={notes} onSeen={() => setNotes((s) => ({ ...s, seenAt: Date.now() }))} onClear={() => setNotes({ items: [], seenAt: Date.now() })} onOpen={(t) => openTargetRef.current?.(t)} onSettings={() => openTargetRef.current?.({ tab: "settings", notes: true })} />
            <QuickBtn />
            <span className="nx-top-search-icon"><IconBtn icon={Icon.search} onClick={() => openSearch()} label="Поиск" /></span>
            <IconBtn icon={Icon.user} onClick={() => navTo("settings")} label="Настройки" className="nx-tb-user" />
          </TopBar>

        {/* maxWidth 1440 — контент не растягивается до бесконечности на
            очень широких мониторах, но при этом свободно заполняет
            обычное окно браузера */}
        {/* position: relative — точка отсчёта для соседнего раздела во время свайпа */}
        <div className="ng-main-content" style={{ flex: 1, width: "100%", maxWidth: 1440, margin: "0 auto", position: "relative" }}>
    {/* Открыт экран устройства — показываем его вместо текущего раздела */}
    {securityOpen ? (
    <div key="security" className="ng-screen-anim">
      <ScreenSecurity onBack={() => setSecurityOpen(false)} user={auth.user} onLogin={() => setAuthOpen(true)} online={online} mySid={mySid}
        devices={devices.map((d) => ({ ...d, sids: (d.members || [d.id]).map((rid) => deviceStore.state[rid]?.sid).filter(Boolean), canRevoke: deviceSids(d.id).length > 0 }))}
        onRename={renameDevice} onDisconnect={disconnectWithUndo} onEndSession={endSessionWithUndo} onSignOutOthers={signOutOthersWithUndo}
        syncLine={!online ? { title: "Нет сети", text: syncPending ? `Изменений ждут отправки: ${syncPending}. Уйдут, когда вернётся интернет` : "Всё сохраняется на этом устройстве" }
          : syncError ? { title: "Есть сбой синхронизации", text: syncError }
          : syncLoading || syncPending ? { title: "Синхронизируем…", text: syncPending ? `Ждут подтверждения облака: ${syncPending}` : "Сверяем данные с облаком" }
          : { ok: true, title: "Всё сохранено в облаке", text: "Устройства, диалоги, файлы и расписание подтверждены облаком" }}
        locateBlock={locateBlock} flowOn={flow.on !== false} log={secLog} memoryInfo={{ on: memoryOn, count: memory.length }}
        onOpenMemory={() => { setSecurityOpen(false); setTab("settings"); setTimeout(() => document.getElementById("nx-memory-settings")?.scrollIntoView({ block: "start", behavior: "smooth" }), 350); }}
        onOpenFlow={() => { setSecurityOpen(false); setTab("settings"); setTimeout(() => document.getElementById("nx-flow-settings")?.scrollIntoView({ block: "start", behavior: "smooth" }), 350); }} />
    </div>
  ) : devicesOpen && !openDevice ? (
    <div key="devices" className="ng-screen-anim">
      <ScreenDevices devices={devices} received={received} findState={findState} onOpenDevice={showDevice} onFind={findDevice}
        onAddDevice={onAddDevice} onBack={() => setDevicesOpen(false)} />
    </div>
  ) : notesOpen ? (
    <div key="notes" className="ng-screen-anim">
      <ScreenNotes notes={userNotes} api={notesApi} uid={uid} online={online} sync={uid ? syncState.notes : null} onBack={() => setNotesOpen(false)}
        request={notesReq} schedule={schedule} onAddSchedule={addScheduleItem} toast={showToast} />
    </div>
  ) : aboutOpen ? (
    <div key="about" className="ng-screen-anim">
      <ScreenAbout onBack={() => setAboutOpen(false)} installed={installedVersion} />
    </div>
  ) : activityOpen ? (
    <div key="activity" className="ng-screen-anim">
      <ScreenActivity items={activity} onBack={() => setActivityOpen(false)} onClear={() => setActivity([])} />
    </div>
  ) : openDevice ? (
    <div key={`dev-${openDevice.id}`} className="ng-screen-anim">
      <DeviceScreen
        key={openDevice.id}
        device={openDevice}
        devices={devices}
        files={files}
        folders={folders}
        received={received[openDevice.id]}
        fileCount={files.filter(onDeviceFile(openDevice)).length}
        onBack={() => setOpenDeviceId(null)}
        onOpenFiles={() => openDeviceFiles(openDevice.id)}
        // Удалить = отключить от аккаунта: завершить вход на нём (если знаем его сеанс) и убрать из списка.
        // Своё устройство (и запись без входа) — просто убрать из списка, как раньше
        canRevoke={!openDevice.isSelf && !openDevice.bt && deviceSids(openDevice.id).length > 0}
        onRemove={() => {
          const d = openDevice;
          if (d.isSelf) { removeDevices([d.id]); if (d.real) setTimeout(() => link.emit("devices.changed", {}), 2000); return; }
          disconnectWithUndo(d.id, d.bt || deviceSids(d.id).length ? "full" : "list");
        }}
        onToast={showToast}
        onFind={findDevice}
        findState={openDevice.real ? findState[openDevice.device_id] : undefined}
        onRename={(name) => renameDevice(openDevice.id, name)}
        link={link}
        flowOn={flow.on}
        realActions={openDevice.real && (() => {
          const t = actTarget(openDevice);
          return (
            <>
              {openDevice.parts && <PhoneParts d={openDevice} pick={livePart(openDevice)} onPick={(pid) => setPartPick((m) => ({ ...m, [openDevice.id]: pid }))} />}
              <RealDeviceActions d={t} linkOnline={link.status === "online"}
                st={{ find: findState[t.device_id], lock: lockState[t.device_id], send: sendState[t.device_id], locate: locateState[t.device_id] }}
                act={{ find: findDevice, lock: lockDevice, sendFile: sendFileTo, cancelSend, openLink: openLinkOn, reconnect: openPair, locate: locateDevice }} />
            </>
          );
        })()}
      />
    </div>
  ) : tabPanels()}
</div>
        {/* Нижней строки с логотипом и версией больше нет: казалось, что ниже есть ещё что-то
            и страницу хочется пролистать. Версия — в «О системе» и в шапке ассистента */}
</div>
      {/* Окно просмотра файла поверх всего. key — чтобы для нового файла
          окно открывалось "с нуля", без сообщений от прошлого */}
      {/* Берём файл из общего списка по id, чтобы новое имя сразу было видно в окне */}
      {openFile && files.some((f) => f.id === openFile.id) && (
        <FileViewer
          key={openFile.id}
          file={files.find((f) => f.id === openFile.id)}
          /* Соседние файлы — тот же список и порядок, откуда открыли (папка, категория, недавние):
             стрелки и свайп в окне листают их; nav — открыт листанием (без своего «появления») */
          siblings={(openFile.list || []).map((id) => files.find((f) => f.id === id)).filter(Boolean)}
          onNavigate={(id) => setOpenFile((o) => ({ ...o, id, nav: true }))}
          pop={!openFile.nav}
          photos={sortByRecent(files.filter((f) => f.uploaded && f.cat === "photo"))}
          folders={folders}
          devices={devices}
          onClose={closeViewer}
          onDelete={deleteFile}
          onRename={(name) => renameFile(openFile.id, name)}
          onSent={(device) => finishTransfer(files.find((f) => f.id === openFile.id), device)}
          onContinue={uid ? (f) => { setOpenFile(null); setContSend({ kind: "file", ref: f.id, title: f.name }); } : null}
          onToast={showToast}
        />
      )}
      {/* Окно устройства поверх всего. key — чтобы для другого устройства
          окно открывалось "с нуля" (без идущего поиска от прошлого) */}
      {/* Меню «Передать на…» и полёт карточки к устройству */}
      {transfer && (
        <TransferMenu
          anchor={transfer.anchor}
          file={transfer.file}
          devices={devices}
          sendingId={transfer.sendingId}
          onPick={pickTransfer}
          onClose={() => setTransfer(null)}
        />
      )}
      {flight && <FoldFlight file={flight.file} from={flight.from} to={flight.to} onDone={endFlight} />}
      {searchOpen && (
        <GlobalSearch
          files={files}
          chats={chats}
          folders={folders}
          devices={devices}
          onOpenDevice={showDevice}
          onClose={() => setSearchOpen(false)}
          onOpenFile={(f) => setOpenFile(f)}
          onOpenFolder={openFolderFromSearch}
          onOpenChat={openChatFromSearch}
          notes={userNotes}
          onOpenNote={(id) => openNotes({ id })}
          onNavigate={goTab}
          initialQuery={searchQuery}
        />
      )}
      {/* «Отправить в NEXA» — с любого экрана (Настройки, «Поделиться» Android, быстрые действия) */}
      {flowSend && <FlowSendDialog initial={flowSend.text} initialTo={flowSend.to} link={link} devices={devices} flowOn={flow.on} user={auth.user}
        onLogin={() => { setFlowSend(null); setAuthOpen(true); }} onClose={() => setFlowSend(null)} />}
      {/* Продолжить на другом устройстве (отправитель) и «Продолжить здесь?» (получатель) */}
      {contSend && <ContinueDialog item={contSend} devices={contTargets} user={auth.user} online={online} linkOnline={link.status === "online"}
        job={contJob} onSend={startContinue} onCancelJob={cancelContinue} onClose={() => setContSend(null)}
        onLogin={() => { setContSend(null); setAuthOpen(true); }} />}
      {contOffer && <ContinueOffer key={contOffer.id} offer={contOffer} onOpen={acceptContinue} onDecline={declineContinue} />}
      {/* Панель быстрых действий */}
      {quickOpen && <QuickPanel commands={quick.list} note={quick.note} onClose={() => setQuickOpen(false)} onSearch={openSearch} closeRef={quickCloseRef} />}
      {/* Быстрые действия → «Отправить файл» → «Выбрать на этом устройстве» */}
      <input ref={quickFileRef} type="file" hidden onChange={(e) => {
        const f = e.target.files?.[0], d = quickFileTo.current;
        e.target.value = "";
        if (f && d) { sendFileTo(d, f); showDevice(d.id); } // ход отправки виден на экране устройства
      }} />
      {/* Выбор файлов по команде ассистента «загрузи файл» */}
      <input
        ref={uploadInputRef} type="file" multiple hidden
        onChange={(e) => {
          if (e.target.files?.length) { addFiles(e.target.files, null); goTab("files"); }
          e.target.value = "";
        }}
      />
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
     </div>
  );
}
