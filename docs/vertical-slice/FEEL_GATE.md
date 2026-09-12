# Vertical Slice A — Feel Gate verification

This gate is ready for device playtest when all automated checks pass and the following manual checks have been performed.

- Relative touch input makes small corrections without forcing the finger onto the paddle.
- Paddle rebound changes with contact position and small motion influence.
- Three lives are retained across ball loss; block state is not reset.
- No obvious tunneling occurs in the configured speed range.
- `?debug` exposes pause/single-step, restart, collision geometry and frame/simulation metrics.
- The single-face loop remains readable without rotation or hero VFX.

Tuning can be overridden with query parameters such as `ballSpeed`, `ballMaxSpeed`, `paddleWidth`, `paddleSensitivity` and `lives`.
