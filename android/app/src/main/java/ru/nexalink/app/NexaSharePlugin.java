package ru.nexalink.app;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * NEXA Flow: «Поделиться» → «Отправить в NEXA» из любого приложения.
 *
 * Android открывает NEXA с текстом (Intent.ACTION_SEND, text/plain) —
 * передаём его веб-части событием "sharedText" { text }. Веб-часть сама
 * ничего не отправляет: открывает окно «Отправить в NEXA», где человек
 * выбирает устройство и нажимает «Отправить».
 * При холодном запуске событие ждёт подписчика (retain).
 */
@CapacitorPlugin(name = "NexaShare")
public class NexaSharePlugin extends Plugin {
    private static final int MAX_LEN = 2000; // как TEXT_MAX в веб-части

    @Override
    public void load() {
        handle(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handle(intent);
    }

    private void handle(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String type = intent.getType();
        if (type == null || !type.startsWith("text/")) return;
        CharSequence cs = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (cs == null) return;
        String text = cs.toString().trim();
        // Обработали — убираем из Intent, чтобы перезапуск страницы не открыл окно ещё раз
        intent.removeExtra(Intent.EXTRA_TEXT);
        intent.setAction(Intent.ACTION_MAIN);
        if (text.isEmpty()) return;
        if (text.length() > MAX_LEN) text = text.substring(0, MAX_LEN);
        JSObject data = new JSObject();
        data.put("text", text);
        notifyListeners("sharedText", data, true);
    }
}
