/* Профиль аккаунта (2026-10-27): своё имя и фото. Хранится в профиле Supabase (user_metadata:
   nexa_name, nexa_avatar), поэтому одинаковое на всех устройствах аккаунта — таблиц и миграций не нужно.
   Фото — маленькая картинка 96 × 96 (JPEG, несколько КБ): профиль уходит в пропуск входа (JWT)
   с каждым запросом, большие картинки туда класть нельзя. Тесты — tests/profile.test.mjs */

export const NAME_MAX = 40;
export const AVATAR_PX = 96;
export const AVATAR_MAX_CHARS = 9000; // data:image/jpeg;base64,… — больше не принимаем (≈ 6,5 КБ)

// Имя: своё, иначе из профиля почтового входа, иначе часть почты до «@» с большой буквы
export function profileName(user) {
  const m = user?.user_metadata || {};
  const own = String(m.nexa_name || "").trim();
  if (own) return own;
  const n = String(m.full_name || m.name || "").trim();
  if (n) return n;
  const local = String(user?.email || "").split("@")[0] || "";
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "";
}

// Фото — только наша же картинка (data:image/jpeg или png), чужие адреса не показываем
export function profileAvatar(user) {
  const a = user?.user_metadata?.nexa_avatar;
  return typeof a === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(a) && a.length <= AVATAR_MAX_CHARS ? a : null;
}

// Имя для записи: без переводов строк и лишних пробелов, до NAME_MAX знаков; пустое — «вернуть как было»
export function cleanName(v) {
  return String(v || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
}

/* Фото из файла: середина картинки квадратом, 96 × 96, JPEG. Качество снижаем, пока не влезет в предел.
   null — картинку не прочитать (например, HEIC в браузере, который его не понимает) */
export async function makeAvatar(file) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { return null; }
  const side = Math.min(bmp.width, bmp.height);
  if (!side) return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = AVATAR_PX;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#01090F"; // прозрачные PNG — на тёмном, как фон NEXA
  ctx.fillRect(0, 0, AVATAR_PX, AVATAR_PX);
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
  bmp.close?.();
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length <= AVATAR_MAX_CHARS) return url;
  }
  return null;
}

/* Записать в профиль. patch: { name?, avatar? } — avatar: строка data:… или null (убрать фото).
   Возвращает null при успехе или понятный текст ошибки */
export async function saveProfile(patch) {
  // Клиент Supabase — по месту: так правила профиля проверяются тестами без настроек входа
  const { supabase } = await import("./supabase.js");
  if (!supabase) return "Аккаунты сейчас недоступны";
  if (navigator.onLine === false) return "Нет связи — изменения не сохранены";
  const data = {};
  if ("name" in patch) data.nexa_name = cleanName(patch.name) || null;
  if ("avatar" in patch) data.nexa_avatar = patch.avatar || null;
  try {
    const { error } = await supabase.auth.updateUser({ data });
    return error ? "Не удалось сохранить — попробуйте ещё раз" : null;
  } catch {
    return "Не удалось сохранить — попробуйте ещё раз";
  }
}
