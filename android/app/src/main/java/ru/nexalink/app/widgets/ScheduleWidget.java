package ru.nexalink.app.widgets;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

import ru.nexalink.app.R;

/**
 * Виджет «Расписание» (4 × 2): до трёх ближайших дел на сегодня — время и название.
 * Данные — то же расписание, что на экране «Сегодня» (nexa-schedule): приложение
 * передаёт его через плагин NexaWidgets в WidgetStore. Нажатие открывает «Сегодня».
 *
 * Прошедшие дела убираются сами: виджет просит Android разбудить его к началу
 * следующей минуты после ближайшего дела и в полночь (будильник без точного
 * времени — система может сдвинуть его на несколько минут).
 */
public class ScheduleWidget extends AppWidgetProvider {
    static final String ACTION_TICK = "ru.nexalink.app.widgets.SCHEDULE_TICK";
    private static final Locale RU = new Locale("ru");
    private static final int[] ROWS = { R.id.schedule_row1, R.id.schedule_row2, R.id.schedule_row3 };
    private static final int[] TIMES = { R.id.schedule_time1, R.id.schedule_time2, R.id.schedule_time3 };
    private static final int[] TITLES = { R.id.schedule_title1, R.id.schedule_title2, R.id.schedule_title3 };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        render(context, manager, ids);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String a = intent.getAction();
        if (ACTION_TICK.equals(a) || Intent.ACTION_TIME_CHANGED.equals(a)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(a) || Intent.ACTION_DATE_CHANGED.equals(a)) {
            Widgets.updateSchedule(context);
            return;
        }
        super.onReceive(context, intent);
    }

    @Override
    public void onDisabled(Context context) {
        alarms(context).cancel(tickIntent(context));
    }

    static void render(Context c, AppWidgetManager manager, int[] ids) {
        Date now = new Date();
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(now);
        String nowHm = new SimpleDateFormat("HH:mm", Locale.US).format(now);

        // Сегодняшние дела по времени и те, что ещё впереди
        JSONArray all = WidgetStore.schedule(c);
        List<JSONObject> todayItems = new ArrayList<>();
        for (int i = 0; i < all.length(); i++) {
            JSONObject it = all.optJSONObject(i);
            if (it != null && today.equals(it.optString("date"))) todayItems.add(it);
        }
        todayItems.sort((x, y) -> x.optString("time").compareTo(y.optString("time")));
        List<JSONObject> upcoming = new ArrayList<>();
        for (JSONObject it : todayItems) if (it.optString("time").compareTo(nowHm) >= 0) upcoming.add(it);

        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_schedule);
        String date = new SimpleDateFormat("EEEE, d MMMM", RU).format(now);
        v.setTextViewText(R.id.schedule_date, Character.toUpperCase(date.charAt(0)) + date.substring(1));
        for (int i = 0; i < ROWS.length; i++) {
            if (i < upcoming.size()) {
                v.setViewVisibility(ROWS[i], View.VISIBLE);
                v.setTextViewText(TIMES[i], upcoming.get(i).optString("time"));
                v.setTextViewText(TITLES[i], upcoming.get(i).optString("title"));
            } else {
                v.setViewVisibility(ROWS[i], View.GONE);
            }
        }
        // Больше трёх — сколько ещё
        int more = upcoming.size() - ROWS.length;
        v.setTextViewText(R.id.schedule_more, more > 0 ? "ещё " + more : "");
        v.setViewVisibility(R.id.schedule_more, more > 0 ? View.VISIBLE : View.GONE);

        String empty = null;
        if (!WidgetStore.hasSchedule(c)) empty = c.getString(R.string.widget_schedule_open_app);
        else if (todayItems.isEmpty()) empty = c.getString(R.string.widget_schedule_free);
        else if (upcoming.isEmpty()) empty = c.getString(R.string.widget_schedule_done);
        v.setViewVisibility(R.id.schedule_empty, empty != null ? View.VISIBLE : View.GONE);
        if (empty != null) v.setTextViewText(R.id.schedule_empty, empty);

        v.setOnClickPendingIntent(R.id.widget_root, Widgets.openApp(c, "today", 1));
        manager.updateAppWidget(ids, v);
        scheduleTick(c, upcoming.isEmpty() ? null : upcoming.get(0).optString("time"));
    }

    // Следующее пробуждение: минута после ближайшего дела или полночь — что раньше
    private static void scheduleTick(Context c, String nextHm) {
        Calendar midnight = Calendar.getInstance();
        midnight.add(Calendar.DAY_OF_YEAR, 1);
        midnight.set(Calendar.HOUR_OF_DAY, 0);
        midnight.set(Calendar.MINUTE, 0);
        midnight.set(Calendar.SECOND, 5);
        long at = midnight.getTimeInMillis();
        if (nextHm != null && nextHm.matches("\\d{2}:\\d{2}")) {
            Calendar t = Calendar.getInstance();
            t.set(Calendar.HOUR_OF_DAY, Integer.parseInt(nextHm.substring(0, 2)));
            t.set(Calendar.MINUTE, Integer.parseInt(nextHm.substring(3)) + 1);
            t.set(Calendar.SECOND, 0);
            if (t.getTimeInMillis() > System.currentTimeMillis()) at = Math.min(at, t.getTimeInMillis());
        }
        alarms(c).set(AlarmManager.RTC, at, tickIntent(c));
    }

    private static AlarmManager alarms(Context c) {
        return (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
    }

    private static PendingIntent tickIntent(Context c) {
        Intent i = new Intent(c, ScheduleWidget.class).setAction(ACTION_TICK);
        return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
