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

By default, development uses the deployed API at `https://pvkbjelovar.onrender.com/api`.
