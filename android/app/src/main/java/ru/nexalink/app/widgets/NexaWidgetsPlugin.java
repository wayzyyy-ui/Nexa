package ru.nexalink.app.widgets;

import android.content.Context;
import android.content.Intent;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Мост между NEXA (веб-часть) и виджетами рабочего стола.
 *
 * setSchedule({ items: [{ date, time, title }] }) — расписание для виджета
 *     (то же, что на экране «Сегодня»). Хранится в SharedPreferences, поэтому
 *     виджет видит его и при закрытом приложении.
 * setCity({ city, lat, lon }) — город из настроек NEXA (city: null — не выбран, тогда Казань).
 * refresh() — перерисовать виджеты и, если погода устарела, обновить её.
 * Событие "openTab" { tab } — нажали на виджет: открыть раздел ("today" или "home").
 */
@CapacitorPlugin(name = "NexaWidgets")
public class NexaWidgetsPlugin extends Plugin {
    private static final int MAX_ITEMS = 200;
    private static final int MAX_TITLE = 120;

    @Override
    public void load() {
        // Приложение запустили нажатием на виджет — передаём раздел, как только
        // веб-часть подпишется на событие (retain: событие дождётся подписчика)
        handleTab(getActivity().getIntent());
        Widgets.scheduleWeather(getContext());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleTab(intent); // приложение уже было открыто
    }

    private void handleTab(Intent intent) {
        if (intent == null) return;
        String tab = intent.getStringExtra(Widgets.EXTRA_TAB);
        if (!"today".equals(tab) && !"home".equals(tab)) return;
        intent.removeExtra(Widgets.EXTRA_TAB); // чтобы перезапуск страницы не открыл раздел ещё раз
        JSObject data = new JSObject();
        data.put("tab", tab);
        notifyListeners("openTab", data, true);
    }

    @PluginMethod
    public void setSchedule(PluginCall call) {
        JSArray items = call.getArray("items");
        if (items == null) {
            call.reject("items required");
            return;
        }
        // Берём только нужные поля и в разумных пределах — данные приходят из веб-части
        JSONArray clean = new JSONArray();
        for (int i = 0; i < items.length() && clean.length() < MAX_ITEMS; i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null) continue;
            String date = it.optString("date"), time = it.optString("time"), title = it.optString("title");
            if (!date.matches("\\d{4}-\\d{2}-\\d{2}") || !time.matches("\\d{2}:\\d{2}") || title.isEmpty()) continue;
            try {
                clean.put(new JSONObject()
                        .put("date", date)
                        .put("time", time)
                        .put("title", title.length() > MAX_TITLE ? title.substring(0, MAX_TITLE) : title));
            } catch (Exception ignored) {}
        }
        Context c = getContext();
        WidgetStore.saveSchedule(c, clean);
        Widgets.updateSchedule(c);
        call.resolve();
    }

    @PluginMethod
    public void setCity(PluginCall call) {
        String city = call.getString("city");
        if (city != null) city = city.trim();
        if (city != null && (city.isEmpty() || city.length() > 80)) city = null;
        Double lat = call.getDouble("lat"), lon = call.getDouble("lon");
        if (lat != null && (lat < -90 || lat > 90)) lat = null;
        if (lon != null && (lon < -180 || lon > 180)) lon = null;
        Context c = getContext();
        if (WidgetStore.saveCity(c, city, lat, lon)) {
            Widgets.updateWeather(c);      // сразу — новое название города
            Widgets.refreshWeatherNow(c);  // и погода для него, как только будет сеть
        }
        call.resolve();
    }

    @PluginMethod
    public void refresh(PluginCall call) {
        Context c = getContext();
        Widgets.updateSchedule(c);
        Widgets.updateWeather(c);
        WeatherData w = WidgetStore.weather(c);
        if (w == null || System.currentTimeMillis() - w.updatedAt > 30 * 60 * 1000L) Widgets.refreshWeatherNow(c);
        call.resolve();
    }
}
