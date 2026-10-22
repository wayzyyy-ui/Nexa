// Настройки → «Данные»: резервная копия и восстановление. Логика — src/lib/backup.js, ход — backupApi в NexaApp.
// Окна — role="dialog" с Esc (кнопка «Назад» Android закрывает их); пока идёт работа, закрыть можно только «Отменить».
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { btnReset, SectionTitle, SettingsGroup, SettingsRow } from "./base.jsx";
import { formatBytes } from "../lib/deviceInfo.js";
import { plural } from "../lib/format.js";
import { BACKUP_PARTS, BACKUP_EXCLUDED, BACKUP_EXT } from "../lib/backup.js";

const when = (ms) => new Date(ms).toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const pill = { ...btnReset, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 18px", fontSize: 14, borderRadius: 999, whiteSpace: "nowrap" };
const primary = { ...pill, color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`, border: "1px solid transparent", fontWeight: 500 };
const ghost = { ...pill, border: `1px solid ${C.borderStrong}`, color: C.text };
const danger = { ...pill, border: `1px solid ${C.red}`, color: C.red };

export function BackupSettings({ api }) {
  const [open, setOpen] = useState(null); // "create" | "restore"
  const last = api.last;
  return (
    <>
      <SectionTitle>Данные</SectionTitle>
      <SettingsGroup>
        <SettingsRow icon={Icon.download({ c: C.mint, s: 18 })} title="Создать резервную копию"
          subtitle={last ? `Последняя на этом устройстве — ${when(last.at)}${last.complete ? "" : " (неполная)"}` : "Заметки, диалоги, расписание и файлы — в один файл на этом устройстве"}
          right={Icon.chevron({})} onClick={() => setOpen("create")} />
        <SettingsRow last icon={Icon.refresh({ c: C.muted, s: 18 })} title="Восстановить из копии"
          subtitle={`Файл ${BACKUP_EXT}: сначала покажем, что внутри, — ничего не удалится без вашего подтверждения`}
          right={Icon.chevron({})} onClick={() => setOpen("restore")} />
      </SettingsGroup>
      {open === "create" && <CreateBackup api={api} onClose={() => setOpen(null)} />}
      {open === "restore" && <RestoreBackup api={api} onClose={() => setOpen(null)} />}
    </>
  );
}

/* Окно: затемнение, карточка, Esc. busy — идёт работа: Esc и нажатие мимо не закрывают */
function Shell({ title, onClose, busy, onEsc, children }) {
  const esc = useRef(null); esc.current = () => { if (busy) return; (onEsc || onClose)(); };
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); esc.current(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return createPortal(
    <div className="nx-viewer" onClick={() => !busy && onClose()} style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "var(--scrim)" }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="nx-pop nx-scroll" data-no-swipe style={{
        width: "min(520px, 100%)", maxHeight: "calc(100% - 32px)", overflowY: "auto", boxSizing: "border-box",
        background: C.panel, border: `1px solid ${C.borderStrong}`, borderRadius: 20, padding: 20, textAlign: "left",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div className="ng-display" style={{ fontSize: 20, fontWeight: 600 }}>{title}</div>
          {!busy && (
            <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Закрыть" style={{ ...btnReset, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {Icon.close({ c: C.muted, s: 14 })}
            </button>
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// Строка-галочка (как переключатель, но в списке частей)
function Check({ on, onClick, disabled, title, sub }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} disabled={disabled} onClick={onClick} style={{
      ...btnReset, display: "flex", alignItems: "flex-start", gap: 12, width: "100%", textAlign: "left", padding: "9px 2px", opacity: disabled ? 0.5 : 1,
    }}>
      <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 999, flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center",
        border: `1.5px solid ${on ? C.green : C.borderStrong}` }}>{on && Icon.check({ c: C.green, s: 12 })}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, color: C.text }}>{title}</span>
        {sub && <span style={{ display: "block", fontSize: 12, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>{sub}</span>}
      </span>
    </button>
  );
}

// Настоящий прогресс: доля сделанного и что сейчас происходит
function Progress({ p }) {
  const pct = p.total ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
  return (
    <div style={{ marginTop: 16 }} role="status" aria-live="polite">
      <div style={{ height: 6, borderRadius: 999, background: `color-mix(in srgb, ${C.text} 12%, transparent)`, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: C.mint, transition: "width 160ms linear" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: C.muted, marginTop: 8 }}>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.text || "…"}</span>
        <span style={{ flexShrink: 0 }}>{pct} %</span>
      </div>
    </div>
  );
}

const countText = (id, c) => {
  if (id === "notes") return `${c.notes} ${plural(c.notes, ["заметка", "заметки", "заметок"])}`;
  if (id === "chats") return `${c.chats} ${plural(c.chats, ["диалог", "диалога", "диалогов"])}`;
  if (id === "schedule") return `${c.schedule} ${plural(c.schedule, ["дело", "дела", "дел"])}`;
  if (id === "memory") return `${c.memory} ${plural(c.memory, ["запись", "записи", "записей"])}`;
  if (id === "files") return `${c.files} ${plural(c.files, ["файл", "файла", "файлов"])}, ${c.folders} ${plural(c.folders, ["папка", "папки", "папок"])} своих`;
  if (id === "settings") return c.settings ? "тема, Enter в ассистенте, город погоды и т. п." : "пока не меняли";
  return "";
};

/* ── Создать копию ── */
function CreateBackup({ api, onClose }) {
  const c = api.counts;
  const [sel, setSel] = useState(() => new Set(BACKUP_PARTS.map((p) => p.id)));
  const [withContent, setWithContent] = useState(true);
  const [phase, setPhase] = useState("setup"); // setup | build | save | done | error
  const [prog, setProg] = useState({ done: 0, total: 1, text: "" });
  const [note, setNote] = useState(null);
  const [result, setResult] = useState(null);
  const ctl = useRef(null);
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const busy = phase === "build" || phase === "save";
  const content = sel.has("files") && withContent && c.files > 0;

  const run = async () => {
    setNote(null); setPhase("build"); setProg({ done: 0, total: 1, text: "Собираем записи" });
    ctl.current = new AbortController();
    const signal = ctl.current.signal;
    try {
      const r = await api.create({ parts: sel, withContent: content, signal, onProgress: setProg });
      setPhase("save"); setProg({ done: 0, total: r.blob.size, text: "Сохраняем файл копии" });
      const s = await api.save(r.blob, r.name, { signal, manifest: r.manifest, onProgress: (d, t) => setProg({ done: d, total: t, text: "Сохраняем файл копии" }) });
      if (s === "cancelled") { setPhase("setup"); setNote("Сохранение отменено — файл копии не записан."); return; }
      setResult({ ...r, saved: s }); setPhase("done");
    } catch (e) {
      if (signal.aborted || e?.code === "abort") { setPhase("setup"); setNote("Отменено — копия не сохранена, ваши данные не тронуты."); return; }
      setNote(e?.message === "old_app" ? "Копия больше 40 МБ, а эта версия приложения сохраняет только меньше. Обновите NEXA или сделайте копию без содержимого файлов."
        : e?.message === "save_failed" ? "Не получилось сохранить файл на устройстве — возможно, кончилось место."
        : e?.code === "too_big" ? e.message
        : "Не получилось собрать копию. Попробуйте ещё раз.");
      setPhase("error");
    }
  };

  if (phase === "done" && result) {
    const m = result.manifest;
    return (
      <Shell title="Копия готова" onClose={onClose}>
        <div style={{ fontSize: 14, color: C.text, marginTop: 12, lineHeight: 1.5 }}>
          {result.saved === "started" ? "Браузер сохраняет файл в «Загрузки»:" : "Файл сохранён:"} <b style={{ fontWeight: 500 }}>{result.name}</b>, {formatBytes(result.blob.size)}.
        </div>
        <div style={{ fontSize: 13, marginTop: 10, color: m.complete ? C.green : C.red, lineHeight: 1.45 }}>
          {m.complete ? "Всё выбранное попало в копию." : `Копия неполная: без содержимого ${m.missing.length} ${plural(m.missing.length, ["файла", "файлов", "файлов"])} (их сведения сохранены).`}
        </div>
        {!m.complete && (
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
            {m.missing.slice(0, 8).map((x, i) => <li key={i}>«{x.name}» — {x.reason}</li>)}
            {m.missing.length > 8 && <li>и ещё {m.missing.length - 8}</li>}
          </ul>
        )}
        <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 12, lineHeight: 1.45 }}>Копия не зашифрована — храните её так же бережно, как личные документы.</div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" className="nx-primary" style={primary} onClick={onClose}>Готово</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Резервная копия" onClose={onClose} busy={busy}>
      {!busy && (
        <>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 6, lineHeight: 1.45 }}>
            {api.guest ? "Вы не вошли в аккаунт: в копию попадёт то, что хранится в этом браузере." : "В копию попадут данные вашего аккаунта, как они сейчас на этом устройстве."}
            {api.last ? ` Последняя копия на этом устройстве — ${when(api.last.at)}.` : " На этом устройстве копий ещё не делали."}
          </div>
          <div style={{ marginTop: 12 }}>
            {BACKUP_PARTS.map((p) => <Check key={p.id} on={sel.has(p.id)} onClick={() => toggle(p.id)} title={p.label} sub={countText(p.id, c)} />)}
          </div>
          {sel.has("files") && c.files > 0 && (
            <div style={{ marginTop: 6, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
              <Check on={withContent} onClick={() => setWithContent((v) => !v)} title="Содержимое файлов"
                sub={withContent ? `Сами файлы, ${formatBytes(c.filesBytes)}${!api.guest && !api.online ? ". Нет связи — файлы из облака не скачаются" : ""}` : "Только названия и папки — копия маленькая, но сами файлы не восстановятся"} />
            </div>
          )}
          <details style={{ marginTop: 10, fontSize: 12, color: C.muted }}>
            <summary style={{ cursor: "pointer" }}>Что не попадает в копию</summary>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.5 }}>{BACKUP_EXCLUDED.map((x) => <li key={x}>{x}</li>)}</ul>
          </details>
          <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 10, lineHeight: 1.45 }}>
            Копия не зашифрована: заметки, диалоги и файлы в ней лежат как есть. Не отправляйте её посторонним.
          </div>
          {note && <div role="alert" style={{ fontSize: 13, color: phase === "error" ? C.red : C.muted, marginTop: 10 }}>{note}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
            <button type="button" className="nx-ghost-btn" style={ghost} onClick={onClose}>Закрыть</button>
            <button type="button" className="nx-primary" style={{ ...primary, opacity: sel.size ? 1 : 0.5 }} disabled={!sel.size} onClick={run}>
              {phase === "error" ? "Повторить" : "Создать копию"}
            </button>
          </div>
        </>
      )}
      {busy && (
        <>
          <Progress p={prog} />
          <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 10 }}>Отмена ничего не меняет в ваших данных.</div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button type="button" className="nx-ghost-btn" style={ghost} onClick={() => ctl.current?.abort()}>Отменить</button>
          </div>
        </>
      )}
    </Shell>
  );
}

/* ── Восстановить ── */
function RestoreBackup({ api, onClose }) {
  const [phase, setPhase] = useState("pick"); // pick | reading | preview | confirm | run | done
  const [err, setErr] = useState(null);
  const [b, setB] = useState(null);
  const [parts, setParts] = useState(new Set());
  const [mode, setMode] = useState("merge");
  const [prog, setProg] = useState({ done: 0, total: 1, text: "" });
  const [out, setOut] = useState(null);
  const input = useRef(null);
  const ctl = useRef(null);

  const pick = async (file) => {
    if (!file) return;
    setErr(null); setPhase("reading");
    try {
      const r = await api.read(file);
      setB(r);
      setParts(new Set(r.summary.present));
      setMode("merge");
      setPhase("preview");
    } catch (e) {
      setErr(e?.message && e?.code ? e.message : "Файл не открылся как резервная копия NEXA.");
      setPhase("pick");
    }
  };
  const plan = useMemo(() => (b ? api.plan(b, { parts, mode }) : null), [b, parts, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    setPhase("run"); setProg({ done: 0, total: 1, text: "Начинаем" });
    ctl.current = new AbortController();
    try {
      setOut(await api.apply(b, plan, { parts, mode, signal: ctl.current.signal, onProgress: setProg }));
    } catch {
      setOut({ written: [], failed: [{ part: "all", text: "Восстановление прервалось" }], files: { done: 0, queued: 0, failed: [] }, cancelled: false });
    }
    setPhase("done");
  };

  if (phase === "done" && out) {
    const label = (id) => (id === "folders" ? "Папки" : BACKUP_PARTS.find((p) => p.id === id)?.label || id);
    const ok = !out.cancelled && !out.failed.length && !out.files.failed.length;
    return (
      <Shell title={out.cancelled ? "Восстановление остановлено" : ok ? "Данные восстановлены" : "Восстановлено не всё"} onClose={onClose}>
        <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 14, color: C.text, lineHeight: 1.6 }}>
          {out.written.map((p) => <li key={p}>{label(p)} — записано</li>)}
          {(out.files.done > 0 || out.files.queued > 0) && <li>Файлы: восстановлено {out.files.done}{out.files.queued ? `, ждут сети для отправки в облако — ${out.files.queued}` : ""}</li>}
        </ul>
        {out.cancelled && <div style={{ fontSize: 13, color: C.muted, marginTop: 10, lineHeight: 1.45 }}>Вы остановили восстановление. Уже восстановленные файлы остались, заметки, диалоги и расписание не менялись.</div>}
        {out.failed.map((f, i) => <div key={i} role="alert" style={{ fontSize: 13, color: C.red, marginTop: 8 }}>{label(f.part)}: {f.text}</div>)}
        {out.files.failed.length > 0 && (
          <>
            <div style={{ fontSize: 13, color: C.red, marginTop: 10 }}>Не восстановились файлы ({out.files.failed.length}):</div>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              {out.files.failed.slice(0, 8).map((f, i) => <li key={i}>«{f.name}» — {f.text}</li>)}
              {out.files.failed.length > 8 && <li>и ещё {out.files.failed.length - 8}</li>}
            </ul>
          </>
        )}
        {!api.guest && out.written.length > 0 && <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 12, lineHeight: 1.45 }}>На этом устройстве всё записано. В облако и на другие устройства изменения уйдут обычной синхронизацией — следите за строкой «Сохранено в облаке».</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" className="nx-primary" style={primary} onClick={onClose}>Готово</button>
        </div>
      </Shell>
    );
  }

  if (phase === "run") {
    return (
      <Shell title="Восстанавливаем" onClose={onClose} busy>
        <Progress p={prog} />
        <div style={{ fontSize: 12, color: C.mutedSoft, marginTop: 10, lineHeight: 1.45 }}>Сначала файлы, потом записи. Отмена до записей оставит заметки, диалоги и расписание как были.</div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="nx-ghost-btn" style={ghost} onClick={() => ctl.current?.abort()}>Отменить</button>
        </div>
      </Shell>
    );
  }

  if (phase === "confirm" && plan) {
    const rows = [["notes", "заметок"], ["chats", "диалогов"], ["schedule", "дел"], ["memory", "записей памяти"]].filter(([id]) => plan.next[id]);
    return (
      <Shell title="Заменить данные?" onClose={onClose} onEsc={() => setPhase("preview")}>
        <div style={{ fontSize: 14, color: C.text, marginTop: 10, lineHeight: 1.5 }}>Выбранное станет ровно таким, как в копии. Сейчас:</div>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 14, color: C.text, lineHeight: 1.6 }}>
          {rows.map(([id, w]) => <li key={id}>{BACKUP_PARTS.find((p) => p.id === id).label}: {api.counts[id]} {w} → станет {plan.next[id].length}</li>)}
        </ul>
        <div style={{ fontSize: 13, color: C.red, marginTop: 10, lineHeight: 1.45 }}>Того, чего нет в копии, не станет — на всех устройствах вашего аккаунта. Отменить замену нельзя.</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Файлы не удаляются никогда — из копии они только добавляются.</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          <button type="button" className="nx-ghost-btn" style={ghost} onClick={() => setPhase("preview")}>Назад</button>
          <button type="button" className="nx-ghost-btn" style={danger} onClick={run}>Заменить</button>
        </div>
      </Shell>
    );
  }

  if (phase === "preview" && b && plan) {
    const s = b.summary;
    const cnt = { notes: s.notes, chats: s.chats, schedule: s.schedule, memory: s.memory, files: s.files, folders: s.folders, settings: s.settings };
    const r = plan.report;
    const toggle = (id) => setParts((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const willText = (id) => {
      if (id === "files") return r.files ? `добавится ${r.files.add}${r.files.skip ? `, пропустим ${r.files.skip} (уже есть или без содержимого)` : ""}` : "";
      if (id === "settings") return "тема, Enter в ассистенте, город — на этом устройстве";
      const x = r[id];
      if (!x) return "";
      if (mode === "replace") return `станет ${plan.next[id].length} (сейчас ${api.counts[id]})`;
      return [x.added && `добавится ${x.added}`, x.updated && `обновится ${x.updated}`, x.same && `уже есть ${x.same}`, x.limit && `не войдёт по лимиту ${x.limit}`].filter(Boolean).join(", ") || "ничего нового";
    };
    return (
      <Shell title="Что в копии" onClose={onClose}>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 6, lineHeight: 1.45 }}>
          Сделана {s.createdAt ? when(Date.parse(s.createdAt)) : "—"}{s.app ? `, NEXA ${s.app}` : ""}, {s.account ? "в аккаунте" : "без входа"}.{" "}
          {b.sameOwner
            ? (s.account ? "Это копия вашего аккаунта — совпадающее не задвоится." : "Копия сделана без входа, как и сейчас, — совпадающее не задвоится.")
            : "Копия другого аккаунта или сделана без входа — записи получат новые номера, одинаковые не повторятся."}
        </div>
        {!s.complete && <div style={{ fontSize: 13, color: C.red, marginTop: 8, lineHeight: 1.45 }}>Копия неполная: у {s.missing.length} {plural(s.missing.length, ["файла", "файлов", "файлов"])} нет содержимого — восстановятся без них.</div>}
        {b.warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: C.red, marginTop: 6 }}>{w}</div>)}
        <div style={{ marginTop: 10 }}>
          {BACKUP_PARTS.map((p) => {
            const present = s.present.includes(p.id);
            return <Check key={p.id} on={present && parts.has(p.id)} disabled={!present} onClick={() => toggle(p.id)}
              title={`${p.label}${present ? ` — ${cnt[p.id]}${p.id === "files" ? ` (с содержимым ${s.filesWithContent})` : ""}` : " — нет в копии"}`}
              sub={present && parts.has(p.id) ? willText(p.id) : null} />;
          })}
        </div>
        <div role="radiogroup" aria-label="Как восстановить" style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
          <Check on={mode === "merge"} onClick={() => setMode("merge")} title="Объединить с текущими данными" sub="Ничего не удаляется: добавится то, чего нет, и более новые версии из копии" />
          <Check on={mode === "replace"} onClick={() => setMode("replace")} title="Заменить выбранное содержимым копии" sub="Заметки, диалоги, дела и память станут ровно как в копии. Попросим подтвердить" />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          <button type="button" className="nx-ghost-btn" style={ghost} onClick={() => { setB(null); setPhase("pick"); }}>Другой файл</button>
          <button type="button" className="nx-primary" style={{ ...primary, opacity: parts.size ? 1 : 0.5 }} disabled={!parts.size}
            onClick={() => (mode === "replace" ? setPhase("confirm") : run())}>Восстановить</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Восстановить из копии" onClose={onClose} busy={phase === "reading"}>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 6, lineHeight: 1.45 }}>
        Выберите файл {BACKUP_EXT}. Сначала проверим его и покажем, что внутри, — ничего не изменится, пока вы не подтвердите.
      </div>
      {phase === "reading" && <Progress p={{ done: 0, total: 1, text: "Проверяем файл…" }} />}
      {err && <div role="alert" style={{ fontSize: 13, color: C.red, marginTop: 12, lineHeight: 1.45 }}>{err}</div>}
      <input ref={input} type="file" accept={`${BACKUP_EXT},application/zip,application/octet-stream`} hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; pick(f); }} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
        <button type="button" className="nx-ghost-btn" style={ghost} onClick={onClose} disabled={phase === "reading"}>Закрыть</button>
        <button type="button" className="nx-primary" style={primary} onClick={() => input.current?.click()} disabled={phase === "reading"}>Выбрать файл</button>
      </div>
    </Shell>
  );
}
