package ru.nexalink.app.widgets;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/**
 * Фоновое обновление погоды для виджета (WorkManager).
 * Город — из настроек NEXA (координаты), иначе Казань. Погода — с нашего сервера
 * /api/weather (Gismeteo, резерв Open-Meteo). Не вышло (нет сети, сервер молчит) — виджет
 * продолжает показывать последнюю удачную погоду с её временем.
 */
public class WeatherWorker extends Worker {

    public WeatherWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        try {
            WidgetStore.saveWeather(c, WeatherSource.current(c).load(WidgetStore.weatherQuery(c), WidgetStore.cityOrDefault(c)));
            Widgets.updateWeather(c);
            return Result.success();
        } catch (Exception e) {
            // Нет сети или сервер не ответил: пара повторов с паузой, дальше ждём следующего раза
            Widgets.updateWeather(c); // хотя бы освежить подпись «обновлено … назад»
            return getRunAttemptCount() < 2 ? Result.retry() : Result.success();
        }
    }
}
