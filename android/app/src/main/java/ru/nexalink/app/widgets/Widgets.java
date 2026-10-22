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
    /** Виджет «Заметки» (Intent extra): id заметки, "new" — новая заметка, "list" — список заметок */
    public static final String EXTRA_NOTE = "nexa_note";
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

    public static void updateNotes(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, NotesWidget.class));
        if (ids.length > 0) NotesWidget.render(c, m, ids);
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

    /* ─── Виджет «Заметки»: открыть заметку (id), новую ("new") или список ("list") ─── */
    static PendingIntent openNote(Context c, String note, int requestCode) {
        Intent i = new Intent(c, MainActivity.class)
                .setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .putExtra(EXTRA_NOTE, note)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /* ─── Погода словами и значком (те же коды WMO, что на сайте) ─── */
    /** Значок по коду состояния NEXA (cond из /api/weather) */
    static int weatherIcon(String cond) {
        if ("sun".equals(cond)) return R.drawable.ic_widget_clear;
        if ("partly".equals(cond)) return R.drawable.ic_widget_partly;
        if ("fog".equals(cond)) return R.drawable.ic_widget_fog;
        if ("snow".equals(cond)) return R.drawable.ic_widget_snow;
        if ("storm".equals(cond)) return R.drawable.ic_widget_storm;
        if ("rain".equals(cond) || "sleet".equals(cond)) return R.drawable.ic_widget_rain;
        return R.drawable.ic_widget_cloud;
    }

    /** Подпись источника: открыть его сайт во внешнем браузере. Только известные адреса */
    static PendingIntent openSource(Context c, String url, int requestCode) {
        String safe = url != null && (url.startsWith("https://www.gismeteo.ru") || url.startsWith("https://open-meteo.com"))
                ? url : "https://www.gismeteo.ru";
        Intent i = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(safe));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
