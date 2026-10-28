package ru.nexalink.app;

import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.WindowManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // NEXA на экране: тогда push «Найти» ничего не показывает — сигнал придёт по каналу связи
    static volatile boolean inForeground = false;

    @Override
    public void onResume() { super.onResume(); inForeground = true; }

    @Override
    public void onPause() { inForeground = false; super.onPause(); }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Свой модуль: место на телефоне (см. NexaDiskPlugin). Регистрируем до super.onCreate
        registerPlugin(NexaDiskPlugin.class);
        // Файлы: «Скачать» в «Загрузки» и «Открыть» другим приложением (см. NexaFilesPlugin)
        registerPlugin(NexaFilesPlugin.class);
        // NEXA Flow: текст из «Поделиться» другого приложения (см. NexaSharePlugin)
        registerPlugin(NexaSharePlugin.class);
        // Bluetooth: сопряжённые часы, наушники и т.п. (см. NexaBluetoothPlugin)
        registerPlugin(NexaBluetoothPlugin.class);
        // Push «Найти устройство»: адрес для сервера и нажатие на уведомление (см. NexaPushPlugin)
        registerPlugin(NexaPushPlugin.class);
        // «Рядом»: файл напрямую на соседний телефон без интернета (Nearby Connections)
        registerPlugin(NexaNearbyPlugin.class);
        // Обновление изнутри: скачать APK, проверить, открыть установщик (см. NexaUpdatePlugin)
        registerPlugin(NexaUpdatePlugin.class);
        // Голосовой ввод в ассистента: системное распознавание речи (см. NexaSpeechPlugin)
        registerPlugin(NexaSpeechPlugin.class);
        // Голосовой вывод: прочитать ответ ассистента вслух системным синтезатором (см. NexaTtsPlugin)
        registerPlugin(NexaTtsPlugin.class);
        // Виджеты рабочего стола: расписание и город из приложения (см. widgets/NexaWidgetsPlugin)
        registerPlugin(ru.nexalink.app.widgets.NexaWidgetsPlugin.class);
        super.onCreate(savedInstanceState);

        // Ползунок прокрутки страницы в приложении рисует сам Android, а не страница (CSS его не прячет).
        // На телефоне полос прокрутки нет совсем (просьба автора 2026-10-25) — выключаем системные
        WebView webView = getBridge().getWebView();
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);

        // Плавность (2026-10-28, просьба автора): соседние с экраном части страницы рисуются заранее —
        // при прокрутке и свайпах не видно «дорисовки» (чуть больше памяти, на скорость запуска не влияет)
        if (Build.VERSION.SDK_INT >= 23) webView.getSettings().setOffscreenPreRaster(true);
        preferHighRefreshRate();
    }

    /* Самая высокая частота экрана для NEXA (90 / 120 Гц, где есть). Многие телефоны по умолчанию
       держат приложения на 60 Гц — прокрутка и анимации тогда вдвое реже обновляются.
       Это только просьба: режим экономии заряда и сама система могут оставить 60 Гц */
    private void preferHighRefreshRate() {
        if (Build.VERSION.SDK_INT < 23) return;
        try {
            Display d = Build.VERSION.SDK_INT >= 30 ? getDisplay() : getWindowManager().getDefaultDisplay();
            if (d == null) return;
            Display.Mode cur = d.getMode(), best = cur;
            for (Display.Mode m : d.getSupportedModes()) {
                // То же разрешение экрана — меняем только частоту
                if (m.getPhysicalWidth() == cur.getPhysicalWidth() && m.getPhysicalHeight() == cur.getPhysicalHeight()
                        && m.getRefreshRate() > best.getRefreshRate()) best = m;
            }
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.preferredDisplayModeId = best.getModeId();
            getWindow().setAttributes(lp);
        } catch (Exception ignored) {
            // Не вышло — остаётся частота по умолчанию, всё работает как раньше
        }
    }
}
