// Вход: почта и код, вход по QR, разрешение входа, экран первого запуска, «Аккаунт», «Удалить мои данные»
import { useState, useRef, useEffect } from "react";
import foldSvg from "../assets/fold.svg";
import { isNative } from "../native.js";
import { App as CapApp } from "@capacitor/app";
import { supabase, authAvailable } from "../lib/supabase.js";
import { looksLikeEmail, isAllowedEmail, DOMAIN_NOT_ALLOWED_MESSAGE } from "../lib/allowedEmailDomains.js";
import { deviceIdentity, PAIR_CODE_RE } from "../lib/realtime.js";
import { C, fontDisplay } from "../ui/theme.js";
import { Icon } from "../ui/icons.jsx";
import { mmss } from "../lib/format.js";
import { qrApi, QR_LOGIN_TTL_MS, QR_POLL_MS, loginUrl, APPROVE_LOCK_KEY, RESEND_SECONDS, authErrorText, CODE_MIN, CODE_MAX, signOut, clearLocalAccountData } from "../lib/auth.js";
import { StateNote, QrCode, Spinner, CodeCells, btnReset, authLink, authField, StateButton, SectionTitle, SettingsGroup, SettingsRow, Dot, Logo, LogoMark } from "../ui/base.jsx";

/* Новое устройство: QR и код, ждём подтверждения с вошедшего.
   onBack — вернуться ко входу по почте */
export function QrLoginView({ onBack }) {
  const [st, setSt] = useState({ phase: "loading" }); // loading | show | expired | signing | error
  const [now, setNow] = useState(Date.now());
  const sess = useRef(null); // { id, secret, code, expiresAt } — секрет только в памяти
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const start = async () => {
    setSt({ phase: "loading" });
    try {
      const { ok, data } = await qrApi("start", { label: deviceIdentity().name });
      if (!alive.current) return;
      if (!ok || !data.code) { setSt({ phase: "error", text: data.error || "Вход по QR сейчас недоступен. Войдите по почте." }); return; }
      sess.current = { id: data.id, secret: data.secret, code: data.code, expiresAt: Date.now() + QR_LOGIN_TTL_MS };
      setSt({ phase: "show" });
    } catch {
      if (alive.current) setSt({ phase: "error", text: "Нет связи с сервером. Проверьте интернет или войдите по почте." });
    }
  };
  useEffect(() => { start(); }, []);

  // Тикаем таймер и раз в 2 секунды спрашиваем «разрешили?»
  useEffect(() => {
    if (st.phase !== "show") return;
    const tick = setInterval(() => setNow(Date.now()), 500);
    let busy = false;
    const poll = setInterval(async () => {
      const ss = sess.current;
      if (busy || !ss) return;
      if (Date.now() > ss.expiresAt) { setSt({ phase: "expired" }); return; }
      busy = true;
      try {
        const { data } = await qrApi("poll", { id: ss.id, secret: ss.secret });
        if (!alive.current) return;
        if (data.status === "approved" && data.token_hash) {
          setSt({ phase: "signing" });
          // Входим одноразовым пропуском — Supabase сам сохранит сессию, экран входа закроется
          const { error } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: "magiclink" });
          if (error && alive.current) setSt({ phase: "error", text: "Не получилось войти. Попробуйте ещё раз." });
        } else if (data.status === "expired") setSt({ phase: "expired" });
        else if (data.status === "used" || data.status === "not_found") setSt({ phase: "expired" });
      } catch {} finally { busy = false; }
    }, QR_POLL_MS);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [st.phase]);

  const ss = sess.current;
  const left = ss ? ss.expiresAt - now : 0;
  const dim = st.phase !== "show";
  return (
    <div className="nx-auth-step" data-step="qr">
      {st.phase === "error" ? (
        <StateNote kind="error">{st.text}</StateNote>
      ) : (
        <div className="nx-qrlogin" style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flexShrink: 0, opacity: dim ? 0.25 : 1, transition: "opacity 200ms ease" }}>
            {ss ? <QrCode text={loginUrl(ss.code)} size={150} radius={0} label="QR-код для входа" />
              : <div style={{ width: 150, height: 150, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.border}` }}><Spinner s={18} /></div>}
          </div>
          <div style={{ flex: "1 1 180px", minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Отсканируйте в приложении NEXA</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginTop: 4 }}>
              Настройки → «Войти на другом устройстве». Или введите там код:
            </div>
            <div style={{ marginTop: 10 }}>{ss && <CodeCells code={ss.code} dim={dim} />}</div>
            <div aria-hidden="true" style={{ height: 3, marginTop: 12, background: `color-mix(in srgb, ${C.text} 8%, transparent)` }}>
              <div style={{ height: "100%", width: `${dim ? 0 : Math.max(0, Math.min(100, (left / QR_LOGIN_TTL_MS) * 100))}%`, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`, transition: "width 500ms linear" }} />
            </div>
            <div role="status" style={{ fontSize: 13, marginTop: 8, color: st.phase === "expired" ? C.red : C.muted, display: "flex", alignItems: "center", gap: 6 }}>
              {st.phase === "signing" ? <><Spinner s={11} /> Входим…</>
                : st.phase === "expired" ? "Код истёк"
                : st.phase === "loading" ? "Готовим код…"
                : <>Действует ещё <span style={{ fontFamily: fontDisplay, color: C.text }}>{mmss(left)}</span></>}
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginTop: 16 }}>
        {(st.phase === "expired" || st.phase === "error") && (
          <button type="button" className="nx-primary" onClick={start} style={{
            ...btnReset, padding: "8px 16px", fontSize: 13, fontWeight: 500, borderRadius: 999,
            border: "1px solid transparent", color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            {Icon.refresh({ c: C.onFold, s: 14 })} Новый код
          </button>
        )}
        <button type="button" onClick={onBack} style={authLink}>Войти по почте</button>
      </div>
    </div>
  );
}

