# Lamar – Idle Vlogger: browser reconstruction

An **initial playable reconstruction**, built from the supplied Android game's original sprites, Spine animation rig, scene transforms and serialized configuration. The Android executable and Unity engine do **not** run in the browser. This is **not yet a complete 1:1 port**: gameplay formulas, scene composition, story playback and later systems need parity work.

## Run

```sh
npm ci
npm run dev
```

Open the URL Vite prints. Tap or hold the scene to earn money; Space and gamepad A also record. Use the bottom menus to buy property, equipment, style and skill upgrades. Settings contains music, sound, save export/import and fullscreen. Saves are local to the browser and origin.

```sh
npm test
npm run build
npm run preview
```

`dist/` is the standalone static build. Serve it over HTTPS or localhost; loading by `file://` is unsupported. It needs no backend or external asset CDN. CI builds an artifact without publishing a site.

## What is original and what is reconstructed

Original: the full Lamar Spine 3.8 rig and animation timelines, 112 outfit/attachment mappings, UI sprites, fonts, music and selected sound effects, eight areas' sprite layers/transforms/pivots, and serialized configuration values. The extraction manifest identifies the input APK by SHA-256.

New browser code: PixiJS WebGL rendering, scene/attachment selection, game rules, UI layout, input, audio playback, fixed-step simulation and persistence. Original configuration values do not prove that a newly written formula matches native behavior. Read [the parity checklist](docs/PARITY.md) before treating this as an accurate preservation build.

The asset payload is about 53 MB. Independent packs are at most 4 MiB. Loading streams each response with byte progress, checks its SHA-256, and exposes files through a virtual filesystem. Area packs load on demand. JSON and WAV files are gzip compressed inside the packs; images are lossless WebP. The original Android ASTC textures are decoded during extraction, not on the user's device.

## Inspection and route

**Route: asset-based browser reconstruction, because native IL2CPP recovery produced invalid C# and no buildable original Unity project or official web build was found.**

- [Format, architecture, engine evidence and route evaluation](docs/PORTING.md)
- [Machine-readable ZIP/ELF/DEX inspection](docs/inspection.json)
- [Known fidelity gaps](docs/PARITY.md)
- [Tool and validation record](docs/VALIDATION.md)
- [Resource extraction failures](public/game/extraction-report.json)

## Reproduce the assets from a local APK

The APK itself is not committed. The extraction tool does not launch it. Install Python dependencies from `tools/requirements.txt`, then produce serialized-field layout DLLs with Cpp2IL. The tested build was `2022.1.0-development.1743+b5ad444` (commit `b5ad444b82267cb1e4b88b8b373c008105bdea52`).

```sh
python3 -m pip install -r tools/requirements.txt
Cpp2IL --game-path /absolute/path/game.apk \
  --use-processor attributeanalyzer --output-as dll_empty \
  --output-to .local/layout-dlls
python3 tools/inspect_apk.py /absolute/path/game.apk
python3 tools/extract.py /absolute/path/game.apk \
  --layout-dlls .local/layout-dlls --out public/game
npm test
```

Layout DLLs have empty methods; they recover field definitions/attributes needed to deserialize resources. They are **not recovered game source**. The separate `dll_il_recovery` attempt is documented in `docs/PORTING.md`.

## Browser checks

```sh
npx playwright install chromium
npm run test:browser
```

For an already installed Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. The test launches a local server and browser in the same process environment, records income, purchases an upgrade, reloads a persisted save, exports/imports a save and checks invalid input. It writes internal screenshots and a result under `.local/`.

Native Android comparisons, a full campaign playthrough, real mobile touch hardware and gamepad hardware have not been verified. See `docs/VALIDATION.md` for exactly which checks passed.

Original game assets remain the property of their original owners. Dependency licenses, including the Spine runtime license, remain applicable; see [third-party notes](THIRD_PARTY.md).
