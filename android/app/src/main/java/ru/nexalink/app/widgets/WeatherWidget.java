package ru.nexalink.app.widgets;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import ru.nexalink.app.R;

/**
 * Виджет «Погода»: 2 × 2 (компактный) и 4 × 2 (широкий) — один виджет,
 * раскладка меняется по ширине. Город, температура, состояние, минимум
 * и максимум на день, время обновления. Нажатие открывает Главную.
 * Данные — последняя удачная погода из WidgetStore (её обновляет WeatherWorker).
 */
public class WeatherWidget extends AppWidgetProvider {
    private static final long STALE_MS = 30 * 60 * 1000L;
    private static final int WIDE_MIN_DP = 220; // шире — широкая раскладка (Android 11 и ниже)

    @Override
    public void onEnabled(Context context) {
        Widgets.scheduleWeather(context);
        Widgets.refreshWeatherNow(context);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        render(context, manager, ids);
        Widgets.scheduleWeather(context);
        WeatherData w = WidgetStore.weather(context);
        if (w == null || System.currentTimeMillis() - w.updatedAt > STALE_MS) Widgets.refreshWeatherNow(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        render(context, manager, new int[] { id });
    }

    @Override
    public void onDisabled(Context context) {
        Widgets.stopWeather(context); // виджетов погоды не осталось — фоновая задача не нужна
    }

    static void render(Context c, AppWidgetManager manager, int[] ids) {
        WeatherData w = WidgetStore.weather(c);
        for (int id : ids) {
            RemoteViews views;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Android 12+: система сама выбирает раскладку под размер виджета
                Map<SizeF, RemoteViews> bySize = new HashMap<>();
                bySize.put(new SizeF(110f, 110f), build(c, w, R.layout.widget_weather_small));
                bySize.put(new SizeF(250f, 110f), build(c, w, R.layout.widget_weather_wide));
                views = new RemoteViews(bySize);
            } else {
                int minWidth = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
                views = build(c, w, minWidth >= WIDE_MIN_DP ? R.layout.widget_weather_wide : R.layout.widget_weather_small);
            }
            manager.updateAppWidget(id, views);
        }
    }

    private static RemoteViews build(Context c, WeatherData w, int layout) {
        RemoteViews v = new RemoteViews(c.getPackageName(), layout);
        if (w == null) {
            // Погоды ещё ни разу не было (только что добавили или нет сети)
            v.setTextViewText(R.id.weather_city, WidgetStore.cityOrDefault(c));
            v.setTextViewText(R.id.weather_temp, "—");
            v.setTextViewText(R.id.weather_sky, c.getString(R.string.widget_weather_loading));
            v.setTextViewText(R.id.weather_range, "");
            v.setTextViewText(R.id.weather_updated, c.getString(R.string.widget_weather_need_net));
            v.setImageViewResource(R.id.weather_icon, R.drawable.ic_widget_cloud);
        } else {
            v.setTextViewText(R.id.weather_city, w.city);
            v.setTextViewText(R.id.weather_temp, signed(w.temp) + "°");
            v.setTextViewText(R.id.weather_sky, Widgets.weatherText(w.code));
            v.setTextViewText(R.id.weather_range, "↓ " + signed(w.min) + "°   ↑ " + signed(w.max) + "°");
            v.setTextViewText(R.id.weather_updated, updatedText(w.updatedAt));
            v.setImageViewResource(R.id.weather_icon, Widgets.weatherIcon(w.code));
        }
        v.setOnClickPendingIntent(R.id.widget_root, Widgets.openApp(c, "home", 2));
        return v;
    }

    // +5, −3, 0 — как на сайте
    private static String signed(int t) {
        return t > 0 ? "+" + t : t < 0 ? "−" + (-t) : "0";
    }

    // «Обновлено в 14:05» сегодня, иначе «Обновлено 11 окт. в 14:05»
    private static String updatedText(long at) {
        Locale ru = new Locale("ru");
        Date d = new Date(at);
        SimpleDateFormat day = new SimpleDateFormat("yyyyMMdd", Locale.US);
        String hm = new SimpleDateFormat("HH:mm", ru).format(d);
        if (day.format(d).equals(day.format(new Date()))) return "Обновлено в " + hm;
        return "Обновлено " + new SimpleDateFormat("d MMM", ru).format(d) + " в " + hm;
    }
}
