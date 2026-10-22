package ru.nexalink.app.widgets;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import ru.nexalink.app.R;

/**
 * Виджет «Заметки»: закреплённая заметка из NEXA — название, начало текста, когда изменена.
 * Один виджет, раскладка по размеру: компактная (2 × 2 — нажатие открывает заметку)
 * и широкая (от 4 × 2 — ещё «Открыть» и «Новая заметка»); чем выше виджет, тем больше строк текста.
 *
 * Данные — одна заметка в WidgetStore (её присылает веб-часть через NexaWidgets.setNote),
 * поэтому виджет показывает её и при закрытом приложении, а сам ничего не загружает.
 * Время на виджете — когда изменена сама заметка, а не когда пришли данные.
 */
public class NotesWidget extends AppWidgetProvider {
    private static final Locale RU = new Locale("ru");
    private static final int WIDE_MIN_DP = 220; // шире — широкая раскладка (Android 11 и ниже)
    private static final int TALL_MIN_DP = 180; // выше — больше строк текста

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        render(context, manager, ids);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        render(context, manager, new int[] { id });
    }

    static void render(Context c, AppWidgetManager manager, int[] ids) {
        JSONObject n = WidgetStore.note(c);
        for (int id : ids) {
            RemoteViews views;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Android 12+: система сама выбирает раскладку под размер виджета
                Map<SizeF, RemoteViews> bySize = new HashMap<>();
                bySize.put(new SizeF(110f, 110f), build(c, n, R.layout.widget_notes_small, 3));
                bySize.put(new SizeF(110f, 200f), build(c, n, R.layout.widget_notes_small, 9));
                bySize.put(new SizeF(250f, 110f), build(c, n, R.layout.widget_notes_wide, 2));
                bySize.put(new SizeF(250f, 200f), build(c, n, R.layout.widget_notes_wide, 8));
                views = new RemoteViews(bySize);
            } else {
                Bundle o = manager.getAppWidgetOptions(id);
                boolean wide = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) >= WIDE_MIN_DP;
                boolean tall = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0) >= TALL_MIN_DP;
                views = wide ? build(c, n, R.layout.widget_notes_wide, tall ? 8 : 2)
                        : build(c, n, R.layout.widget_notes_small, tall ? 9 : 3);
            }
            manager.updateAppWidget(id, views);
        }
    }

    private static RemoteViews build(Context c, JSONObject n, int layout, int lines) {
        RemoteViews v = new RemoteViews(c.getPackageName(), layout);
        boolean wide = layout == R.layout.widget_notes_wide;
        String state = n == null ? "none" : n.optString("state");
        v.setInt(R.id.notes_text, "setMaxLines", lines);

        if ("note".equals(state)) {
            String hidden = n.optString("hidden");
            String title = hidden.isEmpty() ? n.optString("title") : c.getString(R.string.widget_notes_hidden_title);
            String text = "hide".equals(hidden) ? c.getString(R.string.widget_notes_hidden_text)
                    : "secret".equals(hidden) ? c.getString(R.string.widget_notes_secret_text)
                    : n.optString("text");
            v.setViewVisibility(R.id.notes_title, View.VISIBLE);
            v.setTextViewText(R.id.notes_title, title.isEmpty() ? c.getString(R.string.widget_notes_untitled) : title);
            // Пустой текст не прячем: поле держит место, и строка «Изменено…» остаётся внизу
            v.setViewVisibility(R.id.notes_text, View.VISIBLE);
            v.setTextViewText(R.id.notes_text, text);
            v.setTextColor(R.id.notes_text, c.getColor(hidden.isEmpty() ? R.color.widget_text : R.color.widget_muted));
            // Компактный: «21 окт., 22:52 · ☑ 1/2» — иначе подпись не помещается в 2 × 2
            String when = changedText(n.optLong("updatedAt", 0), !wide);
            String check = n.optString("check");
            if (!wide) check = check.replace(" из ", "/");
            String meta = when + (!when.isEmpty() && !check.isEmpty() ? " · " : "") + check;
            v.setViewVisibility(R.id.notes_meta, meta.isEmpty() ? View.GONE : View.VISIBLE);
            v.setTextViewText(R.id.notes_meta, meta);
            String id = n.optString("id");
            v.setOnClickPendingIntent(R.id.widget_root, Widgets.openNote(c, id, 10));
            if (wide) {
                v.setViewVisibility(R.id.notes_actions, View.VISIBLE);
                v.setTextViewText(R.id.notes_open, c.getString(R.string.widget_notes_open));
                v.setOnClickPendingIntent(R.id.notes_open, Widgets.openNote(c, id, 10));
                v.setViewVisibility(R.id.notes_new, View.VISIBLE);
                v.setOnClickPendingIntent(R.id.notes_new, Widgets.openNote(c, "new", 11));
            }
            return v;
        }

        // Пустые состояния: закреплённой нет / приложение ещё не присылало / вышли из аккаунта
        boolean signedOut = "signedOut".equals(state);
        int msg = signedOut ? R.string.widget_notes_signed_out
                : "empty".equals(state) ? R.string.widget_notes_empty : R.string.widget_notes_open_app;
        v.setViewVisibility(R.id.notes_title, View.GONE);
        v.setViewVisibility(R.id.notes_meta, View.GONE);
        v.setViewVisibility(R.id.notes_text, View.VISIBLE);
        v.setTextViewText(R.id.notes_text, c.getString(msg));
        v.setTextColor(R.id.notes_text, c.getColor(R.color.widget_muted));
        v.setOnClickPendingIntent(R.id.widget_root, signedOut ? Widgets.openApp(c, "home", 13) : Widgets.openNote(c, "list", 12));
        if (wide) {
            v.setViewVisibility(R.id.notes_actions, signedOut ? View.GONE : View.VISIBLE);
            v.setTextViewText(R.id.notes_open, c.getString(R.string.widget_notes_list));
            v.setOnClickPendingIntent(R.id.notes_open, Widgets.openNote(c, "list", 12));
            v.setOnClickPendingIntent(R.id.notes_new, Widgets.openNote(c, "new", 11));
        }
        return v;
    }

    /* «Изменено 22 окт. в 14:05» (другой год — «… 2025 в 14:05»). Всегда точная дата, без «сегодня»:
       виджет не перерисовывается в полночь, и «сегодня» назавтра стало бы неправдой */
    private static String changedText(long at, boolean compact) {
        if (at <= 0) return "";
        Date d = new Date(at);
        Calendar t = Calendar.getInstance();
        t.setTime(d);
        boolean thisYear = t.get(Calendar.YEAR) == Calendar.getInstance().get(Calendar.YEAR);
        if (compact) return new SimpleDateFormat(thisYear ? "d MMM, HH:mm" : "d MMM yyyy", RU).format(d);
        return "Изменено " + new SimpleDateFormat(thisYear ? "d MMM 'в' HH:mm" : "d MMM yyyy 'в' HH:mm", RU).format(d);
    }
}
