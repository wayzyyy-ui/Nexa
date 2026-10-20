// Экран «ИИ — Ассистент»: переписка, поле ввода, файлы, команды, потоковый ответ
import { useLayoutEffect, useState, useEffect, useRef } from "react";
import { formatBytes } from "../../lib/deviceInfo.js";
import { formatLabel, prepareAttachment, SUPPORTED_HINT, attachUnsupported, extOf } from "../../lib/attach.js";
import { C, NAV_W, PHONE_MQ, readTheme, switchTheme, T } from "../../ui/theme.js";
import { Icon } from "../../ui/icons.jsx";
import { liveAbort, useLiveChatId, isPartial, live, setLiveAbort, liveSet, STREAM_FLUSH_MS } from "../../lib/live.js";
import { btnReset, IconBtn } from "../../ui/base.jsx";
import { QuickBtn, QuickPanel } from "../../ui/QuickPanel.jsx";
import { AssistantSpectrum, AssistantAura, ReplyAura, REPLY_AURA_HOLD, REPLY_AURA_FADE } from "./visuals.jsx";
import { ChatHistory, assistantSuggestions } from "./ChatHistory.jsx";
import { TimeDate } from "../../ui/notifications.jsx";
import { flushSync } from "react-dom";
import { API_CHAT_URL } from "../../native.js";
import { newId } from "../../lib/sync.js";
import { fileBlob, signedFileUrl } from "../../lib/files.js";
import { fileBytes, plural } from "../../lib/format.js";
import { TAB_REPLIES, TAB_TITLES, NAV_DELAY, buildTodaySummary, buildDevicesSummary, ASSISTANT_HELP, parseCommand } from "../../lib/commands.js";
import { parseMemoryCommand, pickMemory, findMemoryToForget, MEMORY_REFUSE } from "../../lib/memory.js";
import { useMediaQuery } from "../../lib/hooks.js";
import { useVoiceInput } from "../../lib/voice.js";
import { FILE_SCOPE, sortByRecent, catOf } from "../../lib/fileStore.js";
import { VERSION } from "../../version.js";
import { FileThumb } from "../../ui/files.jsx";
import { LiveAnswer, AttachChip, MessageBubble, AssistantSkeleton } from "./messages.jsx";

