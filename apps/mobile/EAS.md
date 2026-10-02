# Building the app on your phone (EAS development build)

Expo Go cannot run Nomi's voice capture or bill reminders, because they need native modules it does not include. A **development build** is the real Nomi app with those modules, plus a dev menu that connects to your computer for live reloading. Expo builds it in the cloud, so you do not need Android Studio or Xcode.

Android is the quickest: you get an `.apk` file and install it directly. iOS needs a paid Apple Developer account ($99/year).

## One-time setup

1. Make a free account at https://expo.dev.
2. On your computer, in the repo: `npm install` then `npm install -g eas-cli`.
3. `cd apps/mobile && eas login`
4. `eas init` (creates the project on expo.dev and writes its id into `app.json`; commit that change).
5. Optional now, needed for sign-in and backup: add your Supabase settings so they are built in. They are public values, not secrets:
   ```
   eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR-REF.supabase.co --environment development --visibility plaintext
   eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value YOUR-ANON-KEY --environment development --visibility plaintext
   ```
   Skip this and the app runs fully on the phone with no sign-in (still the normal first-run flow).

## Build and install (Android)

```
npm run build:dev:android -w @nomi/mobile      # from the repo root; or: cd apps/mobile && eas build --profile development --platform android
```
The first build takes roughly 10 to 20 minutes and asks to create an Android keystore: say yes and let Expo manage it. When it finishes, the terminal shows a link and a QR code. Open it on the phone, download the `.apk`, and allow "install unknown apps" for your browser when asked.

## Run it

On your computer: `npm run start:dev -w @nomi/mobile`. Open the Nomi app you just installed (not Expo Go), and it finds the dev server on the same Wi-Fi; if not, enter the URL shown in the terminal. Edits to the code reload on the phone.

Use `npx expo start --dev-client --tunnel` if your network blocks phone-to-computer connections.

## What to check on the phone

- **Voice:** tap the mic, allow the microphone and speech permissions, say "spent 450 on lunch". Try Bangla too; recognition quality on your phone is the main unknown.
- **Reminders:** Profile, Notifications, turn on, allow notifications. Add a bill due today or tomorrow in Planning and check the list shows it. (Reminders fire at the hour you pick.)
- **Export:** Profile, Privacy and data, export JSON and CSV; the share sheet should open.
- Everything works offline: turn on airplane mode and record something.

## iOS

`npm run build:dev:ios -w @nomi/mobile` needs the Apple Developer account and registering your iPhone (`eas device:create`). Or use `eas build --profile development-simulator --platform ios` for the iOS Simulator on a Mac.

## Other profiles

- `preview`: an installable build without the dev menu, for trying the app like a user would.
- `production`: store builds. Not ready until the first-deploy checklist in `supabase/README.md` is done and the app has real icons and store listings.

## If a build fails

Open the build page on expo.dev and read the log from the bottom. Common causes: not logged in, the `eas init` step skipped, or a package version mismatch (`npx expo install --check` fixes versions). Send me the last 30 lines of the log.

## Building on your own computer instead (Android, Windows)

No Expo account needed. It takes longer to set up the first time, then builds in a few minutes.

1. **Android Studio** (https://developer.android.com/studio). On first launch let it install the SDK, then in *Settings, Languages & Frameworks, Android SDK* tick **SDK Platform 35** (or the newest), and in *SDK Tools* tick **Android SDK Build-Tools**, **Platform-Tools**, **NDK (Side by side)** and **CMake**.
2. **JDK 17** (Android Studio ships one; or install Temurin 17). Check with `java -version`.
3. Set environment variables (Windows Settings, search "environment variables"), then open a **new** PowerShell:
   - `ANDROID_HOME` = `C:\Users\<you>\AppData\Local\Android\Sdk`
   - add `%ANDROID_HOME%\platform-tools` to `Path`
4. In PowerShell, from the repo:
   ```
   git pull origin claude/track-expense
   npm install
   cd apps\mobile
   npx expo prebuild --platform android --clean
   cd android
   .\gradlew.bat assembleRelease
   ```
   Keep the repo path short (yours, `J:\nomi`, is fine): Windows' path-length limit breaks native builds in deep folders.
5. The APK is at `apps\mobile\android\app\build\outputs\apk\release\app-release.apk`. Copy it to the phone (USB, Drive, or `adb install app-release.apk` with USB debugging on) and open it. Allow "install unknown apps" when asked.

This is a **standalone** build: the app code is inside it, so it runs without your computer. It is signed with a debug key, which is fine for your own phone but not for the Play Store.

To get a development build instead (live reload, connects to `npm run start:dev`), use `.\gradlew.bat assembleDebug`; the file is under `outputs\apk\debug\`.

If Gradle fails, the last 40 lines before `FAILURE: Build failed` are what I need. Common ones: `ANDROID_HOME` not set, a missing NDK or CMake (install it in SDK Tools), or "path too long".
