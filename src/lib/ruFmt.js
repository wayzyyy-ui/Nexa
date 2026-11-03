/* Форматирование дат и времени по-русски без лишней работы.
   d.toLocaleDateString("ru-RU", { … }) каждый раз заново создаёт «форматировщик» — это дорого, а такие подписи
   («был в сети вчера в 14:05», дни расписания, «Активность») пересчитываются при каждой перерисовке экрана.
   ruFmt(opts) создаёт его один раз на набор настроек и дальше берёт готовый: ruFmt({ hour: "2-digit" }).format(d).
   Результат тот же, что у toLocale…String с теми же настройками */
const cache = new Map();

export function ruFmt(opts) {
  const key = JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) { f = new Intl.DateTimeFormat("ru-RU", opts); cache.set(key, f); }
  return f;
}
