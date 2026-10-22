# Viewer performance notes

## Reproduce the scene-update benchmark

From `viewer`, run:

```sh
npm test -- test/world3d_performance.test.ts
```

The deterministic fixture models a 64×64 world with 16 districts, 13 occupied house plots per district, 14 workplaces, and 100, 1,000, or 3,000 active residents. Each result warms the scene for 60 updates, then reports the median and slowest of nine averages, each covering 120 updates. The benchmark exercises `WorldScene.update` and Three.js CPU-side instance updates; `WebGLRenderer.render` is stubbed.

The recorded comparison used Node 24.14.1 on Windows 11 Pro with an Intel Core i7-12700H. The baseline was `f77dd1c` (the `main` commit containing PR #46); both runs used the same checkout, runtime, fixture, and benchmark. Times are milliseconds per update:

| Active residents | Baseline median | Updated median | Change | Baseline slowest run mean | Updated slowest run mean |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 0.244 | 0.069 | −71.6% | 0.332 | 0.091 |
| 1,000 | 2.338 | 0.654 | −72.0% | 2.398 | 0.773 |
| 3,000 | 6.958 | 2.104 | −69.8% | 7.120 | 2.352 |

Each median is the median of nine run averages. The “slowest run mean” is the largest of those nine averages, not a frame-time p95. This harness does not measure browser scheduling, replay sampling, DOM updates, GPU time, draw calls, or end-to-end frame pacing, and its synthetic fixture is not a recorded user export. Use browser Performance and GPU profiling with representative exports before making claims about full-frame FPS or GPU-bound behavior. These results describe this machine and harness, not a general guarantee.

## Change and trade-offs

`WorldScene.update` now reuses its transform vectors, quaternions, matrix, collision output, and visibility stamps. `pushOut` scans houses and workplaces in their existing order without constructing a combined array and accepts a caller-owned output point. Position collision checks and rendered instance values are unchanged; callers that omit the optional output point still receive a fresh object as before. A fixed-size visibility stamp array uses 12 KiB for the scene capacity of 3,000 instances and avoids creating a set every update.

The production `world` bundle measured 617.36 kB (158.24 kB gzip) at baseline and 618.27 kB (158.40 kB gzip) afterward, an increase of 0.91 kB (0.16 kB gzip) from the added scratch-state handling. The Three.js renderer remains the dominant bundle dependency; this change targets runtime update cost and does not claim a bundle-size reduction. Vite continues to report that this chunk exceeds its 500 kB warning threshold.
