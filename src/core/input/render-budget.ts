/**
 * The render-budget governor.
 *
 * ARCHITECTURE.md §8 asks for "a render-budget governor in `core/input` that can
 * throttle the rAF loop to a target rate", era-neutral, with only one era setting a
 * rate below the display's. This is that, and it is the second of the two additions
 * §8 says the sixth era costs the architecture.
 *
 * It is the single animation clock for the whole system. Anything that wants
 * per-frame work asks here rather than calling `requestAnimationFrame` itself, for
 * two reasons that are not stylistic:
 *
 * 1. **A private rAF cannot be throttled and cannot be counted.** An era that bills
 *    the viewer for rendering has to know how many frames were actually painted, and
 *    a loop the governor cannot see is work it cannot account for.
 * 2. **Throttling is not frame-dropping.** Waking sixty times a second to discard
 *    fifty-nine of the wakeups saves nothing — it is the same main-thread work with
 *    less to show for it. When the target period is longer than a frame this sleeps
 *    on a timer and only takes a `requestAnimationFrame` to land the delivery on a
 *    vsync boundary, so a 1Hz target really is about one wakeup a second.
 *
 * ### The priority lane
 *
 * Direct manipulation is never throttled, and that is §8's own sentence rather than
 * an exemption invented here: "Windows still overlap, stack, drag and resize.
 * Rationing did not delete direct manipulation." A drag delivered at the throttled
 * rate would not be a drag. So the governor has two lanes — a priority lane that runs
 * at whatever the compositor gives, and the subscriber lane that obeys the target —
 * and the gesture controller uses the first.
 *
 * The priority lane is a single slot rather than a list because there is only ever
 * one gesture in flight: pointer capture guarantees it. A slot costs one branch per
 * frame where a list would cost an iterator, and `CLAUDE.md` forbids allocation
 * inside a rAF callback.
 *
 * ### What this does not do
 *
 * It does not read `prefers-reduced-motion`. Throttling is a power policy and reduced
 * motion is an accessibility obligation; they answer different questions and an era
 * may want one without the other. `core/motion.ts` owns the query, the window manager
 * enforces it for minimize animations, and a skin that drives a moving effect from
 * this clock is responsible for stopping that effect — not this clock — when the
 * query flips.
 */

/**
 * A target rate. `null` means "whatever the compositor delivers", which is what every
 * era except one wants and is the state the governor starts in.
 */
export interface RenderBudgetSpec {
  /** Rate while nothing is being interacted with. `null` for unthrottled. */
  readonly idleHz: number | null
  /** Rate during a burst. `null` for unthrottled. */
  readonly burstHz: number | null
  /** How long a burst lasts after the last `poke()`. */
  readonly burstMs: number
}

/**
 * What a subscriber is handed. One reused object, never a fresh one per frame — the
 * no-allocation rule applies to everything reachable from a rAF callback, and a tick
 * payload allocated sixty times a second is exactly the kind of garbage §6 is about.
 * Copy any field you intend to keep.
 */
export interface FrameTick {
  /** The frame timestamp, from `requestAnimationFrame`. */
  now: number
  /** How many frames this governor has delivered. Monotonic. */
  index: number
  /** Milliseconds since the previous delivery. */
  sinceLast: number
  /** True while a burst is in force. */
  bursting: boolean
}

/**
 * Counters, written into a caller-supplied object.
 *
 * A `stats()` that returned a fresh record would allocate on a path an era reads
 * every frame to render a running cost. The shape mirrors `geometry.ts`'s `*Into`
 * convention for the same reason.
 */
export interface RenderBudgetStats {
  /** Frames delivered to subscribers. */
  delivered: number
  /** Frames the compositor offered and the target rate declined. */
  suppressed: number
  /** Frames delivered to the priority lane. */
  priority: number
  /** Milliseconds spent asleep on a timer rather than awake discarding frames. */
  sleptMs: number
  /** The rate currently in force, or null when unthrottled. */
  hz: number | null
}

/**
 * How early to wake before the target period elapses, so the following
 * `requestAnimationFrame` still lands inside the intended period rather than one
 * vsync late. One frame at 60Hz, rounded up.
 */
const VSYNC_SLACK_MS = 17

export class RenderBudget {
  private spec: RenderBudgetSpec | null = null

  private rafHandle = 0
  private timerHandle = 0
  private running = false

  private readonly subs: Array<(t: FrameTick) => void> = []
  private priorityFn: (() => void) | null = null
  private priorityPending = false

  private lastDeliver = 0
  private burstUntil = 0
  private sleepStarted = 0

  private delivered = 0
  private suppressed = 0
  private priorityFrames = 0
  private sleptMs = 0

  /** Reused across every delivery. */
  private readonly tick: FrameTick = { now: 0, index: 0, sinceLast: 0, bursting: false }

  /** Bound once so scheduling a frame allocates no closure. */
  private readonly onFrame = (now: number): void => this.frame(now)
  private readonly onWake = (): void => {
    this.timerHandle = 0
    if (this.sleepStarted !== 0) {
      this.sleptMs += performance.now() - this.sleepStarted
      this.sleepStarted = 0
    }
    this.rafHandle = requestAnimationFrame(this.onFrame)
  }

  /**
   * Set the target, or pass null to run unthrottled.
   *
   * The governor never learns why a rate was chosen, exactly as the window manager
   * never learns why the work area is shorter. A skin declares one number in its
   * manifest and the shell passes it here.
   */
  setSpec(spec: RenderBudgetSpec | null): void {
    this.spec = spec
    this.reschedule()
  }

