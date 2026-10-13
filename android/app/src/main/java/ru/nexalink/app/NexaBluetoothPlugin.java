package ru.nexalink.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Set;

/**
 * Bluetooth-устройства, сопряжённые с телефоном (часы, наушники и т.п.).
 *
 * Ничего не ищет и не подключает само — только читает список, который
 * человек уже сопряг в настройках Android, и следит, какие сейчас подключены.
 * Адрес устройства наружу не отдаём: вместо него короткий отпечаток (sha-256).
 *
 * Android 12+ — нужно разрешение «Устройства поблизости» (BLUETOOTH_CONNECT).
 * Методы: status(), requestPermission(), bonded(); событие "changed" —
 * устройство подключилось / отключилось / сменился заряд.
 * Заряд и «подключено» Android официально не отдаёт всем приложениям —
 * берём их из скрытых методов, где телефон позволяет; иначе — «нет данных».
 */
@CapacitorPlugin(
    name = "NexaBluetooth",
    permissions = { @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT }) }
)
public class NexaBluetoothPlugin extends Plugin {
    private BroadcastReceiver receiver;

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    // Разрешение нужно только с Android 12
    private boolean needsPermission() { return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S; }
    private String permissionState() {
        if (!needsPermission()) return "granted";
        PermissionState st = getPermissionState("bluetooth");
        return st == PermissionState.GRANTED ? "granted" : st == PermissionState.DENIED ? "denied" : "prompt";
    }

    @Override
    public void load() {
        // Подключилось / отключилось / сменился заряд — веб-часть перечитает список
        receiver = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) { notifyListeners("changed", new JSObject()); }
        };
        IntentFilter f = new IntentFilter();
        f.addAction(BluetoothDevice.ACTION_ACL_CONNECTED);
        f.addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED);
        f.addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED);
        f.addAction(BluetoothAdapter.ACTION_STATE_CHANGED);
        f.addAction("android.bluetooth.device.action.BATTERY_LEVEL_CHANGED");
        if (Build.VERSION.SDK_INT >= 33) getContext().registerReceiver(receiver, f, Context.RECEIVER_EXPORTED);
        else getContext().registerReceiver(receiver, f);
    }

    @Override
    protected void handleOnDestroy() {
        try { if (receiver != null) getContext().unregisterReceiver(receiver); } catch (Exception ignored) {}
    }

    @PluginMethod
    public void status(PluginCall call) {
        BluetoothAdapter a = adapter();
        JSObject r = new JSObject();
        r.put("supported", a != null);
        r.put("enabled", a != null && a.isEnabled());
        r.put("permission", permissionState());
        call.resolve(r);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (!needsPermission() || getPermissionState("bluetooth") == PermissionState.GRANTED) { status(call); return; }
        requestPermissionForAlias("bluetooth", call, "permissionDone");
    }

    @PermissionCallback
    private void permissionDone(PluginCall call) { status(call); }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void bonded(PluginCall call) {
        BluetoothAdapter a = adapter();
        if (a == null) { call.reject("Bluetooth на этом телефоне нет", "unsupported"); return; }
        if (!"granted".equals(permissionState())) { call.reject("Нет разрешения «Устройства поблизости»", "permission"); return; }
        JSArray list = new JSArray();
        if (a.isEnabled()) {
            Set<BluetoothDevice> devices = a.getBondedDevices();
            if (devices != null) for (BluetoothDevice d : devices) {
                JSObject o = new JSObject();
                o.put("id", fingerprint(d.getAddress()));
                o.put("name", d.getName() == null ? "" : d.getName());
                o.put("kind", kindOf(d.getBluetoothClass()));
                o.put("connected", hiddenBool(d, "isConnected"));
                int battery = hiddenInt(d, "getBatteryLevel");
                if (battery >= 0 && battery <= 100) o.put("battery", battery);
                list.put(o);
            }
        }
        JSObject r = new JSObject();
        r.put("enabled", a.isEnabled());
        r.put("devices", list);
        call.resolve(r);
    }

    // Что это за устройство — по классу Bluetooth (без названий моделей и брендов)
    private static String kindOf(BluetoothClass c) {
        if (c == null) return "other";
        int major = c.getMajorDeviceClass();
        if (major == BluetoothClass.Device.Major.WEARABLE) return "watch";
        if (major == BluetoothClass.Device.Major.AUDIO_VIDEO) {
            int dev = c.getDeviceClass();
            if (dev == BluetoothClass.Device.AUDIO_VIDEO_VIDEO_DISPLAY_AND_LOUDSPEAKER || dev == BluetoothClass.Device.AUDIO_VIDEO_VIDEO_MONITOR) return "tv";
            return "buds"; // наушники, гарнитура, колонка
        }
        if (major == BluetoothClass.Device.Major.PHONE) return "phone";
        if (major == BluetoothClass.Device.Major.COMPUTER) return "laptop";
        return "other";
    }

    // Отпечаток адреса: тот же телефон всегда даёт тот же id, но адрес из него не восстановить
    private static String fingerprint(String address) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] h = md.digest(("nexa-bt:" + address).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 10; i++) sb.append(String.format("%02x", h[i]));
            return sb.toString();
        } catch (Exception e) { return Integer.toHexString(address.hashCode()); }
    }

    private static boolean hiddenBool(BluetoothDevice d, String method) {
        try { Method m = d.getClass().getMethod(method); Object v = m.invoke(d); return v instanceof Boolean && (Boolean) v; }
        catch (Exception e) { return false; }
    }
    private static int hiddenInt(BluetoothDevice d, String method) {
        try { Method m = d.getClass().getMethod(method); Object v = m.invoke(d); return v instanceof Integer ? (Integer) v : -1; }
        catch (Exception e) { return -1; }
    }
}
