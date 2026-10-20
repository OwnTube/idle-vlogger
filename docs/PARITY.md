# Fidelity and remaining work

This is an initial playable reconstruction, not a finished 1:1 game port.

| System | Current status | Remaining work |
| --- | --- | --- |
| Original asset identity | APK hash and per-pack hashes recorded | Compare against an unmodified official APK if supplied |
| Lamar animation | Full original Spine rig/timelines; original 112 outfit maps | Compare poses, transitions, attachment conditions and scale against Android |
| World artwork | Eight areas, original prefab positions, pivots, scales and layer metadata | Verify sorting-layer interpretation, camera fit, variant conditions, clouds and animated props |
| UI | Original icons/font with a new HTML layout | Reproduce the complete original layout, dialogs, animation and navigation |
| Income and costs | Native item-income/cost arithmetic checked across all levels and discounts | Income aggregation, starting state and complete balance remain provisional; see `NATIVE-RULES.md` |
| Subscriber progression | Original stage values | Reconstruct reward claims, formulas and all stage transitions |
| Upgrade effects | All 16 price/value functions checked; eight effects connected; purchases spend gold | Gold reward sources and remaining effects are missing; activation conditions/integration need native checks |
| Holding/battery | Fixed-step tap interval, drain and restoration | Compare exact native formulas and edge conditions |
| Area progression | Eight regions, upgrade-based relocation | Verify native locks, rewards, timing and all region transitions |
| Story scenes/choices | Original full/choice/short introductions, three animated actors, intertitles, replay and saved decisions; 60 scene scripts and 71 English dialogue assets recovered | Remaining campaign scenes/choices, requirements/rewards, triggers, camera, UI and native comparison; intro grounding/presentation are reconstructed |
| Tasks/events/pets/races | Some configuration/art recovered | Gameplay not implemented |
| Audio | Original music and selected effects via Web Audio | Complete all native sound triggers and levels |
| Saves | Browser IndexedDB, bounded offline income, JSON export/import | Android save conversion is not supported; four-hour offline cap is provisional |
| Graphics | Browser PixiJS WebGL renderer | WebGPU is not implemented; verify on current mobile browsers |
| Input | Pointer/touch events, Space, gamepad A | Real device/gamepad testing and remaining bindings |
| Network SDKs/store | Native SDKs are not loaded | Ads, purchases and online services are not reproduced |

The six reported singular-matrix sprite export failures are retained in `public/game/extraction-report.json`. The complete Spine character textures and attachment mappings are present and tested separately. Those failures are not silently counted as successful exports.

Acceptance for a finished reconstruction requires original/native comparison, story/event implementation, gameplay formula validation, a complete progression playthrough, and checks on current desktop and mobile browsers. Passing build/unit/browser smoke tests alone does not establish parity.

## Requested follow-up: widescreen

After the remaining game systems and parity work are complete, attempt an optional widescreen modification: expand the world camera viewport, adapt scene boundaries/background coverage, rearrange the HUD and menus for desktop, and retain portrait mode for phones. Verify cutscenes, pointer coordinates, upgrades, saves and region transitions in both layouts. Do not count the current centered portrait canvas as widescreen support.
