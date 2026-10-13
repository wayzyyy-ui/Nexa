package ru.nexalink.app;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * Push-адрес (FCM token) и открытие уведомления «Устройство ищут».
 *
 * token() — адрес для api/push.js; Firebase не настроен (нет google-services.json) —
 * ошибка "not_configured", приложение работает как раньше.
 * Событие "pushOpen" { type: "find", id, from } — нажали на уведомление
 * (при холодном запуске ждёт подписчика).
 */
@CapacitorPlugin(name = "NexaPush")
public class NexaPushPlugin extends Plugin {
    static final String EXTRA_TYPE = "nexa_push_type";
    static final String EXTRA_ID = "nexa_push_id";
    static final String EXTRA_FROM = "nexa_push_from";

    @Override
    public void load() { handle(getActivity().getIntent()); }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handle(intent);
    }

    private void handle(Intent intent) {
        if (intent == null || !"find".equals(intent.getStringExtra(EXTRA_TYPE))) return;
        JSObject o = new JSObject();
        o.put("type", "find");
        o.put("id", intent.getStringExtra(EXTRA_ID));
        o.put("from", intent.getStringExtra(EXTRA_FROM));
        intent.removeExtra(EXTRA_TYPE); // перезапуск страницы не повторит событие
        // Уведомление больше не нужно — звонок выключаем
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NexaMessagingService.NOTE_ID);
        notifyListeners("pushOpen", o, true);
    }

    @PluginMethod
    public void token(PluginCall call) {
        if (FirebaseApp.getApps(getContext()).isEmpty()) { call.reject("Push не настроен", "not_configured"); return; }
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(t -> {
                if (!t.isSuccessful() || t.getResult() == null) { call.reject("Не удалось получить push-адрес", "error"); return; }
                JSObject r = new JSObject();
                r.put("token", t.getResult());
                call.resolve(r);
            });
        } catch (Exception e) {
            call.reject("Push не настроен", "not_configured");
        }
    }
}
