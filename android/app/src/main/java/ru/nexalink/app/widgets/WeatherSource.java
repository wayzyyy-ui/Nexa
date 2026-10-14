package ru.nexalink.app.widgets;

import android.content.Context;

/**
 * Источник погоды для виджетов. Сейчас один — наш сервер NEXA (/api/weather,
 * внутри Gismeteo с резервом Open-Meteo): напрямую к поставщикам погоды виджет не ходит.
 */
public interface WeatherSource {

    /** Погода: query — «lat=…&lon=…» или «city=kazan». Бросает исключение, если не вышло. */
    WeatherData load(String query, String cityName) throws Exception;

    static WeatherSource current(Context c) {
        return new NexaApiSource(WidgetStore.apiBase(c));
    }
}
