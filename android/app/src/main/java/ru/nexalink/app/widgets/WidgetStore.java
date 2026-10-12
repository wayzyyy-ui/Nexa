package ru.nexalink.app.widgets;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Общее хранилище виджетов NEXA — SharedPreferences «nexa_widgets».
 *
 * Сюда пишут: веб-часть приложения через плагин NexaWidgets (расписание и город)
 * и фоновая задача WeatherWorker (погода и координаты города).
 * Отсюда читают виджеты — поэтому они показывают данные, даже когда
 * само приложение закрыто.
 *
 * Ключи:
 *   schedule      — JSON-массив дел [{date "2026-10-12", time "09:30", title}]
 *   schedule_at   — когда расписание пришло из приложения (мс; 0 — ещё ни разу)
 *   city, city_lat, city_lon — город из настроек NEXA (нет — Казань)
 *   geo_name, geo_lat, geo_lon — найденные геокодером координаты города
 *   weather       — последняя успешная погода (JSON, см. WeatherData)
 */
public final class WidgetStore {
    private static final String PREFS = "nexa_widgets";
    public static final String DEFAULT_CITY = "Казань";

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

    /* ─── Город ─── */
    /** Город из настроек NEXA; null — не выбран (тогда Казань) */
    public static String city(Context c) {
        return prefs(c).getString("city", null);
    }

    public static String cityOrDefault(Context c) {
        String city = city(c);
        return city == null || city.trim().isEmpty() ? DEFAULT_CITY : city;
    }

    /** true — город поменялся (нужно обновить погоду) */
    public static boolean saveCity(Context c, String city, Double lat, Double lon) {
        String old = city(c);
        boolean changed = old == null ? city != null : !old.equals(city);
        SharedPreferences.Editor e = prefs(c).edit();
        if (city == null) {
            e.remove("city").remove("city_lat").remove("city_lon");
        } else {
            e.putString("city", city);
            if (lat != null && lon != null) {
                e.putString("city_lat", String.valueOf(lat)).putString("city_lon", String.valueOf(lon));
                changed = changed || !String.valueOf(lat).equals(prefs(c).getString("city_lat", ""));
            } else {
                e.remove("city_lat").remove("city_lon");
            }
        }
        e.apply();
        return changed;
    }

    /** Координаты города: из настроек NEXA или из кэша геокодера. null — не известны */
    public static double[] coords(Context c, String city) {
        SharedPreferences p = prefs(c);
        if (city.equals(city(c)) && p.contains("city_lat")) {
            return parse(p.getString("city_lat", null), p.getString("city_lon", null));
        }
        if (city.equals(p.getString("geo_name", null))) {
            return parse(p.getString("geo_lat", null), p.getString("geo_lon", null));
        }
        return null;
    }

    public static void saveGeo(Context c, String city, double lat, double lon) {
        prefs(c).edit()
                .putString("geo_name", city)
                .putString("geo_lat", String.valueOf(lat))
                .putString("geo_lon", String.valueOf(lon))
                .apply();
    }

    private static double[] parse(String lat, String lon) {
        try {
            return new double[] { Double.parseDouble(lat), Double.parseDouble(lon) };
        } catch (Exception e) {
            return null;
        }
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
