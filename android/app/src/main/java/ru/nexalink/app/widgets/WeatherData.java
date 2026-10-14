package ru.nexalink.app.widgets;

import org.json.JSONException;
import org.json.JSONObject;

/** Погода для виджета: город, сейчас, минимум и максимум на день, когда получена, источник. */
public final class WeatherData {
    public final String city;
    public final int temp;
    public final String cond;    // свой код NEXA: sun, partly, cloud, overcast, rain, snow, sleet, storm, fog
    public final String text;    // описание от источника («Пасмурно, небольшой дождь»)
    public final int min;
    public final int max;
    public final long updatedAt; // когда получена (мс)
    public final String source;  // gismeteo | openmeteo
    public final String attrText; // подпись источника — обязательна («По данным Gismeteo»)
    public final String attrUrl;
    public final boolean stale;  // сервер отдал последние сохранённые данные

    public WeatherData(String city, int temp, String cond, String text, int min, int max, long updatedAt,
                       String source, String attrText, String attrUrl, boolean stale) {
        this.city = city;
        this.temp = temp;
        this.cond = cond;
        this.text = text;
        this.min = min;
        this.max = max;
        this.updatedAt = updatedAt;
        this.source = source;
        this.attrText = attrText;
        this.attrUrl = attrUrl;
        this.stale = stale;
    }

    JSONObject toJson() {
        JSONObject o = new JSONObject();
        try {
            o.put("v", 2).put("city", city).put("temp", temp).put("cond", cond).put("text", text)
                    .put("min", min).put("max", max).put("at", updatedAt)
                    .put("source", source).put("attrText", attrText).put("attrUrl", attrUrl).put("stale", stale);
        } catch (JSONException ignored) {}
        return o;
    }

    /** Старый формат (до Gismeteo, с кодом WMO) не читаем — виджет просто загрузит заново */
    static WeatherData fromJson(JSONObject o) throws JSONException {
        if (o.optInt("v", 1) < 2) throw new JSONException("old");
        return new WeatherData(o.getString("city"), o.getInt("temp"), o.getString("cond"), o.optString("text", ""),
                o.getInt("min"), o.getInt("max"), o.getLong("at"),
                o.optString("source", ""), o.optString("attrText", ""), o.optString("attrUrl", ""), o.optBoolean("stale", false));
    }
}
