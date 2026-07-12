# Mobile App

Expo React Native starter for the future PVK Mladost Bjelovar mobile app.

Current starter scope:

- shared mobile login for `ADMIN`, `COACH`, `PARENT`, and `PLAYER`
- required first-login password change flow
- role-based placeholder home screens for later feature expansion
- editable API base URL for simulator or physical-device testing

## Run

From the monorepo root:

```bash
npm run dev:mobile
```

Or directly inside the workspace:

```bash
npm run start --workspace @water-polo-club/mobile
```

If you test on a physical device, replace `127.0.0.1` with the local IP address of the machine running the API.
