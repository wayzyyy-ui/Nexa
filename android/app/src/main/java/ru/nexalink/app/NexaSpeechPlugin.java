package ru.nexalink.app;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

/**
 * Голосовой ввод в ИИ-ассистента (Android-приложение).
 *
 * Встроенный браузер приложения (WebView) распознавать речь не умеет, поэтому
 * используем системный распознаватель Android (SpeechRecognizer) — тот, что
 * стоит на телефоне (обычно сервис Google). Он может отправлять звук на свой
 * сервер — офлайн это не гарантировано. Мы звук не записываем и не храним:
 * наружу отдаём только распознанный текст.
 *
 * Методы: available(), start({ lang }), stop() — закончить и дождаться текста,
 * cancel() — бросить без результата. События: "partial" { text } — текст по
 * ходу речи, "final" { text } — итог фразы, "end" {} — распознавание закончилось,
 * "error" { code } — что пошло не так (см. codeOf). Разрешение — «Микрофон»
 * (RECORD_AUDIO), спрашивается только при первом нажатии на кнопку.
 * Всё, что трогает SpeechRecognizer, — в главном потоке (так требует Android).
 */
@CapacitorPlugin(
    name = "NexaSpeech",
    permissions = { @Permission(alias = "mic", strings = { Manifest.permission.RECORD_AUDIO }) }
)
public class NexaSpeechPlugin extends Plugin {
    private SpeechRecognizer recognizer;

    private boolean available() { return SpeechRecognizer.isRecognitionAvailable(getContext()); }

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", available());
        PermissionState st = getPermissionState("mic");
        r.put("permission", st == PermissionState.GRANTED ? "granted" : st == PermissionState.DENIED ? "denied" : "prompt");
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!available()) { call.reject("Распознавание речи на телефоне недоступно", "unavailable"); return; }
        if (getPermissionState("mic") != PermissionState.GRANTED) { requestPermissionForAlias("mic", call, "micDone"); return; }
        begin(call);
    }

    @PermissionCallback
    private void micDone(PluginCall call) {
        if (getPermissionState("mic") == PermissionState.GRANTED) begin(call);
        else call.reject("Нет доступа к микрофону", "denied");
    }

    private void begin(PluginCall call) {
        String lang = call.getString("lang", "ru-RU");
        getActivity().runOnUiThread(() -> {
            destroy(); // одна сессия за раз: прежняя (если была) закрывается
            try {
                recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                recognizer.setRecognitionListener(new Listener());
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                // Дать договорить: пауза до конца фразы чуть длиннее обычной
                intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L);
                recognizer.startListening(intent);
                call.resolve();
            } catch (Exception e) {
                destroy();
                call.reject("Не удалось включить распознавание", "client");
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> { if (recognizer != null) recognizer.stopListening(); call.resolve(); });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        getActivity().runOnUiThread(() -> { destroy(); call.resolve(); });
    }

    // Приложение ушло в фон — диктовку прекращаем: микрофон не должен работать незаметно
    @Override
    protected void handleOnPause() {
        if (recognizer != null) { destroy(); notifyListeners("end", new JSObject()); }
        super.handleOnPause();
    }

    @Override
    protected void handleOnDestroy() { destroy(); }

    private void destroy() {
        if (recognizer == null) return;
        try { recognizer.cancel(); recognizer.destroy(); } catch (Exception ignored) { }
        recognizer = null;
    }

    private static String firstText(Bundle b) {
        ArrayList<String> list = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return list == null || list.isEmpty() ? "" : list.get(0);
    }

    // Коды ошибок Android → короткие слова, которые понимает веб-часть (src/lib/voice.js)
    private static String codeOf(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
            case 11: /* ERROR_SERVER_DISCONNECTED */
                return "network";
            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "no-speech";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "denied";
            case SpeechRecognizer.ERROR_AUDIO: return "audio";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "busy";
            case 12: case 13: /* LANGUAGE_NOT_SUPPORTED / LANGUAGE_UNAVAILABLE */ return "language";
            default: return "service";
        }
    }

    private class Listener implements RecognitionListener {
        @Override public void onReadyForSpeech(Bundle params) { }
        @Override public void onBeginningOfSpeech() { }
        @Override public void onRmsChanged(float rmsdB) { }
        @Override public void onBufferReceived(byte[] buffer) { }
        @Override public void onEndOfSpeech() { }
        @Override public void onEvent(int eventType, Bundle params) { }

        @Override public void onPartialResults(Bundle partial) {
            JSObject r = new JSObject();
            r.put("text", firstText(partial));
            notifyListeners("partial", r);
        }

        @Override public void onResults(Bundle results) {
            JSObject r = new JSObject();
            r.put("text", firstText(results));
            notifyListeners("final", r);
            destroy();
            notifyListeners("end", new JSObject());
        }

        @Override public void onError(int error) {
            JSObject r = new JSObject();
            r.put("code", codeOf(error));
            notifyListeners("error", r);
            destroy();
            notifyListeners("end", new JSObject());
        }
    }
}
