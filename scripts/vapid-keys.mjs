// Ключи веб-уведомлений сайта (VAPID) — создать один раз: node scripts/vapid-keys.mjs
// Обе строки вписать в Vercel → Settings → Environment Variables (в код и в git — нельзя):
//   WEBPUSH_PUBLIC_KEY, WEBPUSH_PRIVATE_KEY, и WEBPUSH_SUBJECT = mailto:ваша@почта
// Сменили ключи — подписки всех браузеров перестанут работать, каждому включить заново.
import { generateKeyPairSync } from "node:crypto";
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pj = publicKey.export({ format: "jwk" }), sj = privateKey.export({ format: "jwk" });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(pj.x, "base64url"), Buffer.from(pj.y, "base64url")]).toString("base64url");
console.log("WEBPUSH_PUBLIC_KEY=" + pub);
console.log("WEBPUSH_PRIVATE_KEY=" + sj.d);
