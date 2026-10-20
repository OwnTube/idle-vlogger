# Native calculation evidence

The first prototype guessed item costs and income tiers, reversed the two first upgrade IDs, charged cash instead of gold, and omitted part of the upgrade cost expression. Those behaviors have been corrected. `src/rules.js` preserves single-precision operations and is checked against original ARM64 instructions.

## Reference execution

`tools/verify_native_rules.py` loads this APK's original `libil2cpp.so` ELF segments into Unicorn 2.1.4 and executes four calculation functions. It constructs synthetic IL2CPP objects using field offsets recovered from the metadata. It does not execute Android, the complete game, SDKs or Unity's renderer.

| Function | File offset | ELF virtual address | Tested cases |
| --- | --- | --- | --- |
| `StuffsIncomeService.GetTotalIncome` | `0x1E7463C` | `0x1E7863C` | Levels 0–600; 600 clamps to the native maximum 599 |
| `StuffsCostService.GetLvlCost` | `0x1E74130` | `0x1E78130` | Levels 0–599; all six cost-discount levels |
| `UpgradesService.UpdateCost` | `0x1E51170` | `0x1E55170` | All configured levels for all 16 IDs |
| `UpgradesService.UpdateValue` | `0x1E515F0` | `0x1E555F0` | All configured levels for all 16 IDs |

Cpp2IL's injected `RVA`/`Offset` attributes for this ELF contain file offsets. The executable ELF segment adds `0x4000` to obtain these virtual addresses. The verifier loads segments at their actual virtual addresses. This distinction avoids accidentally disassembling unrelated code.

Hooks supply generic-array interface access, upgrade-config lookup, `Lazy<UpgradesService>.Value`, `powf` and `modf`. Floating-point arithmetic, branching, recurrence, caching and rounding inside the selected functions execute as original ARM64 instructions. The `powf` hook uses the host math implementation rounded to float32; it is not an independent check of Android's libm implementation. Fixture provenance and exact APK/library hashes are recorded in `tests/fixtures/native-rules.json`.

The JavaScript tests compare exact numerical results against 601 income cases, 600 regular cost cases, 3,600 discounted cost cases, and every configured upgrade price/value. Native `ConfigArea.MaxLvl` is `Count * LvlsInArea - 1`, hence 599. Browser purchases stop there; legacy saves containing level 600 remain readable and income clamps to 599.

## Recovered behavior

- Upgrade IDs 0/1 are passive/tap income; 12/13 are their second multipliers. IDs 7/8 affect recharge/duration, 9 subscriber speed, and 14 item prices. The browser exposes these eight functioning effects.
- Upgrade costs use either `CostBase + CostDelta * level`, or `CostExtraOffset + CostExtraMult * (pow(CostDelta, level + 1) - 1)`, with float32 operations and ties-to-even rounding. Original first passive/tap prices are 4/3 gold.
- Values use either `ValueBase * pow(ValueDelta, level)` or `ValueBase + ValueDelta * level`, with float32 operations.
- Item costs include an exponential term multiplied by the area's income multiplier, a linear level term, a base offset, the native tier factor, and the cost-discount upgrade. Costs remain fractional cash values. Level 1 costs about $0.11, not the prototype's rounded $1.
- The original income function divides the **area index** by `LvlsInTier` in its tier branch. The browser preserves the observed instructions instead of substituting a visually plausible tier formula.
- The original purchase-readiness code reads `ModelGame.Gold`. Upgrade purchases now deduct gold; item purchases deduct cash. Gold reward sources are not yet restored and a fresh browser save starts at zero gold.

## Reproduce

After extracting the browser assets:

```sh
python3 -m pip install -r tools/requirements-analysis.txt
python3 tools/verify_native_rules.py /absolute/path/game.apk
npm test
```

The verifier refuses an APK whose SHA-256 differs from the inspected input, because these addresses and layouts are build-specific. The generated fixture contains numerical results, not an executable copy of the library.

This does **not** establish whole-game balance. The browser's baseline income, active-item counting and income aggregation, subscriber formulas/rewards, upgrade activation conditions, battery integration, starting state, locks, relocation and offline behavior still need native comparison. No complete Android playthrough or visual comparison has been performed.
