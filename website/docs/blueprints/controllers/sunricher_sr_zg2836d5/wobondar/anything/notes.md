### Operating Modes

This is a multi-function rotary remote with two operating modes and 20 configurable actions:

**Color Mode** (enter: center + scene 1 button): Center button toggles on/off. Rotary controls brightness by default. Double press center button to cycle sub-modes: brightness (1x LED blink) -> color temperature (2x) -> color hue (3x) -> brightness.

**Cover Mode** (enter: center + scene 2 button): Center button short press cycles through open/close/stop. Rotary right sends open then stop, rotary left sends close then stop.

Additionally, 4 scene buttons support short press (recall) and hold (store).

### Continuous Mode

The blueprint supports an optional **continuous mode** for each color sub-mode (brightness, color temperature, color hue). When enabled, the action loops continuously while you keep rotating, and stops when rotation stops.

- **Without continuous mode** (default): Each rotary click fires your custom action once. The Z2M payload data is auto-extracted into variables (see below).
- **With continuous mode enabled**: The blueprint ignores Z2M's `action_step_size` and loops the action at a fixed pace (configurable via delay setting), using the configured step size.

Configure these options in the **Rotary & Continuous Mode options** section (collapsed by default).

**Note:** Keep custom actions fast (simple service calls) when using continuous mode, as slow actions (>250ms) may be interrupted by the loop timeout.

### Step Size & Payload Variables

**Note:** Configured step size variables (brightness_step_size, etc.) only take effect if you reference them in your custom actions. Setting a value without using `{{ variable_name }}` in your action template has no effect.

**Note:** In continuous mode, `action_step_size` and `action_transition_time` reflect the **first** rotation event's payload. Subsequent events caught by the loop do not update these variables.

### Known Limitations

Due to `mode: single` (required for the continuous loop pattern):

- **Fast rotation without continuous mode**: Events arriving while the previous action is still executing are silently dropped. Enable continuous mode if you need smooth fast rotation.
- **Direction reversal**: Reversing rotation mid-loop may lose the first reversed step while the current loop finishes (within the configured delay).
- **Cover mode rotary**: The device sends open/close then stop in rapid succession. The stop event may be dropped. Use the center button for reliable stop.
