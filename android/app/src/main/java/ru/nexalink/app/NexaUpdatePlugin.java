package ru.nexalink.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Обновление приложения изнутри: скачать APK → проверить → открыть системный установщик.
 *
 * download({ url, size?, sha256? }) — качает в кэш приложения (cache/updates/nexa-update.apk)
 *   с событием "progress" { loaded, total }; потом сверяет размер и SHA-256 (если даны).
 *   Только https. cancel() — оборвать загрузку.
 * canInstall() — есть ли у NEXA право ставить приложения (Android 8+: «Установка неизвестных приложений»).
 * openInstallSettings() — открыть этот экран настроек для NEXA.
 * install() — открыть системный установщик (FileProvider). Тихой установки нет:
 *   Android всегда показывает своё окно «Установить?».
 * signer() — SHA-256 сертификата, которым подписано установленное приложение:
 *   обновление встанет поверх, только если новый APK подписан тем же ключом.
 * cleanup() — удалить скачанный файл.
 */
@CapacitorPlugin(name = "NexaUpdate")
public class NexaUpdatePlugin extends Plugin {
    private volatile boolean cancelled = false;
    private volatile HttpURLConnection current = null;

    private File apkFile() {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, "nexa-update.apk");
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url", "");
        long size = call.getLong("size", 0L);
        String sha = call.getString("sha256", "");
        if (!url.startsWith("https://")) { call.reject("Адрес обновления должен быть https", "bad_url"); return; }
        cancelled = false;
        new Thread(() -> {
            File out = apkFile();
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                current = c;
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                c.setInstanceFollowRedirects(true);
                int code = c.getResponseCode();
                if (code != 200) { call.reject("Сервер ответил " + code, "http"); return; }
                long total = c.getContentLengthLong();
                if (total <= 0) total = size;
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                long loaded = 0, lastSent = 0;
                try (InputStream in = c.getInputStream(); FileOutputStream fo = new FileOutputStream(out)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        if (cancelled) throw new InterruptedException("cancel");
                        fo.write(buf, 0, n);
                        md.update(buf, 0, n);
                        loaded += n;
                        // Прогресс — не чаще чем каждые 128 КБ
                        if (loaded - lastSent > 128 * 1024 || loaded == total) {
                            lastSent = loaded;
                            JSObject p = new JSObject();
                            p.put("loaded", loaded);
                            p.put("total", total);
                            notifyListeners("progress", p);
                        }
                    }
                }
                if (size > 0 && loaded != size) { out.delete(); call.reject("Файл скачался не целиком — повторите", "size"); return; }
                String got = hex(md.digest());
                if (!sha.isEmpty() && !sha.equalsIgnoreCase(got)) { out.delete(); call.reject("Файл повреждён — контрольная сумма не совпала. Повторите", "sha256"); return; }
                JSObject r = new JSObject();
                r.put("size", loaded);
                r.put("sha256", got);
                call.resolve(r);
            } catch (InterruptedException e) {
                out.delete();
                call.reject("Загрузка отменена", "cancel");
            } catch (Exception e) {
                out.delete();
                call.reject(cancelled ? "Загрузка отменена" : "Нет связи — загрузка прервалась", cancelled ? "cancel" : "network");
            } finally {
                current = null;
            }
        }).start();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelled = true;
        HttpURLConnection c = current;
        if (c != null) try { c.disconnect(); } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject r = new JSObject();
        r.put("allowed", Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(r);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    @PluginMethod
    public void install(PluginCall call) {
        File f = apkFile();
        if (!f.exists()) { call.reject("Файл обновления не найден — скачайте заново", "missing"); return; }
        try {
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Не получилось открыть установщик Android", "install");
        }
    }

    @PluginMethod
    public void signer(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            String pkg = getContext().getPackageName();
            Signature[] sigs;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageInfo pi = pm.getPackageInfo(pkg, PackageManager.GET_SIGNING_CERTIFICATES);
                sigs = pi.signingInfo.getApkContentsSigners();
            } else {
                PackageInfo pi = pm.getPackageInfo(pkg, PackageManager.GET_SIGNATURES);
                sigs = pi.signatures;
            }
            JSObject r = new JSObject();
            r.put("sha256", sigs != null && sigs.length > 0 ? hex(MessageDigest.getInstance("SHA-256").digest(sigs[0].toByteArray())) : "");
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Не удалось прочитать подпись приложения", "signer");
        }
    }

    /* Уведомление «Вышла NEXA X» при закрытой NEXA (UpdateCheckWorker):
       watch({ url, web, known, on }) — откуда брать version.json, какая веб-часть сейчас стоит,
       какую последнюю версию NEXA уже видела сама (о ней не уведомляем), включены ли уведомления.
       Выключено — фоновая проверка снимается */
    @PluginMethod
    public void watch(PluginCall call) {
        String url = call.getString("url", "");
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false)) && url.startsWith("https://");
        getContext().getSharedPreferences(UpdateCheckWorker.PREFS, android.content.Context.MODE_PRIVATE).edit()
            .putString("url", url)
            .putString("web", call.getString("web", ""))
            .putString("known", call.getString("known", ""))
            .putBoolean("on", on)
            .apply();
        try { UpdateCheckWorker.schedule(getContext(), on); call.resolve(); }
        catch (Exception e) { call.reject("watch_failed"); }
    }

    @PluginMethod
    public void cleanup(PluginCall call) {
        File f = apkFile();
        boolean had = f.exists();
        if (had) f.delete();
        JSObject r = new JSObject();
        r.put("removed", had);
        call.resolve(r);
    }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }
}