/* Вошедшее устройство разрешает вход на другом: сканирует QR (в приложении)
   или вводит код, видит, что за устройство просит, и нажимает «Разрешить».
   initialCode — код из QR (если уже есть), onScan — открыть сканер */
export function ApproveLoginModal({ initialCode, onClose, onScan, onApproved }) {
  const [code, setCode] = useState(initialCode || "");
  const [st, setSt] = useState({ phase: "enter" }); // enter | checking | confirm | approving | done
  const [error, setError] = useState(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const token = async () => (await supabase.auth.getSession()).data.session?.access_token;

  // Шаг 1: что за устройство просит вход (неверных кодов — не больше 5 в минуту)
  const check = async (c = clean) => {
    setError(null);
    const lock = (() => { try { return JSON.parse(localStorage.getItem(APPROVE_LOCK_KEY)) || { wrong: 0, until: 0 }; } catch { return { wrong: 0, until: 0 }; } })();
    if (lock.until > Date.now()) { setError(`Слишком много неверных кодов. Попробуйте через ${mmss(lock.until - Date.now())}.`); return; }
    if (!PAIR_CODE_RE.test(c)) { setError("Код — это 6 букв и цифр с экрана другого устройства"); return; }
    setSt({ phase: "checking" });
    try {
      const { ok, status, data } = await qrApi("peek", { code: c }, await token());
      if (ok) { try { localStorage.setItem(APPROVE_LOCK_KEY, JSON.stringify({ wrong: 0, until: 0 })); } catch {} setSt({ phase: "confirm", code: c, label: data.device_label }); return; }
      if (status === 404) {
        const wrong = lock.wrong + 1;
        try { localStorage.setItem(APPROVE_LOCK_KEY, JSON.stringify(wrong >= 5 ? { wrong: 0, until: Date.now() + 60000 } : { wrong, until: 0 })); } catch {}
      }
      setError(data.error || "Не получилось проверить код"); setSt({ phase: "enter" });
    } catch {
      setError("Нет связи с сервером. Проверьте интернет."); setSt({ phase: "enter" });
    }
  };
  // Пришли с готовым кодом (из QR) — сразу проверяем
  useEffect(() => { if (initialCode) check(initialCode.toUpperCase()); }, []);

  // Шаг 2: разрешить
  const approve = async () => {
    setError(null); setSt((x) => ({ ...x, phase: "approving" }));
    try {
      const { ok, data } = await qrApi("approve", { code: st.code }, await token());
      if (ok) { setSt({ phase: "done" }); onApproved?.(); }
      else { setError(data.error || "Не получилось разрешить вход"); setSt({ phase: "enter" }); }
    } catch { setError("Нет связи с сервером. Проверьте интернет."); setSt({ phase: "enter" }); }
  };

  const primary = { ...btnReset, padding: "11px 18px", fontSize: 14, fontWeight: 500, borderRadius: 999, border: "1px solid transparent", color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 };
  const ghost = { ...btnReset, padding: "11px 18px", fontSize: 14, borderRadius: 999, border: `1px solid ${C.borderStrong}`, color: C.text, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 };
  return (
    <div className="nx-viewer" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 330, background: `color-mix(in srgb, ${C.bg} 80%, transparent)`,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nx-approve-title" className="nx-viewer-panel nx-pop" onClick={(e) => e.stopPropagation()}
        style={{ width: "min(420px, 100%)", background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 18, padding: "20px 22px 22px", boxSizing: "border-box", textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="nx-approve-title" style={{ fontFamily: fontDisplay, fontSize: 22, lineHeight: 1.2 }}>
              {st.phase === "done" ? "Вход разрешён" : st.phase === "confirm" || st.phase === "approving" ? "Разрешить вход?" : "Войти на другом устройстве"}
            </div>
            <div style={{ fontSize: 13, color: C.mutedSoft, marginTop: 6, lineHeight: 1.45 }}>
              {st.phase === "done" ? "Через пару секунд там откроется ваш аккаунт"
                : st.phase === "confirm" || st.phase === "approving" ? "Разрешайте, только если этот код сейчас на вашем экране"
                : "На новом устройстве: «Войти» → «Войти по QR». Отсканируйте QR или введите код"}
            </div>
          </div>
          <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть" style={{ ...btnReset, width: 34, height: 34, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {Icon.close({ c: C.muted, s: 18 })}
          </button>
        </div>

        {(st.phase === "enter" || st.phase === "checking") && (
          <form onSubmit={(e) => { e.preventDefault(); check(); }} style={{ marginTop: 18 }}>
            {onScan && (
              <button type="button" onClick={() => { onClose(); onScan(); }} style={{ ...primary, width: "100%", marginBottom: 14 }}>
                {Icon.search({ c: C.onFold, s: 15 })} Сканировать QR
              </button>
            )}
            <label htmlFor="nx-approve-code" style={{ fontSize: 13, color: C.mutedSoft }}>{onScan ? "Или введите код" : "Код с экрана нового устройства"}</label>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input id="nx-approve-code" className="nx-input" value={clean} onChange={(e) => { setCode(e.target.value); setError(null); }}
                autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={6} placeholder="······" autoFocus={!onScan}
                style={{
                  flex: 1, minWidth: 0, background: "transparent", color: C.text, fontFamily: fontDisplay, fontSize: 19,
                  letterSpacing: "0.32em", textAlign: "center", textTransform: "uppercase",
                  border: `1px solid ${error ? C.red : C.borderStrong}`, borderRadius: 10, padding: "8px 10px", outline: "none",
                }} />
              <button type="submit" disabled={clean.length !== 6 || st.phase === "checking"} style={clean.length === 6 ? primary : { ...ghost, color: C.mutedSoft }}>
                {st.phase === "checking" ? <Spinner s={13} c={C.onFold} /> : "Дальше"}
              </button>
            </div>
          </form>
        )}

        {(st.phase === "confirm" || st.phase === "approving") && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `1px solid ${C.border}`, borderRadius: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: 16, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {(/телефон/i.test(st.label || "") ? Icon.phone : Icon.laptop)({ c: C.text, s: 17 })}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{st.label || "Новое устройство"}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Код {st.code}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button type="button" onClick={onClose} disabled={st.phase === "approving"} style={{ ...ghost, flex: 1 }}>Отмена</button>
              <button type="button" onClick={approve} disabled={st.phase === "approving"} style={{ ...primary, flex: 1 }}>
                {st.phase === "approving" ? <Spinner s={13} c={C.onFold} /> : Icon.check({ c: C.onFold, s: 15 })} Разрешить
              </button>
            </div>
          </div>
        )}

        {st.phase === "done" && (
          <button type="button" onClick={onClose} style={{ ...ghost, marginTop: 18, width: "100%" }}>Готово</button>
        )}
        {error && <div role="alert" style={{ fontSize: 13, color: C.red, marginTop: 12, lineHeight: 1.45 }}>{error}</div>}
      </div>
    </div>
  );
}

/* Панель входа: шаг 1 — почта и «Получить код», шаг 2 — код и «Войти».
   onEscape — что делать по Esc на шаге почты (на шаге кода Esc возвращает к почте).
   Сама панель ничего не закрывает: после входа Supabase сообщит о сессии,
   и экран входа уберёт тот, кто его показал */
export function AuthPanel({ onEscape, variant, initialStep = "email" }) {
  const gate = variant === "gate";
  const [step, setStep] = useState(initialStep); // "email" | "code" | "qr" (вход по QR с другого устройства)
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sentAt, setSentAt] = useState(0);   // когда отправили последний код
  const [now, setNow] = useState(Date.now()); // тикает раз в секунду для паузы «ещё раз»
  const codeRef = useRef(null);

  // Обратный отсчёт до повторной отправки
  const wait = Math.max(0, RESEND_SECONDS - Math.floor((now - sentAt) / 1000));
  useEffect(() => {
    if (step !== "code" || wait === 0) return;
    const t = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(t);
  }, [step, wait, now]);

  // На шаге кода сразу ставим курсор в поле
  useEffect(() => { if (step === "code") codeRef.current?.focus(); }, [step]);

  // Esc: с кода — назад к почте, с почты — решает тот, кто показал панель
  const escRef = useRef();
  escRef.current = () => {
    if (step === "code" || (step === "qr" && !(gate && initialStep === "qr"))) { setStep("email"); setCode(""); setError(null); }
    else onEscape?.();
  };
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") escRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const cleanEmail = email.trim().toLowerCase();

  // Шаг 1: проверяем почту у себя и просим Supabase прислать код
  const sendCode = async () => {
    if (busy) return;
    if (!looksLikeEmail(cleanEmail)) { setError("Похоже, в адресе опечатка. Проверьте почту."); return; }
    if (!isAllowedEmail(cleanEmail)) { setError(DOMAIN_NOT_ALLOWED_MESSAGE); return; }
    if (navigator.onLine === false) { setError(authErrorText(null)); return; }
    setBusy(true); setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({ email: cleanEmail, options: { shouldCreateUser: true } });
      if (err) { setError(authErrorText(err, "send")); return; }
      setSentAt(Date.now()); setNow(Date.now());
      setCode(""); setStep("code");
    } catch (err) {
      setError(authErrorText(err, "send"));
    } finally {
      setBusy(false);
    }
  };

  // Шаг 2: проверяем код. Успех — Supabase сам сообщит о входе (onAuthStateChange)
  const verify = async () => {
    if (busy || code.length < CODE_MIN) return;
    if (navigator.onLine === false) { setError(authErrorText(null)); return; }
    setBusy(true); setError(null);
    try {
      const { error: err } = await supabase.auth.verifyOtp({ email: cleanEmail, token: code, type: "email" });
      if (err) setError(authErrorText(err, "verify", sentAt));
    } catch (err) {
      setError(authErrorText(err, "verify", sentAt));
    } finally {
      setBusy(false);
    }
  };

  if (!supabase) {
    return (
      <StateNote kind="error">Аккаунты сейчас недоступны. Пользуйтесь NEXA без входа — всё работает как обычно.</StateNote>
    );
  }

  if (step === "qr") return <QrLoginView onBack={() => (gate && initialStep === "qr" ? onEscape?.() : setStep("email"))} />;

  return step === "email" ? (
    // form — чтобы кнопка срабатывала и по Enter
    <form className="nx-auth-step" data-step="email" onSubmit={(e) => { e.preventDefault(); sendCode(); }} noValidate>
      <label htmlFor="nx-auth-email" className={gate ? "nx-sr-only" : undefined} style={{ fontSize: 13, color: C.muted }}>Почта</label>
      <input
        id="nx-auth-email" type="email" inputMode="email" autoComplete="email" autoFocus
        className="nx-input" value={email} disabled={busy}
        placeholder="name@yandex.ru"
        onChange={(e) => { setEmail(e.target.value); setError(null); }}
        aria-invalid={!!error} aria-describedby="nx-auth-hint"
        style={authField(!!error)}
      />
      <div id="nx-auth-hint" role={error ? "alert" : undefined} style={{ fontSize: 13, marginTop: 8, lineHeight: 1.45, color: error ? C.red : C.mutedSoft }}>
        {error || "Пришлём код — пароль не нужен"}
      </div>
      <StateButton variant="primary" state={busy ? "loading" : "idle"} labels={{ loading: "Отправляем…" }}
        disabled={!cleanEmail} onClick={sendCode}
        style={{ width: "100%", marginTop: 18, padding: "12px 16px", fontSize: 14 }}>
        Получить код
      </StateButton>
      {/* Уже вошли на телефоне — можно без письма: QR или код */}
      <div aria-hidden="true" className="nx-auth-or" style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0", fontSize: 12, color: C.mutedSoft }}>
        {!gate && <span style={{ flex: 1, height: 1, background: C.border }} />}<span style={{ flex: gate ? 1 : "none", textAlign: "center" }}>или</span>{!gate && <span style={{ flex: 1, height: 1, background: C.border }} />}
      </div>
      <button type="button" className="nx-ghost-btn" onClick={() => { setError(null); setStep("qr"); }} style={{
        ...btnReset, width: "100%", padding: "11px 16px", fontSize: 14, borderRadius: 999,
        border: `1px solid ${C.borderStrong}`, color: C.text, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
        {gate ? <>Войти по QR {Icon.qr({ c: C.text, s: 22 })}</> : <>{Icon.phone({ c: C.text, s: 15 })} Войти по QR с телефона</>}
      </button>
      <div className="nx-auth-note" style={{ fontSize: 12, color: C.mutedSoft, marginTop: 12, lineHeight: 1.45 }}>
        Проект учебный. Данные хранятся для демонстрации и удаляются по запросу.
      </div>
    </form>
  ) : (
    <form className="nx-auth-step" data-step="code" onSubmit={(e) => { e.preventDefault(); verify(); }} noValidate>
      <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.5 }}>
        Код отправили на <span style={{ color: C.text }}>{cleanEmail}</span>.{" "}
        <button type="button" onClick={() => { setStep("email"); setError(null); }} style={authLink}>Изменить почту</button>
      </div>
      <label htmlFor="nx-auth-code" style={{ display: "block", fontSize: 13, color: C.muted, marginTop: 16 }}>Код из письма</label>
      <input
        id="nx-auth-code" ref={codeRef} inputMode="numeric" autoComplete="one-time-code"
        className="nx-input nx-auth-code" value={code} disabled={busy} maxLength={CODE_MAX}
        placeholder="••••••"
        // Только цифры: лишнее (пробелы, дефисы при вставке) отбрасываем
        onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_MAX)); setError(null); }}
        aria-invalid={!!error} aria-describedby="nx-auth-code-hint"
        style={{ ...authField(!!error), fontFamily: fontDisplay, fontSize: 22, letterSpacing: "0.3em" }}
      />
      <div id="nx-auth-code-hint" role={error ? "alert" : undefined} style={{ fontSize: 13, marginTop: 8, lineHeight: 1.45, color: error ? C.red : C.mutedSoft }}>
        {error || "Письмо может прийти через минуту. Загляните и в «Спам»"}
      </div>
      <StateButton variant="primary" state={busy ? "loading" : "idle"} labels={{ loading: "Проверяем…" }}
        disabled={code.length < CODE_MIN} onClick={verify}
        style={{ width: "100%", marginTop: 18, padding: "12px 16px", fontSize: 14 }}>
        Войти
      </StateButton>
      <div style={{ marginTop: 14, fontSize: 13, color: C.mutedSoft, textAlign: "center" }}>
        {wait > 0
          ? <>Отправить ещё раз через <span style={{ fontFamily: fontDisplay }}>{wait}</span> с</>
          : <button type="button" onClick={sendCode} disabled={busy} style={authLink}>Отправить ещё раз</button>}
      </div>
    </form>
  );
}

