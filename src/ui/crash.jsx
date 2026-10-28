/* Предохранитель экрана: если интерфейс упал при отрисовке, вместо пустого экрана — «Что-то сломалось»
   и «Перезагрузить»; сбой уходит отчётом (src/lib/crashes.js). Общие стили (APP_CSS) живут внутри
   упавшего приложения — поэтому у этого экрана свой маленький блок стилей с цветами обеих тем. */
import { Component } from "react";
import { reportCrash } from "../lib/crashes.js";

const CSS = `
  :root { --crash-bg: #01090F; --crash-text: #EAF2F7; --crash-muted: #8FA3B3; --crash-a: #4A6FFF; --crash-b: #5CE1C6; --crash-on: #01090F; }
  :root[data-theme="light"] { --crash-bg: #EDF1F5; --crash-text: #0B1A24; --crash-muted: #516574; }
  .nx-crash { position: fixed; inset: 0; z-index: 3000; display: flex; align-items: center; justify-content: center; padding: 16px;
    background: var(--crash-bg); color: var(--crash-text); font-family: Manrope, system-ui, sans-serif; text-align: center; }
  .nx-crash h1 { font-size: 26px; font-weight: 600; margin: 0 0 10px; }
  .nx-crash p { color: var(--crash-muted); font-size: 15px; line-height: 1.5; margin: 0 auto 22px; max-width: 380px; }
  .nx-crash button { border: none; border-radius: 999px; padding: 13px 26px; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer;
    color: var(--crash-on); background: linear-gradient(90deg, var(--crash-a), var(--crash-b)); }
`;

export class CrashBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) {
    // Стек компонентов добавляем к стеку ошибки — так видно, какой экран упал (имена — из сборки, не данные)
    const e = error instanceof Error ? error : new Error(String(error));
    reportCrash({ name: e.name, message: e.message, stack: `${e.stack || ""}\n${info?.componentStack || ""}` }, "render");
    // Заставка запуска могла остаться поверх — убираем, иначе этот экран был бы не виден
    try { document.getElementById("nx-boot")?.remove(); } catch {}
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="nx-crash" role="alert">
        <style>{CSS}</style>
        <div>
          <h1>Что-то сломалось</h1>
          <p>Ваши данные на месте. Перезагрузите NEXA, чтобы продолжить. Если отчёты о сбоях не выключены в настройках, разработчик уже знает об этом сбое (без ваших данных).</p>
          <button type="button" onClick={() => location.reload()}>Перезагрузить</button>
        </div>
      </div>
    );
  }
}
