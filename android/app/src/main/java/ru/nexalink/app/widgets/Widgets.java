package ru.nexalink.app.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

import ru.nexalink.app.MainActivity;
import ru.nexalink.app.R;

/** Общее для виджетов NEXA: обновить, запланировать погоду, открыть нужный раздел. */
public final class Widgets {
    /** Раздел, который открыть в приложении (Intent extra): "today" или "home" */
    public static final String EXTRA_TAB = "nexa_tab";
    private static final String WORK_PERIODIC = "nexa-weather";
    private static final String WORK_NOW = "nexa-weather-now";

    private Widgets() {}

    /* ─── Перерисовать ─── */
    public static void updateSchedule(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, ScheduleWidget.class));
        if (ids.length > 0) ScheduleWidget.render(c, m, ids);
    }

    public static void updateWeather(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = weatherIds(c);
        if (ids.length > 0) WeatherWidget.render(c, m, ids);
    }

    static int[] weatherIds(Context c) {
        return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, WeatherWidget.class));
    }

    /* ─── Погода в фоне ─── */
    private static Constraints network() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    /**
     * Просим Android обновлять погоду раз в 30 минут — только пока на экране есть
     * виджет погоды. Это просьба, а не расписание: в режиме экономии заряда
     * и «Doze» система может откладывать задачу заметно дольше.
     */
    public static void scheduleWeather(Context c) {
        if (weatherIds(c).length == 0) return;
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(WeatherWorker.class, 30, TimeUnit.MINUTES)
                .setConstraints(network())
                .build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork(WORK_PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req);
    }

    /** Обновить погоду сейчас (как только будет сеть): сменился город, добавили виджет */
    public static void refreshWeatherNow(Context c) {
        if (weatherIds(c).length == 0) return;
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(WeatherWorker.class)
                .setConstraints(network())
                .build();
        WorkManager.getInstance(c).enqueueUniqueWork(WORK_NOW, ExistingWorkPolicy.REPLACE, req);
    }

    public static void stopWeather(Context c) {
        WorkManager.getInstance(c).cancelUniqueWork(WORK_PERIODIC);
        WorkManager.getInstance(c).cancelUniqueWork(WORK_NOW);
    }

    /* ─── Нажатие на виджет: открыть NEXA в нужном разделе ─── */
    static PendingIntent openApp(Context c, String tab, int requestCode) {
        Intent i = new Intent(c, MainActivity.class)
                .setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .putExtra(EXTRA_TAB, tab)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /* ─── Погода словами и значком (те же коды WMO, что на сайте) ─── */
    static String weatherText(int code) {
        if (code == 0) return "Ясно";
        if (code == 1) return "Почти ясно";
        if (code == 2) return "Переменная облачность";
        if (code == 3) return "Пасмурно";
        if (code == 45 || code == 48) return "Туман";
        if (code >= 51 && code <= 55) return "Морось";
        if (code == 56 || code == 57) return "Ледяная морось";
        if (code == 61 || code == 63) return "Дождь";
        if (code == 65) return "Сильный дождь";
        if (code == 66 || code == 67) return "Ледяной дождь";
        if (code == 71 || code == 73) return "Снег";
        if (code == 75) return "Сильный снег";
        if (code == 77) return "Снежная крупа";
        if (code >= 80 && code <= 82) return "Ливень";
        if (code == 85 || code == 86) return "Снегопад";
        if (code == 95) return "Гроза";
        if (code == 96 || code == 99) return "Гроза с градом";
        return "Облачно";
    }

    static int weatherIcon(int code) {
        if (code == 0 || code == 1) return R.drawable.ic_widget_clear;
        if (code == 2) return R.drawable.ic_widget_partly;
        if (code == 45 || code == 48) return R.drawable.ic_widget_fog;
        if ((code >= 71 && code <= 77) || code == 85 || code == 86) return R.drawable.ic_widget_snow;
        if (code >= 95) return R.drawable.ic_widget_storm;
        if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return R.drawable.ic_widget_rain;
        return R.drawable.ic_widget_cloud;
    }
}
