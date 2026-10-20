# Binary inspection and porting decision

Inspected on 2026-10-20. Findings are from the provided file, not its `.apk` suffix or the similarly named public repositories.

| Property | Finding |
| --- | --- |
| Local input path | `/workspace/scratch/6570c9b35837/input/lamar-idle-vlogger-mod_241.0.0-an1.com.apk` |
| Size | 180,074,005 bytes |
| SHA-256 | `844f057d71b892b90b489f5078c47ca2b06dcf75ee35a9b944b289031cf273f4` |
| Container magic | `50 4b 03 04` (ZIP local-file header) |
| Entries | 3,175 |
| Platform / architecture | Android; native libraries only under `lib/arm64-v8a/` |
| Native bitness / byte order | ELF64, little endian, `EM_AARCH64`, `ET_DYN` |
| Engine | Unity **2022.3.62f2**, IL2CPP |
| Animation format | Spine JSON **3.8.99** (Lamar); text atlas with 13 image pages |

An APK is an archive with no single instruction-set header. Its native libraries determine the game's CPU target; DEX is Java VM bytecode, not x86 machine code. Generated Cpp2IL DLLs later report PE/CLI headers; that does not change the original game's ARM64 architecture.

## Engine evidence

- `lib/arm64-v8a/libil2cpp.so`: **69,593,688 bytes**, ELF magic `7f 45 4c 46 02 01`, AArch64 ELF64 shared library. Its executable `il2cpp` section accompanies `.text`, `.plt`, `.rodata`, `.data.rel.ro`, `.rela.dyn` and `.rela.plt`.
- `lib/arm64-v8a/libunity.so`: **18,661,624 bytes**, same architecture. Imports `libmain.so`, `libandroid.so`, `liblog.so`, `libz.so`, `libEGL.so`, `libmediandk.so`, `libm.so`, `libdl.so`, `libc.so`.
- `lib/arm64-v8a/libmain.so`: **6,728 bytes**.
- `assets/bin/Data/data.unity3d`: **49,621,395 bytes**, `UnityFS\0` bundle magic. Its header contains `2022.3.62f2`.
- `assets/bin/Data/Managed/Metadata/global-metadata.dat`: **10,815,236 bytes**, `af 1b b1 fa`, metadata version **31**. Cpp2IL identifies layout **31.1**.
- `ScriptingAssemblies.json`, `boot.config` and Unity resource/addressable bundles corroborate the engine. There are no original managed method DLLs, C# source files or Unity Editor project settings in this APK.

`libil2cpp.so` has 30 sections and 10 program headers, including four `PT_LOAD` ranges (read-only, executable, and two writable ranges), `PT_DYNAMIC`, `PT_GNU_RELRO`, `PT_GNU_EH_FRAME`, `PT_GNU_STACK` and `PT_NOTE`. `.dynsym` contains 2,705 entries, including exported `il2cpp_init`, `il2cpp_runtime_invoke` and `il2cpp_domain_get`. A full `.symtab` is absent; `.gnu_debuglink` remains. Direct dependencies are Android/Bionic `liblog.so`, `libm.so`, `libdl.so`, `libc.so`. The inspection JSON retains sections, segments, dependencies, imports and exports for every native library.

## Source and existing-port search

The [official Google Play listing](https://play.google.com/store/apps/details?id=com.advant.streamer), [App Store listing](https://apps.apple.com/us/app/lamar-idle-vlogger/id1595314851) and [CrazyLabs game site](https://www.crazylabs.com/games/) identify the mobile game. The checked official material did not expose a downloadable web release or source project.

GitHub searches for `"Lamar" "vlogger"` and `"idle-vlogger"` found similarly named projects. `MixStudiosWeb/Lamar-Vlogger` contains a React/AI Studio app, not the Unity game's original source or a full decompilation. `otvertkahshshs-cloud/idle-vlogger` has Android Gradle sources rather than the original Unity project. No verified matching decompilation or recompilation project was found. Search absence is not proof that none exists.

## Recovery attempts and rejected routes

1. **Original Unity web export:** no Unity Editor project or original method bodies exist in the archive. Unity's web build process requires a buildable project; changing an Android library's extension cannot produce WebAssembly.
2. **IL2CPP code recovery:** ran Cpp2IL `2022.1.0-development.1743+b5ad444`, output `dll_il_recovery`, against the APK. It found code registration `0x3DB2C58`, metadata registration `0x3F19B58` and 82,699 method definitions. It reported 23,356 successfully decompiled methods. ILSpy inspection of the result revealed invalid IL, unresolved runtime calls and native pointer arithmetic in game services. For example, `StuffsIncomeService.InitImpl` decompiled to `object obj = this + 24;` and `NoteDecompilerIssue("Method not found @1B9A1FC")`. Its success percentage is not a buildability or correctness result.
3. **Static ARM64 recompilation:** a complete translation would also need the Unity runtime and Android/IL2CPP ABI, engine calls, graphics, audio, lifecycle, reflection and generic instantiations. No verified recompiler covering this target was found. N64Recomp and XenonRecomp target different machines. REA/Ghidra help analyze code; neither supplies an Android Unity-to-Emscripten runtime. This project does not claim to implement a whole-program ARM64 recompiler.
4. **Browser emulation:** js-dos, v86, BoxedWine and console emulators do not supply the required ARM64 Android Unity environment for this APK. No suitable working browser emulator was established.
5. **User-authorized fallback:** recover the actual assets/configuration and implement new browser systems, following the asset-based reconstruction approach in [Vheissu's PORTING.md](https://github.com/Vheissu/hit-and-run-web/blob/main/docs/PORTING.md). That project is an architectural reference, not source code for Lamar.

**Chosen route: original-asset browser reconstruction because no buildable original source recovery or suitable existing browser runtime was established.** Emscripten is not part of this route and was not installed or represented as a successful build tool.

## REA and Ghidra

The user supplied [morluto/rea](https://github.com/morluto/rea). Installed `rea-agents` 6.7.0 and used `inspect-managed-members` to examine `StuffsIncomeService` in the Cpp2IL-generated assembly. This retained a PE/CLI member inventory and artifact digest. The current GitHub documentation describes an `inspect-il2cpp-metadata` command absent from that npm release; the release refused that command. An attempt to build the newer source was blocked by automatic approval review for attempted Vercel telemetry. It was not bypassed.

Ghidra 12.1.4, Java 21, PyGhidra and GhidraMCP 2.0 were installed. GhidraMCP successfully started its local MCP server, imported `libil2cpp.so` and began analysis. Whole-binary auto-analysis was stopped; no completed Ghidra whole-program decompilation is claimed. REA's native provider refused this container's process-ownership `ps` check; its guard was not bypassed. Cheat Engine was not needed and was not used.

## Selected native calculations

After choosing reconstruction, Cpp2IL's `attributeinjector` output was used to locate four small ARM64 rule functions and recover their field offsets. Capstone inspection and isolated Unicorn execution established numerical fixtures for every item level, all upgrade price/value ranges and all cost-discount levels. `src/rules.js` now matches those results exactly. This is calculation recovery, not a whole-program recompilation; see [native evidence and reproduction](NATIVE-RULES.md).
