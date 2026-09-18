# Appointment shared cat

The manifest targets `github:mrburdeveloperteam/pet-function#v0.9.12`.
The dependency and lockfile now use the official v0.9.12 tag, resolving to
`a8033bf4aae9c0f53e9f0fca1776efc36ea93e7b`. Installed node_modules is version
0.9.12 from GitHub, not the earlier local verification tarball.
No file: dependency or sibling-folder link is used.
Shared source is maintained in the separate `intern/pet-function` repository.

The package owns the cat/pet interface, care and game runtime, AI chat presentation,
pet options and resources, and Flappy Cat, Pac-Cat, Tetris and Meowdoku.
`src/games/MeowdokuLauncher.tsx` only supplies this application's account and adapters.

Appointment-specific dialogue is in pet-function/src/apps/AppointmentCatMascot.jsx.
AI orchestration, data-chat providers/router/follow-ups, proactive rules and their
minute-aligned React hook are in pet-function/src/apps/appointment/.
Pet persistence is in pet-function/src/apps/repositories/appointment.ts.
Simulator configuration reads, support presentation and visit/currency logic are shared.
The corresponding 35 old host modules are retained as line comments between
PET_FUNCTION_ARCHIVE_BEGIN and PET_FUNCTION_ARCHIVE_END, followed by thin imports.
Do not uncomment old implementations alongside shared code.

Authentication/SSO, active clinic selection, business data loading, navigation and
server AI transports remain host-owned and are injected into the package.
Existing account/clinic remount boundaries and patient-local schedule answers are preserved.
No database schema or live records were modified by this migration.

`scripts/prepare-pet.mjs` restores shared non-game images before development/build.
The shared Vite plugin serves canonical package games during development and emits
identical game resources to `dist/games` during builds. No game copies remain in `public/games`.
The image URL folder `molar-experience` is historical naming, not an old dependency.

Verification:

```
npm run build
npm run typecheck
npm test -- --run
node scripts/verify-pet.mjs
```

Manually test authenticated appointment dialogue, care/shop balance persistence,
all games and rewards, Meowdoku saves/check-in, and sign-out/account switching.
Game presentation follows the shared calculator baseline, including Meowdoku's overlay.

For future shared changes, release a new version/tag, update the dependency and lockfile,
and rebuild/redeploy this application. Updating source alone does not update live deployments.
No paid service was added by the import integration.

Validated locally: production build, typecheck, 78 existing host tests, 28 shared
package tests (including 9 Appointment parity/safety tests), and all 82 game files.
No real database or AI calls were made for these tests. No commit/push/publication/deploy.
Official v0.9.12 dependency installation and lockfile update are complete.
Commit the manifest AND regenerated lockfile along with the migration after review.
