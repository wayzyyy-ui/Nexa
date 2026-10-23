package ru.nexalink.app;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.AdvertisingOptions;
import com.google.android.gms.nearby.connection.ConnectionInfo;
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback;
import com.google.android.gms.nearby.connection.ConnectionResolution;
import com.google.android.gms.nearby.connection.ConnectionsClient;
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes;
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo;
import com.google.android.gms.nearby.connection.DiscoveryOptions;
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback;
import com.google.android.gms.nearby.connection.Payload;
import com.google.android.gms.nearby.connection.PayloadCallback;
import com.google.android.gms.nearby.connection.PayloadTransferUpdate;
import com.google.android.gms.nearby.connection.Strategy;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * «Рядом» — передача файла напрямую между телефонами с NEXA, без интернета (как AirDrop).
 * Google Nearby Connections: телефоны находят друг друга по Bluetooth и передают файл по
 * Bluetooth / прямому Wi-Fi (что окажется быстрее, решает сама библиотека).
 *
 * Получатель: advertise({ name }) — его видно, пока включено «Принимать рядом» (веб-часть сама
 * выключает через 10 минут и при уходе в фон). Входящий запрос — событие "request" { endpointId,
 * name, file, size, digits }: показываем «Принять?» с кодом; accept / reject. Принятый файл
 * лежит в cache/nearby/<id>/<имя> — событие "received" { id, name, size, mime };
 * openReceived / saveReceived («Загрузки») / readReceived (кусками base64 — в «Файлы» NEXA) /
 * dropReceived.
 * Отправитель: discover() — события "found" { endpointId, name } / "lost"; файл кладём во
 * временный файл (stageStart / stageWrite, кусками), connect({ endpointId, token, name }) —
 * запрос с именем файла; приняли — сначала сведения о файле (BYTES), потом сам файл (FILE).
 * Ход — событие "progress" { endpointId, bytes, total, incoming }; итог — "sent" / "failed" { reason }.
 * Никаких аккаунтов здесь нет: принять или нет, решает человек у получателя (код для сверки
 * показывают оба телефона). Сеть и облако не используются.
 */
