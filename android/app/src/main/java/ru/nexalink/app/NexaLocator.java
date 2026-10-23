package ru.nexalink.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.os.CancellationSignal;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * «Где устройство?» и сообщение на экран блокировки, когда NEXA закрыта (push из api/push.js).
 *
 * locate: разрешено ли — решает человек у ЭТОГО телефона (Настройки NEXA → «Поиск этого устройства»,
 * флаг в SharedPreferences "nexa_locate", пишет NexaPushPlugin.setLocate). Выключено — отвечаем "off".
 * Без разрешения «Местоположение — разрешать всегда» Android место в фоне не отдаёт — отвечаем
 * "background" (на Android 9 и старше достаточно обычного разрешения). Место ищем не дольше
 * WAIT_MS (свежее последнее — сразу), иначе последнее известное (не старше LAST_MAX_MS). Ответ — POST на тот же сервер,
 * что прислал push (только https), с одноразовым ключом из push. Ключа входа в аккаунт здесь нет.
 * Человеку у телефона показываем тихое уведомление «Местоположение показано».
 *
 * message: уведомление, которое видно на экране блокировки (текст от владельца).
 */
class NexaLocator {
    static final String PREFS = "nexa_locate";
    static final String CHANNEL_SHOWN = "nexa-locate";
    static final String CHANNEL_MESSAGE = "nexa-message";
    static final int NOTE_SHOWN = 7101;
    static final int NOTE_MESSAGE = 7102;
    static final long WAIT_MS = 6000;
    static final long FRESH_MS = 2 * 60 * 1000;
    static final long LAST_MAX_MS = 10 * 60 * 1000;

    static boolean allowed(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("allow", false);
    }

    static boolean hasLocation(Context c) {
        return ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    // Место в фоне: с Android 10 нужно отдельное разрешение «разрешать всегда»
    static boolean hasBackground(Context c) {
        if (!hasLocation(c)) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true;
        return ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    // Вызывается из NexaMessagingService (свой поток FCM, можно ждать несколько секунд)
    static void answer(Context c, Map<String, String> data) {
        String id = data.get("id"), key = data.get("key"), api = data.get("api");
        if (id == null || key == null || api == null || !api.startsWith("https://")) return;
        String from = data.get("from") == null ? "Ваше устройство" : data.get("from");
        try {
            JSONObject o = new JSONObject();
            o.put("action", "locate-reply");
            o.put("id", id);
            o.put("key", key);
            if (!allowed(c)) o.put("status", "off");
            else if (!hasBackground(c)) o.put("status", hasLocation(c) ? "background" : "denied");
            else {
                Location loc = find(c);
                if (loc == null) o.put("status", "error");
                else {
                    o.put("status", "ok");
                    o.put("lat", loc.getLatitude());
                    o.put("lon", loc.getLongitude());
                    o.put("acc", loc.hasAccuracy() ? (double) loc.getAccuracy() : 0d);
                    o.put("at", loc.getTime());
                }
            }
            android.util.Log.i("NexaLocator", "status " + o.optString("status"));
            int code = post(api + "/api/push", o);
            // В журнал — только статус и код ответа сервера, без координат и ключа
            android.util.Log.i("NexaLocator", "reply " + o.optString("status") + " http " + code);
            if ("ok".equals(o.optString("status"))) shown(c, from);
        } catch (Exception e) {
            // Без сети — спросивший увидит «не ответило»
            android.util.Log.i("NexaLocator", "reply failed " + e.getClass().getSimpleName());
        }
    }

    /* Срочный push даёт приложению сеть всего на несколько секунд (на эмуляторе без push сеть
       пропадала через ~9 с в фоне). Поэтому: свежее последнее место (не старше FRESH_MS) — сразу;
       иначе ищем не дольше WAIT_MS; не нашли — последнее, если не старше LAST_MAX_MS */
    private static Location find(Context c) {
        LocationManager lm = (LocationManager) c.getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return null;
        Location best = null;
        try {
            Location last = lastKnown(lm);
            if (last != null && System.currentTimeMillis() - last.getTime() <= FRESH_MS) return last;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                String provider = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && lm.hasProvider(LocationManager.FUSED_PROVIDER) ? LocationManager.FUSED_PROVIDER
                    : lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) ? LocationManager.NETWORK_PROVIDER : LocationManager.GPS_PROVIDER;
                final Location[] got = new Location[1];
                CountDownLatch done = new CountDownLatch(1);
                CancellationSignal cancel = new CancellationSignal();
                lm.getCurrentLocation(provider, cancel, Executors.newSingleThreadExecutor(), (l) -> { got[0] = l; done.countDown(); });
                if (!done.await(WAIT_MS, TimeUnit.MILLISECONDS)) cancel.cancel();
                best = got[0];
            }
            if (best == null) {
                best = lastKnown(lm);
                if (best != null && System.currentTimeMillis() - best.getTime() > LAST_MAX_MS) best = null;
            }
        } catch (SecurityException | InterruptedException e) { return null; }
        return best;
    }

    // Самое свежее место, которое Android уже знает (от любого источника)
    private static Location lastKnown(LocationManager lm) throws SecurityException {
        Location best = null;
        for (String p : lm.getProviders(true)) {
            Location l = lm.getLastKnownLocation(p);
            if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
        }
        return best;
    }

    private static int post(String url, JSONObject body) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setRequestMethod("POST");
        h.setConnectTimeout(8000);
        h.setReadTimeout(8000);
        h.setInstanceFollowRedirects(false);
        h.setDoOutput(true);
        h.setRequestProperty("Content-Type", "application/json");
        try (OutputStream os = h.getOutputStream()) { os.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
        int code = h.getResponseCode();
        h.disconnect();
        return code;
    }

    private static PendingIntent openApp(Context c, int code) {
        Intent open = new Intent(c, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, code, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // Человек у телефона должен знать, что его место показали
    private static void shown(Context c, String from) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL_SHOWN) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_SHOWN, "Местоположение показано", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Когда другое устройство вашего аккаунта узнало, где этот телефон");
            nm.createNotificationChannel(ch);
        }
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL_SHOWN)
            .setSmallIcon(R.drawable.ic_stat_nexa)
            .setContentTitle("Местоположение показано")
            .setContentText("«" + from + "» узнало, где этот телефон. Выключить — в NEXA: Настройки → «Поиск этого устройства»")
            .setStyle(new NotificationCompat.BigTextStyle().bigText("«" + from + "» узнало, где этот телефон. Выключить — в NEXA: Настройки → «Поиск этого устройства»"))
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setAutoCancel(true)
            .setContentIntent(openApp(c, NOTE_SHOWN));
        try { nm.notify(NOTE_SHOWN, b.build()); } catch (SecurityException ignored) {}
    }

    // Сообщение владельца — видно на экране блокировки целиком
    static void message(Context c, Map<String, String> data) {
        String text = data.get("text");
        if (text == null || text.trim().isEmpty()) return;
        if (text.length() > 200) text = text.substring(0, 200);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL_MESSAGE) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_MESSAGE, "Сообщение владельца", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Текст с другого устройства вашего аккаунта — например, если телефон потерян");
            ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL_MESSAGE)
            .setSmallIcon(R.drawable.ic_stat_nexa)
            .setContentTitle("Сообщение владельца телефона")
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(openApp(c, NOTE_MESSAGE));
        try { nm.notify(NOTE_MESSAGE, b.build()); } catch (SecurityException ignored) {}
    }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
}
