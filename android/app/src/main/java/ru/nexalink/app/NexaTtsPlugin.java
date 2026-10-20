package ru.nexalink.app;

import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Голосовой вывод ответов ИИ — Ассистента (Android-приложение).
 *
 * Встроенный браузер приложения (WebView) синтез речи надёжно не поддерживает, поэтому
 * читаем системным синтезатором телефона (TextToSpeech — обычно движок Google). Текст
 * готовит веб-часть (src/lib/voiceOutput.js): без разметки и уже разрезан на фразы.
 *
 * Методы: available() → { available, ru } — есть ли синтезатор и русский язык;
 * speak({ id, parts, lang }) — прочитать фразы по очереди (прежнее чтение прерывается);
 * stop() — замолчать. События: "done" { id } — дочитали или остановили, "error" { id }.
 * Свернули приложение — замолкаем сами (onPause). Разрешения не нужны.
 */
@CapacitorPlugin(name = "NexaTts")
public class NexaTtsPlugin extends Plugin {
    private TextToSpeech tts;
    private boolean ready = false;          // движок запустился
    private boolean initDone = false;       // запуск закончился (удачно или нет)
    private final List<Runnable> waiting = new ArrayList<>(); // вызовы до запуска движка
    private volatile String currentId = null; // какой ответ читаем (события приходят из другого потока)
    private volatile int lastPart = -1;     // номер последней фразы текущего чтения

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), (status) -> {
            synchronized (waiting) {
                ready = status == TextToSpeech.SUCCESS;
                initDone = true;
                for (Runnable r : waiting) r.run();
                waiting.clear();
            }
        });
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String utteranceId) {}
            @Override public void onDone(String utteranceId) {
                String id = idOf(utteranceId);
                if (id != null && id.equals(currentId) && utteranceId.endsWith(":" + lastPart)) finish("done");
            }
            @Override public void onError(String utteranceId) {
                String id = idOf(utteranceId);
                if (id != null && id.equals(currentId)) finish("error");
            }
            @Override public void onStop(String utteranceId, boolean interrupted) {}
        });
    }

    // Подождать запуска движка (он запускается не сразу)
    private void whenReady(Runnable r) {
        synchronized (waiting) {
            if (initDone || tts == null) { r.run(); return; }
            waiting.add(r);
        }
    }

    private static String idOf(String utteranceId) {
        int at = utteranceId == null ? -1 : utteranceId.lastIndexOf(':');
        return at > 0 ? utteranceId.substring(0, at) : null;
    }

    private void finish(String event) {
        String id = currentId;
        currentId = null;
        JSObject e = new JSObject();
        e.put("id", id);
        notifyListeners(event, e);
    }

    private boolean hasRussian(String lang) {
        if (!ready || tts == null) return false;
        int r = tts.isLanguageAvailable(Locale.forLanguageTag(lang));
        return r >= TextToSpeech.LANG_AVAILABLE;
    }

    @PluginMethod
    public void available(PluginCall call) {
        whenReady(() -> {
            JSObject r = new JSObject();
            r.put("available", ready && tts != null);
            r.put("ru", hasRussian("ru-RU"));
            call.resolve(r);
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String id = call.getString("id", "");
        String lang = call.getString("lang", "ru-RU");
        JSArray parts = call.getArray("parts", new JSArray());
        whenReady(() -> {
            if (!ready || tts == null) { call.reject("Синтез речи на телефоне недоступен", "unavailable"); return; }
            if (!hasRussian(lang)) { call.reject("Нет русского голоса", "language"); return; }
            try {
                stopNow(); // прежнее чтение прерываем
                tts.setLanguage(Locale.forLanguageTag(lang));
                List<String> list = parts.toList();
                if (list.isEmpty()) { call.reject("Пустой текст", "empty"); return; }
                currentId = id;
                lastPart = list.size() - 1;
                for (int i = 0; i < list.size(); i++) {
                    Bundle params = new Bundle();
                    int res = tts.speak(String.valueOf(list.get(i)), i == 0 ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, params, id + ":" + i);
                    if (res != TextToSpeech.SUCCESS) { currentId = null; tts.stop(); call.reject("Не удалось начать чтение", "speak"); return; }
                }
                call.resolve();
            } catch (Exception e) {
                currentId = null;
                call.reject("Не удалось начать чтение", "speak");
            }
        });
    }

    private void stopNow() {
        if (tts == null) return;
        String id = currentId;
        currentId = null;
        tts.stop();
        if (id != null) {
            JSObject e = new JSObject();
            e.put("id", id);
            notifyListeners("done", e);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopNow();
        call.resolve();
    }

    // Приложение ушло в фон — замолкаем
    @Override
    protected void handleOnPause() {
        stopNow();
        super.handleOnPause();
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) { tts.stop(); tts.shutdown(); tts = null; }
        super.handleOnDestroy();
    }
}
