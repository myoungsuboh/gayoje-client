---
name: App Size & Performance Optimization
description: A general-purpose standard for optimizing a mobile app's binary size, startup time (cold start), memory, battery, and frame rate (60fps) — common concepts not tied to either iOS or Android. Measure first, defer/move heavy work to the background, remove unused code/resources, recycle/downsample lists/images. Read it when an app is heavy or slow, or when inspecting/profiling performance before release. Keywords: performance, app-size, cold-start, fps, memory, battery, profiling, code-shrinking, app-thinning, app-bundle, lazy-init.
rules:
  - "Measure first, do not guess: optimize only after confirming the bottleneck with a profiler. Do not touch anything without measuring. (Measure startup time, memory, frames, and battery each separately.)"
  - "Prioritize startup time (cold start) above all: measure from process creation → app initialization → first-screen render, and move heavy initialization on the startup path to lazy/background/on-demand."
  - "Free up the main (UI) thread: take heavy work such as decoding, parsing, I/O, and encryption off the UI thread to keep the frame budget (60fps ≈ 16ms/frame)."
  - "Reduce binary size: remove unused code/resources (code shrinking/obfuscation), have each device download only what it needs (app bundle/slicing), and shrink images with efficient formats/resolutions."
  - "Bound memory: recycle views in lists, downsample images to the display size, and check for leaks with a profiler."
  - "Save battery: minimize background location, network polling, and wakeups, and handle work via batching/deferral/coalescing."
  - "Common concepts first, tools as mappings: define principles platform-neutrally, and view actual tools (e.g., iOS Instruments·App Thinning, Android Profiler·R8/App Bundle) as implementations of those concepts."
tags:
  - "performance"
  - "app-size"
  - "cold-start"
  - "fps"
  - "memory"
  - "battery"
  - "profiling"
  - "code-shrinking"
  - "app-thinning"
  - "app-bundle"
  - "lazy-init"
  - "proguard"
---

# ⚡ App Size & Performance Optimization

> A general-purpose standard for optimizing a mobile app's size, startup time, frames, memory, and battery. Find bottlenecks by measurement rather than guessing, move heavy work to lazy/background, remove unused code/resources, and recycle/downsample lists/images. Read it when an app is heavy or slow, or when inspecting/profiling performance before release. These are common concepts not tied to any specific platform (iOS/Android) or framework; platform-specific tools are covered in the appendix.

## 1. Purpose

- Guarantee the user-perceived **startup speed, responsiveness, heat, and app size** above a certain level.
- Manage performance not by "gut feeling" but by **measured values (startup time, frames, memory, battery)**, and standardize pre-release inspection.
- Gather in one place the **common principles** that hold the same even across platforms, and map tools as concepts.

## 2. Core Principles

- **Measure first, do not guess**: optimize only after confirming the bottleneck with a profiler. Do not touch anything without measuring. (Measure startup time, memory, frames, and battery each separately.)
- **Prioritize startup time (cold start) above all**: measure from process creation → app initialization → first-screen render, and move heavy initialization on the startup path to **lazy/background/on-demand**.
- **Free up the main (UI) thread**: take heavy work such as decoding, parsing, I/O, and encryption off the UI thread to keep the **frame budget (60fps ≈ 16ms/frame)**.
- **Reduce binary size**: remove unused code/resources (code shrinking/obfuscation), have each device download only what it needs (app bundle/slicing), and shrink images with efficient formats/resolutions.
- **Bound memory**: **recycle** views in lists, **downsample** images to the display size, and check for leaks with a profiler.
- **Save battery**: minimize background location, network polling, and wakeups, and handle work via **batching/deferral/coalescing**.
- **Common concepts first, tools as mappings**: define principles platform-neutrally, and view actual tools (e.g., iOS Instruments·App Thinning, Android Profiler·R8/App Bundle) as implementations of those concepts.

## 3. Rules (✅/❌)

