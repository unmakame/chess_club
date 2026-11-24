package com.unmakame.bbchess

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

private enum class Tab(val path: String, val icon: String, val title: String) {
    HALL("/", "♙", "Зал"), BOOK("/reserve", "▦", "Бронь"),
    TRAIN("/training", "♞", "Задачи"), PLAY("/?play=1", "♚", "Играть"),
    PROFILE("/profile", "♔", "Профиль")
}

internal fun serverOrigin(input: String): String? {
    val match = Regex("""https://([a-z0-9]+(?:[.-][a-z0-9]+)*)(?::([0-9]{1,5}))?/?""",
        RegexOption.IGNORE_CASE).matchEntire(input.trim()) ?: return null
    val port = match.groupValues[2]
    if (port.isNotEmpty() && port.toInt() !in 1..65535) return null
    val host = match.groupValues[1].lowercase()
    return "https://" + host + if (port.isEmpty() || port == "443") "" else ":" + port.toInt()
}

internal fun isClubUrl(url: String, server: String): Boolean =
    url == server || url.startsWith("$server/") || url.startsWith("$server?")

@Composable
internal expect fun ClubBrowser(
    server: String, destination: String, request: Int, failed: (Boolean) -> Unit, modifier: Modifier
)

@Composable
internal fun ClubApp(savedServer: String?, saveServer: (String) -> Unit) {
    var server by remember { mutableStateOf(savedServer?.let(::serverOrigin)) }
    var editing by remember { mutableStateOf(server == null) }
    var input by remember { mutableStateOf(server.orEmpty()) }
    var inputError by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf(false) }
    var tab by remember { mutableStateOf(Tab.HALL) }
    var request by remember { mutableStateOf(0) }

    MaterialTheme(colorScheme = darkColorScheme(
        primary = Color(0xFFB6D78D), onPrimary = Color(0xFF22311F),
        background = Color(0xFF202820), surface = Color(0xFF202820)
    )) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Text("bbchess", style = MaterialTheme.typography.headlineMedium)
                    Spacer(Modifier.weight(1f))
                    if (!editing) TextButton(onClick = {
                        input = server.orEmpty()
                        editing = true
                    }) { Text("Сервер") }
                }

                if (editing || server == null) {
                    Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("Адрес клуба", style = MaterialTheme.typography.headlineSmall)
                        Text("Укажите HTTPS-адрес сервера bbchess без пути.")
                        OutlinedTextField(input, { input = it; inputError = false },
                            modifier = Modifier.fillMaxWidth(), singleLine = true, isError = inputError,
                            label = { Text("https://…") })
                        if (inputError) Text("Проверьте адрес сервера.", color = MaterialTheme.colorScheme.error)
                        Button(onClick = {
                            val valid = serverOrigin(input)
                            if (valid == null) inputError = true else {
                                saveServer(valid)
                                server = valid
                                failure = false
                                tab = Tab.HALL
                                request++
                                editing = false
                            }
                        }) { Text("Подключиться") }
                        if (server != null) TextButton(onClick = { editing = false }) { Text("Назад") }
                    }
                } else {
                    val currentServer = requireNotNull(server)
                    Box(Modifier.weight(1f).fillMaxWidth()) {
                        ClubBrowser(currentServer, currentServer + tab.path, request,
                            { failure = it }, Modifier.fillMaxSize())
                        if (failure) Surface(Modifier.fillMaxSize()) {
                            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text("Клуб недоступен", style = MaterialTheme.typography.headlineSmall)
                                Text("Проверьте интернет и адрес сервера.")
                                Button(onClick = { failure = false; request++ }) { Text("Повторить") }
                                TextButton(onClick = { input = currentServer; editing = true }) { Text("Изменить адрес") }
                            }
                        }
                    }
                    NavigationBar {
                        Tab.entries.forEach { item ->
                            NavigationBarItem(selected = tab == item, onClick = {
                                failure = false
                                tab = item
                                request++
                            }, icon = { Text(item.icon) }, label = { Text(item.title) })
                        }
                    }
                }
            }
        }
    }
}
