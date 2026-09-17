# Appointment shared cat

This application imports `@mrburdeveloperteam/pet-function` from GitHub tag `v0.9.10`.
Shared source is maintained in the separate `intern/pet-function` repository.

The package owns the cat/pet interface, care and game runtime, AI chat presentation,
pet options and resources, and Flappy Cat, Pac-Cat, Tetris and Meowdoku.
`src/games/MeowdokuLauncher.tsx` only supplies this application's account and adapters.

Appointment-specific dialogue and appointment queries remain in `src/components/CatMascot.jsx`.
AI orchestration remains in `src/aiExperience/appointmentsMolarAdapter.ts`.
Persistence remains in `src/petExperience/appointmentsPetRepository.ts`.
The existing account, geolocation and currency integration remains local.
No database schema or live records were modified by this migration.

`scripts/prepare-pet.mjs` restores shared non-game images before development/build.
The shared Vite plugin serves canonical package games during development and emits
identical game resources to `dist/games` during builds. No game copies remain in `public/games`.
The image URL folder `molar-experience` is historical naming, not an old dependency.

Verification:

```
npm run build
npm run typecheck
node scripts/verify-pet.mjs
```

Manually test authenticated appointment dialogue, care/shop balance persistence,
all games and rewards, Meowdoku saves/check-in, and sign-out/account switching.
Game presentation follows the shared calculator baseline, including Meowdoku's overlay.

For future shared changes, release a new version/tag, update the dependency and lockfile,
and rebuild/redeploy this application. Updating source alone does not update live deployments.
No paid service was added by the import integration.
