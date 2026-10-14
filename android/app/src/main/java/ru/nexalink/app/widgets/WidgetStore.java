package ru.nexalink.app.widgets;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Общее хранилище виджетов NEXA — SharedPreferences «nexa_widgets».
 *
 * Сюда пишут: веб-часть приложения через плагин NexaWidgets (расписание и город)
 * и фоновая задача WeatherWorker (погода).
 * Отсюда читают виджеты — поэтому они показывают данные, даже когда
 * само приложение закрыто.
 *
 * Ключи:
 *   schedule      — JSON-массив дел [{date "2026-10-12", time "09:30", title}]
 *   schedule_at   — когда расписание пришло из приложения (мс; 0 — ещё ни разу)
 *   city_id, city — город из настроек NEXA: id для /api/weather и название (нет — Казань)
 *   api_base      — адрес сервера NEXA (погода — <api_base>/api/weather?city=<id>)
 *   weather       — последняя успешная погода (JSON, см. WeatherData)
 */
public final class WidgetStore {
    private static final String PREFS = "nexa_widgets";
    public static final String DEFAULT_CITY = "Казань";
    public static final String DEFAULT_CITY_ID = "kazan";
    public static final String DEFAULT_API = "https://nexa-link.ru";

    private WidgetStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /* ─── Расписание ─── */
    public static void saveSchedule(Context c, JSONArray items) {
        prefs(c).edit()
                .putString("schedule", items.toString())
                .putLong("schedule_at", System.currentTimeMillis())
                .apply();
    }

    public static JSONArray schedule(Context c) {
        try {
            return new JSONArray(prefs(c).getString("schedule", "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    /** Приходило ли расписание из приложения хоть раз (иначе виджет просит открыть NEXA) */
    public static boolean hasSchedule(Context c) {
        return prefs(c).getLong("schedule_at", 0) > 0;
    }

    /* ─── Город и сервер ─── */
    /** Название города из настроек NEXA; null — не выбран (тогда Казань) */
    public static String city(Context c) {
        return prefs(c).getString("city", null);
    }

    public static String cityOrDefault(Context c) {
        String city = city(c);
        return city == null || city.trim().isEmpty() ? DEFAULT_CITY : city;
    }

    /** id города для /api/weather (kazan, moscow…); нет — kazan */
    public static String cityId(Context c) {
        return prefs(c).getString("city_id", DEFAULT_CITY_ID);
    }

    /** Адрес сервера NEXA, откуда брать погоду (https) */
    public static String apiBase(Context c) {
        return prefs(c).getString("api_base", DEFAULT_API);
    }

    /** true — город поменялся (нужно обновить погоду) */
    public static boolean saveCity(Context c, String id, String name, String api) {
        boolean changed = !id.equals(cityId(c)) || (api != null && !api.equals(apiBase(c)));
        SharedPreferences.Editor e = prefs(c).edit().putString("city_id", id);
        if (name != null) e.putString("city", name); else e.remove("city");
        if (api != null) e.putString("api_base", api);
        if (changed) e.remove("weather"); // погода прежнего города больше не подходит
        e.apply();
        return changed;
    }

    /* ─── Погода ─── */
    public static void saveWeather(Context c, WeatherData w) {
        prefs(c).edit().putString("weather", w.toJson().toString()).apply();
    }

    /** Последняя успешная погода или null */
    public static WeatherData weather(Context c) {
        try {
            String s = prefs(c).getString("weather", null);
            return s == null ? null : WeatherData.fromJson(new JSONObject(s));
        } catch (Exception e) {
            return null;
        }
    }
}
