# bbchess для iPhone и Android

Мобильный клиент на Kotlin Multiplatform и Compose Multiplatform. Вкладки и экран настроек общие для обеих платформ. iOS использует WKWebView, Android — системный WebView. Короткая точка входа iOS написана на Swift и запускает экран из Kotlin.

Сайт, сервер Flask и PostgreSQL остаются в корне репозитория. Мобильный клиент подключается к тому же серверу. В настройках укажите HTTPS-адрес bbchess без пути. Адрес можно изменить кнопкой «Сервер».

## iOS

На Mac с Xcode 26, JDK 17 и XcodeGen откройте терминал в каталоге mobile:

```sh
chmod +x gradlew
cd iosApp
xcodegen generate
open bbchess.xcodeproj
```

Выберите схему bbchess и симулятор iPhone. Для реального iPhone укажите команду подписи в Signing & Capabilities. Xcode соберёт Kotlin-фреймворк через Gradle.

## Android

На Windows с JDK 17 и установленным Android SDK 35 откройте каталог mobile в Android Studio. Выберите модуль app и устройство или эмулятор. Чтобы собрать отладочный APK из PowerShell:

```powershell
.\gradlew.bat :app:assembleDebug
```

APK появится в app/build/outputs/apk/debug/.

## Предпросмотр

Браузерная рамка телефона показывает адаптивный сайт. Работу приложения с WebKit и Android WebView проверяют в симуляторах или на устройствах.