### 3-1. Do not optimize without measuring

- First confirm where it is slow with a profiler, then measure again after the change to verify the effect.

```text
// ❌ Forbidden — touching things by "feel" without measuring
"The list seems slow, so let's just add more caching for now"

// ✅ Recommended — measure → identify bottleneck → fix → re-measure
Find the frame-drop point with a profiler → remove the cause (main-thread decoding) → measure again to confirm improvement
```

### 3-2. Move heavy initialization on the startup path to lazy/background

- On the cold-start path (app initialization → first screen), do not run SDKs/config/cache warming that are not needed right away synchronously.
- Do immediately only what is needed to draw the first screen, and defer the rest to **lazy loading/background/on-demand**.

```text
// ❌ Forbidden — synchronously initialize all SDKs at app start (delays the first screen)
app start:
  analytics.init(); ads.init(); crash.init(); imageCache.warmAll();  // all synchronous
  showFirstScreen()

// ✅ Recommended — only what the first screen needs, the rest lazy/background
app start:
  crash.init()                    // only the minimum needed immediately
  background { analytics.init(); ads.init() }   // off the startup path
  lazy { imageCache }             // initialize on first use
  showFirstScreen()
```

### 3-3. Do not do heavy work on the main (UI) thread

- Take work such as image decoding, large parsing, disk/network I/O, and encryption off the UI thread to prevent frame drops.
- The more **frequently and quickly a point is called**, such as the path that binds list cells, the more you must avoid heavy work there.

```text
// ❌ Forbidden — synchronous decoding in cell binding (a per-frame path) → frame drop
bindListItem(item):
  image = decodeFullSizeImage(item.path)   // UI thread blocking
  view.image = image

// ✅ Recommended — background decoding + downsample to display size + apply asynchronously
bindListItem(item):
  loadImageAsync(item.path, targetW, targetH) into view.image
```

### 3-4. Binary size by "removal + splitting + efficient formats"

- Remove unused code/resources at the build stage (code shrinking/obfuscation), and have each device download only the resources it needs (app bundle/slicing).
- Shrink images to a resolution sufficient for display and an efficient format (do not bundle unnecessary originals).

```text
// ❌ Forbidden — put resources for all devices in one binary, keeping unused code too
All-resolution images + all ABIs/architectures + dead code included → bloated download size

// ✅ Recommended — removal·splitting·efficient format
Remove unused code/resources + per-device split (bundle/slicing) + efficient image format·resolution
```

### 3-5. Bound memory for lists/images via recycling/downsampling

- For long lists, create views only for as many as are visible on screen and **recycle** them (do not load the whole thing into memory at once).
- Downsample images to the **actual display size** rather than the original resolution to save memory/bandwidth.

```text
// ❌ Forbidden — create all items at once and put original-resolution images straight into memory
buildAllRowsAtOnce(items)         // 10,000 at once
view.image = load(originalHugeImage)   // 4000x3000 into a small cell

// ✅ Recommended — recycle only as many as visible + downsample to display size
recycleVisibleRows(items)
view.image = load(path, downsampleTo = cellSize)
```

### 3-6. Battery: minimize·batch·defer background work

- Minimize background location tracking, frequent network polling, and repeated wakeups.
- Handle truly necessary work by **batching·deferring·an appropriate trigger (condition/interval)**.

```text
// ❌ Forbidden — keep waking up on a short interval to poll·collect location (heat·battery drain)
every 5s: pollServer(); readPreciseLocation()

// ✅ Recommended — coalesce, defer, and make conditional
batched/deferred sync (network·charging conditions, etc.) + request location only at the needed accuracy/interval
```

## 4. Common Mistakes

