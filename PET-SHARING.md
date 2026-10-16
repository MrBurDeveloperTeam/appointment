# Appointment shared cat

Appointment and its pet-function dependency use version **0.12.2**.
The dependency and lockfile use the official v0.12.2 tag, resolving to
`8a1993a66d60087829519c053ee7de0ed3475320`. The npm build approval matches
that release commit.
No file: dependency or sibling-folder link is used.
Shared source is maintained in the separate `intern/pet-function` repository.

The package owns the cat/pet interface, care and game runtime, AI chat presentation,
pet options and resources, and the shared mini-games.
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

`scripts/prepare-pet.mjs` restores and verifies the installed release's resource
packs and copies shared non-game images before development/build.
The shared Vite plugin serves canonical package games during development and emits
identical game resources to `dist/games` during builds. No game copies remain in `public/games`.
The postbuild script splits oversized WASM and PCK files, verifies their bytes,
and patches Godot loaders to reconstruct them, including Kart Racing's shared
engine. All deployment assets must remain within 25 MiB.
The image URL folder `molar-experience` is historical naming, not an old dependency.

Verification:

```
npm run build
npm run typecheck
npm test -- --run
node scripts/verify-pet.mjs
node --test tests/cloudflare-game-assets.node-test.mjs
```

Manually test authenticated appointment dialogue, care/shop balance persistence,
all games and rewards, Meowdoku saves/check-in, and sign-out/account switching.
Game presentation follows the shared calculator baseline, including Meowdoku's overlay.

For future shared changes, release a new version/tag, update the dependency and lockfile,
and rebuild/redeploy this application. Updating source alone does not update live deployments.
No paid service was added by the import integration.

The resource verification compares every emitted game file with the installed
release, reconstructs split WASM/PCK byte-for-byte, and checks the deployment
asset size limit. Run it after the production build.
These checks do not require real database or AI calls. No database migration is
required for this version update.
Commit the manifest, regenerated lockfile, resource scripts, documentation and
regression tests together. Generated dist and public/pet-function stay untracked.
