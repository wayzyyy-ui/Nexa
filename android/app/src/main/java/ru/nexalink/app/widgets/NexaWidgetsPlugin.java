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
 * setCity({ city, lat, lon, api }) — город из настроек NEXA (city: null — не выбран, тогда Казань) и адрес сервера.
 * setNote({ state, id, title, text, hidden, updatedAt, check }) — виджет «Заметки»: одна закреплённая
 *     заметка (state "note"), "empty" — закреплённой нет, "signedOut" — вышли из аккаунта.
 * refresh() — перерисовать виджеты и, если погода устарела, обновить её.
 * Событие "openTab" { tab } — нажали на виджет: открыть раздел ("today" или "home").
 * Событие "openNote" { id } | { create: true } | {} — виджет «Заметки»: заметка, новая заметка, список.
 */
@CapacitorPlugin(name = "NexaWidgets")
public class NexaWidgetsPlugin extends Plugin {
    private static final int MAX_ITEMS = 200;
    private static final int MAX_TITLE = 120;
    private static final int NOTE_TITLE = 200;
    private static final int NOTE_TEXT = 700;
    private static final java.util.regex.Pattern NOTE_ID = java.util.regex.Pattern.compile("[0-9a-fA-F-]{8,64}");

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
        String note = intent.getStringExtra(Widgets.EXTRA_NOTE);
        if (note != null) {
            intent.removeExtra(Widgets.EXTRA_NOTE);
            JSObject data = new JSObject();
            if ("new".equals(note)) data.put("create", true);
            else if (NOTE_ID.matcher(note).matches()) data.put("id", note);
            notifyListeners("openNote", data, true);
            return;
        }
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
        // Город, выбранный в NEXA (название и координаты; нет — Казань), и адрес сервера (только https)
        String city = call.getString("city");
        if (city != null) city = city.trim();
        if (city != null && (city.isEmpty() || city.length() > 80)) city = null;
        Double lat = call.getDouble("lat"), lon = call.getDouble("lon");
        if (lat == null || lon == null || lat < -90 || lat > 90 || lon < -180 || lon > 180) { lat = null; lon = null; }
        if (city == null) { lat = null; lon = null; }
        String api = call.getString("api");
        if (api != null && (!api.startsWith("https://") || api.length() > 200)) api = null;
        if (api != null) api = api.replaceAll("/+$", "");
        Context c = getContext();
        if (WidgetStore.saveCity(c, city, lat, lon, api)) {
            Widgets.updateWeather(c);      // сразу — новое название города
            Widgets.refreshWeatherNow(c);  // и погода для него, как только будет сеть
        }
        call.resolve();
    }

    @PluginMethod
    public void setNote(PluginCall call) {
        // Только нужные поля и в пределах — заметка приходит из веб-части
        String state = call.getString("state", "");
        JSONObject n = new JSONObject();
        try {
            if ("note".equals(state)) {
                String id = call.getString("id", "");
                if (!NOTE_ID.matcher(id).matches()) { call.reject("bad id"); return; }
                String hidden = call.getString("hidden", "");
                if (!"hide".equals(hidden) && !"secret".equals(hidden)) hidden = "";
                n.put("state", "note").put("id", id).put("hidden", hidden)
                        .put("title", cut(hidden.isEmpty() ? call.getString("title", "") : "", NOTE_TITLE))
                        .put("text", cut(hidden.isEmpty() ? call.getString("text", "") : "", NOTE_TEXT))
                        .put("check", cut(hidden.isEmpty() ? call.getString("check", "") : "", 40))
                        .put("updatedAt", Math.max(0L, call.getData().optLong("updatedAt", 0L)));
            } else if ("signedOut".equals(state)) {
                n.put("state", "signedOut"); // вышли — старый текст стираем, а не прячем
            } else {
                n.put("state", "empty");
            }
        } catch (Exception e) {
            call.reject("bad note");
            return;
        }
        Context c = getContext();
        WidgetStore.saveNote(c, n);
        Widgets.updateNotes(c);
        call.resolve();
    }

    private static String cut(String s, int max) {
        if (s == null) return "";
        return s.length() > max ? s.substring(0, max) : s;
    }

    @PluginMethod
    public void refresh(PluginCall call) {
        Context c = getContext();
        Widgets.updateNotes(c);
        Widgets.updateSchedule(c);
        Widgets.updateWeather(c);
        WeatherData w = WidgetStore.weather(c);
        if (w == null || System.currentTimeMillis() - w.updatedAt > 30 * 60 * 1000L) Widgets.refreshWeatherNow(c);
        call.resolve();
    }
}
