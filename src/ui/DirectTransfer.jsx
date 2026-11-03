// Складка сопровождает настоящую передачу; успех показываем только после проверки всех байтов.
import { useEffect, useRef } from "react";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { formatBytes } from "../lib/deviceInfo.js";
import { plural } from "../lib/format.js";

function Preview({ file }) {
  const image = useRef(null);
  const preview = !!file.blob && /^image\/(png|jpeg|webp|gif|avif)$/.test(file.mime);
  useEffect(() => {
    if (!preview) return;
    const next = URL.createObjectURL(file.blob);
    if (image.current) image.current.src = next;
    return () => URL.revokeObjectURL(next);
  }, [file.blob, preview]);
  return preview ? <img ref={image} className="nx-transfer-preview" alt="" /> : <span className="nx-transfer-file-icon" aria-hidden="true">{Icon.doc({ c: C.mint, s: 22 })}</span>;
}

function Fold({ phase, progress }) {
  const spread = phase === "done" ? 1 : phase === "receiving" || phase === "sending" ? 0.3 + progress * 0.5 : 0.15;
  return <svg className="nx-transfer-fold" viewBox="0 0 160 100" aria-hidden="true" style={{ "--unfold": spread }}>
    <path className="nx-transfer-plane is-left" d="M80 16 22 38 80 86Z" fill={C.blue} />
    <path className="nx-transfer-plane is-right" d="M80 16 138 38 80 86Z" fill={C.blueLight} />
    <path className="nx-transfer-plane is-bottom" d="M22 38 80 86 138 38 104 94Z" fill={C.blueDark} />
    <path className="nx-transfer-crease" d="M80 16V86" fill="none" stroke={C.mint} strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

function TransferCard({ transfer, request, outgoing, onAccept, onReject, onCancel, onClose, onSave, onAdd }) {
  const root = useRef(null);
  const phase = request ? "asking" : transfer.phase;
  const done = phase === "done", failed = phase === "failed";
  const busy = !request && !done && !failed;
  const total = outgoing ? transfer.total : transfer.size;
  const bytes = Math.min(total || 0, transfer.bytes || 0);
  const progress = total ? Math.min(1, bytes / total) : done ? 1 : 0;
  const files = transfer.files || [];
  const title = request ? "Принять файлы?" : done ? outgoing ? "Файлы доставлены" : "Получение завершено"
    : failed ? transfer.reason === "cancel" ? "Передача отменена" : transfer.reason === "declined" ? "Запрос отклонён" : "Передача не завершена"
    : phase === "asking" ? "Ждём подтверждения" : phase === "connecting" ? "Соединяем устройства" : outgoing ? "Отправляем файлы" : "Получаем файлы";
  const peer = outgoing ? transfer.toName : request ? transfer.name : transfer.fromName;
  useEffect(() => {
    if (request) root.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [request]);
  useEffect(() => {
    const key = (e) => {
      if (e.key !== "Escape" || (!root.current?.contains(document.activeElement) && !request)) return;
      e.stopPropagation();
      if (request) onReject(); else if (!busy) onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [request, busy, onReject, onClose]);
  return <section ref={root} role={request ? "dialog" : "region"} aria-label={title} aria-modal={request ? "false" : undefined}
    className={`nx-transfer-card is-${phase}`} data-no-swipe>
    <div className="nx-transfer-heading">
      <Fold phase={phase} progress={progress} />
      <div><div className="nx-transfer-eyebrow">NEXA · В одной сети</div><h2>{title}</h2>
        <div className="nx-transfer-peer">{outgoing ? "Кому" : "От кого"}: {peer || "Устройство"}</div></div>
      {!busy && !request && <button className="nx-icon-btn" type="button" onClick={onClose} aria-label="Закрыть передачу">{Icon.close({ c: C.muted, s: 16 })}</button>}
    </div>
    <div className="nx-transfer-summary">{files.length} {plural(files.length, ["файл", "файла", "файлов"])} · {formatBytes(total || 0)}</div>
    {request && <p className="nx-transfer-hint">Передача начнётся после вашего согласия. Файлы не откроются автоматически.</p>}
    <ul className={`nx-transfer-files${done && !outgoing ? " is-received" : ""}`}>
      {files.map((file, index) => <li key={`${index}-${file.name}`}>
        {done && !outgoing && <Preview file={file} />}
        <div className="nx-transfer-file-name"><span title={file.name}>{file.name}</span><small>{formatBytes(file.size)}</small></div>
        {done && !outgoing && file.blob && <button type="button" className="nx-ghost-btn" onClick={() => onSave(file)} aria-label={`Сохранить ${file.name}`}>Сохранить</button>}
      </li>)}
    </ul>
    {busy && <>
      <div className="nx-transfer-progress" role="progressbar" aria-label={outgoing ? "Получено другим устройством" : "Получено"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress * 100)}>
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>
      <div className="nx-transfer-meter"><span>{formatBytes(bytes)} из {formatBytes(total || 0)}</span><span>{Math.floor(progress * 100)}%</span></div>
    </>}
    <div className="nx-transfer-status" role={failed ? "alert" : "status"} aria-live="polite">
      {failed ? transfer.error : done ? "✓ Готово" : phase === "asking" && !request ? "Откройте NEXA на принимающем устройстве" : phase === "connecting" ? "Оба устройства должны быть в одной локальной сети" : ""}
    </div>
    <div className="nx-transfer-actions">
      {request ? <><button type="button" className="nx-ghost-btn" onClick={onReject}>Отклонить</button><button type="button" className="nx-primary" onClick={onAccept}>Принять</button></>
        : busy ? <button type="button" className="nx-ghost-btn" onClick={onCancel}>Отменить передачу</button>
        : done && !outgoing ? <button type="button" className="nx-primary" onClick={() => onAdd(files)}>Добавить в «Файлы»</button> : null}
    </div>
    {done && !outgoing && <p className="nx-transfer-hint">Сохраните файлы перед закрытием карточки: пока они находятся в памяти NEXA.</p>}
  </section>;
}

export function DirectTransfer({ direct, onSave, onAdd }) {
  if (!direct.ask && !direct.inc && !direct.out) return null;
  return <div className="nx-transfer-host">
    {direct.ask ? <TransferCard key={direct.ask.id} transfer={direct.ask} request onAccept={direct.accept} onReject={direct.reject} />
      : direct.inc && <TransferCard key={direct.inc.id} transfer={direct.inc} onCancel={direct.cancelInc} onClose={direct.closeInc} onSave={onSave} onAdd={onAdd} />}
    {direct.out && <TransferCard key={direct.out.id} transfer={direct.out} outgoing onCancel={direct.cancelOut} onClose={direct.closeOut} />}
  </div>;
}