- **Optimizing without measuring** → you fix the wrong place and cannot verify the effect either. Find the bottleneck with a profiler first.
- **Synchronously initializing everything at startup** → cold start gets long. Keep only what the first screen needs, the rest lazy/background.
- **Decoding·parsing·I/O on the main thread** → scrolling/animation stutters (frame drops). Move heavy work to the background.
- **Putting original-resolution images straight into a small view** → memory surge·OOM. Downsample to the display size.
- **Creating the whole list at once** → memory·lag. Recycle views for only as many as visible.
- **Bundling unused code·resources·all-device resources in one binary** → bloated download size. Removal + per-device split.
- **Overusing background polling·location·wakeups** → heat·battery drain. Batch·defer·conditional.
- **Leaving memory leaks unattended** → usage keeps growing on repeated screen entry. Check leaks with a profiler.

## 5. Checklist

- [ ] Did you **measure with a profiler** the startup time, memory, frames, and battery, and confirm the effect by re-measuring after the change?
- [ ] Did you measure the cold start (app initialization → first screen) and move heavy initialization to **lazy·background**?
- [ ] Do you keep **60fps** by removing heavy work such as decoding·parsing·I/O from the main (UI) thread?
- [ ] Did you remove unused code/resources (code shrinking·obfuscation) and apply per-device **splitting (app bundle/slicing)**?
- [ ] Did you shrink images to an **efficient format·display size**?
- [ ] Do lists **recycle** views, and are images **downsampled** to bound memory?
- [ ] Did you check for **memory leaks** with a profiler?
- [ ] Did you **minimize·batch·defer** background location, network polling, and wakeups?

> So as not to conflict with other standards such as input validation·networking·error handling, also confirm that performance optimization does not break correctness·security.

## Appendix: Per-Stack Examples

> The following are reference implementation examples. The principles/rules in 2–5 above are the standard; the appendix is merely an application case. Add examples matching the platform/tools your team uses following the same pattern.

### Per-platform tool mapping (concept → implementation)

| Concept | Android | iOS |
|------|---------|-----|
| Binary split (per-device delivery) | App Bundle (AAB) | App Thinning (slicing) |
| Unused code/resource removal | R8 / ProGuard | (compiler optimization·dead-code removal) |
| Efficient images | Vector drawable · WebP | Appropriate format·resolution (@x assets) |
| Startup time measurement | Macrobenchmark | Instruments (App Launch) |
| Memory measurement·leaks | Memory Profiler | Instruments (Allocations/Leaks) |
| Frame measurement | Profile GPU Rendering | Instruments (Core Animation) |
| Battery measurement | Battery Historian | Instruments (Energy Log) |

### Android (Kotlin)

#### Startup time optimization

```
Cold start stages: process creation → Application onCreate → first-screen render
Goal: < 2 seconds (Android Vitals recommendation)

Strategy:
- Defer heavy SDK initialization in onCreate (App Startup·lazy)
- Splash → prefetch first-screen data
- Remove main-thread blocking work
```

#### Binary size reduction

For techniques·tools, refer to the 「Per-platform tool mapping」 table above (the binary split / unused code·resource removal / efficient image rows). On Android, split per-device APKs with App Bundle (AAB), remove unused code·resources with R8/ProGuard, and shrink images with vector drawables·WebP.

#### Frame performance (60fps)

```kotlin
// ❌ Forbidden — heavy work on the main thread (frame drop)
fun onBindViewHolder(...) {
    val bitmap = decodeHugeImage(path)  // main-thread blocking → frame drop
}

// ✅ Recommended — background decoding + downsampling
fun onBindViewHolder(...) {
    Glide.with(context).load(path)
        .override(targetW, targetH)  // downsample
        .into(holder.image)
}
```

> For profiling tools (startup time·memory·frames·battery), refer to the 「Per-platform tool mapping」 table above.

### iOS (Swift)

> The principles/rules in 1–5 above are common to iOS·Android. The team adds the Swift implementation examples below following the same pattern (for profiling tools, refer to the iOS column of the 「Per-platform tool mapping」 table).
