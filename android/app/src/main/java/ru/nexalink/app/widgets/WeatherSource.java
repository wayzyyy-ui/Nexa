package ru.nexalink.app.widgets;

/**
 * Источник погоды для виджетов. Сейчас один — OpenMeteoSource.
 * Чтобы подключить другого поставщика, достаточно написать свой класс
 * с этими двумя методами и вернуть его в WeatherSource.current().
 */
public interface WeatherSource {

    /** Координаты города по названию: { широта, долгота } или null, если не нашёлся. */
    double[] findCity(String name) throws Exception;

    /** Погода в точке. city — подпись для виджета. Бросает исключение, если не вышло. */
    WeatherData load(String city, double lat, double lon) throws Exception;

    static WeatherSource current() {
        return new OpenMeteoSource();
    }
}
