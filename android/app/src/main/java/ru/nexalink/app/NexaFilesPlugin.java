package ru.nexalink.app;

import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Файлы NEXA в приложении: «Скачать» и «Открыть».
 *
 * Встроенный браузер приложения (WebView) сам не умеет ни скачивать файлы,
 * ни открывать их в других приложениях — поэтому кнопки в окне файла
 * зовут этот модуль.
 *
 * save({ url | base64, name, mime }) — сохранить в «Загрузки» телефона;
 * open({ url | base64, name, mime }) — открыть подходящим приложением
 *   (просмотр PDF, галерея, плеер…), файл временно лежит в кэше приложения.
 * url — подписанная ссылка облака (только https), base64 — содержимое файла
 * гостя из браузерного хранилища.
 * streamStart / streamWrite / streamFinish / streamCancel — большой файл (резервная копия)
 *   по кускам, без предела 60 МБ.
 */
@CapacitorPlugin(name = "NexaFiles")
public class NexaFilesPlugin extends Plugin {
    private static final long MAX_BYTES = 60L * 1024 * 1024; // запас над лимитом 50 МБ

    @PluginMethod
    public void save(PluginCall call) {
        new Thread(() -> {
            try (InputStream in = source(call)) {
                String name = safeName(call.getString("name", "file"));
                String mime = mimeOf(call.getString("mime"), name);
                String where;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    // Android 10+: в общую папку «Загрузки», разрешения не нужны
                    ContentResolver cr = getContext().getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime);
                    v.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) throw new Exception("no_uri");
                    try (OutputStream out = cr.openOutputStream(uri)) { copy(in, out); }
                    v.clear();
                    v.put(MediaStore.Downloads.IS_PENDING, 0);
                    cr.update(uri, v, null, null);
                    where = "downloads";
                } else {
                    // Android 7–9: папка «Загрузки» приложения (без разрешения на память)
                    File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) throw new Exception("no_dir");
                    dir.mkdirs();
                    try (OutputStream out = new FileOutputStream(new File(dir, name))) { copy(in, out); }
                    where = "app";
                }
                JSObject res = new JSObject();
                res.put("where", where);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("save_failed");
            }
        }).start();
    }

    /* ── Большой файл по частям (резервная копия NEXA): весь файл одной строкой base64 не держим ──
       streamStart({ name, mime }) → { token }: пустой временный файл в кэше приложения;
       streamWrite({ token, base64 }) — дописать кусок (до 4 МБ);
       streamFinish({ token }) → { where } — в «Загрузки», как save; временный файл удаляется;
       streamCancel({ token }) — удалить временный файл (отмена). Старые недописанные — убираются при старте */
    private final java.util.Map<String, File> streams = new java.util.HashMap<>();
    private final java.util.Map<String, String[]> streamMeta = new java.util.HashMap<>();
    private static final int CHUNK_MAX = 6 * 1024 * 1024; // base64 куска (≈ 4,5 МБ байтов)

    private File streamDir() {
        File dir = new File(getContext().getCacheDir(), "stream");
        dir.mkdirs();
        return dir;
    }

    @PluginMethod
    public void streamStart(PluginCall call) {
        try {
            File dir = streamDir();
            File[] old = dir.listFiles();
            long day = System.currentTimeMillis() - 24L * 3600 * 1000;
            if (old != null) for (File f : old) if (f.lastModified() < day) f.delete();
            String token = java.util.UUID.randomUUID().toString();
            File part = new File(dir, token + ".part");
            if (!part.createNewFile()) throw new Exception("no_file");
            String name = safeName(call.getString("name", "file"));
            synchronized (streams) {
                streams.put(token, part);
                streamMeta.put(token, new String[] { name, mimeOf(call.getString("mime"), name) });
            }
            JSObject res = new JSObject();
            res.put("token", token);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("stream_failed");
        }
    }

    @PluginMethod
    public void streamWrite(PluginCall call) {
        File part;
        synchronized (streams) { part = streams.get(call.getString("token", "")); }
        String b64 = call.getString("base64");
        if (part == null || b64 == null || b64.length() > CHUNK_MAX) { call.reject("bad_stream"); return; }
        try (OutputStream out = new FileOutputStream(part, true)) {
            out.write(Base64.decode(b64, Base64.DEFAULT));
            call.resolve();
        } catch (Exception e) {
            call.reject("stream_failed"); // например, на телефоне кончилось место
        }
    }

    @PluginMethod
    public void streamFinish(PluginCall call) {
        String token = call.getString("token", "");
        File part;
        String[] meta;
        synchronized (streams) { part = streams.remove(token); meta = streamMeta.remove(token); }
        if (part == null || meta == null) { call.reject("bad_stream"); return; }
        new Thread(() -> {
            try (InputStream in = new java.io.FileInputStream(part)) {
                String where;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver cr = getContext().getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, meta[0]);
                    v.put(MediaStore.Downloads.MIME_TYPE, meta[1]);
                    v.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) throw new Exception("no_uri");
                    try (OutputStream out = cr.openOutputStream(uri)) { copyAll(in, out); }
                    v.clear();
                    v.put(MediaStore.Downloads.IS_PENDING, 0);
                    cr.update(uri, v, null, null);
                    where = "downloads";
                } else {
                    File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) throw new Exception("no_dir");
                    dir.mkdirs();
                    try (OutputStream out = new FileOutputStream(new File(dir, meta[0]))) { copyAll(in, out); }
                    where = "app";
                }
                JSObject res = new JSObject();
                res.put("where", where);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("save_failed");
            } finally {
                part.delete();
            }
        }).start();
    }

    @PluginMethod
    public void streamCancel(PluginCall call) {
        File part;
        synchronized (streams) { part = streams.remove(call.getString("token", "")); streamMeta.remove(call.getString("token", "")); }
        if (part != null) part.delete();
        call.resolve();
    }

    // Как copy, но без предела 60 МБ (резервная копия бывает больше)
    private static void copyAll(InputStream in, OutputStream out) throws Exception {
        byte[] buf = new byte[256 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }

    @PluginMethod
    public void open(PluginCall call) {
        new Thread(() -> {
            try (InputStream in = source(call)) {
                String name = safeName(call.getString("name", "file"));
                String mime = mimeOf(call.getString("mime"), name);
                // Кладём во временную папку кэша (её отдаёт FileProvider, см. file_paths.xml)
                File dir = new File(getContext().getCacheDir(), "open");
                dir.mkdirs();
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete(); // прошлые открытые файлы не копим
                File file = new File(dir, name);
                try (OutputStream out = new FileOutputStream(file)) { copy(in, out); }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                Intent view = new Intent(Intent.ACTION_VIEW)
                        .setDataAndType(uri, mime)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().runOnUiThread(() -> {
                    try {
                        getActivity().startActivity(Intent.createChooser(view, "Открыть файл").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                        call.resolve();
                    } catch (ActivityNotFoundException e) {
                        call.reject("no_app");
                    }
                });
            } catch (Exception e) {
                call.reject("open_failed");
            }
        }).start();
    }

    // Откуда брать байты: подписанная ссылка облака (только https) или base64
    private InputStream source(PluginCall call) throws Exception {
        String url = call.getString("url");
        if (url != null) {
            if (!url.startsWith("https://")) throw new Exception("bad_url");
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            if (conn.getResponseCode() != 200) throw new Exception("http_" + conn.getResponseCode());
            if (conn.getContentLengthLong() > MAX_BYTES) throw new Exception("too_big");
            return conn.getInputStream();
        }
        String b64 = call.getString("base64");
        if (b64 == null) throw new Exception("no_source");
        byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
        if (bytes.length > MAX_BYTES) throw new Exception("too_big");
        return new ByteArrayInputStream(bytes);
    }

    private static void copy(InputStream in, OutputStream out) throws Exception {
        byte[] buf = new byte[64 * 1024];
        long total = 0;
        int n;
        while ((n = in.read(buf)) > 0) {
            total += n;
            if (total > MAX_BYTES) throw new Exception("too_big");
            out.write(buf, 0, n);
        }
    }

    // Имя без папок и служебных символов — файл не выйдет за пределы своей папки
    private static String safeName(String name) {
        String s = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (s.isEmpty() || s.equals(".") || s.equals("..")) s = "file";
        return s.length() > 120 ? s.substring(s.length() - 120) : s;
    }

    private static String mimeOf(String mime, String name) {
        if (mime != null && mime.matches("[a-z]+/[a-z0-9.+-]+")) return mime;
        int dot = name.lastIndexOf('.');
        String fromExt = dot >= 0 ? MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot + 1).toLowerCase()) : null;
        return fromExt != null ? fromExt : "application/octet-stream";
    }
}
