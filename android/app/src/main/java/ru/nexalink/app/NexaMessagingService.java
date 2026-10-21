package ru.nexalink.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Push «Найти устройство» (api/push.js → Firebase → сюда).
 * Ещё — push общего буфера обмена (type "clip") → NexaClipReceiver.show (уведомление с «Скопировать»).
 *
 * Приложение на экране — ничего не делаем: сигнал уже пришёл по каналу связи
 * и показан внутри NEXA. Иначе — уведомление «Устройство ищут», которое звонит
 * и вибрирует, пока его не откроют или не смахнут (FLAG_INSISTENT), но не дольше минуты.
 * Нажали — открывается NEXA и сама отвечает «Нашёл» (NexaPushPlugin → веб-часть).
 */
public class NexaMessagingService extends FirebaseMessagingService {
    static final String CHANNEL = "nexa-find";
    static final int NOTE_ID = 7001;

    @Override
    public void onMessageReceived(RemoteMessage msg) {
        Map<String, String> data = msg.getData();
        if (MainActivity.inForeground) return; // NEXA открыта — справится сама (сигнал пришёл по каналу)
        if ("clip".equals(data.get("type"))) { NexaClipReceiver.show(this, data); return; }
        if (!"find".equals(data.get("type"))) return;
        String from = data.get("from") == null ? "Ваше устройство" : data.get("from");

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Поиск устройства", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Звонит, когда это устройство ищут с другого устройства вашего аккаунта");
            ch.setSound(sound, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[] { 0, 600, 400, 600, 400, 600 });
            nm.createNotificationChannel(ch);
        }

        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        open.putExtra(NexaPushPlugin.EXTRA_TYPE, "find");
        open.putExtra(NexaPushPlugin.EXTRA_ID, data.get("id"));
        open.putExtra(NexaPushPlugin.EXTRA_FROM, from);
        PendingIntent pi = PendingIntent.getActivity(this, NOTE_ID, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_nexa)
            .setContentTitle("Устройство ищут")
            .setContentText("«" + from + "» ищет этот телефон. Нажмите — «Нашёл»")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setSound(sound)
            .setVibrate(new long[] { 0, 600, 400, 600, 400, 600 })
            .setAutoCancel(true)
            .setTimeoutAfter(60000)
            .setContentIntent(pi)
            .addAction(0, "Нашёл", pi);
        android.app.Notification n = b.build();
        n.flags |= android.app.Notification.FLAG_INSISTENT; // звонит, пока не откроют или не смахнут
        try { nm.notify(NOTE_ID, n); } catch (SecurityException ignored) { /* нет разрешения на уведомления */ }
    }

    @Override
    public void onNewToken(String token) {
        // Новый push-адрес — веб-часть заберёт его при следующем запуске (NexaPushPlugin.token)
        getSharedPreferences("nexa_push", MODE_PRIVATE).edit().putString("token", token).apply();
    }
}
