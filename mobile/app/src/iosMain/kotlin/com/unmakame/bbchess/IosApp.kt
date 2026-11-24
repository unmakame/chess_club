package com.unmakame.bbchess

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.interop.UIKitView
import androidx.compose.ui.window.ComposeUIViewController
import kotlinx.cinterop.ExperimentalForeignApi
import platform.CoreGraphics.CGRectMake
import platform.Foundation.NSError
import platform.Foundation.NSHTTPURLResponse
import platform.Foundation.NSURL
import platform.Foundation.NSURLRequest
import platform.Foundation.NSUserDefaults
import platform.UIKit.UIApplication
import platform.WebKit.WKNavigation
import platform.WebKit.WKNavigationAction
import platform.WebKit.WKNavigationActionPolicy
import platform.WebKit.WKNavigationDelegateProtocol
import platform.WebKit.WKNavigationResponse
import platform.WebKit.WKNavigationResponsePolicy
import platform.WebKit.WKWebView
import platform.WebKit.WKWebViewConfiguration
import platform.darwin.NSObject

fun MainViewController() = ComposeUIViewController {
    val settings = NSUserDefaults.standardUserDefaults
    ClubApp(settings.stringForKey("bbchess.server")) { settings.setObject(it, forKey = "bbchess.server") }
}

@OptIn(ExperimentalForeignApi::class)
@Composable
internal actual fun ClubBrowser(
    server: String, destination: String, request: Int, failed: (Boolean) -> Unit, modifier: Modifier
) {
    val currentServer = rememberUpdatedState(server)
    val reportFailure = rememberUpdatedState(failed)
    val lastLoad = remember { mutableListOf<Any>() }
    val delegate = remember {
        object : NSObject(), WKNavigationDelegateProtocol {
            override fun webView(
                webView: WKWebView,
                decidePolicyForNavigationAction: WKNavigationAction,
                decisionHandler: (WKNavigationActionPolicy) -> Unit
            ) {
                val address = decidePolicyForNavigationAction.request.URL
                val url = address?.absoluteString.orEmpty()
                if (url == "about:blank" || isClubUrl(url, currentServer.value)) {
                    decisionHandler(WKNavigationActionPolicy.WKNavigationActionPolicyAllow)
                } else {
                    decisionHandler(WKNavigationActionPolicy.WKNavigationActionPolicyCancel)
                    if (address?.scheme == "https" && decidePolicyForNavigationAction.targetFrame?.mainFrame != false) {
                        UIApplication.sharedApplication.openURL(address, options = emptyMap<Any?, Any>(), completionHandler = null)
                    }
                }
            }

            override fun webView(
                webView: WKWebView,
                decidePolicyForNavigationResponse: WKNavigationResponse,
                decisionHandler: (WKNavigationResponsePolicy) -> Unit
            ) {
                val response = decidePolicyForNavigationResponse.response as? NSHTTPURLResponse
                if (decidePolicyForNavigationResponse.forMainFrame && response != null && response.statusCode >= 500) {
                    reportFailure.value(true)
                }
                decisionHandler(WKNavigationResponsePolicy.WKNavigationResponsePolicyAllow)
            }

            override fun webView(webView: WKWebView, didFailProvisionalNavigation: WKNavigation?, withError: NSError) {
                if (withError.code != -999L) reportFailure.value(true)
            }
        }
    }
    UIKitView(
        factory = {
            WKWebView(CGRectMake(0.0, 0.0, 0.0, 0.0), WKWebViewConfiguration()).apply {
                navigationDelegate = delegate
            }
        },
        modifier = modifier,
        update = { view ->
            val load = listOf(destination, request)
            if (lastLoad != load) {
                lastLoad.clear()
                lastLoad.addAll(load)
                view.loadRequest(NSURLRequest(URL = NSURL(string = destination)))
            }
        },
        onRelease = { view -> view.stopLoading(); view.navigationDelegate = null }
    )
}
