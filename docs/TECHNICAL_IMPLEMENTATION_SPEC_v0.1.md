# Breakout3D — Technical Implementation Specification

**Version:** 0.1  
**Status:** Implementation plan for the Vertical Slice  
**Repository:** `JanFschr/breakout3d`  
**Parent:** Breakout3D GDD / Visual Design Bible v0.1 + Vertical Slice Specification v0.1

---

## 1. Purpose

This document translates the Vertical Slice design into an implementation architecture for the current repository. It is intentionally narrower than the GDD: it defines the runtime boundaries, data contracts, deterministic simulation rules, implementation order, quality gates and repository issues required to ship one polished cube slice.

The central engineering principle is:

> **Simulation owns truth. Three.js owns presentation.**

The ball may visually deform, the paddle may tilt, the camera may rotate and the cube may produce large VFX, but none of these presentation effects may redefine collision geometry or gameplay state.

## 2. Current repository baseline

At the time of this specification the repository is a small Vite + Three.js prototype:

- Vite application, ES modules.
- `three` is the only runtime dependency.
- Main implementation is still a single `src/main.js` file.
- The existing scene already renders bricks, a paddle and a ball, but does not yet implement real Breakout physics.
- CI currently runs lint + build.
- GitHub Pages deployment builds `dist` with the repository base path.

The Vertical Slice should evolve this prototype incrementally rather than replace it with a heavy framework.

## 3. Locked technical direction

### Stack

- TypeScript, strict mode.
- Three.js for rendering.
- Vite for development/build.
- Static GitHub Pages deployment.
- PWA/offline shell for the slice.
- No backend in V1.
- Local persistence only.
- Face-local 2D gameplay simulation projected into a 3D body.

### Physics decision

The final collision implementation remains an explicit spike. The baseline to beat is a custom lightweight 2D arcade solver; the comparison candidate is Rapier 2D.

The decision is based on deterministic behavior, exact paddle rebound shaping, high-speed collision robustness, easy Edge Ride pause/resume, mobile CPU/bundle cost and maintainability — not physical realism. Cannon is not the primary candidate because the core simulation is intentionally 2D per face.

## 4. Runtime architecture

```text
Browser / PWA
    |
    v
App
 ├── GameLoop ---------------- fixed simulation clock
 ├── InputController --------- touch/pointer gestures
 ├── GameStateMachine -------- high-level runtime state
 ├── LevelRuntime ------------ authored level + mutable state
 │    ├── FaceGraph ---------- topology / local-world transforms
 │    ├── FaceSimulation ----- ball/paddle/blocks in 2D
 │    ├── DependencyEngine --- cross-face links/objectives
 │    ├── MasterySystem ------ combo/orbit/score
 │    └── GameplayEvents ----- deterministic event stream
 |
 ├── Renderer3D -------------- consumes snapshots/events
 │    ├── Body/FaceRenderer
 │    ├── BallRenderer
 │    ├── BlockRenderer
 │    ├── CameraController
 │    └── RotationController
 |
 ├── JuiceDirector ----------- presentation intensity only
 ├── VFXSystem --------------- pooled transient effects
 ├── AudioDirector ----------- impacts/music/haptics
 ├── Persistence ------------- settings/best local results
 └── Debug/Telemetry ---------- local tooling and playtests
```

No renderer/VFX/audio system may directly change simulation state.

## 5. Recommended source layout

```text
src/
  main.ts
  app/
    App.ts
    GameSession.ts
  core/
    GameLoop.ts
    GameClock.ts
    GameStateMachine.ts
    events.ts
    math.ts
    rng.ts
  gameplay/
    FaceSimulation.ts
    BallSimulation.ts
    PaddleSimulation.ts
    CollisionSolver.ts
    BlockRegistry.ts
    ComboSystem.ts
    OrbitSystem.ts
    ScoreSystem.ts
  world/
    FaceGraph.ts
    FaceBasis.ts
    LevelRuntime.ts
    DependencyEngine.ts
    ObjectiveSystem.ts
    RotationController.ts
  data/
    levelTypes.ts
    levelSchema.ts
    levelValidator.ts
    levels/
      cube01ReactorGarden.ts
  input/
    InputController.ts
    GestureRecognizer.ts
  rendering/
    Renderer3D.ts
    BodyRenderer.ts
    BlockRenderer.ts
    BallRenderer.ts
    PaddleRenderer.ts
    CameraController.ts
    materials/
    shaders/
  vfx/
    JuiceDirector.ts
    VFXSystem.ts
    pools/
  audio/
    AudioDirector.ts
  persistence/
    SettingsStore.ts
    ProgressStore.ts
  debug/
    DebugPanel.ts
    MetricsCollector.ts
    DebugRenderer.ts
```

