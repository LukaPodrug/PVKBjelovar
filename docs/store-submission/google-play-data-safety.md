# Google Play Data safety answers

Google Play requires every app to complete the Data safety form and provide a privacy policy URL. Google says developers are responsible for declaring collection, sharing, security practices, deletion options, and third-party SDK handling.

## Privacy policy

Privacy policy URL:
- `https://pvkmladostbjelovar1934.com/pravila-privatnosti`

Account deletion URL:
- `https://pvkmladostbjelovar1934.com/brisanje-racuna`

## Data collection and sharing

Does your app collect or share user data?

Answer: Yes.

Is all user data collected by your app encrypted in transit?

Answer: Yes.

Do you provide a way for users to request that their data is deleted?

Answer: Yes.

Deletion mechanism:
- In-app account deletion is available in the mobile app profile/account screen.
- Users may also contact the club.
- Public deletion instructions are available at `https://pvkmladostbjelovar1934.com/brisanje-racuna`.

Does your app share user data with third parties?

Answer: No for sale/advertising/data broker sharing.

Note: Service providers such as hosting, database, email, push notification, and app distribution providers process data to operate the app. This is service-provider processing, not advertising sale.

## Data types

### Personal info

Name:
- Collected: Yes
- Shared: No
- Processed ephemerally: No
- Required or optional: Required for club account/member records
- Purpose: App functionality, Account management

Email address:
- Collected: Yes
- Shared: No
- Processed ephemerally: No
- Required or optional: Required for most parent/coach/admin accounts
- Purpose: App functionality, Account management

Phone number:
- Collected: Yes
- Shared: No
- Processed ephemerally: No
- Required or optional: Optional or based on club records
- Purpose: App functionality, Account management

User IDs:
- Collected: Yes
- Shared: No
- Processed ephemerally: No
- Required or optional: Required
- Purpose: App functionality, Account management

### App activity

App interactions / Other app activity:
- Collected: Yes
- Shared: No
- Processed ephemerally: No
- Required or optional: Required for app functionality
- Purpose: App functionality
- Examples: attendance records, notification read state, QR attendance actions.

### App info and performance

Crash logs / Diagnostics:
- Answer No unless you add a crash reporting SDK or actively collect/export crash diagnostics.

### Device or other IDs

Device or other IDs:
- Collected: Yes, Expo push notification token
- Shared: No
- Processed ephemerally: No
- Required or optional: Optional, depending on notification permission
- Purpose: App functionality

### Financial info

Payment info:
- Recommended answer: No.
- Reason: The app creates a bank payment QR template and does not process payment cards, bank transactions, or payment confirmations.

### Photos and videos / Audio

Photos and videos:
- Collected: No by the mobile app.

Audio files / voice recordings:
- Collected: No.

Current mobile config declares camera permission only. Keep microphone permission out unless the app adds an actual audio-recording feature.

## Permissions declaration

Camera:
- Purpose: QR code scanning for attendance.
- User-facing explanation: Kamera se koristi za skeniranje QR kodova za evidenciju dolazaka na trening.

Notifications:
- Purpose: training and club notifications.

Microphone:
- Not used by the app.
