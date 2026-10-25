/* Разослать объявление на все телефоны с NEXA (push через Firebase, api/push.js → action "announce").
   Текст берётся из src/lib/announce.js (то же объявление, что люди видят внутри NEXA).

   Запуск (секрет — только из переменной окружения, в код и в git не вписывать):
     PowerShell:  $env:NEXA_ADMIN_SECRET = "…"; node scripts/announce.mjs mini-1 --dry-run
     Git Bash:    NEXA_ADMIN_SECRET=… node scripts/announce.mjs mini-1 --dry-run
   --dry-run — только посчитать телефоны, ничего не отправлять. Без него — настоящая рассылка
   (одно и то же объявление сервер разошлёт не чаще раза в 30 дней).
   --base=https://… — другой адрес сервера (по умолчанию https://nexa-link.ru). */
import { ANNOUNCEMENTS } from "../src/lib/announce.js";

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--"));
const dry = args.includes("--dry-run");
const base = (args.find((a) => a.startsWith("--base="))?.slice(7) || "https://nexa-link.ru").replace(/\/+$/, "");
const secret = process.env.NEXA_ADMIN_SECRET || "";

const a = ANNOUNCEMENTS.find((x) => x.id === id);
if (!a) {
  console.error(`Укажите объявление: ${ANNOUNCEMENTS.map((x) => x.id).join(", ")}`);
  process.exit(1);
}
if (secret.length < 24) {
  console.error("Нет секрета: задайте NEXA_ADMIN_SECRET (тот же, что в переменных Vercel, не короче 24 знаков)");
  process.exit(1);
}
if (!base.startsWith("https://")) { console.error("Адрес сервера — только https"); process.exit(1); }

console.log(`${dry ? "Проверка" : "Рассылка"}: «${a.title}» → ${base}`);
const r = await fetch(`${base}/api/push`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-nexa-admin": secret },
  body: JSON.stringify({ action: "announce", id: a.id, title: a.title, text: a.text, dry }),
});
const j = await r.json().catch(() => ({}));
if (!r.ok) { console.error(`Сервер ответил ${r.status}: ${j.error || "ошибка"}`); process.exit(1); }
if (j.reason === "not_configured") { console.error("На сервере не настроены Firebase или Supabase"); process.exit(1); }
if (dry) console.log(`Телефонов с NEXA: ${j.devices}. Чтобы разослать — запустите без --dry-run`);
else console.log(`Готово: телефонов ${j.devices}, отправлено ${j.sent}, устаревших адресов убрано ${j.stale}, ошибок ${j.failed}`);