This is a target boundary, not a requirement to create empty classes before they are needed.

## 6. Simulation timing

Start with a **120 Hz fixed simulation step** while rendering at browser refresh rate.

```ts
const SIM_DT = 1 / 120;
```

Rules:

- Rendering receives interpolation snapshots.
- Simulation never uses raw render delta for gameplay decisions.
- Catch-up time is capped after long stalls/backgrounding.
- Inspect pauses simulation exactly.
- Edge Ride is a deterministic transition state rather than hidden live collision simulation.
- Seeded/replayable input must be possible for regression tests.

120 Hz is a prototype default and must be validated on target mobile hardware.

## 7. Face-local coordinate model

Every playable face owns a local 2D basis. Gameplay works in normalized local coordinates:

```text
u ∈ [-1, +1]
v ∈ [-1, +1]
```

```ts
interface FaceBasis {
  faceId: FaceId;
  origin: THREE.Vector3;
  uAxis: THREE.Vector3;
  vAxis: THREE.Vector3;
  normal: THREE.Vector3;
}
```

Required transforms:

```ts
localToWorld(face, position2D)
worldToLocal(face, worldPosition)
localVelocityToWorld(face, velocity2D)
worldVelocityToLocal(face, worldVelocity)
```

A face transition transforms velocity as:

```text
source local velocity
  -> world tangent velocity
  -> destination local velocity
```

These transforms are unit-tested independently from the Edge Ride animation.

## 8. Core runtime state machine

```text
BOOT
 -> READY
 -> SERVE
 -> PLAY_FACE
      -> EDGE_WINDOW
          -> PLAY_FACE       (no rotation)
          -> EDGE_RIDE
              -> PLAY_FACE   (destination face)
      -> INSPECT -> PLAY_FACE
      -> LIFE_LOST -> SERVE / FAILED
      -> CORE_KILL -> RESULTS
```

### PLAY_FACE

- Fixed-step ball/paddle/block simulation active.
- Normal input moves paddle.
- Eligible edge contact may open `EDGE_WINDOW`.

### EDGE_WINDOW

- Short time-dilated decision state.
- Gesture selects a valid adjacent face.
- No commit means normal rebound/continued play.
- Perfect Flip timing is evaluated here but is never required to rotate.

### EDGE_RIDE

- Face collision simulation suspended.
- Transition path deterministic.
- Ball remains visual anchor.
- Cube/camera rotate to destination.
- Velocity is transferred through face bases.
- Simulation resumes after destination state is fully initialized.

### INSPECT

- Simulation clock frozen.
- Free visual body rotation.
- No level mutation.
- Exit restores exact simulation state.

## 9. Ball and paddle simulation

Mobile uses relative touch/pointer movement. Collision pose remains stable even if the rendered paddle tilts or deforms.

Paddle rebound is intentionally arcade-shaped:

```text
primary influence: contact position across paddle
secondary influence: paddle horizontal velocity at impact
```

The solver exposes a deterministic rebound function instead of relying only on rigid-body restitution.

Near-horizontal trajectories are not globally forbidden by design. The simulation must nevertheless expose a tunable anti-stall strategy for pathological loops rather than hide a hard-coded angle clamp.

## 10. Gameplay event model

Simulation emits typed gameplay events into a deterministic queue:

```ts
type GameplayEvent =
  | { type: 'ball.hitPaddle'; speed: number; offset: number }
  | { type: 'block.hit'; blockId: BlockId; damage: number }
  | { type: 'block.destroyed'; blockId: BlockId; blockType: BlockType }
  | { type: 'face.entered'; from: FaceId; to: FaceId }
  | { type: 'edge.committed'; edgeId: EdgeId; timing: FlipTiming }
  | { type: 'generator.destroyed'; blockId: BlockId }
  | { type: 'chain.triggered'; sourceId: BlockId }
  | { type: 'life.lost'; remaining: number }
  | { type: 'core.exposed' }
  | { type: 'core.destroyed' };
```

Score/combo/orbit consume deterministic gameplay events. VFX/audio/camera consume read-only presentation events. Presentation consumers may not mutate gameplay state.

## 11. Level data contract

The Vertical Slice must not be hard-coded in scene setup.

```ts
interface LevelDefinition {
  id: string;
  version: number;
  body: BodyDefinition;
  faces: FaceDefinition[];
  links: DependencyLink[];
  objectives: ObjectiveDefinition[];
  scoring: ScoringDefinition;
  visual: VisualThemeRef;
  audio: AudioThemeRef;
  tuning: LevelTuning;
}

interface FaceDefinition {
  id: FaceId;
  orientation: string;
  paddle: PaddleDefinition;
  serve: ServeDefinition;
  blocks: BlockDefinition[];
  edges: EdgeDefinition[];
}
```

