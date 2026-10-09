package ru.nexalink.app;

import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Ползунок прокрутки страницы в приложении рисует сам Android, а не
        // страница — поэтому CSS его не красит. Делаем его мятным (как на сайте):
        // тонкая скруглённая полоска, мятный цвет NEXA с прозрачностью 70%
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            WebView webView = getBridge().getWebView();
            GradientDrawable thumb = new GradientDrawable();
            thumb.setColor(0xB300FFDF);
            thumb.setCornerRadius(999f);
            webView.setVerticalScrollbarThumbDrawable(thumb);
        }
    }
}
