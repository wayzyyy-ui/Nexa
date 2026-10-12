package ru.nexalink.app.widgets;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/**
 * Фоновое обновление погоды для виджета (WorkManager).
 * Город — из настроек NEXA, иначе Казань. Координаты города ищет геокодер
 * один раз и запоминает. Не вышло (нет сети, сервис молчит) — виджет
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
        WeatherSource source = WeatherSource.current();
        String city = WidgetStore.cityOrDefault(c);
        try {
            double[] ll = WidgetStore.coords(c, city);
            if (ll == null) {
                ll = source.findCity(city);
                if (ll == null) return Result.failure(); // такого города сервис не знает
                WidgetStore.saveGeo(c, city, ll[0], ll[1]);
            }
            WidgetStore.saveWeather(c, source.load(city, ll[0], ll[1]));
            Widgets.updateWeather(c);
            return Result.success();
        } catch (Exception e) {
            // Нет сети или сервис не ответил: пара повторов с паузой, дальше ждём следующего раза
            Widgets.updateWeather(c); // хотя бы освежить подпись «обновлено … назад»
            return getRunAttemptCount() < 2 ? Result.retry() : Result.success();
        }
    }
}