Each instance has a stable ID. Links/objectives reference IDs, never array positions.

Required validation:

- unique stable IDs,
- all references resolve,
- valid adjacency,
- Anchors own valid edges,
- Generator targets exist,
- Core completion reachable without optional content,
- no irreversible required dependency cycle,
- legal block/paddle/serve bounds,
- ordered star thresholds.

The same contract is intended for future procedurally generated definitions.

## 12. Vertical Slice block registry

Only six mechanics are required:

1. **Normal** — standard HP/destruction.
2. **Armor** — protected/weakened resistance states.
3. **Anchor** — owns/unlocks an edge.
4. **Generator** — triggers dependency links.
5. **Chain** — propagates ordered destruction.
6. **Core** — objective/vulnerability/completion state.

Block behavior lives in simulation/data; rendered material state is derived from block state.

## 13. Dependency engine

The first authored dependency is Generator G1 → Front Armor group, but it must be represented generically:

```ts
interface DependencyLink {
  id: string;
  source: EntityRef;
  trigger: string;
  targets: EntityRef[];
  effect: DependencyEffect;
}
```

This permits later Anchor→Edge, Resonator→Resonator or phase/group dependencies without scene-specific controllers.

## 14. Mastery and score

- **Perfect Flip:** normal/good/perfect timing, configurable windows/rewards; normal rotation remains valid.
- **Combo:** event-driven, explicit gain/decay/reset rules; never tied to VFX callbacks.
- **Orbit:** distinct-face progression; repeating one face cannot farm Orbit.
- **Full Orbit/Overdrive:** prototype state, fully tunable.
- **Stars:** deterministic evaluation from final `RunSummary` including time, score, peak combo, Orbit state and life losses.

## 15. Rendering architecture

Three.js mirrors simulation state into presentation.

### Active face

The active face dominates attention while neighboring geometry remains visible enough to preserve the 3D-body read.

### Hero ball

Use shader/vertex deformation instead of real fluid simulation:

- bright glass/energy core,
- Fresnel/emissive edge,
- impact-direction squash/spike,
- speed/energy-driven tendrils,
- trail/smear separate from collision geometry.

### Glass strategy

Reserve expensive transmission for selected hero elements. Common blocks/body use cheaper fake-glass/satin materials.

## 16. Juice and VFX

`JuiceDirector` receives read-only gameplay/mastery state and emits presentation targets:

```ts
interface JuiceState {
  global: number;
  ball: number;
  world: number;
  audio: number;
  camera: number;
}
```

Each subsystem has its own curve and hard readability cap; not every effect follows exactly the same scalar.

All recurring transient VFX are pooled. Runtime fracture is avoided in favor of reusable authored fragment shapes. The elastic Chain shockwave visualizes ordered chain events; it does not decide gameplay propagation.

## 17. Audio and haptics

AudioDirector subscribes to events:

- distinct impact families for block classes,
- combo increases pitch/layers/texture more than loudness,
- Perfect Flip unique cue,
- Generator cue reinforces remote causality,
- Core Kill multi-stage arc,
- haptics minimal, optional and informationally redundant.

## 18. Persistence

No backend. Store locally:

- settings,
- reduced-motion/reduced-effects preference,
- quality override if exposed,
- best score/time/stars,
- optional local playtest run exports.

## 19. Performance architecture

Reference target is approximately iPhone 13 mini generation and comparable Android hardware at 60 FPS.

Primary budgets: transparent overdraw, post-processing fill-rate, device pixel ratio, trail/particle count, transient allocation/GC and hero transmission/refraction.

Quality tiers:

- **High:** selected hero transmission, richer particles/shockwave/post-process.
- **Medium:** more fake glass, standard bloom, reduced particles.
- **Low:** minimal transparency, simplified trails/background, lower render scale.

Quality tier may never alter gameplay behavior.

## 20. PWA and GitHub Pages

The current Pages workflow already builds `dist` with a repository base path. All assets must remain compatible with `/breakout3d/` and offline caching.

PWA requirements: manifest, versioned service-worker cache, offline shell/assets after initial load, safe update strategy and no backend dependency.

## 21. Test strategy

### Unit tests

Highest priority:

- FaceBasis round trips,
- velocity transfer,
- collision/rebound functions,
- state-machine transitions,
- block state transitions,
- dependency links,
- combo/orbit reset rules,
- star threshold boundaries.

### Data tests

Every authored level passes schema and no-softlock validation in CI.

### Determinism tests

Seeded input/state fixtures are simulated under different render cadences and compared on simulation state.

### Rendering tests

Rendering is separate from simulation correctness. A browser smoke test may verify boot/critical route integration, but simulation tests must not depend on WebGL.