export function ScreenAssistant({ initialChatId, openRequest, onCurrentChat, onContinueChat, memory = [], memoryOn = true, memoryApi, chats, setChats, onToast, tab, setTab, devices = [], onAddDevice, onUploadFiles, bell, account, sync, files = [], uid = null, onAddFiles }) {
  const greetings = [
  "Что сегодня в повестке дня?",
  "Чем могу помочь сегодня?",
  "С чего начнём?",
  "Задайте любой вопрос — я готов помочь",
  "Что нового хотите узнать?",
  "О чём поговорим?",
  "Как дела? Расскажите, что нужно",
  "Готов помочь — с чего начнём?",
  "Есть вопросы? Я слушаю",
  "Что вас интересует сегодня?",
];
const [greeting, setGreeting] = useState('');
useEffect(() => {
  setGreeting(greetings[Math.floor(Math.random() * greetings.length)]);
}, []);
  const [currentChatId, setCurrentChatId] = useState(initialChatId || null);
  const [input, setInput] = useState('');

  /* ── Вложение к вопросу (src/lib/attach.js) ──
     att = { key, name, size, status: "preparing" | "ready" | "error", error, payload, sent, file }
     Подготовка только читает файл здесь, на устройстве. Содержимое уходит на сервер
     только вместе с вопросом по «Отправить». После отправки файл остаётся в диалоге
     (так и написано у поля) — следующий вопрос тоже уйдёт с ним, пока его не убрали */
  const [att, setAtt] = useState(null);
  const [pickOpen, setPickOpen] = useState(false);
  const attCtl = useRef(null);
  const attachInputRef = useRef(null);
  const clearAtt = () => { attCtl.current?.abort(); attCtl.current = null; setAtt(null); };
  const attach = (src, extra = {}) => {
    attCtl.current?.abort();
    const ctl = new AbortController(); attCtl.current = ctl;
    const key = `${src.name}|${src.size}|${Date.now()}`;
    setAtt({ key, name: src.name, size: src.size, status: "preparing", ...extra });
    prepareAttachment(src, ctl.signal)
      .then((payload) => { if (attCtl.current === ctl) setAtt((a) => (a?.key === key ? { ...a, status: "ready", payload } : a)); })
      .catch((e) => {
        if (e?.name === "AbortError" || attCtl.current !== ctl) return;
        setAtt((a) => (a?.key === key ? { ...a, status: "error", error: e?.userText || "Не получилось прочитать файл — возможно, он повреждён" } : a));
      });
  };
  // Файл из «Файлов» NEXA: байты — копия в браузере или своя облачная корзина
  const attachStored = (f) => attach({
    name: f.name, size: fileBytes(f), mime: f.mime || "", cloud: !!(uid && f.path),
    getBlob: () => fileBlob(f, FILE_SCOPE, attCtl.current?.signal), signedUrl: () => signedFileUrl(f),
  }, { from: "files" });
  // Файл с устройства — ни в «Файлы», ни в облако он при этом не попадает
  const attachDevice = (file) => attach({ name: file.name, size: file.size, mime: file.type || "", blob: file }, { from: "device", file });
  // Выбор файла: первая строка — «С этого устройства», дальше файлы из «Файлов»
  const pickItems = [
    { id: "__device", title: "С этого устройства…", sub: `Подходят: ${SUPPORTED_HINT}`, icon: Icon.plus, keywords: ["устройство", "компьютер", "телефон"], run: () => attachInputRef.current?.click() },
    ...sortByRecent(files.filter((f) => f.uploaded)).map((f) => {
      const why = attachUnsupported(f.name, f.mime || "");
      return { id: `f-${f.id}`, title: f.name, sub: why || `${formatLabel(f.name)} · ${formatBytes(fileBytes(f))}`, disabled: !!why,
        keywords: [catOf(f)?.label], thumb: <FileThumb file={f} w={34} h={34} iconSize={14} radius={0} />, run: () => attachStored(f) };
    }),
  ];
  const demoCount = files.filter((f) => !f.uploaded).length;
  // Сменили диалог — вложение к нему больше не относится
  useEffect(() => { if (att?.chatId && att.chatId !== currentChatId) clearAtt(); }, [currentChatId]);
  useEffect(() => () => attCtl.current?.abort(), []);
  // Ассистент занят: печатает ответ (общее хранилище live) или выполняет команду
  const liveChatId = useLiveChatId();
  const [cmdBusy, setCmdBusy] = useState(false);
  const cmdBusyRef = useRef(false); cmdBusyRef.current = cmdBusy; // для спектрального фона
  const isLoading = cmdBusy || liveChatId !== null;
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  // Компьютер: колонку истории можно скрыть крестиком (запоминаем в браузере)
  const [histHidden, setHistHiddenState] = useState(() => { try { return localStorage.getItem("nexa-hist-hidden") === "1"; } catch { return false; } });
  const setHistHiddenNow = (v) => { setHistHiddenState(v); try { localStorage.setItem("nexa-hist-hidden", v ? "1" : "0"); } catch {} };
  // Скрыть колонку истории — сначала короткая анимация ухода (уезжает влево), потом убираем.
  // Показать — колонка появляется и выезжает (CSS .nx-hist-col)
  const [histLeaving, setHistLeaving] = useState(false);
  const setHistHidden = (v) => {
    if (!v) { setHistLeaving(false); setHistHiddenNow(false); return; }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setHistHiddenNow(true); return; }
    setHistLeaving(true);
    setTimeout(() => { setHistLeaving(false); setHistHiddenNow(true); }, 220);
  };
  // Свайп вправо на экране ассистента открывает историю (см. useTabSwipe в NexaApp)
  useEffect(() => {
    const open = () => setIsHistoryOpen(true);
    window.addEventListener("nexa-open-history", open);
    return () => window.removeEventListener("nexa-open-history", open);
  }, []);
  const bottomRef = useRef(null);
  // Окно со списком сообщений: прокручиваем вниз только его, а не всю страницу
  const listRef = useRef(null);
  const scrollToBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  // Телефонная ширина: история — шторка; шире — постоянная колонка слева
  const mobile = useMediaQuery(PHONE_MQ);

  // Аура за ответом: появляется, когда ассистент начинает думать,
  // и исчезает через REPLY_AURA_HOLD после ответа
  const [replyAura, setReplyAura] = useState(null); // { id, fading } или null
  useEffect(() => {
    if (isLoading) { setReplyAura({ id: Date.now(), fading: false }); return; }
    const t1 = setTimeout(() => setReplyAura((a) => a && { ...a, fading: true }), REPLY_AURA_HOLD);
    const t2 = setTimeout(() => setReplyAura(null), REPLY_AURA_HOLD + REPLY_AURA_FADE);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isLoading]);

  // Переход по команде ждёт NAV_DELAY: пока ждёт, его можно отменить
  const [pendingNavId, setPendingNavId] = useState(null);
  const navTimer = useRef(null);
  useEffect(() => () => clearTimeout(navTimer.current), []);

  // Поле ввода: в новом диалоге — по центру, после первого сообщения
  // плавно уезжает вниз (и обратно при «Новом диалоге»).
  // Запоминаем, где поле было, и после перерисовки анимируем разницу
  const inputDockRef = useRef(null);
  const [inputFocused, setInputFocused] = useState(false); // поле в фокусе — аура «оживает»
  // На телефоне аура стоит по центру приветствия (а не всей колонки, где внизу поле ввода):
  // меряем, где приветствие, и кладём высоту в CSS-переменную --aura-y
  const emptyColRef = useRef(null);
  useLayoutEffect(() => {
    const col = emptyColRef.current;
    if (!col || !window.ResizeObserver) return;
    const place = () => {
      const g = col.querySelector(".nx-empty-greet");
      if (!g) return;
      const c = col.getBoundingClientRect(), r = g.getBoundingClientRect();
      col.style.setProperty("--aura-y", `${r.top - c.top + r.height / 2}px`);
    };
    place();
    // Приветствие меняет высоту (сменилась фраза, догрузился шрифт) — переставляем
    const ro = new ResizeObserver(place);
    ro.observe(col);
    const g = col.querySelector(".nx-empty-greet");
    if (g) ro.observe(g);
    document.fonts?.ready.then(place);
    return () => ro.disconnect();
  });
  const flipFrom = useRef(null);
  const taRef = useRef(null);
  /* Голосовой ввод (src/lib/voice.js): распознанное дописывается в поле, отправляет человек сам */
  const inputNow = useRef(input);
  inputNow.current = input;
  const voice = useVoiceInput({ getText: () => inputNow.current, setText: setInput });
  // Esc и «Назад» Android во время диктовки — отменить её (поле вернётся к тексту до диктовки)
  useEffect(() => {
    if (!voice.active) return;
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); voice.cancel(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [voice.active]);
  const rememberInputPos = () => {
    const el = inputDockRef.current;
    if (el) flipFrom.current = { top: el.getBoundingClientRect().top, focused: document.activeElement === taRef.current };
  };

  const currentChat = chats.find(c => c.id === currentChatId);
  // Пока ответ в этом диалоге печатается, сохранённый на всякий случай кусок
  // не показываем — его место занимает LiveAnswer
  const streamingHere = liveChatId !== null && liveChatId === currentChatId;
  const messages = (currentChat?.messages || []).filter((m, i, all) => !(streamingHere && i === all.length - 1 && isPartial(m)));
  // Новый диалог — приветствие по центру, даже если в другом диалоге ещё печатается ответ
  const isEmpty = messages.length === 0 && !cmdBusy && !streamingHere;

  // Где аура: за последним сообщением в чате (это «печатает…» или ответ).
  // Двигаем внешний слой напрямую, без перерисовки, не чаще раза за кадр
  const replyAuraPos = useRef(null);
  const placeFrame = useRef(0);
  const placeReplyAura = () => {
    cancelAnimationFrame(placeFrame.current);
    placeFrame.current = requestAnimationFrame(() => {
      const el = replyAuraPos.current, list = listRef.current;
      if (!el || !list) return;
      const msgs = list.querySelectorAll(".nx-msg");
      const last = msgs[msgs.length - 1];
      if (!last) return;
      const box = el.parentElement.getBoundingClientRect();
      const r = last.getBoundingClientRect();
      el.style.left = `${r.left - box.left + Math.min(r.width / 2, 240)}px`;
      el.style.top = `${r.top - box.top + r.height / 2}px`;
    });
  };
  useLayoutEffect(() => { if (replyAura) placeReplyAura(); }, [replyAura?.id, messages.length, messages[messages.length - 1]?.text, isLoading]);
  useEffect(() => {
    const list = listRef.current;
    if (!replyAura || !list) return;
    list.addEventListener("scroll", placeReplyAura, { passive: true });
    window.addEventListener("resize", placeReplyAura);
    return () => {
      list.removeEventListener("scroll", placeReplyAura);
      window.removeEventListener("resize", placeReplyAura);
      cancelAnimationFrame(placeFrame.current);
    };
  }, [replyAura?.id]);
  // Поле ввода переехало (центр ↔ низ): плавно ведём его из старого места.
  // Без движения — если так настроено в системе
  useLayoutEffect(() => {
    const from = flipFrom.current;
    flipFrom.current = null;
    const el = inputDockRef.current;
    if (!from || !el) return;
    if (from.focused) taRef.current?.focus({ preventScroll: true });
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const dy = from.top - el.getBoundingClientRect().top;
    if (Math.abs(dy) < 2) return;
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }],
      { duration: 560, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  }, [isEmpty]);

  // Поле ввода растёт по высоте вместе с текстом, дальше — прокрутка внутри поля.
  // Потолок — до ~6 строк, но не больше 30% видимой высоты экрана: на маленьком
  // экране с открытой клавиатурой поле не выдавливает переписку
  const fitInput = () => {
    const t = taRef.current;
    if (!t) return;
    const visible = window.visualViewport?.height || window.innerHeight;
    const cap = Math.max(60, Math.min(168, Math.round(visible * 0.3)));
    t.style.maxHeight = `${cap}px`;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, cap)}px`;
    t.style.overflowY = t.scrollHeight > cap ? "auto" : "hidden";
    // Одна строка — кнопка по центру поля, несколько — прижата к низу
    const oneLine = parseFloat(getComputedStyle(t).lineHeight) + 12 + 4;
    t.parentElement.style.alignItems = t.scrollHeight > oneLine ? "flex-end" : "center";
  };
  useLayoutEffect(fitInput, [input, isEmpty]);
  // Открылась / закрылась клавиатура — потолок пересчитываем
  useEffect(() => {
    const vv = window.visualViewport;
    vv?.addEventListener("resize", fitInput);
    return () => vv?.removeEventListener("resize", fitInput);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, messages[messages.length - 1]?.text, isLoading]);

  // Клавиатура как в мессенджерах. Экран ассистента всегда ровно по видимой
  // области над клавиатурой (--vvh и --vvt ставит useKeyboardViewport в NexaApp):
  // шапка стоит на месте, поле ввода сидит прямо на клавиатуре, сжимается
  // только список сообщений. Если человек был в самом низу переписки —
  // при сжатии списка (клавиатура, поле выросло на строку) остаётся внизу.
  // Если листал историю выше — не дёргаем его вниз.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let atBottom = true;
    const onScroll = () => { atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 48; };
    const ro = new ResizeObserver(() => { if (atBottom) list.scrollTop = list.scrollHeight; });
    list.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(list);
    return () => { list.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, [isEmpty, currentChatId]);
  // Браузер любит сдвигать страницу к полю ввода — возвращаем её на место
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const back = () => { if (window.scrollY !== 0) window.scrollTo(0, 0); };
    vv.addEventListener('resize', back);
    vv.addEventListener('scroll', back);
    return () => { vv.removeEventListener('resize', back); vv.removeEventListener('scroll', back); };
  }, []);

  const newChat = () => { if (currentChatId) rememberInputPos(); setCurrentChatId(null); setInput(''); };
  // «Новый диалог» из панели быстрых действий: чистый диалог и курсор в поле
  // (на телефоне без фокуса — иначе сразу выскочит клавиатура)
  const newChatRef = useRef(newChat); newChatRef.current = newChat;
  useEffect(() => {
    const onNew = () => {
      newChatRef.current(); setIsHistoryOpen(false);
      if (!window.matchMedia(PHONE_MQ).matches) setTimeout(() => document.querySelector(".ng-input-field")?.focus(), 0);
    };
    window.addEventListener("nexa-new-chat", onNew);
    return () => window.removeEventListener("nexa-new-chat", onNew);
  }, []);
  const openChat = (id) => { setCurrentChatId(id); setInput(''); };
  // Открыть диалог по просьбе извне (продолжение с другого устройства), даже если экран уже открыт
  useEffect(() => {
    if (!openRequest?.id || !chats.some((c) => c.id === openRequest.id)) return;
    openChat(openRequest.id); setIsHistoryOpen(false);
  }, [openRequest?.n]);
  // Какой диалог открыт — NexaApp (для «Продолжить на устройстве» в быстрых действиях)
  useEffect(() => { onCurrentChat?.(currentChatId); }, [currentChatId]);
  // Удаление (уже после подтверждения в меню диалога)
  const deleteChat = (id) => {
    setChats(prev => prev.filter(c => c.id !== id));
    if (id === currentChatId) setCurrentChatId(null);
    onToast?.({ title: "Диалог удалён" });
  };

    // Главная функция: отправляет вопрос на сервер и по мере прихода
  // текста вписывает ответ в чат. Используется и при обычной отправке,
  // и при повторе ответа, и при редактировании сообщения.
  // previousMessages это сообщения чата ДО вопроса, text это сам вопрос.
  // attachment — подготовленное вложение (см. att), уходит только с этим вопросом
  const streamAnswer = async (chatId, previousMessages, text, attachment = null) => {
    if (live.chatId) return; // уже печатается другой ответ — второй не начинаем
    const ctl = new AbortController();
    setLiveAbort(() => ctl.abort());
    liveSet({ chatId, text: "" });
    let fullText = '';
    let timer = 0;

    // Ответ в историю чата: последний сохранённый «на всякий случай» кусок
    // заменяем, иначе добавляем новое сообщение. Так ответ не задваивается
    const putAnswer = (answer) => setChats(prev => prev.map(c => {
      if (c.id !== chatId) return c;
      const msgs = [...c.messages];
      if (isPartial(msgs[msgs.length - 1])) msgs[msgs.length - 1] = { ...answer, at: msgs[msgs.length - 1].at || answer.at };
      else msgs.push(answer);
      return { ...c, messages: msgs };
    }));
    // Конец: ответ — в историю один раз, целиком. flushSync — чтобы пузырь
    // LiveAnswer и сохранённый ответ сменили друг друга в одном кадре, без мигания
    const finish = (answerText, isError = false) => {
      clearTimeout(timer);
      removeEventListener('pagehide', checkpoint);
      document.removeEventListener('visibilitychange', checkpoint);
      flushSync(() => putAnswer({ role: 'ai', text: answerText, at: Date.now(), ...(isError ? { error: true } : {}) }));
      setLiveAbort(null);
      liveSet({ chatId: null, text: "" });
    };
    // Страницу закрывают или сворачивают посреди ответа — сохраняем то, что
    // успело прийти, с пометкой. Допишется — заменим целым ответом
    const checkpoint = () => {
      if (document.visibilityState !== 'hidden' || !fullText) return;
      // flushSync: в историю (и в localStorage) — сразу, страница может закрыться в любой момент
      flushSync(() => putAnswer({ role: 'ai', text: fullText + '\n\n(ответ прервался, нажмите "повторить")', at: Date.now(), error: true, partial: true }));
    };
    addEventListener('pagehide', checkpoint);
    document.addEventListener('visibilitychange', checkpoint);

    try {
      // История для модели: сообщения с ошибками в неё не берём
      const history = previousMessages
        .filter(m => !m.error && !m.action) // команды и ошибки модели не нужны
        .map(m => ({
          role: m.role === 'ai' ? 'model' : 'user',
          // Был файл — модель узнаёт только об этом, не о содержимом (его здесь уже нет)
          parts: [{ text: m.file ? `[К этому сообщению был приложен файл «${m.file.name}»]\n${m.text}` : m.text }],
        }));
      // Память: только подходящие к вопросу записи (подбор здесь, без лишних запросов к модели)
      const memoryPick = memoryOn ? pickMemory(memory, text, previousMessages.filter((m) => !m.action)) : [];

      // На сайте — /api/chat, в приложении — полный адрес (см. src/native.js)
      const res = await fetch(API_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, ...(attachment ? { attachment } : {}), ...(memoryPick.length ? { memory: memoryPick } : {}) }),
        signal: ctl.signal,
      });

      if (!res.ok) {
        // Сервер присылает понятный текст ошибки, достаём его
        let serverMsg = '';
        try { serverMsg = (await res.json()).error; } catch {}
        const err = new Error('server');
        err.userMessage = serverMsg || `Ошибка сервера (${res.status})`;
        throw err;
      }

      // Читаем ответ кусками. Показываем пачками раз в STREAM_FLUSH_MS:
      // первый кусок — сразу, следующие собираются и выводятся вместе
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const show = () => { timer = 0; liveSet({ text: fullText }); };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        if (!fullText) continue;
        if (!live.text) show();
        else if (!timer) timer = setTimeout(show, STREAM_FLUSH_MS);
      }
      fullText += decoder.decode();

      if (!fullText.trim()) finish('Пустой ответ. Нажмите "повторить".', true);
      else finish(fullText);
    } catch (error) {
      const stopped = error?.name === 'AbortError';
      if (fullText) {
        // Ответ оборвался посередине (или его остановили): оставляем то, что успело прийти
        finish(fullText + (stopped ? '\n\n(остановлено)' : '\n\n(ответ оборвался, нажмите "повторить")'), true);
      } else if (stopped) {
        finish('Отправка отменена — нажмите «повторить», чтобы спросить снова.', true);
      } else if (!error.userMessage && navigator.onLine === false) {
        finish(attachment ? 'Нет связи — вопрос с файлом не отправлен.' : 'Нет связи — вопрос не отправлен.', true);
      } else {
        finish(error.userMessage || 'Ошибка соединения с сервером.', true);
      }
    }
  };

  // Добавить сообщение в конец чата / поменять сообщение по id
  const pushMsg = (chatId, msg) => setChats(prev => prev.map(c =>
    c.id === chatId ? { ...c, messages: [...c.messages, { at: Date.now(), ...msg }] } : c));
  const patchMsg = (chatId, id, patch) => setChats(prev => prev.map(c =>
    c.id === chatId ? { ...c, messages: c.messages.map(m => (m.id === id ? { ...m, ...patch } : m)) } : c));

  /* Выполнить команду и ответить от имени ассистента.
     Ответ — обычное сообщение ИИ с пометкой action: true (такие не уходят
     на сервер), actionLabel — подпись на плашке, undo — как отменить.
     ВАЖНО: всё до первого await выполняется сразу по нажатию — поэтому
     окно выбора файлов браузер откроет без вопросов */
  const runCommand = async (chatId, { action, params, text: memText }) => {
    const id = `a${Date.now()}`;
    const say = (text, extra) => pushMsg(chatId, { role: 'ai', text, action: true, id, ...extra });
    if (action.startsWith("mem")) return runMemory(chatId, action, memText, say);
    if (action === "theme") {
      const prev = readTheme();
      const next = params.mode === "toggle" ? (prev === "dark" ? "light" : "dark") : params.mode;
      const label = next === "dark" ? "Тёмная тема" : "Светлая тема";
      if (next === prev) return say(`Тема уже ${next === "dark" ? "тёмная" : "светлая"} — оставляю как есть`, { actionLabel: label });
      switchTheme(next);
      return say(`Готово, включил ${next === "dark" ? "тёмную" : "светлую"} тему`, { actionLabel: label, undo: { kind: "theme", prev } });
    }
    if (action === "navigate") {
      say(TAB_REPLIES[params.tab], { actionLabel: `Переход: ${TAB_TITLES[params.tab]}`, undo: { kind: "nav" } });
      setPendingNavId(id);
      clearTimeout(navTimer.current);
      navTimer.current = setTimeout(() => { navTimer.current = null; setPendingNavId(null); setTab?.(params.tab); }, NAV_DELAY);
      return;
    }
    if (action === "summary") {
      setCmdBusy(true); // пока собираем погоду — «печатает»
      const text = await buildTodaySummary();
      setCmdBusy(false);
      return say(text, { actionLabel: "Сводка на сегодня" });
    }
    if (action === "devices") return say(buildDevicesSummary(devices), { actionLabel: "Устройства" });
    if (action === "addDevice") {
      onAddDevice?.();
      return say("Открываю подключение устройства: покажу код и QR — откройте NEXA на другом устройстве и введите код", { actionLabel: "Подключение устройства" });
    }
    if (action === "upload") {
      onUploadFiles?.();
      return say("Выберите файлы — они попадут в «Хранилище», и я открою раздел «Файлы»", { actionLabel: "Загрузка файлов" });
    }
    if (action === "help") return say(ASSISTANT_HELP, { actionLabel: "Команды NEXA" });
  };

  // «Отменить» на плашке: тема — вернуть прежнюю, переход — не переходить
  /* Команды памяти. Пишется только то, что человек сам сказал запомнить; модель в память не пишет.
     «Запомни это» без текста — прошлое сообщение человека в этом диалоге */
  const runMemory = (chatId, action, memText, say) => {
    const chatMsgs = chats.find((c) => c.id === chatId)?.messages || [];
    const label = "Память ассистента";
    const where = "Посмотреть и изменить — Настройки → «Память ассистента»";
    if (!memoryApi) return say("Память сейчас недоступна", { actionLabel: label });
    if (action === "memList") {
      if (!memory.length) return say("Пока ничего не помню. Скажите, например: «Запомни: отвечай кратко»" + (memoryOn ? "" : ". Память сейчас выключена"), { actionLabel: label });
      const list = memory.slice(0, 20).map((m) => "• " + m.text).join("\n") + (memory.length > 20 ? `\n…и ещё ${memory.length - 20}` : "");
      return say(`${memoryOn ? "Вот что я помню" : "Память выключена, но записи сохранены"}:\n${list}\n\n${where}`, { actionLabel: label });
    }
    // Последнее, что запомнили в этом диалоге (для «Не запоминай» и «Забудь это»)
    const lastAdd = [...chatMsgs].reverse().find((m) => m.undo?.kind === "memory" && !m.undone && memory.some((x) => x.id === m.undo.id));
    if (action === "memUndo" || (action === "memForget" && !memText)) {
      if (!lastAdd) return say(action === "memUndo" ? "Я ничего не запоминаю сам — только когда вы просите «Запомни…»" : "Что забыть? Напишите, например: «Забудь, что я учусь в КФУ»", { actionLabel: label });
      const item = memory.find((x) => x.id === lastAdd.undo.id);
      memoryApi.remove(item.id);
      patchMsg(chatId, lastAdd.id, { undone: true });
      return say(`Хорошо, не помню: «${item.text}»`, { actionLabel: label, undo: { kind: "memoryRestore", items: [item] } });
    }
    if (action === "memForget") {
      const item = findMemoryToForget(memory, memText);
      if (!item) return say(`Не нашёл в памяти «${memText}». ${where}`, { actionLabel: label });
      memoryApi.remove(item.id);
      return say(`Забыл: «${item.text}»`, { actionLabel: label, undo: { kind: "memoryRestore", items: [item] } });
    }
    if (action === "memClear") {
      if (!memory.length) return say("Память и так пуста", { actionLabel: label });
      const items = memory;
      memoryApi.clear();
      return say(`Память очищена — забыл ${items.length} ${plural(items.length, ["запись", "записи", "записей"])}`, { actionLabel: label, undo: { kind: "memoryRestore", items } });
    }
    // memAdd
    if (!memoryOn) return say(MEMORY_REFUSE.off, { actionLabel: label });
    const source = memText ?? [...chatMsgs].reverse().find((m) => m.role === "user" && !m.action)?.text ?? "";
    const r = memoryApi.add(source);
    if (r.ok) return say(`Запомнил: «${r.item.text}». Буду учитывать в ответах. ${where}`, { actionLabel: label, undo: { kind: "memory", id: r.item.id } });
    if (r.reason === "same") return say(`Это я уже помню: «${r.item.text}»`, { actionLabel: label });
    return say(MEMORY_REFUSE[r.reason] || MEMORY_REFUSE.empty, { actionLabel: label });
  };

  const undoAction = (chatId, msg) => {
    if (msg.undo?.kind === "memory") memoryApi?.remove(msg.undo.id);
    if (msg.undo?.kind === "memoryRestore") memoryApi?.restore(msg.undo.items);
    if (msg.undo?.kind === "theme") switchTheme(msg.undo.prev);
    if (msg.undo?.kind === "nav") { clearTimeout(navTimer.current); navTimer.current = null; setPendingNavId(null); }
    patchMsg(chatId, msg.id, { undone: true });
  };

  // Отправка сообщения: из поля ввода или по нажатию на подсказку
  const sendMessage = async (preset) => {
    // Вложение: пока готовится или с ошибкой — не отправляем; готово — уходит с вопросом.
    // Без текста — просим краткое содержание
    if (att && att.status !== "ready") return;
    const withFile = att?.status === "ready" ? att : null;
    const text = (typeof preset === "string" ? preset : input).trim() || (withFile ? "Кратко перескажи этот файл" : "");
    if (!text || isLoading) return;

    // Сначала проверяем, не команда ли это (с файлом — это всегда вопрос по файлу)
    const cmd = withFile ? null : (parseMemoryCommand(text) || parseCommand(text));
    if (isEmpty) rememberInputPos();
    // at — когда написано (мс): по нему история делится на «Сегодня», «Вчера»…
    // file — только сведения (имя, формат, размер), содержимое в историю не пишем
    const fileInfo = withFile && { name: withFile.name, ext: extOf(withFile.name), size: withFile.size };
    const userMsg = { role: 'user', text, at: Date.now(), ...(cmd ? { action: true } : {}), ...(fileInfo ? { file: fileInfo } : {}) };
    const before = currentChat?.messages || [];
    let chatId = currentChatId;

    if (!chatId) {
      chatId = newId(); // uuid — такой же id будет у диалога в облаке
      setChats(prev => [{
        id: chatId,
        title: fileInfo && !input.trim() ? `Файл «${fileInfo.name.slice(0, 30)}»` : text.length > 40 ? text.slice(0, 40) + '…' : text,
        messages: [userMsg],
        createdAt: Date.now(),
      }, ...prev]);
      setCurrentChatId(chatId);
    } else {
      setChats(prev => prev.map(c =>
        c.id === chatId ? { ...c, messages: [...c.messages, userMsg] } : c
      ));
    }

    setInput('');
    // Файл остаётся в этом диалоге — следующий вопрос тоже уйдёт с ним, пока его не убрали
    if (withFile) setAtt((a) => (a?.key === withFile.key ? { ...a, sent: true, chatId } : a));
    if (cmd) await runCommand(chatId, cmd);
    else await streamAnswer(chatId, before, text, withFile?.payload || null);
  };
  // Вложение для повтора / правки: только если тот же файл ещё приложен
  const fileFor = (m) => (m?.file && att?.status === "ready" && att.name === m.file.name && att.size === m.file.size ? att.payload : null);

  // ПОВТОРИТЬ: удаляет последний ответ и запрашивает новый на тот же вопрос
  const regenerate = () => {
    if (isLoading || !currentChatId) return;

    // Ищем последний вопрос пользователя
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;

    const questionText = messages[lastUserIdx].text;
    const previous = messages.slice(0, lastUserIdx);

    // Оставляем чат до вопроса включительно, старый ответ убираем
    setChats(prev => prev.map(c =>
      c.id === currentChatId ? { ...c, messages: messages.slice(0, lastUserIdx + 1) } : c
    ));
    streamAnswer(currentChatId, previous, questionText, fileFor(messages[lastUserIdx]));
  };

  // РЕДАКТИРОВАНИЕ: заменяет сообщение пользователя, всё, что было после него, удаляется,
  // и ответ генерируется заново
  const editMessage = (index, newText) => {
    if (isLoading || !currentChatId) return;

    const previous = messages.slice(0, index);
    const cmd = messages[index].file ? null : (parseMemoryCommand(newText) || parseCommand(newText)); // вопрос по файлу — не команда
    setChats(prev => prev.map(c => {
      if (c.id !== currentChatId) return c;
      return {
        ...c,
        // Если правим самое первое сообщение, обновляем и название чата в истории
        title: index === 0
          ? (newText.length > 40 ? newText.slice(0, 40) + '…' : newText)
          : c.title,
        messages: [...previous, { role: 'user', text: newText, at: Date.now(), ...(cmd ? { action: true } : {}), ...(messages[index].file ? { file: messages[index].file } : {}) }],
      };
    }));
    if (cmd) runCommand(currentChatId, cmd);
    else streamAnswer(currentChatId, previous, newText, fileFor(messages[index]));
  };
  
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); voice.release(); sendMessage(); }
  };


 const titleOnly = (
  <div style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", position: "relative", zIndex: 2 }}>
    {/* Кнопка истории: на телефоне открывает шторку, на компьютере
        возвращает скрытую колонку (видна, только пока колонка скрыта) */}
    <button
      type="button"
      className={`ng-hamburger${!mobile && histHidden ? " is-shown" : ""}`}
      title="История диалогов"
      onClick={() => (mobile ? setIsHistoryOpen(true) : setHistHidden(false))}
      style={{
        background: "transparent", border: "none",
        cursor: "pointer", padding: 4, display: "none",
        alignItems: "center", justifyContent: "center",
      }}
      aria-label="История диалогов"
      aria-expanded={isHistoryOpen}
    >
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke={C.text} strokeWidth="2">
        <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
      </svg>
    </button>
    <div style={{ textAlign: "left", minWidth: 0 }}>
      {/* На телефоне — одна строка без переноса: название и маленькая версия рядом */}
      <div className="ng-display nx-assistant-title" style={{ fontSize: T.fs.page, fontWeight: 500, textAlign: "left" }}>
        ИИ — Ассистент<span className="nx-assistant-ver"> v{VERSION}</span>
      </div>
      {/* Описание — только на компьютере */}
       <div className="nx-assistant-subtitle" style={{ fontSize: 13, color: C.muted, marginTop: 6, textAlign: "left" }}>
        Интеллектуальный центр системы NEXA · v{VERSION}
      </div>
    </div>
  </div>
);
const menuBlock = (
  // Справа сверху (только компьютер): время, уведомления, профиль.
  // «Новый диалог» и поиск — в колонке истории слева
  <div className="ng-menu-block" style={{
    position: "fixed",
    top: 24,
    right: 40,
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    alignItems: "flex-end",
  }}>
    {/* Верхняя строка: время/дата + иконка профиля */}
    <div className="nx-tb-row" style={{
      display: "flex",
      alignItems: "center",
      gap: 18,
      marginBottom: 8,
    }}>
      <TimeDate />
      <QuickBtn />
      {bell}
      <IconBtn icon={Icon.user} onClick={() => setTab?.("settings")} label="Настройки" className="nx-tb-user" />
    </div>
  </div>
);

  // Отправить можно: не идёт ответ; есть текст или готовое вложение; вложение не готовится и без ошибки
  const canSend = !isLoading && (att ? att.status === "ready" : !!input.trim());
  const sendHint = att?.status === "preparing" ? "Файл ещё готовится" : att?.status === "error" ? "Сначала уберите файл с ошибкой" : "Отправить";
  // Быстрые вопросы по приложенному файлу (поле пустое)
  const fileAsks = [
    ["Кратко перескажи", "Кратко перескажи этот файл"],
    ["Главные пункты", "Выдели главные пункты файла списком"],
    ["Объясни простыми словами", "Объясни содержимое файла простыми словами"],
  ];
    const inputRow = (
  <div style={{ width: "100%", maxWidth: 820, display: "flex", flexDirection: "column", gap: 8 }}>
  {att && (
    <AttachChip att={att} onRemove={clearAtt}
      onToFiles={uid && att.from === "device" && att.file && /«Файлы»/.test(att.error || "") ? () => { onAddFiles?.([att.file]); clearAtt(); } : null} />
  )}
  {att?.status === "ready" && !input.trim() && !isLoading && (
    <div className="nx-file-asks nx-no-scrollbar" style={{ display: "flex", gap: 6, overflowX: "auto" }} data-no-swipe>
      {fileAsks.map(([label, q]) => (
        <button key={label} type="button" className="nx-ghost-btn" onClick={() => sendMessage(q)} style={{
          ...btnReset, flexShrink: 0, whiteSpace: "nowrap", border: `1px solid ${C.borderStrong}`, borderRadius: 999,
          padding: "6px 12px", fontSize: 13, color: C.text, background: `color-mix(in srgb, ${C.bg} 70%, transparent)`,
        }}>{label}</button>
      ))}
      <button type="button" className="nx-ghost-btn" onClick={() => { setInput("Найди в файле: "); setTimeout(() => taRef.current?.focus(), 0); }} style={{
        ...btnReset, flexShrink: 0, whiteSpace: "nowrap", border: `1px solid ${C.borderStrong}`, borderRadius: 999,
        padding: "6px 12px", fontSize: 13, color: C.text, background: `color-mix(in srgb, ${C.bg} 70%, transparent)`,
      }}>Найти в файле…</button>
    </div>
  )}
  <div className="nx-input-ring" style={{
    width: "100%",
    padding: 1,
    // 25 = половина высоты однострочного поля: одна строка — «таблетка»,
    // несколько строк — прямоугольник со скруглёнными углами
    borderRadius: 25,
    // Градиент симметричный (синий, мятный, синий), чтобы при движении не было шва
    background: `linear-gradient(90deg, ${C.blue}, ${C.mint}, ${C.blue})`,
    backgroundSize: "200% 100%",
    // Пока ассистент отвечает, граница плавно перетекает
    animation: isLoading ? "nx-border-flow 2.4s linear infinite" : "none",
    boxShadow: "var(--input-glow)",
  }}>
            <div
        onClick={() => document.querySelector('.ng-input-field')?.focus()}
        style={{
          // flex-end: кнопка отправки остаётся внизу, когда текст в несколько строк
          width: "100%", display: "flex", alignItems: "flex-end", gap: 10,
          padding: "8px 8px 8px 8px", borderRadius: 24,
          background: C.bg, boxSizing: "border-box",
          cursor: "text",
        }}
      >
        {/* Скрепка: выбрать файл из «Файлов» NEXA или с устройства */}
        <button type="button" className="nx-icon-btn" aria-label="Приложить файл" title="Приложить файл" aria-haspopup="dialog"
          onClick={(e) => { e.stopPropagation(); setPickOpen(true); }}
          style={{ ...btnReset, width: 32, height: 32, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {Icon.clip({ c: att ? C.mint : C.muted, s: 18 })}
        </button>
        {/* Многострочное поле: длинный текст переносится, Enter — отправить,
            Shift+Enter — новая строка */}
        <textarea
          ref={taRef}
          rows={1}
          value={input}
          onChange={(e) => { voice.release(); setInput(e.target.value); }}
          onKeyDown={onKeyDown}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          placeholder="Написать сообщение..."
          className="ng-input-field"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          name="nexa-message-nofill"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: C.text,
            fontSize: 14,
            lineHeight: 1.5,
            fontFamily: "inherit",
            resize: "none",
            // border-box: высота поля = высота текста вместе с отступами (как scrollHeight)
            boxSizing: "border-box",
            padding: "6px 0",
            margin: 0,
            minWidth: 0,
            maxHeight: 168,
            overflowY: "hidden",
            overflowWrap: "anywhere",
          }}
        />
        {/* Микрофон: нажать — говорить, ещё раз — готово. Нет распознавания на этом устройстве — кнопки нет */}
        {voice.supported && (
          <button type="button" onPointerDown={(e) => e.preventDefault()}
            onClick={(e) => { e.stopPropagation(); voice.toggle(); }}
            className={`nx-icon-btn nx-mic${voice.active ? " is-on" : ""}`} aria-pressed={voice.active}
            aria-label={voice.active ? "Закончить диктовку" : "Сказать голосом"} title={voice.active ? "Закончить диктовку" : "Сказать голосом"}
            style={{ ...btnReset, width: 32, height: 32, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            {Icon.mic({ c: voice.active ? C.mint : C.muted, s: 18 })}
          </button>
        )}
        {/* Пока печатается ответ в этом диалоге — «Остановить» вместо «Отправить» */}
        {streamingHere ? (
          <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); liveAbort?.(); }} className="ng-input-send"
            aria-label="Остановить ответ" title="Остановить ответ" style={{
              width: 32, height: 32, borderRadius: "50%", background: C.text, border: "none", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}>
            {Icon.stop({ c: C.bg, s: 16 })}
          </button>
        ) : (
        <button
          // Палец на кнопке не уводит фокус с поля: клавиатура не закрывается,
          // экран не прыгает — и нажатие попадает в кнопку (иначе срабатывало только со второго раза)
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => { voice.release(); sendMessage(); }}
          disabled={!canSend}
          aria-label={sendHint} title={sendHint}
          className="ng-input-send"
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: !canSend ? C.chip : C.mint,
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: !canSend ? "default" : "pointer",
            transition: "background 140ms ease",
            flexShrink: 0,
          }}
        >
          {Icon.up({ c: !canSend ? C.muted : C.onAccent, s: 15 })}
        </button>
        )}
      </div>
    </div>
  </div>
  );
  // Подпись под полем: обычно — «ИИ может допускать ошибки», во время диктовки — что происходит
  const voiceLine = voice.error ? voice.error
    : voice.state === "permission" ? "Разрешите доступ к микрофону"
    : voice.state === "finishing" ? "Заканчиваю…"
    : voice.state === "listening" ? (voice.heard ? "Слушаю… Проверьте текст перед отправкой" : "Говорите… Нажмите на микрофон, когда закончите")
    : null;
    const disclaimer = voiceLine ? (
  <div className="ng-disclaimer nx-voice-line" role="status" aria-live="polite" style={{ fontSize: 11, color: voice.error ? C.red : C.mint, textAlign: "center", display: "flex", justifyContent: "center", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
    <span>{voiceLine}</span>
    {voice.active && (
      <button type="button" className="nx-link-btn" onPointerDown={(e) => e.preventDefault()} onClick={voice.cancel}
        style={{ ...btnReset, fontSize: 11, color: C.muted, textDecoration: "underline", textUnderlineOffset: 2 }}>Отменить</button>
    )}
  </div>
) : (
  <div className="ng-disclaimer" style={{ fontSize: 11, color: C.mutedSoft, textAlign: "center", whiteSpace: "nowrap" }}>
    ИИ может допускать ошибки.
  </div>
);

  // ─── ПАНЕЛЬ ИСТОРИИ (см. ChatHistory) ─────────────────────
  const historyPanel = (
    <ChatHistory
      onContinue={onContinueChat}
      chats={chats}
      setChats={setChats}
      currentChatId={currentChatId}
      mobile={mobile}
      open={isHistoryOpen}
      onClose={() => (mobile ? setIsHistoryOpen(false) : setHistHidden(true))}
      leaving={!mobile && histLeaving}
      onOpen={(id) => { openChat(id); setIsHistoryOpen(false); }}
      onNew={() => { newChat(); setIsHistoryOpen(false); }}
      onDelete={deleteChat}
      account={account}
      sync={sync}
      onSettings={() => { setIsHistoryOpen(false); setTab?.("settings"); }}
    />
  );

  const wrapperStyle = {
    // Высота и сдвиг — по видимой области экрана (см. эффект с visualViewport),
    // чтобы при открытой клавиатуре экран не уезжал вверх
    position: "fixed",
    top: "var(--vvt, 0px)", left: NAV_W + 1, right: 0, height: "var(--vvh, 100%)",
    background: C.bg, zIndex: 5, overflow: "hidden",
    display: "flex", flexDirection: "column",
  };

  const innerStyle = {
  position: "relative", zIndex: 1, // над спектральным фоном
  flex: 1, display: "flex", flexDirection: "row",
  width: "100%", maxWidth: 1440, margin: "0 auto",
  padding: "66px 40px 20px 40px",
  overflow: "hidden",
  boxSizing: "border-box", minHeight: 0,
};
  return (
  <div className="ng-assistant-wrapper ng-assistant-anim" style={wrapperStyle}>
    {/* Спектральный фон — под всем содержимым, нажатия и прокрутку не перехватывает */}
    <AssistantSpectrum busyRef={cmdBusyRef} />
    {menuBlock}
    {/* Выбор файла для ассистента — та же панель, что у быстрых действий */}
    {pickOpen && (
      <QuickPanel commands={pickItems} label="Приложить файл" placeholder="Найти файл…" icon={Icon.clip} keys={null}
        note={demoCount ? "Демо-файлы без содержимого — их ассистент прочитать не может" : null}
        onClose={() => setPickOpen(false)} />
    )}
    <input ref={attachInputRef} type="file" hidden onChange={(e) => {
      const f = e.target.files?.[0]; e.target.value = "";
      if (f) attachDevice(f);
    }} />

    {/* История — слева: на компьютере колонкой от бокового меню на всю высоту
        (скрыта — не рисуем), на телефоне — шторкой поверх (в body) */}
    <div style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0, display: "flex" }}>
    {(mobile || !histHidden) && historyPanel}
    <div className="ng-assistant-inner" style={innerStyle}>
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        minWidth: 0, minHeight: 0,
      }}>
        {titleOnly}

         {isEmpty ? (
          // Новый диалог: приветствие, поле ввода и подсказки — по центру
          // На телефоне (см. .nx-empty-col в стилях): поле ввода внизу,
          // над ним компактные подсказки, приветствие — по центру свободного места
          <div ref={emptyColRef} className="nx-empty-col" style={{
            flex: 1, minHeight: 0, padding: "0 16px", position: "relative",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22,
          }}>
            {/* Аура: складка из граней позади; при наборе текста приближается */}
            <AssistantAura active={inputFocused || !!input.trim()} />
            <div
              className="ng-greeting nx-greeting-anim nx-empty-greet"
              style={{ position: "relative", textAlign: "center", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {greeting}
            </div>
            <div ref={inputDockRef} className="nx-dock" style={{ position: "relative", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              {inputRow}
              {/* В новом диалоге подписи нет — только состояние диктовки */}
              {voiceLine && disclaimer}
            </div>
            {/* Подсказки-команды: нажатие отправляет текст как сообщение.
                На телефоне листаются вбок */}
            <div className="nx-chips nx-no-scrollbar nx-stagger" style={{
              position: "relative", display: att ? "none" : "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, maxWidth: 820,
            }}>
              {assistantSuggestions().map((sg) => (
                <button key={sg.text} type="button" className="nx-ghost-btn" onClick={() => sendMessage(sg.text)} style={{
                  ...btnReset, display: "flex", alignItems: "center", gap: 7, flexShrink: 0, whiteSpace: "nowrap",
                  border: `1px solid ${C.borderStrong}`, borderRadius: 999, padding: "8px 14px", fontSize: 13, color: C.text,
                  background: `color-mix(in srgb, ${C.bg} 70%, transparent)`,
                }}>
                  {sg.icon({ c: C.mint, s: 14 })} {sg.text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Сообщения сверху. Обёртка нужна для ауры за ответом:
                аура лежит под списком и не прокручивается вместе с ним */}
            <div className="nx-chat-area" style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", marginTop: 24, marginBottom: 16 }}>
            {replyAura && <ReplyAura key={replyAura.id} fading={replyAura.fading} posRef={replyAuraPos} />}
            <div
              ref={listRef}
              className="nx-scroll nx-msg-list"
              style={{
                flex: 1,
                overflowY: "auto",
                overscrollBehavior: "contain", // прокрутка списка не тянет за собой страницу
                minHeight: 0,
                paddingLeft: 8,
                paddingRight: 8,
                position: "relative", zIndex: 1,
              }}
            >
              <div className="nx-msg-col" style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 10 }}>
                {messages.map((m, i) => (
                  <MessageBubble
                    key={i}
                    role={m.role}
                    text={m.text}
                    file={m.file}
                    error={m.error}
                    actionLabel={m.action && m.role === 'ai' ? m.actionLabel : null}
                    undone={m.undone}
                    // «Отменить»: тему можно вернуть всегда, переход — пока он ещё не случился
                    undoable={!!m.undo && !m.undone && (m.undo.kind === "theme" || m.undo.kind === "memory" || m.undo.kind === "memoryRestore" || pendingNavId === m.id)}
                    onUndo={() => undoAction(currentChatId, m)}
                    isLastAi={m.role === 'ai' && i === messages.length - 1 && !m.action}
                    disabled={isLoading}
                    onRegenerate={regenerate}
                    onEdit={(newText) => editMessage(i, newText)}
                  />
                ))}
                {cmdBusy && messages[messages.length - 1]?.role !== 'ai' && <AssistantSkeleton />}
                {/* Ответ, который сейчас печатается (только в своём диалоге) */}
                {streamingHere && <LiveAnswer onGrow={() => { scrollToBottom(); if (replyAura) placeReplyAura(); }} />}
                <div ref={bottomRef} />
              </div>
            </div>
            </div>

            {/* Поле ввода + дисклеймер (дисклеймер только в чате).
                На телефоне — закреплённая область с переходом в переписку (.nx-chat-dock) */}
            <div ref={inputDockRef} className="nx-chat-dock" style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              paddingBottom: 8,
            }}>
              {inputRow}
              {disclaimer}
            </div>
           </>
        )}
      </div>
    </div>
    </div>
  </div>
  );
}
