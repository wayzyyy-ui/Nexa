package ru.nexalink.app;

import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
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
        // Виджеты рабочего стола: расписание и город из приложения (см. widgets/NexaWidgetsPlugin)
        registerPlugin(ru.nexalink.app.widgets.NexaWidgetsPlugin.class);
        super.onCreate(savedInstanceState);

        // Ползунок прокрутки страницы в приложении рисует сам Android, а не
        // страница — поэтому CSS его не красит. Делаем его мятным (как на сайте):
        // тонкая скруглённая полоска, мятный цвет NEXA с прозрачностью 70%
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            WebView webView = getBridge().getWebView();
            GradientDrawable thumb = new GradientDrawable();
            thumb.setColor(0xB300FFDF);
            thumb.setCornerRadius(999f);
            webView.setVerticalScrollbarThumbDrawable(thumb);
        }
    }
}
