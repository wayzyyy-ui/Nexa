package ru.nexalink.app;

import android.os.Environment;
import android.os.StatFs;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Свободное и общее место на телефоне — для «Это устройство» в NEXA.
 *
 * В @capacitor/device 8 полей diskFree / realDiskFree больше нет, поэтому
 * спрашиваем Android напрямую: StatFs по разделу данных (туда ставятся
 * приложения и ложатся файлы пользователя). Разрешений не требуется,
 * ничего, кроме двух чисел в байтах, не отдаём.
 */
@CapacitorPlugin(name = "NexaDisk")
public class NexaDiskPlugin extends Plugin {

    @PluginMethod
    public void getSpace(PluginCall call) {
        try {
            StatFs stat = new StatFs(Environment.getDataDirectory().getPath());
            JSObject result = new JSObject();
            result.put("free", stat.getAvailableBytes());
            result.put("total", stat.getTotalBytes());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("unavailable");
        }
    }
}
