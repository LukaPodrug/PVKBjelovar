# Submission checklist

## Required before App Store / Google Play review

- Deploy landing page so the privacy policy URL is public:
  - Current project path is `/pravila-privatnosti`.
  - Store URL: `https://pvkmladostbjelovar1934.com/pravila-privatnosti`.
- Deploy landing page so the account deletion URL is public:
  - Current project path is `/brisanje-racuna`.
  - Store URL: `https://pvkmladostbjelovar1934.com/brisanje-racuna`.
- Create at least one reviewer account in production API.
- Add reviewer credentials in:
  - App Store Connect > App Review Information
  - Google Play Console > App access
- Confirm API is deployed before building mobile app.
- Confirm mobile EAS production build uses `https://pvkbjelovar.onrender.com/api` or replace it with your final production API URL.

## Important app config review

Current local `apps/mobile/app.json` declares camera permission only.

Keep microphone permission out unless microphone/audio recording becomes intentional. If it is added later, Google Play may ask for audio data/permission justification.

Recommended Android permissions:

```json
"permissions": [
  "android.permission.CAMERA"
]
```

The local iOS value below is appropriate if the app only uses standard HTTPS encryption:

```json
"ITSAppUsesNonExemptEncryption": false
```

## Build commands

Preview Android APK:

```bash
cd apps/mobile
eas build --platform android --profile preview
```

Production Android:

```bash
cd apps/mobile
eas build --platform android --profile production
```

Production iOS:

```bash
cd apps/mobile
eas build --platform ios --profile production
```

## Reviewer account suggestion

Create a parent account if you want reviewers to see the most complete normal user flow:

- login
- children selector
- schedule
- notifications
- payment QR
- profile
- delete account

Also consider creating separate player/coach accounts if Apple or Google requests deeper role testing.
