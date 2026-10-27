// Профиль аккаунта: аватар (кружок с фото или значком) и блок «Имя и фото» в настройках аккаунта
import { useState, useRef, useEffect } from "react";
import { C } from "./theme.js";
import { Icon } from "./icons.jsx";
import { btnReset, SectionTitle, SettingsGroup, Spinner } from "./base.jsx";
import { profileName, profileAvatar, makeAvatar, saveProfile, cleanName, NAME_MAX } from "../lib/profile.js";

// Кружок аккаунта: фото из профиля, иначе значок человека
export function Avatar({ user, size = 40, src }) {
  const photo = src !== undefined ? src : profileAvatar(user);
  return (
    <span className="nx-set-avatar" aria-hidden="true" style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center", background: C.avatarBg,
    }}>
      {photo
        ? <img src={photo} alt="" width={size} height={size} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        : Icon.user({ c: C.avatarInk, s: Math.round(size * 0.48) })}
    </span>
  );
}

/* «Имя и фото»: поменять имя (Enter — сохранить) и фото (выбор картинки → квадрат 96 px).
   Сохраняется в профиле аккаунта — на других устройствах появится само после их обновления сеанса */
export function ProfileSettings({ user }) {
  const saved = String(user?.user_metadata?.nexa_name || "");
  const fallback = profileName({ ...user, user_metadata: { ...(user?.user_metadata || {}), nexa_name: "" } });
  const [name, setName] = useState(saved || "");
  const [busy, setBusy] = useState(null);   // "name" | "photo" | null
  const [note, setNote] = useState(null);   // { kind: "ok" | "error", text }
  const fileRef = useRef(null);
  const avatar = profileAvatar(user);
  useEffect(() => { setName(saved || ""); }, [saved]);
  useEffect(() => {
    if (note?.kind !== "ok") return;
    const t = setTimeout(() => setNote(null), 2500);
    return () => clearTimeout(t);
  }, [note]);

  const changed = cleanName(name) !== cleanName(saved);
  const saveName = async () => {
    if (!changed || busy) return;
    setBusy("name");
    const err = await saveProfile({ name });
    setBusy(null);
    setNote(err ? { kind: "error", text: err } : { kind: "ok", text: cleanName(name) ? "Имя сохранено" : "Имя снова как в почте" });
  };
  const pickPhoto = async (file) => {
    if (!file) return;
    setBusy("photo"); setNote(null);
    const url = await makeAvatar(file);
    if (!url) { setBusy(null); setNote({ kind: "error", text: "Эту картинку не получилось открыть — выберите фото в JPG или PNG" }); return; }
    const err = await saveProfile({ avatar: url });
    setBusy(null);
    setNote(err ? { kind: "error", text: err } : { kind: "ok", text: "Фото обновлено" });
  };
  const removePhoto = async () => {
    setBusy("photo"); setNote(null);
    const err = await saveProfile({ avatar: null });
    setBusy(null);
    setNote(err ? { kind: "error", text: err } : { kind: "ok", text: "Фото убрано" });
  };

  const pill = { ...btnReset, borderRadius: 999, padding: "8px 16px", fontSize: 13, border: `1px solid ${C.borderStrong}`, color: C.text, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 };
  return (
    <>
      <SectionTitle>Имя и фото</SectionTitle>
      <SettingsGroup>
        <div className="nx-profile" style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 18px", flexWrap: "wrap" }}>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} aria-label="Изменить фото" title="Изменить фото"
            style={{ ...btnReset, borderRadius: "50%", position: "relative", flexShrink: 0 }}>
            <Avatar user={user} size={72} />
            <span aria-hidden="true" style={{
              position: "absolute", right: -2, bottom: -2, width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: C.panel, border: `1px solid ${C.borderStrong}`,
            }}>
              {busy === "photo" ? <Spinner s={12} /> : Icon.edit({ c: C.text, s: 13 })}
            </span>
          </button>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="nx-ghost-btn" onClick={() => fileRef.current?.click()} disabled={!!busy} style={pill}>
              {Icon.plus({ c: C.text, s: 14 })} {avatar ? "Другое фото" : "Добавить фото"}
            </button>
            {avatar && (
              <button type="button" className="nx-ghost-btn" onClick={removePhoto} disabled={!!busy} style={{ ...pill, color: C.muted }}>
                Убрать
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); saveName(); }}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 18px 16px", flexWrap: "wrap" }}>
          <input className="nx-input" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)}
            placeholder={fallback || "Как вас зовут?"} aria-label="Имя" autoComplete="name"
            style={{ flex: "1 1 180px", minWidth: 0, background: "transparent", color: C.text, fontFamily: "inherit", fontSize: 16,
              border: `1px solid ${C.borderStrong}`, borderRadius: 999, padding: "9px 16px", outline: "none", boxSizing: "border-box" }} />
          <button type="submit" className="nx-primary" disabled={!changed || !!busy} style={{
            ...btnReset, borderRadius: 999, padding: "9px 18px", fontSize: 13, fontWeight: 500, border: "1px solid transparent",
            color: C.onFold, background: `linear-gradient(90deg, ${C.foldBlue}, ${C.foldCyan})`, opacity: changed ? 1 : 0.5,
          }}>
            {busy === "name" ? "Сохраняем…" : "Сохранить"}
          </button>
        </form>
        {note && (
          <div role="status" style={{ padding: "0 18px 14px", fontSize: 12.5, color: note.kind === "error" ? C.red : C.green }}>{note.text}</div>
        )}
        {!note && (
          <div style={{ padding: "0 18px 14px", fontSize: 12.5, color: C.mutedSoft }}>
            Видно только вам — на ваших устройствах. Пустое имя — как в почте{fallback ? ` («${fallback}»)` : ""}
          </div>
        )}
      </SettingsGroup>
    </>
  );
}
