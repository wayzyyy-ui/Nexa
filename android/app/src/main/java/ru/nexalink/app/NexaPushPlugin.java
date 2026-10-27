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

    /* «Поиск этого устройства» при закрытой NEXA (NexaLocator): веб-часть передаёт сюда переключатель
       из Настроек, потому что push обрабатывается без неё */
    @PluginMethod
    public void setLocate(PluginCall call) {
        NexaLocator.prefs(getContext()).edit().putBoolean("allow", Boolean.TRUE.equals(call.getBoolean("allow", false))).apply();
        call.resolve();
    }

    // Что разрешено: место вообще и место в фоне («разрешать всегда»; до Android 10 — то же самое)
    @PluginMethod
    public void locateStatus(PluginCall call) {
        JSObject r = new JSObject();
        r.put("location", NexaLocator.hasLocation(getContext()));
        r.put("background", NexaLocator.hasBackground(getContext()));
        r.put("needsBackground", android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q);
        r.put("gps", NexaLocator.locationOn(getContext()));
        // Экономия заряда: «без ограничений» — Android не мешает NEXA проснуться от push (2026-10-27)
        android.os.PowerManager pm = (android.os.PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        r.put("battery", pm == null || pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        // Xiaomi / Redmi / POCO: без «Автозапуска» закрытая NEXA вообще не получает push — проверить это
        // приложение не может, только подсказать и открыть экран настройки
        String brand = (android.os.Build.MANUFACTURER + " " + android.os.Build.BRAND).toLowerCase();
        r.put("autostart", brand.contains("xiaomi") || brand.contains("redmi") || brand.contains("poco"));
        call.resolve(r);
    }

    /* «Работа в фоне» (2026-10-27): экран, где разрешают NEXA просыпаться при закрытом приложении.
       Xiaomi — «Автозапуск» (MIUI / HyperOS), иначе — список «Оптимизация батареи» (без особого
       разрешения), в крайнем случае — страница NEXA в настройках. Новых разрешений нет */
    @PluginMethod
    public void openBackgroundSettings(PluginCall call) {
        Context c = getContext();
        Intent[] tries = {
            new Intent().setComponent(new android.content.ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")),
            new Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
            new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.fromParts("package", c.getPackageName(), null)),
        };
        String brand = (android.os.Build.MANUFACTURER + " " + android.os.Build.BRAND).toLowerCase();
        boolean xiaomi = brand.contains("xiaomi") || brand.contains("redmi") || brand.contains("poco");
        for (int k = xiaomi ? 0 : 1; k < tries.length; k++) {
            try {
                tries[k].addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                c.startActivity(tries[k]);
                JSObject r = new JSObject();
                r.put("opened", k == 0 ? "autostart" : k == 1 ? "battery" : "app");
                call.resolve(r);
                return;
            } catch (Exception ignored) { /* такого экрана нет — пробуем следующий */ }
        }
        call.reject("Не открылись настройки", "error");
    }

    /* Android не даёт спросить «разрешать всегда» окном внутри приложения — только на странице
       разрешений NEXA в настройках системы. Открываем её; человек выбирает сам */
    @PluginMethod
    public void openLocateSettings(PluginCall call) {
        try {
            Intent i = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.fromParts("package", getContext().getPackageName(), null));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) { call.reject("Не открылись настройки", "error"); }
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