/* Экран первого запуска (макет 2026-10). Фон — рендер устройств (public/art/gate-dark|light.webp
   под тему), справа «стеклянная» карточка (на телефоне — шторка снизу).
   Шаг 1: знак NEXA, что это такое, «Войти» и круглая кнопка QR. Шаг 2: «Вход в NEXA» —
   почта и код (AuthPanel variant="gate") или вход по QR с другого устройства.
   Гостевого входа здесь нет (решение автора); гостевой режим остаётся у тех, кто уже гость.
   Esc / «Назад» Android на шаге 2 — к шагу 1, на шаге 1 приложение сворачивается.
   Показывается, только если аккаунты доступны (есть настройки Supabase) */
export function AuthGate() {
  const [step, setStep] = useState(null); // null — приветствие; "email" | "qr" — вход
  return (
    <div className="nx-auth-gate nx-scroll" role="dialog" aria-modal="true" aria-labelledby="nx-auth-title">
      {/* Фон: две картинки, видна та, что под текущую тему (см. .nx-gate-scene в стилях) */}
      <div className="nx-gate-scene" aria-hidden="true">
        <img className="nx-gate-dark" src="/art/gate-dark.webp" alt="" draggable={false} />
        <img className="nx-gate-light" src="/art/gate-light.webp" alt="" draggable={false} />
      </div>
      <div className="nx-gate-card">
        {step ? (
          <div key="login" className="nx-pop nx-gate-login">
            <div id="nx-auth-title" className="nx-gate-title">Вход в NEXA</div>
            <div className="nx-gate-sub">По коду из письма, без пароля</div>
            <AuthPanel variant="gate" initialStep={step} onEscape={() => setStep(null)} />
          </div>
        ) : (
          <div key="hello" className="nx-pop nx-gate-hello">
            <div className="nx-gate-logo" role="img" aria-label="NEXA">
              <LogoMark s={88} color={C.gateText} />
              <Logo bare h={44} color={C.gateText} />
            </div>
            <div id="nx-auth-title" className="nx-gate-text">
              NEXA — ваша личная экосистема устройств, синхронизированных друг с другом. Всё, что вам нужно, в одном пространстве.
            </div>
            <div className="nx-gate-actions">
              <button type="button" className="nx-primary nx-gate-enter" onClick={() => setStep("email")}>Войти</button>
              <button type="button" className="nx-icon-btn nx-gate-qr" onClick={() => setStep("qr")} aria-label="Войти по QR с другого устройства" title="Войти по QR">
                {Icon.qr({ c: C.gateText, s: 30 })}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* Окно входа из Настроек: та же панель, крестик и Esc закрывают.
   Фон под окном просто затемнён, без размытия */
export function AuthModal({ onClose, hint }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div className="nx-viewer" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: `color-mix(in srgb, ${C.bg} 80%, transparent)`,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nx-auth-modal-title"
        className="nx-viewer-panel nx-pop nx-scroll" onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 100%)", maxHeight: "calc(100vh - 40px)", overflowY: "auto",
          background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 18,
          boxSizing: "border-box", textAlign: "left", padding: "20px 22px 22px",
        }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="nx-auth-modal-title" style={{ fontFamily: fontDisplay, fontSize: 24, lineHeight: 1.15 }}>Вход в NEXA</div>
            <div style={{ fontSize: 13, color: C.mutedSoft, marginTop: 6, lineHeight: 1.45 }}>{hint || "По коду из письма, без пароля"}</div>
          </div>
          <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть" style={{
            ...btnReset, width: 34, height: 34, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {Icon.close({ c: C.muted, s: 18 })}
          </button>
        </div>
        <AuthPanel onEscape={onClose} />
      </div>
    </div>
  );
}

/* Группа «Аккаунт» в Настройках: вошли — почта и «Выйти», нет — «Войти» */
export function AccountSettings({ user, onLogin, onDeleteData, onApproveLogin }) {
  const [leaving, setLeaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false); // окно «Удалить мои данные?»
  const logout = async () => {
    const uid = user?.id;
    setLeaving(true);
    try { await signOut(); } finally { setLeaving(false); }
    // Чуть ждём: интерфейс уже переключился на гостевые данные и больше не пишет в ключи аккаунта
    setTimeout(() => clearLocalAccountData(uid), 400);
  };
  const pill = { ...btnReset, flexShrink: 0, borderRadius: 999, padding: "8px 16px", fontSize: 13, whiteSpace: "nowrap" };
  return (
    <>
      <SectionTitle>Аккаунт</SectionTitle>
      <SettingsGroup>
        {user ? (
          <SettingsRow
            last
            icon={Icon.user({ c: C.muted, s: 20 })}
            title={<span style={{ overflowWrap: "anywhere" }}>{user.email}</span>}
            subtitle={
              <span style={{ color: C.green, display: "flex", alignItems: "center", gap: 6 }}>
                <Dot color={C.green} /> Вы вошли
              </span>
            }
            right={
              <button type="button" className="nx-ghost-btn" onClick={logout} disabled={leaving}
                style={{ ...pill, border: `1px solid ${C.borderStrong}`, color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
                {Icon.logout({ c: C.text, s: 15 })} {leaving ? "Выходим…" : "Выйти"}
              </button>
            }
          />
        ) : (
          <SettingsRow
            last
            icon={Icon.user({ c: C.muted, s: 20 })}
            title="Вы не вошли"
            subtitle={authAvailable ? "Вход по почте, без пароля" : "Аккаунты сейчас недоступны"}
            right={
              <button type="button" className="nx-primary" onClick={onLogin} style={{
                ...pill, border: "1px solid transparent", color: C.onFold, fontWeight: 500,
                background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`,
              }}>
                Войти
              </button>
            }
          />
        )}
        {user && onApproveLogin && (
          <SettingsRow
            icon={Icon.phone({ c: C.muted, s: 18 })}
            title="Войти на другом устройстве"
            subtitle="Без письма: отсканируйте QR или введите код"
            right={
              <button type="button" className="nx-ghost-btn" onClick={onApproveLogin}
                style={{ ...pill, border: `1px solid ${C.borderStrong}`, color: C.text }}>
                Подтвердить
              </button>
            }
          />
        )}
        {user && (
          <SettingsRow
            last
            icon={Icon.trash({ c: C.red, s: 18 })}
            title="Удалить мои данные"
            subtitle="Устройства и чаты — из облака и с этого устройства"
            right={
              <button type="button" className="nx-ghost-btn" onClick={() => setConfirmOpen(true)}
                style={{ ...pill, border: `1px solid color-mix(in srgb, ${C.red} 55%, transparent)`, color: C.red }}>
                Удалить
              </button>
            }
          />
        )}
      </SettingsGroup>
      {confirmOpen && <DeleteDataDialog onConfirm={onDeleteData} onClose={() => setConfirmOpen(false)} />}
    </>
  );
}

/* Подтверждение «Удалить мои данные». onConfirm — асинхронное удаление;
   вернуло текст ошибки — показываем его, окно не закрываем */
export function DeleteDataDialog({ onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy]);
  const run = async () => {
    setBusy(true); setError(null);
    const err = await onConfirm();
    setBusy(false);
    if (err) setError(err); else onClose();
  };
  return (
    <div className="nx-viewer" onClick={() => !busy && onClose()} style={{
      position: "fixed", inset: 0, zIndex: 300, background: `color-mix(in srgb, ${C.bg} 80%, transparent)`,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nx-del-title" className="nx-viewer-panel nx-pop"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(400px, 100%)", background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 18, padding: "20px 22px 22px", boxSizing: "border-box", textAlign: "left" }}>
        <div id="nx-del-title" style={{ fontFamily: fontDisplay, fontSize: 22, lineHeight: 1.2 }}>Удалить мои данные?</div>
        <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.5, marginTop: 10 }}>
          Устройства и чаты аккаунта удалятся из облака и с этого устройства. Вернуть их не получится. Аккаунт останется — войти можно будет снова.
        </div>
        {error && <div style={{ marginTop: 14 }}><StateNote kind="error">{error}</StateNote></div>}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button type="button" className="nx-ghost-btn" onClick={onClose} disabled={busy} style={{
            ...btnReset, flex: 1, padding: "11px 16px", fontSize: 14, border: `1px solid ${C.borderStrong}`, color: C.text, textAlign: "center",
          }}>
            Отмена
          </button>
          <StateButton state={busy ? "loading" : "idle"} labels={{ loading: "Удаляем…" }} onClick={run}
            style={{ flex: 1, padding: "11px 16px", fontSize: 14, borderRadius: 999, borderColor: C.red, color: C.red }}>
            Удалить
          </StateButton>
        </div>
      </div>
    </div>
  );
}
