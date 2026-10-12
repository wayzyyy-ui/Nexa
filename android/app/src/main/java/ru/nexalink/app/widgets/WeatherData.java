package ru.nexalink.app.widgets;

import org.json.JSONException;
import org.json.JSONObject;

/** Погода для виджета: город, сейчас, минимум и максимум на день, когда получена. */
public final class WeatherData {
    public final String city;
    public final int temp;
    public final int code;      // код погоды WMO (как у Open-Meteo и на сайте NEXA)
    public final int min;
    public final int max;
    public final long updatedAt; // когда получена (мс)

    public WeatherData(String city, int temp, int code, int min, int max, long updatedAt) {
        this.city = city;
        this.temp = temp;
        this.code = code;
        this.min = min;
        this.max = max;
        this.updatedAt = updatedAt;
    }

    JSONObject toJson() {
        JSONObject o = new JSONObject();
        try {
            o.put("city", city).put("temp", temp).put("code", code)
                    .put("min", min).put("max", max).put("at", updatedAt);
        } catch (JSONException ignored) {}
        return o;
    }

    static WeatherData fromJson(JSONObject o) throws JSONException {
        return new WeatherData(o.getString("city"), o.getInt("temp"), o.getInt("code"),
                o.getInt("min"), o.getInt("max"), o.getLong("at"));
    }
}
