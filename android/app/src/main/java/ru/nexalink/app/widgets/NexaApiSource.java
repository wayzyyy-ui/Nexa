package ru.nexalink.app.widgets;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Погода для виджета — с нашего сервера NEXA: GET <api>/api/weather?lat=…&lon=… (или ?city=kazan).
 * Сам сервер берёт данные у Gismeteo (токен только на сервере), а если Gismeteo
 * недоступен — отдаёт последние сохранённые или Open-Meteo. Источник и его подпись
 * приходят в ответе (source, attribution) — виджет показывает именно их.
 */
public final class NexaApiSource implements WeatherSource {
    private final String base;

    NexaApiSource(String base) {
        this.base = base;
    }

    @Override
    public WeatherData load(String query, String cityName) throws Exception {
        if (!base.startsWith("https://")) throw new IllegalStateException("only https");
        if (!query.matches("(city=[a-z]{2,20}|lat=-?[0-9.]+&lon=-?[0-9.]+)")) throw new IllegalArgumentException("query");
        URL url = new URL(base + "/api/weather?" + query);
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        c.setConnectTimeout(10000);
        c.setReadTimeout(10000);
        c.setInstanceFollowRedirects(false);
        c.setRequestProperty("Accept", "application/json");
        try {
            if (c.getResponseCode() != 200) throw new IllegalStateException("http " + c.getResponseCode());
            JSONObject o = new JSONObject(read(c.getInputStream()));
            JSONObject now = o.getJSONObject("now");
            JSONArray days = o.getJSONArray("days");
            JSONObject today = days.getJSONObject(0);
            JSONObject attr = o.optJSONObject("attribution");
            JSONObject city = o.optJSONObject("city");
            return new WeatherData(
                    // Своё название города важнее: по координатам сервер знает лишь ближайший пункт
                    cityName != null ? cityName : city != null && !city.isNull("name") ? city.optString("name", "Казань") : "Казань",
                    now.getInt("temp"), now.optString("cond", "cloud"), now.optString("text", ""),
                    today.getInt("min"), today.getInt("max"), System.currentTimeMillis(),
                    o.optString("source", ""), attr != null ? attr.optString("text", "") : "",
                    attr != null ? attr.optString("url", "") : "", o.optBoolean("stale", false));
        } finally {
            c.disconnect();
        }
    }

    private static String read(InputStream in) throws Exception {
        try (InputStream s = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = s.read(buf)) > 0) {
                out.write(buf, 0, n);
                if (out.size() > 512 * 1024) throw new IllegalStateException("too big");
            }
            return out.toString("UTF-8");
        }
    }
}
