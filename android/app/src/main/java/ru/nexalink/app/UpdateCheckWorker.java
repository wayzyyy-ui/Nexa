package ru.nexalink.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/**
 * «Вышла NEXA X» системным уведомлением, даже когда NEXA закрыта.
 * Раз в ~6 часов (просьба к системе: Doze и экономия заряда могут отложить) и только при сети
 * WorkManager спрашивает тот же public/version.json, что и приложение. Новое — APK (versionCode
 * больше установленного) или веб-часть (версия новее текущей, подходит к этому APK — nativeMin).
 * Не уведомляем: выключены уведомления NEXA (флаг from JS), версия уже видна была в самой NEXA
 * (known — её передаёт веб-часть), про эту версию уже уведомляли (notified), NEXA сейчас на экране.
 * Нажатие — открыть NEXA (там карточка «Обновить»). Данные — SharedPreferences "nexa_update_watch"
 * (пишет NexaUpdatePlugin.watch). Ключей входа и личных данных здесь нет.
 */
public class UpdateCheckWorker extends Worker {
    static final String PREFS = "nexa_update_watch";
    static final String WORK = "nexa-update-check";
    static final String CHANNEL = "nexa-updates"; // тот же канал, что у уведомлений «Обновления» в NEXA
    static final int NOTE_ID = 7201;

    public UpdateCheckWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }

    // Включить / выключить периодическую проверку (из NexaUpdatePlugin.watch)
    static void schedule(Context c, boolean on) {
        WorkManager wm = WorkManager.getInstance(c);
        if (!on) { wm.cancelUniqueWork(WORK); return; }
        Constraints net = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(UpdateCheckWorker.class, 6, TimeUnit.HOURS)
            .setConstraints(net)
            .build();
        // UPDATE — новые условия применяются и к уже стоящей задаче, отсчёт периода не сбрасывается.
        // Первый запуск сразу: NEXA при этом на экране — задача выходит, ничего не показывая
        wm.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, req);
    }

    // «0.15.4» → число для сравнения (как verNum в src/native.js)
    static long verNum(String v) {
        if (v == null) return 0;
        String[] p = v.split("\\.");
        long r = 0;
        for (int i = 0; i < 3; i++) {
            long n = 0;
            if (i < p.length) try { n = Long.parseLong(p[i].replaceAll("[^0-9]", "")); } catch (Exception ignored) {}
            r = r * 1000 + n;
        }
        return r;
    }

    @NonNull
    @Override
    public Result doWork() {
        check(getApplicationContext());
        return Result.success(); // нет сети / сервер не ответил — попробуем в следующий раз
    }

    // Сама проверка (отдельно от WorkManager — её можно вызвать и напрямую)
    static void check(Context c) {
        SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String url = sp.getString("url", "");
        if (!sp.getBoolean("on", false) || !url.startsWith("https://")) return;
        if (MainActivity.inForeground) return; // NEXA на экране — покажет сама
        try {
            JSONObject v = new JSONObject(get(url + "?t=" + System.currentTimeMillis()));
            long installed = installedCode(c);
            String found = null;
            JSONArray notes = null;
            if (v.optLong("versionCode", 0) > installed) {
                found = v.optString("version", "");
                notes = v.optJSONArray("notes");
            } else {
                JSONObject web = v.optJSONObject("web");
                if (web != null && verNum(web.optString("version", "")) > verNum(sp.getString("web", ""))
                        && installed >= web.optLong("nativeMin", 0)) {
                    found = web.optString("version", "");
                    notes = web.optJSONArray("notes");
                }
            }
            if (found == null || found.isEmpty()) return;
            if (verNum(found) <= verNum(sp.getString("known", ""))) return;   // уже видели в NEXA
            if (found.equals(sp.getString("notified", ""))) return;            // уже уведомляли
            notify(c, found, notes);
            sp.edit().putString("notified", found).apply();
        } catch (Exception ignored) { /* нет сети / сервер не ответил */ }
    }

    private static long installedCode(Context c) throws Exception {
        PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
        return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
    }

    private static String get(String url) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setConnectTimeout(15000);
        h.setReadTimeout(15000);
        h.setInstanceFollowRedirects(true);
        h.setUseCaches(false);
        try (InputStream in = h.getInputStream()) {
            if (h.getResponseCode() != 200) throw new Exception("http " + h.getResponseCode());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n, total = 0;
            while ((n = in.read(buf)) > 0) { total += n; if (total > 256 * 1024) throw new Exception("too_big"); out.write(buf, 0, n); }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } finally { h.disconnect(); }
    }

    private static void notify(Context c, String version, JSONArray notes) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Обновления", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Когда вышла новая версия NEXA");
            nm.createNotificationChannel(ch);
        }
        // «Что нового» — первые три пункта
        StringBuilder sb = new StringBuilder();
        if (notes != null) for (int i = 0; i < Math.min(3, notes.length()); i++) {
            String s = notes.optString(i, "").trim();
            if (s.isEmpty()) continue;
            if (sb.length() > 0) sb.append('\n');
            sb.append("• ").append(s.length() > 120 ? s.substring(0, 120) + "…" : s);
        }
        String text = sb.length() > 0 ? sb.toString() : "Откройте NEXA, чтобы обновить";
        Intent open = new Intent(c, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, NOTE_ID, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_nexa)
            .setContentTitle("Вышла NEXA " + version)
            .setContentText(sb.length() > 0 ? "Что нового — нажмите, чтобы обновить" : text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pi);
        try { nm.notify(NOTE_ID, b.build()); } catch (SecurityException ignored) { /* уведомления запрещены */ }
    }
}
