package com.adityapu17.genshintracker;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Cangkang tipis: menampilkan app web (Cloudflare Pages) di WebView layar penuh.
 * Satu hal yang tidak bisa dilakukan web biasa: membuka game Genshin Impact.
 * Itu disediakan lewat jembatan JavaScript "AndroidApp.openGame()".
 */
public class MainActivity extends Activity {
    private static final String GAME_PACKAGE = "com.miHoYo.GenshinImpact";

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final String home = getString(R.string.app_url);
        final String homeHost = Uri.parse(home).getHost();

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0F1424"));
        setContentView(web);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true); // localStorage: cookie HoyoLab yang disimpan app
        settings.setSupportZoom(false);

        web.addJavascriptInterface(new GameBridge(), "AndroidApp");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (homeHost != null && homeHost.equals(url.getHost())) {
                    return false; // halaman app sendiri tetap di dalam WebView
                }
                try { // link luar (mis. HoyoLab, Play Store) dibuka di browser / app terkait
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(home);
        }
    }

    /** Dipanggil dari JavaScript sebagai AndroidApp.openGame(). */
    private class GameBridge {
        @JavascriptInterface
        public boolean openGame() {
            final Intent launch = getPackageManager().getLaunchIntentForPackage(GAME_PACKAGE);
            if (launch == null) {
                return false; // game belum terpasang
            }
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    startActivity(launch);
                }
            });
            return true;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    // Gesture/tombol back: mundur di riwayat app (mis. tutup detail karakter), baru keluar kalau sudah di awal
    @Override
    public void onBackPressed() {
        if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
