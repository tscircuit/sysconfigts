# CC2340 pedometer reference

`pedometer.syscfg` is transcribed from the configuration Anas Sarkiz supplied
on 29 September 2026, quoting Seve's pedometer development notes for
[seveibar/pedometer](https://tscircuit.com/seveibar/pedometer#files).
Markdown escaping was removed and whitespace normalized. It is **not** an
unchanged downloaded TI file. No SDK source or generated firmware is included.
Round-trip tests compare against this committed transcription, not unseen
original bytes. The board's current connections have not been verified here.

## Header identity

| Field | Recorded value |
| --- | --- |
| Device in `@cliArgs` | `CC2340R5RGE` |
| Device in `@v2CliArgs` | `CC2340R5` |
| Package / v2 package | `RGE` / `VQFN (RGE)` |
| Part / RTOS | `Default` / `freertos` |
| SDK product | `simplelink_lowpower_f3_sdk@9.21.00.36` |
| Creation tool | `1.26.3+4558` |

These are recorded header strings, not a verified orderable manufacturer part
number or evidence of a local TI run. Both CLI headers are preserved as trivia.

The fixture exercises six GPIO instances, one I2C instance, BLE settings,
FreeRTOS settings, NVS, and nested AES/DMA assignments. Identifiers such as
`DIO6_A1_AR+` remain whole strings; this package does not infer package positions
from their suffixes. Omitted GPIO settings remain omitted rather than being
filled with guessed defaults. `I2C0` is a suggestion, not a fixed assignment.

## Verification scope

Parser round-trip, controlled edits, ordered inspection, and deterministic SVG
preview are automated tests. They do not execute scripts or TI SDK modules.

**Real TI generation, firmware compilation, and hardware execution: NOT RUN.**
The tests do not need a TI installation. Before using this as a hardware or
converter acceptance baseline, open the original or this documented copy in
CCStudio with the recorded SDK/tool, verify the actual pedometer wiring, save
it, generate configuration code, and repeat for the round-tripped copy. Preserve
the native export, diagnostics, and generated outputs independently. A preview
SVG is not a resolved pinout or evidence of TI acceptance.