@CapacitorPlugin(
    name = "NexaNearby",
    permissions = {
        // Android 13+: Bluetooth + «устройства Wi-Fi поблизости»
        @Permission(alias = "nearby33", strings = { Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.NEARBY_WIFI_DEVICES, Manifest.permission.ACCESS_FINE_LOCATION }),
        // Android 12: Bluetooth + место (поиск по Bluetooth на этих версиях его требует)
        @Permission(alias = "nearby31", strings = { Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.ACCESS_FINE_LOCATION }),
        // До Android 12: только место
        @Permission(alias = "nearbyOld", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
public class NexaNearbyPlugin extends Plugin {
    static final String SERVICE_ID = "ru.nexalink.app.nearby";
    static final long FILE_MAX = 2L * 1024 * 1024 * 1024; // 2 ГБ — больше не принимаем
    static final int CHUNK_MAX = 6 * 1024 * 1024;         // base64 куска (≈ 4,5 МБ)

    private ConnectionsClient client;
    private boolean advertising, discovering;

    // Сведения по каждому соединению: кто, какой файл, наш ли это исходящий запрос
    private static class Peer {
        String name = "Телефон", file = "file", mime = "application/octet-stream";
        long size = 0;
        boolean outgoing;
        String token;          // исходящий: какой временный файл отправить
        long filePayload = 0;  // номер файла в передаче
        Payload incoming;      // входящий файл (пока идёт)
    }
    private final Map<String, Peer> peers = new HashMap<>();
    private final Map<String, File> staged = new HashMap<>();   // token → временный файл отправки
    private final Map<String, File> received = new HashMap<>(); // id → принятый файл

    @Override
    public void load() {
        client = Nearby.getConnectionsClient(getContext());
        // Прошлые временные файлы не копим
        wipe(new File(getContext().getCacheDir(), "nearby-out"));
        wipe(new File(getContext().getCacheDir(), "nearby"));
    }

    private static void wipe(File dir) {
        File[] list = dir.listFiles();
        if (list != null) for (File f : list) { if (f.isDirectory()) wipe(f); f.delete(); }
    }

    private String alias() { return Build.VERSION.SDK_INT >= 33 ? "nearby33" : Build.VERSION.SDK_INT >= 31 ? "nearby31" : "nearbyOld"; }
    private String permission() {
        PermissionState st = getPermissionState(alias());
        return st == PermissionState.GRANTED ? "granted" : st == PermissionState.DENIED ? "denied" : "prompt";
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext()) == ConnectionResult.SUCCESS);
        r.put("permission", permission());
        r.put("advertising", advertising);
        r.put("discovering", discovering);
        call.resolve(r);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if ("granted".equals(permission())) { status(call); return; }
        requestPermissionForAlias(alias(), call, "permDone");
    }

    @PermissionCallback
    private void permDone(PluginCall call) { status(call); }

    private boolean ready(PluginCall call) {
        if (!"granted".equals(permission())) { call.reject("Нет разрешения «Устройства поблизости»", "permission"); return false; }
        return true;
    }

    private static byte[] info(JSONObject o) { return o.toString().getBytes(StandardCharsets.UTF_8); }
    private static JSONObject parse(byte[] b) {
        try { return new JSONObject(new String(b, StandardCharsets.UTF_8)); } catch (Exception e) { return new JSONObject(); }
    }
    private static String cut(String s, int n) { s = s == null ? "" : s.trim(); return s.length() > n ? s.substring(0, n) : s; }

    /* ── Получатель: видно телефон ── */
    @PluginMethod
    public void advertise(PluginCall call) {
        if (!ready(call)) return;
        if (advertising) { call.resolve(); return; }
        try {
            JSONObject o = new JSONObject();
            o.put("n", cut(call.getString("name", "Телефон"), 24));
            client.startAdvertising(info(o), SERVICE_ID, lifecycle, new AdvertisingOptions.Builder().setStrategy(Strategy.P2P_POINT_TO_POINT).build())
                .addOnSuccessListener(v -> { advertising = true; call.resolve(); })
                .addOnFailureListener(e -> call.reject(reason(e), "start_failed"));
        } catch (Exception e) { call.reject("start_failed"); }
    }

    @PluginMethod
    public void stopAdvertise(PluginCall call) {
        client.stopAdvertising();
        advertising = false;
        call.resolve();
    }

    /* ── Отправитель: ищем телефоны ── */
    @PluginMethod
    public void discover(PluginCall call) {
        if (!ready(call)) return;
        if (discovering) { call.resolve(); return; }
        client.startDiscovery(SERVICE_ID, discovery, new DiscoveryOptions.Builder().setStrategy(Strategy.P2P_POINT_TO_POINT).build())
            .addOnSuccessListener(v -> { discovering = true; call.resolve(); })
            .addOnFailureListener(e -> call.reject(reason(e), "start_failed"));
    }

    @PluginMethod
    public void stopDiscover(PluginCall call) {
        client.stopDiscovery();
        discovering = false;
        call.resolve();
    }

    private final EndpointDiscoveryCallback discovery = new EndpointDiscoveryCallback() {
        @Override public void onEndpointFound(String id, DiscoveredEndpointInfo i) {
            if (!SERVICE_ID.equals(i.getServiceId())) return;
            JSONObject o = parse(i.getEndpointInfo());
            JSObject e = new JSObject();
            e.put("endpointId", id);
            e.put("name", cut(o.optString("n", i.getEndpointName()), 24));
            notifyListeners("found", e);
        }
        @Override public void onEndpointLost(String id) {
            JSObject e = new JSObject();
            e.put("endpointId", id);
            notifyListeners("lost", e);
        }
    };

    /* ── Временный файл для отправки: кусками, чтобы большой файл не держать одной строкой ── */
    @PluginMethod
    public void stageStart(PluginCall call) {
        try {
            File dir = new File(getContext().getCacheDir(), "nearby-out");
            dir.mkdirs();
            String token = UUID.randomUUID().toString();
            File f = new File(dir, token);
            if (!f.createNewFile()) throw new Exception("no_file");
            synchronized (staged) { staged.put(token, f); }
            JSObject r = new JSObject();
            r.put("token", token);
            call.resolve(r);
        } catch (Exception e) { call.reject("stage_failed"); }
    }

    @PluginMethod
    public void stageWrite(PluginCall call) {
        File f;
        synchronized (staged) { f = staged.get(call.getString("token", "")); }
        String b64 = call.getString("base64");
        if (f == null || b64 == null || b64.length() > CHUNK_MAX) { call.reject("bad_stage"); return; }
        try (OutputStream out = new FileOutputStream(f, true)) {
            out.write(Base64.decode(b64, Base64.DEFAULT));
            call.resolve();
        } catch (Exception e) { call.reject("stage_failed"); }
    }

    @PluginMethod
    public void stageDrop(PluginCall call) {
        File f;
        synchronized (staged) { f = staged.remove(call.getString("token", "")); }
        if (f != null) f.delete();
        call.resolve();
    }

    // Запрос на соединение: в сведениях — наше имя и коротко о файле (полное имя — после «Принять»)
    @PluginMethod
    public void connect(PluginCall call) {
        if (!ready(call)) return;
        String endpointId = call.getString("endpointId", "");
        String token = call.getString("token", "");
        File f;
        synchronized (staged) { f = staged.get(token); }
        if (endpointId.isEmpty() || f == null) { call.reject("bad_request"); return; }
        Peer p = new Peer();
        p.outgoing = true;
        p.token = token;
        p.file = NexaFilesPlugin.safeName(call.getString("file", "file"));
        p.mime = NexaFilesPlugin.mimeOf(call.getString("mime"), p.file);
        p.size = f.length();
        synchronized (peers) { peers.put(endpointId, p); }
        try {
            JSONObject o = new JSONObject();
            o.put("n", cut(call.getString("name", "Телефон"), 24));
            o.put("f", cut(p.file, 40));
            o.put("s", p.size);
            client.requestConnection(info(o), endpointId, lifecycle)
                .addOnSuccessListener(v -> call.resolve())
                .addOnFailureListener(e -> { synchronized (peers) { peers.remove(endpointId); } call.reject(reason(e), "connect_failed"); });
        } catch (Exception e) { call.reject("connect_failed"); }
    }

    @PluginMethod
    public void accept(PluginCall call) {
        String id = call.getString("endpointId", "");
        client.acceptConnection(id, payloads)
            .addOnSuccessListener(v -> call.resolve())
            .addOnFailureListener(e -> call.reject(reason(e), "accept_failed"));
    }

    @PluginMethod
    public void reject(PluginCall call) {
        String id = call.getString("endpointId", "");
        client.rejectConnection(id);
        synchronized (peers) { peers.remove(id); }
        call.resolve();
    }

    // Отменить: прервать передачу и разорвать соединение
    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("endpointId", "");
        Peer p;
        synchronized (peers) { p = peers.remove(id); }
        if (p != null && p.filePayload != 0) client.cancelPayload(p.filePayload);
        client.disconnectFromEndpoint(id);
        call.resolve();
    }

    private final ConnectionLifecycleCallback lifecycle = new ConnectionLifecycleCallback() {
        @Override public void onConnectionInitiated(String id, ConnectionInfo info) {
            Peer p;
            synchronized (peers) { p = peers.get(id); }
            JSONObject o = parse(info.getEndpointInfo());
            if (p == null || info.isIncomingConnection()) {
                // Входящий: кто-то хочет передать нам файл — спрашиваем человека
                p = new Peer();
                p.name = cut(o.optString("n", info.getEndpointName()), 24);
                p.file = NexaFilesPlugin.safeName(o.optString("f", "file"));
                p.size = o.optLong("s", 0);
                synchronized (peers) { peers.put(id, p); }
                JSObject e = new JSObject();
                e.put("endpointId", id);
                e.put("name", p.name);
                e.put("file", p.file);
                e.put("size", p.size);
                e.put("digits", info.getAuthenticationDigits());
                if (p.size > FILE_MAX) { client.rejectConnection(id); e.put("tooBig", true); }
                notifyListeners("request", e);
                return;
            }
            // Наш исходящий запрос: со своей стороны принимаем сразу, код показываем для сверки
            JSObject e = new JSObject();
            e.put("endpointId", id);
            e.put("digits", info.getAuthenticationDigits());
            notifyListeners("waiting", e);
            client.acceptConnection(id, payloads);
        }

        @Override public void onConnectionResult(String id, ConnectionResolution r) {
            Peer p;
            synchronized (peers) { p = peers.get(id); }
            int code = r.getStatus().getStatusCode();
            if (code != ConnectionsStatusCodes.STATUS_OK) {
                synchronized (peers) { peers.remove(id); }
                fail(id, code == ConnectionsStatusCodes.STATUS_CONNECTION_REJECTED ? "rejected" : "connect");
                return;
            }
            if (p == null || !p.outgoing) return;
            // Приняли: сначала сведения о файле, потом сам файл
            File f;
            synchronized (staged) { f = staged.get(p.token); }
            if (f == null) { fail(id, "gone"); client.disconnectFromEndpoint(id); return; }
            try {
                JSONObject meta = new JSONObject();
                meta.put("name", p.file);
                meta.put("mime", p.mime);
                meta.put("size", f.length());
                client.sendPayload(id, Payload.fromBytes(info(meta)));
                Payload file = Payload.fromFile(f);
                p.filePayload = file.getId();
                client.sendPayload(id, file);
            } catch (Exception e) { fail(id, "send"); client.disconnectFromEndpoint(id); }
        }

        @Override public void onDisconnected(String id) {
            Peer p;
            synchronized (peers) { p = peers.remove(id); }
            if (p == null) return;
            JSObject e = new JSObject();
            e.put("endpointId", id);
            notifyListeners("disconnected", e);
        }
    };

    private final PayloadCallback payloads = new PayloadCallback() {
        @Override public void onPayloadReceived(String id, Payload payload) {
            Peer p;
            synchronized (peers) { p = peers.get(id); }
            if (p == null || p.outgoing) return; // нам ничего не шлют, когда отправляем мы
            if (payload.getType() == Payload.Type.BYTES) {
                JSONObject m = parse(payload.asBytes());
                if (m.has("name")) p.file = NexaFilesPlugin.safeName(m.optString("name", p.file));
                p.mime = NexaFilesPlugin.mimeOf(m.optString("mime", null), p.file);
                if (m.has("size")) p.size = m.optLong("size", p.size);
            } else if (payload.getType() == Payload.Type.FILE) {
                if (p.size > FILE_MAX) { client.cancelPayload(payload.getId()); client.disconnectFromEndpoint(id); return; }
                p.incoming = payload;
                p.filePayload = payload.getId();
            }
        }

        @Override public void onPayloadTransferUpdate(String id, PayloadTransferUpdate u) {
            Peer p;
            synchronized (peers) { p = peers.get(id); }
            if (p == null || u.getPayloadId() != p.filePayload) return;
            int st = u.getStatus();
            if (st == PayloadTransferUpdate.Status.IN_PROGRESS) {
                JSObject e = new JSObject();
                e.put("endpointId", id);
                e.put("bytes", u.getBytesTransferred());
                e.put("total", u.getTotalBytes() > 0 ? u.getTotalBytes() : p.size);
                e.put("incoming", !p.outgoing);
                notifyListeners("progress", e);
                return;
            }
            if (st == PayloadTransferUpdate.Status.SUCCESS) {
                if (p.outgoing) {
                    JSObject e = new JSObject();
                    e.put("endpointId", id);
                    notifyListeners("sent", e);
                    File f;
                    synchronized (staged) { f = staged.remove(p.token); }
                    if (f != null) f.delete();
                } else {
                    keep(id, p);
                }
                synchronized (peers) { peers.remove(id); }
                client.disconnectFromEndpoint(id);
                return;
            }
            // FAILURE / CANCELED
            synchronized (peers) { peers.remove(id); }
            fail(id, st == PayloadTransferUpdate.Status.CANCELED ? "canceled" : "transfer");
            client.disconnectFromEndpoint(id);
        }
    };

    // Принятый файл — из папки Nearby в свою папку кэша под своим именем
    private void keep(String endpointId, Peer p) {
        new Thread(() -> {
            try {
                Payload.File pf = p.incoming == null ? null : p.incoming.asFile();
                if (pf == null) throw new Exception("no_file");
                String rid = UUID.randomUUID().toString();
                File dir = new File(new File(getContext().getCacheDir(), "nearby"), rid);
                dir.mkdirs();
                File out = new File(dir, p.file);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    Uri uri = pf.asUri();
                    try (InputStream in = getContext().getContentResolver().openInputStream(uri); OutputStream o = new FileOutputStream(out)) { copy(in, o); }
                    try { getContext().getContentResolver().delete(uri, null, null); } catch (Exception ignored) { /* копия Nearby — не наша, может не удалиться */ }
                } else {
                    ParcelFileDescriptor pfd = pf.asParcelFileDescriptor();
                    try (InputStream in = new ParcelFileDescriptor.AutoCloseInputStream(pfd); OutputStream o = new FileOutputStream(out)) { copy(in, o); }
                }
                synchronized (received) { received.put(rid, out); }
                JSObject e = new JSObject();
                e.put("endpointId", endpointId);
                e.put("id", rid);
                e.put("name", p.file);
                e.put("size", out.length());
                e.put("mime", p.mime);
                e.put("from", p.name);
                notifyListeners("received", e, true);
            } catch (Exception e) { fail(endpointId, "save"); }
        }).start();
    }

    private void fail(String id, String why) {
        JSObject e = new JSObject();
        e.put("endpointId", id);
        e.put("reason", why);
        notifyListeners("failed", e);
    }

    private static String reason(Exception e) {
        String m = e == null ? null : e.getMessage();
        return m == null ? "error" : m.length() > 80 ? m.substring(0, 80) : m;
    }

    private static void copy(InputStream in, OutputStream out) throws Exception {
        byte[] buf = new byte[256 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }

    private File receivedFile(PluginCall call) {
        synchronized (received) { return received.get(call.getString("id", "")); }
    }

    /* ── Что сделать с принятым ── */
    @PluginMethod
    public void openReceived(PluginCall call) {
        File f = receivedFile(call);
        if (f == null) { call.reject("gone"); return; }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
        Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, NexaFilesPlugin.mimeOf(call.getString("mime"), f.getName()))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getActivity().runOnUiThread(() -> {
            try { getActivity().startActivity(Intent.createChooser(view, "Открыть файл").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); call.resolve(); }
            catch (ActivityNotFoundException e) { call.reject("no_app"); }
        });
    }

    @PluginMethod
    public void saveReceived(PluginCall call) {
        File f = receivedFile(call);
        if (f == null) { call.reject("gone"); return; }
        new Thread(() -> {
            try (InputStream in = new FileInputStream(f)) {
                String where;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver cr = getContext().getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, f.getName());
                    v.put(MediaStore.Downloads.MIME_TYPE, NexaFilesPlugin.mimeOf(call.getString("mime"), f.getName()));
                    v.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) throw new Exception("no_uri");
                    try (OutputStream out = cr.openOutputStream(uri)) { copy(in, out); }
                    v.clear();
                    v.put(MediaStore.Downloads.IS_PENDING, 0);
                    cr.update(uri, v, null, null);
                    where = "downloads";
                } else {
                    File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) throw new Exception("no_dir");
                    dir.mkdirs();
                    try (OutputStream out = new FileOutputStream(new File(dir, f.getName()))) { copy(in, out); }
                    where = "app";
                }
                JSObject r = new JSObject();
                r.put("where", where);
                call.resolve(r);
            } catch (Exception e) { call.reject("save_failed"); }
        }).start();
    }

    // Кусок принятого файла base64 (offset, length ≤ 3 МБ) — веб-часть собирает его в «Файлы» NEXA
    @PluginMethod
    public void readReceived(PluginCall call) {
        File f = receivedFile(call);
        if (f == null) { call.reject("gone"); return; }
        long offset = call.getLong("offset", 0L);
        int len = Math.min(call.getInt("length", 3 * 1024 * 1024), 3 * 1024 * 1024);
        new Thread(() -> {
            try (java.io.RandomAccessFile raf = new java.io.RandomAccessFile(f, "r")) {
                long left = Math.max(0, raf.length() - offset);
                byte[] buf = new byte[(int) Math.min(len, left)];
                raf.seek(offset);
                raf.readFully(buf);
                JSObject r = new JSObject();
                r.put("base64", Base64.encodeToString(buf, Base64.NO_WRAP));
                r.put("size", raf.length());
                call.resolve(r);
            } catch (Exception e) { call.reject("read_failed"); }
        }).start();
    }

    @PluginMethod
    public void dropReceived(PluginCall call) {
        File f;
        synchronized (received) { f = received.remove(call.getString("id", "")); }
        if (f != null) { f.delete(); f.getParentFile().delete(); }
        call.resolve();
    }

    // NEXA ушла в фон: перестаём быть видимыми и искать (идущую передачу не трогаем)
    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (advertising) { client.stopAdvertising(); advertising = false; notifyListeners("stopped", new JSObject()); }
        if (discovering) { client.stopDiscovery(); discovering = false; }
    }
}
