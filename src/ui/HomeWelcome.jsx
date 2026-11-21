// Сначала приветствие, затем вопрос о нейросети. У каждого шага своя отметка в аккаунте.
import { useEffect, useState } from "react";
import { COLLECT_ASK_DELAY_MS } from "../lib/mini/collect.js";
import { IntroDialog } from "./IntroDialog.jsx";
import { MiniAskDialog } from "./miniHelp.jsx";

// При смене шага компонент создаётся заново: таймер и фокус не переходят в следующее окно.
function WaitingStep({ children }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let timer;
    const tryOpen = () => {
      const busy = document.querySelector('[aria-modal="true"], [role="menu"], .nx-auth-gate, .nx-gate-about, #nx-boot, [data-nx-noback]') || document.documentElement.classList.contains("nx-intro-wait");
      if (busy || document.visibilityState === "hidden") timer = setTimeout(tryOpen, 1500);
      else setVisible(true);
    };
    timer = setTimeout(tryOpen, COLLECT_ASK_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  return visible ? children : null;
}

export function HomeWelcome({ ready, welcome, miniCollect }) {
  if (!ready) return null;
  if (!welcome.seen) return <WaitingStep key="welcome"><IntroDialog title="Добро пожаловать в NEXA!" onClose={welcome.finish}
    actions={<button type="button" className="nx-primary" data-autofocus onClick={welcome.finish}>Начать тестирование</button>}>
    <p>Вы используете тестовую версию NEXA — приложения, которое объединяет ваши устройства в одну систему.</p>
    <p>Проект ещё в разработке: некоторые функции могут работать нестабильно. Если заметите ошибку или столкнётесь с трудностями, напишите нам на <a href="mailto:nexa.hub@yandex.ru">nexa.hub@yandex.ru</a>.</p>
    <p>Опишите, что произошло и на каком устройстве. По возможности приложите скриншот.</p>
    <p>Спасибо, что помогаете делать NEXA лучше 💚</p>
  </IntroDialog></WaitingStep>;
  if (!welcome.miniSeen) return <WaitingStep key="mini"><MiniAskDialog
    onYes={() => miniCollect.answerAsk(true)}
    onNo={() => miniCollect.answerAsk(false)}
    onClose={() => miniCollect.dismissAsk()} /></WaitingStep>;
  return null;
}
