package ru.nexalink.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.Toast;

import androidx.core.app.NotificationCompat;

import java.util.Map;

/**
 * Общий буфер обмена: push «Скопировано на …», когда NEXA на телефоне закрыта
 * (api/push.js → Firebase → NexaMessagingService → сюда).
 *
 * show() — уведомление с началом текста и кнопкой «Скопировать». Само в буфер телефона
 * ничего не кладёт: только по нажатию кнопки (onReceive). Уведомление исчезает само,
 * когда истекает срок записи (1, 10 или 60 минут — выбрал отправитель).
 * Длинный текст (больше, чем влезает в push) — без кнопки: «Откройте NEXA, чтобы скопировать».
 */
public class NexaClipReceiver extends BroadcastReceiver {
    static final String CHANNEL = "nexa-clip";
    static final String ACTION_COPY = "ru.nexalink.app.CLIP_COPY";
    static final String EXTRA_TEXT = "text";
    static final String EXTRA_NOTE = "note";

    static void show(Context ctx, Map<String, String> data) {
        String text = data.get("text");
        if (text == null || text.trim().isEmpty()) return;
        long exp = 0;
        try { exp = Long.parseLong(data.get("exp")); } catch (Exception ignored) {}
        long left = exp - System.currentTimeMillis();
        if (left <= 0) return; // уже истекло — не показываем
        boolean isLong = "1".equals(data.get("long"));
        String from = data.get("from") == null ? "Ваше устройство" : data.get("from");
        int noteId = 7100 + Math.abs(String.valueOf(data.get("id")).hashCode() % 800);

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Общий буфер обмена", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Текст, скопированный на других ваших устройствах, — с кнопкой «Скопировать»");
            nm.createNotificationChannel(ch);
        }

        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPi = PendingIntent.getActivity(ctx, noteId, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String preview = text.replaceAll("\\s+", " ").trim();
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_nexa)
            .setContentTitle("Скопировано на «" + from + "»")
            .setContentText(isLong ? preview + "…" : preview)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(isLong ? preview + "…\nТекст длинный — откройте NEXA, чтобы скопировать целиком" : text))
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE) // на экране блокировки — без текста
            .setAutoCancel(true)
            .setTimeoutAfter(left)
            .setContentIntent(openPi);
        if (!isLong) {
            Intent copy = new Intent(ctx, NexaClipReceiver.class).setAction(ACTION_COPY)
                .putExtra(EXTRA_TEXT, text).putExtra(EXTRA_NOTE, noteId);
            PendingIntent copyPi = PendingIntent.getBroadcast(ctx, noteId, copy, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            b.addAction(0, "Скопировать", copyPi);
        }
        try { nm.notify(noteId, b.build()); } catch (SecurityException ignored) { /* нет разрешения на уведомления */ }
    }

    // Нажали «Скопировать» — кладём текст в буфер телефона и убираем уведомление
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!ACTION_COPY.equals(intent.getAction())) return;
        String text = intent.getStringExtra(EXTRA_TEXT);
        if (text == null) return;
        ClipboardManager cm = (ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
        cm.setPrimaryClip(ClipData.newPlainText("NEXA", text));
        ((NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(intent.getIntExtra(EXTRA_NOTE, 0));
        // Android 13+ сам показывает «Скопировано»; раньше — своя подсказка
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) Toast.makeText(ctx, "Скопировано", Toast.LENGTH_SHORT).show();
    }
}