## 22. CI target

Extend the existing lint/build workflow to:

```text
npm ci
npm run lint
npm run test
npm run validate:levels
npm run build
```

PRs fail on invalid level data, simulation regressions or production build failure.

## 23. Implementation sequence / GitHub roadmap

### A — Feel Gate — #8

- #14 TypeScript/module migration
- #15 deterministic game loop
- #16 mobile input/paddle
- #17 physics spike
- #18 single-face Breakout + lives
- #19 debug/tuning metrics

**Gate:** repeatedly fun and stable before 3D mechanics.

### B — Spatial Gate — #9

- #20 FaceGraph/bases
- #21 state machine/Edge Window
- #22 Edge Ride/camera/velocity transfer
- #23 Inspect Mode

**Gate:** face transition reads as continuous movement of the same ball.

### C — Strategy Gate — #10

- #24 level schema/validator
- #25 block registry
- #26 dependency engine / Generator→Armor
- #27 Reactor Garden + no-softlock validation

**Gate:** players rotate because another face creates gameplay leverage.

### D — Mastery Gate — #11

- #28 gameplay events/combo/score
- #29 Perfect Flip
- #30 Orbit/Full Orbit
- #31 deterministic stars

**Gate:** skill optimization exists beyond survival without becoming mandatory.

### E — Spectacle Gate — #12

- #32 JuiceDirector
- #33 fluid hero ball/trails
- #34 material language/edge glow
- #35 pooled destruction VFX/shockwave
- #36 adaptive audio/haptics
- #37 Core Kill/results

**Gate:** high-skill play is substantially more spectacular while remaining readable.

### F — Platform & QA Gate — #13

- #38 PWA/offline/Pages
- #39 quality/performance budgets
- #40 local playtest metrics
- #41 tests/CI gates
- #42 real-device acceptance

**Gate:** complete slice is deployable, measurable and performant on target mobile hardware.

## 24. Pull-request strategy

Prefer small PRs aligned with issue boundaries. Avoid one giant Vertical Slice branch.

- one issue or tightly coupled pair per PR;
- deterministic/data logic includes tests in the same PR;
- VFX PRs include performance/readability checks;
- every PR states which gate it advances;
- campaign production starts only after the final slice gate decision.

## 25. Technical Definition of Done

1. Reactor Garden loads entirely from level data.
2. Core simulation is deterministic and separate from rendering.
3. Edge Ride transfers the ball between face bases correctly.
4. Generator/Armor dependency works across inactive faces.
5. Perfect Flip, Combo, Orbit and Stars are deterministic/tunable.
6. Hero VFX/audio react to events without mutating gameplay.
7. Core Kill completes exactly once and shows the whole body.
8. Slice is installable/offline after initial load.
9. CI validates code, tests, level data and production build.
10. Target-class devices meet the agreed performance/readability gate.

## 26. Review / QA notes

The architecture intentionally spends early effort on deterministic simulation, data validation and debug tooling. This makes screenshot progress slower during Gate A, but substantially reduces the risk that rotation, generated content or high-end VFX become coupled to fragile scene code.

The main architecture smell to reject is **presentation owning gameplay truth** — collision from animated mesh positions, block state from particle callbacks, score from VFX completion or Core state from camera timelines.

## 27. Optimization recommendations

### Custom solver baseline
**Advantage:** small, exact arcade control, easy Edge Ride pause/resume, low bundle cost.  
**Disadvantage:** collision corner cases are project responsibility.

### 120 Hz fixed simulation
**Advantage:** robust fast-ball feel at tiny dynamic-body count.  
**Disadvantage:** doubles simulation work versus 60 Hz and must be validated on real devices.

### Pooled VFX
**Advantage:** protects frame pacing/GC during cascades.  
**Disadvantage:** more lifecycle complexity and fixed capacity planning.

### Generic dependency links
**Advantage:** future mechanics/procedural generation reuse the same graph.  
**Disadvantage:** more up-front data design than a hard-coded Generator controller.

### Fake common glass
**Advantage:** preserves mobile fill-rate for hero ball/Core/signature moments.  
**Disadvantage:** requires art tuning so common materials still feel premium.

## 28. Assumptions / open decisions

- TypeScript migration is the first implementation step.
- 120 Hz is a prototype default, not a permanent requirement.
- Custom solver is the leading hypothesis, but #17 decides empirically against Rapier 2D.
- Generator G1→Armor is the Slice dependency prototype, not the only future dependency type.
- Perfect Flip windows, Orbit thresholds, Full Orbit benefit and star weights remain tunable.
- GitHub Pages remains the canonical public deployment target for the slice.
- Backend/account/cloud features remain outside V1.
