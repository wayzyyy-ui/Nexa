// Подмена тяжёлых модулей при проверке правил: commands.js тянет за собой React и Capacitor,
// а для разбора фраз (parseCommand) они не нужны. Подменяем только то, что commands.js импортирует.
const STUBS = {
  "./weather.js": "export const TODAY = { city: 'Казань', schedule: [] }; export const getTodayWeather = async () => null;",
  "./format.js": "export const signed = (n) => String(n); export const plural = (n, f) => f[2];",
};
export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith("/src/lib/commands.js") && STUBS[specifier]) {
    return { url: "data:text/javascript," + encodeURIComponent(STUBS[specifier]), shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
