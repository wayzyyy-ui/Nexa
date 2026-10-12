package ru.nexalink.app.widgets;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Погода и поиск города через Open-Meteo — тот же сервис, что у сайта NEXA.
 * Ключ не нужен. Условия: бесплатно для некоммерческого использования,
 * до 10 000 запросов в день, с указанием источника (CC BY 4.0) — источник
 * указан в описании виджета. Виджет спрашивает погоду примерно раз в 30 минут.
 */
final class OpenMeteoSource implements WeatherSource {
    private static final int TIMEOUT_MS = 10000;

    @Override
    public double[] findCity(String name) throws Exception {
        String url = "https://geocoding-api.open-meteo.com/v1/search?count=1&language=ru&format=json&name="
                + URLEncoder.encode(name, "UTF-8");
        JSONArray results = get(url).optJSONArray("results");
        if (results == null || results.length() == 0) return null;
        JSONObject r = results.getJSONObject(0);
        return new double[] { r.getDouble("latitude"), r.getDouble("longitude") };
    }

    @Override
    public WeatherData load(String city, double lat, double lon) throws Exception {
        String url = String.format(Locale.US,
                "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f"
                        + "&current=temperature_2m,weather_code"
                        + "&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1",
                lat, lon);
        JSONObject data = get(url);
        JSONObject current = data.getJSONObject("current");
        JSONObject daily = data.getJSONObject("daily");
        return new WeatherData(
                city,
                (int) Math.round(current.getDouble("temperature_2m")),
                current.getInt("weather_code"),
                (int) Math.round(daily.getJSONArray("temperature_2m_min").getDouble(0)),
                (int) Math.round(daily.getJSONArray("temperature_2m_max").getDouble(0)),
                System.currentTimeMillis());
    }

    private static JSONObject get(String address) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(address).openConnection();
        conn.setConnectTimeout(TIMEOUT_MS);
        conn.setReadTimeout(TIMEOUT_MS);
        try {
            if (conn.getResponseCode() != 200) throw new Exception("http " + conn.getResponseCode());
            StringBuilder sb = new StringBuilder();
            try (BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = in.readLine()) != null) sb.append(line);
            }
            return new JSONObject(sb.toString());
        } finally {
            conn.disconnect();
        }
    }
}
