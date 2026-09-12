# ADR 0001 — Vertical Slice physics solver

**Status:** Accepted for Vertical Slice  
**Issue:** #17

## Decision

Use a small custom, face-local 2D collision solver for the Vertical Slice rather than adding Rapier 2D.

## Why

The core game needs deliberately shaped arcade rebounds, deterministic fixed-step playback, exact pause/resume around Edge Ride, and a very small mobile/web bundle. The playable domain is constrained: one circle, axis-aligned blocks/walls, one paddle, then later face-local transforms between planes.

The implemented solver therefore uses:

- 120 Hz fixed simulation steps.
- Continuous point-vs-expanded-AABB sweeps for paddle and blocks.
- Analytic wall hit times.
- Earliest-hit resolution with a bounded collision-iteration budget.
- Explicit paddle rebound shaping based on hit position and paddle motion.

## Comparison

| Criterion | Custom solver | Rapier 2D |
| --- | --- | --- |
| Arcade rebound shaping | Direct and explicit | Requires overriding/working around physical response |
| Deterministic ownership | Entirely inside game loop | Good, but adds engine integration state |
| Edge Ride freeze/resume | Trivial | Requires synchronizing engine state |
| Bundle/runtime cost | Minimal | Additional WASM/package/runtime cost |
| Collision robustness | We own corner cases | Mature engine advantage |
| General rigid bodies | Poor fit | Strong advantage |
| Future complex dynamics | Would require more code | Strong advantage |

## Revisit trigger

Re-evaluate Rapier or another engine if a later world requires moving rigid bodies, arbitrary convex collisions, stacked dynamics, or other mechanics that exceed the simple face-local circle/AABB model.

## QA cases for the custom solver

- High-speed ball crossing a thin block in one render frame.
- Corner approach against blocks from all four quadrants.
- Paddle edge hits at maximum configured speed.
- Repeated fixed-step runs yielding identical state.
- Pause/resume and future Edge Ride transitions without hidden integration state.

## Trade-off

This decision optimizes the current product rather than general physics capability. The downside is explicit ownership of collision bugs; the upside is deterministic, inspectable behavior tailored to Breakout and a smaller mobile runtime.
