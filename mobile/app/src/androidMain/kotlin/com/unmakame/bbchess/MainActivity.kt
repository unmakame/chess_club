package com.unmakame.bbchess

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val settings = getSharedPreferences("bbchess", MODE_PRIVATE)
        setContent {
            ClubApp(settings.getString("server", null)) {
                settings.edit().putString("server", it).apply()
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
internal actual fun ClubBrowser(
    server: String, destination: String, request: Int, failed: (Boolean) -> Unit, modifier: Modifier
) {
    val currentServer = rememberUpdatedState(server)
    val reportFailure = rememberUpdatedState(failed)
    val lastLoad = remember { mutableListOf<Any>() }

    AndroidView(modifier = modifier, factory = { context ->
        WebView(context).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url.toString()
                    if (url == "about:blank" || isClubUrl(url, currentServer.value)) return false
                    if (request.isForMainFrame && request.url.scheme == "https") {
                        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                    }
                    return true
                }

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame) reportFailure.value(true)
                }

                override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                    if (request.isForMainFrame && response.statusCode >= 500) reportFailure.value(true)
                }
            }
        }
    }, update = { view ->
        val load = listOf(destination, request)
        if (lastLoad != load) {
            lastLoad.clear()
            lastLoad.addAll(load)
            view.loadUrl(destination)
        }
    }, onRelease = { it.destroy() })
}