  /**
   * Promote to the burst rate for `burstMs`.
   *
   * §8: "Typing forces a burst mode that looks and behaves differently." Every
   * interaction pokes — a key, a pointer press, a gesture — so an era that throttles
   * hard while reading still responds immediately when touched.
   */
  poke(): void {
    if (!this.spec) return
    this.burstUntil = performance.now() + this.spec.burstMs
    // A poke during a sleep has to wake the clock now rather than at the end of the
    // idle period, or the first keystroke after a quiet minute waits a second for
    // its own burst to start.
    if (this.timerHandle !== 0) {
      clearTimeout(this.timerHandle)
      this.timerHandle = 0
      if (this.sleepStarted !== 0) {
        this.sleptMs += performance.now() - this.sleepStarted
        this.sleepStarted = 0
      }
    }
    this.reschedule()
  }

  /** True while a burst is in force. */
  get bursting(): boolean {
    return this.spec !== null && performance.now() < this.burstUntil
  }

  subscribe(fn: (t: FrameTick) => void): () => void {
    this.subs.push(fn)
    this.reschedule()
    return () => {
      const i = this.subs.indexOf(fn)
      if (i >= 0) this.subs.splice(i, 1)
      this.reschedule()
    }
  }

  /**
   * Schedule `fn` on the next compositor frame, ignoring the target rate.
   *
   * The gesture controller's replacement for `requestAnimationFrame`. Repeated calls
   * before the frame arrives coalesce into one, which is the same contract the drag
   * loop already relied on when it guarded on a non-zero handle.
   */
  requestPriority(fn: () => void): void {
    this.priorityFn = fn
    this.priorityPending = true
    this.reschedule()
  }

  /** Cancel a pending priority frame. Safe to call when none is pending. */
  cancelPriority(): void {
    this.priorityPending = false
    this.priorityFn = null
    this.reschedule()
  }

  /** Writes the counters into `out` and returns it. Allocates nothing. */
  stats(out: RenderBudgetStats): RenderBudgetStats {
    out.delivered = this.delivered
    out.suppressed = this.suppressed
    out.priority = this.priorityFrames
    out.sleptMs = this.sleptMs
    out.hz = this.targetHz()
    return out
  }

  /** Stop the clock and drop every subscriber. */
  destroy(): void {
    this.subs.length = 0
    this.priorityPending = false
    this.priorityFn = null
    this.stop()
  }

  // ------------------------------------------------------------------ private

  /** The rate in force right now, or null when unthrottled. */
  private targetHz(): number | null {
    const s = this.spec
    if (!s) return null
    return this.bursting ? s.burstHz : s.idleHz
  }

  /** Target period in ms; 0 means "every frame the compositor offers". */
  private periodMs(): number {
    const hz = this.targetHz()
    return hz === null || hz <= 0 ? 0 : 1000 / hz
  }

  private wanted(): boolean {
    return this.subs.length > 0 || this.priorityPending
  }

  /**
   * Start, stop or re-time the clock to match what is currently wanted.
   *
   * The clock does not run when nothing is subscribed and no gesture is in flight,
   * which is why an era that never touches the governor pays nothing for its
   * existence — and why the five eras built before this one are unaffected except
   * while a window is actually being dragged.
   */
  private reschedule(): void {
    if (!this.wanted()) {
      this.stop()
      return
    }
    if (this.rafHandle !== 0) return

    // A pending gesture frame, or no throttle at all, means take the next compositor
    // frame. Otherwise sleep out the remainder of the period first.
    const period = this.periodMs()
    if (this.priorityPending || period === 0) {
      if (this.timerHandle !== 0) {
        clearTimeout(this.timerHandle)
        this.timerHandle = 0
        this.sleepStarted = 0
      }
      this.running = true
      this.rafHandle = requestAnimationFrame(this.onFrame)
      return
    }
    if (this.timerHandle !== 0) return

    this.running = true
    const wait = period - (performance.now() - this.lastDeliver) - VSYNC_SLACK_MS
    if (wait <= 0) {
      this.rafHandle = requestAnimationFrame(this.onFrame)
      return
    }
    this.sleepStarted = performance.now()
    this.timerHandle = setTimeout(this.onWake, wait) as unknown as number
  }

  private stop(): void {
    this.running = false
    if (this.rafHandle !== 0) {
      cancelAnimationFrame(this.rafHandle)
      this.rafHandle = 0
    }
    if (this.timerHandle !== 0) {
      clearTimeout(this.timerHandle)
      this.timerHandle = 0
      this.sleepStarted = 0
    }
  }

  /** The one rAF callback in the system. Allocates nothing. */
  private frame(now: number): void {
    this.rafHandle = 0

    // The priority lane first and unconditionally: a gesture frame is never
    // suppressed, whatever the target rate says.
    if (this.priorityPending) {
      this.priorityPending = false
      this.priorityFrames++
      const fn = this.priorityFn
      if (fn !== null) fn()
    }

    const period = this.periodMs()
    const since = now - this.lastDeliver
    if (period === 0 || this.lastDeliver === 0 || since >= period - 1) {
      this.lastDeliver = now
      this.delivered++
      const t = this.tick
      t.now = now
      t.index = this.delivered
      t.sinceLast = since
      t.bursting = this.bursting
      for (let i = 0; i < this.subs.length; i++) {
        const fn = this.subs[i]
        if (fn !== undefined) fn(t)
      }
    } else {
      this.suppressed++
    }

    if (this.running) this.reschedule()
  }
}
