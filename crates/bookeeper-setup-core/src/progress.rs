//! Progress model: turns real milestones and elapsed time into a bar that never
//! goes backwards, never reaches the next band early, and never looks like a flash.
//!
//! Install bands: Prepare 0–8%, Copy 8–90%, Icons 90–96%, Finish 96–100%.
//! Uninstall bands: RemoveApp 0–70%, RemoveData 70–95% (only when deleting data),
//! Finish 95–100%. Without data deletion RemoveApp runs 0–95%.
//! `fraction` is overall, 0.0..=1.0.

use std::time::{Duration, Instant};

pub const MIN_STEP: Duration = Duration::from_millis(600);
pub const MIN_TOTAL: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    Prepare,
    Copy,
    Icons,
    Finish,
    RemoveApp,
    RemoveData,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Signal {
    /// Time passing; nothing happened.
    Tick,
    /// The installer is extracted and verified; NSIS is about to start.
    Extracted,
    /// Bytes unpacked so far by NSIS (its `ns*.tmp` file) out of the total to install.
    Unpacked { bytes: u64, total: u64 },
    /// `bookeeper-desktop.exe` is complete (a real milestone, 90%).
    MainComplete,
    NsisExited,
    IconsDone,
    AppRemoved,
    DataRemoved,
    Finished,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Snapshot {
    pub step: Step,
    pub fraction: f32,
    pub done: bool,
}

struct Band {
    step: Step,
    lo: f64,
    hi: f64,
    /// Share of the estimated duration spent in this band.
    share: f64,
}

pub struct ProgressModel {
    install: bool,
    bands: Vec<Band>,
    start: Instant,
    estimate: Duration,
    /// Furthest band reached by real signals.
    real_idx: usize,
    real_entered: Instant,
    unpacked: Option<(u64, u64)>,
    finished: bool,
    /// Band currently shown; trails `real_idx` to honour the minimum step time.
    shown_idx: usize,
    shown_entered: Instant,
    fraction: f64,
    last_now: Instant,
    done: bool,
}

/// Fastest the bar may move when catching up with real progress (fraction per second).
const CATCH_UP: f64 = 0.8;

fn band(step: Step, lo: f64, hi: f64, share: f64) -> Band {
    Band { step, lo, hi, share }
}

impl ProgressModel {
    pub fn new_install(start: Instant, estimate: Duration) -> Self {
        let bands = vec![
            band(Step::Prepare, 0.0, 0.08, 0.1),
            band(Step::Copy, 0.08, 0.90, 0.7),
            band(Step::Icons, 0.90, 0.96, 0.1),
            band(Step::Finish, 0.96, 1.0, 0.1),
        ];
        Self::new(true, bands, start, estimate)
    }

    pub fn new_uninstall(start: Instant, estimate: Duration, delete_data: bool) -> Self {
        let bands = if delete_data {
            vec![
                band(Step::RemoveApp, 0.0, 0.70, 0.6),
                band(Step::RemoveData, 0.70, 0.95, 0.3),
                band(Step::Finish, 0.95, 1.0, 0.1),
            ]
        } else {
            vec![band(Step::RemoveApp, 0.0, 0.95, 0.9), band(Step::Finish, 0.95, 1.0, 0.1)]
        };
        Self::new(false, bands, start, estimate)
    }

    fn new(install: bool, bands: Vec<Band>, start: Instant, estimate: Duration) -> Self {
        Self {
            install,
            bands,
            start,
            estimate: estimate.max(Duration::from_millis(1)),
            real_idx: 0,
            real_entered: start,
            unpacked: None,
            finished: false,
            shown_idx: 0,
            shown_entered: start,
            fraction: 0.0,
            last_now: start,
            done: false,
        }
    }

    fn last(&self) -> usize {
        self.bands.len() - 1
    }

    fn reach(&mut self, now: Instant, idx: usize) {
        let idx = idx.min(self.last());
        if idx > self.real_idx {
            self.real_idx = idx;
            self.real_entered = now;
        }
    }

    fn index_of(&self, step: Step) -> Option<usize> {
        self.bands.iter().position(|b| b.step == step)
    }

    pub fn observe(&mut self, now: Instant, signal: Signal) -> Snapshot {
        if !self.done {
            // Time passed under the old state; then the signal changes the plan.
            self.advance(now);
            self.apply(now, signal);
            self.advance(now);
        }
        self.snapshot()
    }

    fn apply(&mut self, now: Instant, signal: Signal) {
        let finish = self.last();
        if self.install {
            match signal {
                Signal::Extracted => self.reach(now, 1),
                Signal::Unpacked { bytes, total } => {
                    self.reach(now, 1);
                    // Only keep a usable, forward-moving reading.
                    if total > 0 && self.unpacked.is_none_or(|(b, _)| bytes >= b) {
                        self.unpacked = Some((bytes.min(total), total));
                    }
                }
                Signal::MainComplete => self.reach(now, 2),
                Signal::NsisExited | Signal::IconsDone => self.reach(now, 3),
                Signal::Finished => {
                    self.reach(now, finish);
                    self.finished = true;
                }
                _ => {}
            }
        } else {
            match signal {
                Signal::AppRemoved => {
                    let next = self.index_of(Step::RemoveData).unwrap_or(finish);
                    self.reach(now, next);
                }
                Signal::DataRemoved => self.reach(now, finish),
                Signal::Finished => {
                    self.reach(now, finish);
                    self.finished = true;
                }
                _ => {}
            }
        }
    }

    /// Where the real work stands, ignoring the display holds.
    fn target(&self, now: Instant) -> f64 {
        if self.finished {
            return 1.0;
        }
        let b = &self.bands[self.real_idx];
        let span = b.hi - b.lo;
        let x = match (self.install && b.step == Step::Copy, self.unpacked) {
            (true, Some((bytes, total))) => (bytes as f64 / total as f64).min(0.999),
            _ => {
                // Slowing curve: approaches the band's end, never reaches it.
                let tau = (self.estimate.as_secs_f64() * b.share).max(0.05);
                let t = now.saturating_duration_since(self.real_entered).as_secs_f64();
                0.95 * (1.0 - (-t / tau).exp())
            }
        };
        b.lo + span * x
    }

    /// Seconds from `last_now` until `t` (zero if already past).
    fn secs_until(&self, t: Instant) -> f64 {
        t.saturating_duration_since(self.last_now).as_secs_f64()
    }

    /// When the bar is paced (the shown band trails the real one, or the work is
    /// finished), the moment the bar should reach the shown band's end. The bar
    /// moves in a straight line from where it is to that point, so it never fills
    /// a band early and then waits at its edge.
    fn pace_deadline(&self) -> Option<f64> {
        let behind = self.shown_idx < self.real_idx;
        if !behind && !self.finished {
            return None;
        }
        let f = self.fraction;
        let shown = &self.bands[self.shown_idx];
        let w0 = (shown.hi - f).max(0.0);
        let min0 = self
            .secs_until(self.shown_entered + MIN_STEP)
            .max(w0 / CATCH_UP);
        if !self.finished {
            return Some(min0);
        }
        // Finished: spread what is left over the earliest moment `done` may arrive,
        // which is after every remaining step's 600 ms and after the 3 s total.
        let rest = &self.bands[self.shown_idx + 1..];
        let widths: Vec<f64> = rest.iter().map(|b| b.hi - b.lo).collect();
        let mins: f64 = widths.iter().map(|w| MIN_STEP.as_secs_f64().max(w / CATCH_UP)).sum();
        let sum_min = min0 + mins;
        let total = sum_min.max(self.secs_until(self.start + MIN_TOTAL));
        let surplus = total - sum_min;
        let sum_w = w0 + widths.iter().sum::<f64>();
        let share = if sum_w > 0.0 {
            w0 / sum_w
        } else {
            1.0 / (rest.len() + 1) as f64
        };
        Some(min0 + surplus * share)
    }

    fn advance(&mut self, now: Instant) {
        let now = now.max(self.last_now);
        // A paced band that ends inside this tick hands what is left of the tick to
        // the next band, so the bar does not idle at the edge until the next tick.
        while let Some(left) = self.pace_deadline() {
            let dt = (now - self.last_now).as_secs_f64();
            if self.shown_idx >= self.real_idx || dt <= left || left <= 0.0 {
                break;
            }
            self.fraction = self.fraction.max(self.bands[self.shown_idx].hi);
            self.last_now = (self.last_now + Duration::from_secs_f64(left)).min(now);
            self.shown_idx += 1;
            self.shown_entered = now;
        }
        let dt = (now - self.last_now).as_secs_f64();
        let paced = self.pace_deadline();
        let f = match paced {
            Some(left) => {
                let hi = self.bands[self.shown_idx].hi;
                if dt >= left {
                    hi
                } else {
                    self.fraction + (hi - self.fraction) * dt / left
                }
            }
            None => {
                let target = self.target(now);
                // Unless the bar follows a real byte count, it glides instead of jumping.
                let measured = self.install
                    && self.bands[self.real_idx].step == Step::Copy
                    && self.unpacked.is_some();
                if measured {
                    target
                } else {
                    target.min(self.fraction + dt * CATCH_UP)
                }
            }
        };
        self.fraction = self.fraction.max(f);
        self.last_now = now;
        if paced.is_some() && self.fraction >= self.bands[self.shown_idx].hi {
            if self.shown_idx < self.real_idx {
                self.shown_idx += 1;
                self.shown_entered = now;
            } else if self.finished {
                // The plan only reaches 1.0 after the minimum times, so this is `done`.
                self.done = true;
                self.fraction = 1.0;
            }
        }
    }

    fn snapshot(&self) -> Snapshot {
        Snapshot {
            step: self.bands[self.shown_idx].step,
            fraction: self.fraction as f32,
            done: self.done,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ms(n: u64) -> Duration {
        Duration::from_millis(n)
    }

    /// Feeds `Tick`s every 100 ms from `*t` up to `until`.
    fn run(m: &mut ProgressModel, t0: Instant, t: &mut u64, until: u64, out: &mut Vec<(u64, Snapshot)>) {
        while *t < until {
            *t += 100;
            out.push((*t, m.observe(t0 + ms(*t), Signal::Tick)));
        }
    }

    #[test]
    fn progress_never_goes_backwards() {
        let t0 = Instant::now();
        let mut m = ProgressModel::new_install(t0, Duration::from_secs(20));
        let mut seen = vec![];
        let mut t = 0;
        let signals = [
            (500, Signal::Extracted),
            (1500, Signal::Unpacked { bytes: 800, total: 1000 }),
            (2500, Signal::Unpacked { bytes: 100, total: 1000 }),
            (3000, Signal::MainComplete),
            (3500, Signal::Unpacked { bytes: 10, total: 1000 }),
            (6000, Signal::NsisExited),
            (6200, Signal::IconsDone),
            (7000, Signal::Finished),
        ];
        for (at, s) in signals {
            run(&mut m, t0, &mut t, at - 100, &mut seen);
            t = at;
            seen.push((at, m.observe(t0 + ms(at), s)));
        }
        run(&mut m, t0, &mut t, 12_000, &mut seen);
        let mut last = 0.0;
        for (_, s) in &seen {
            assert!(s.fraction >= last, "went back: {} < {last}", s.fraction);
            last = s.fraction;
        }
        assert!(seen.last().unwrap().1.done);
        assert_eq!(seen.last().unwrap().1.fraction, 1.0);
    }

    #[test]
    fn progress_waits_for_main_complete_before_ninety() {
        let t0 = Instant::now();
        let mut m = ProgressModel::new_install(t0, Duration::from_secs(5));
        let mut seen = vec![];
        let mut t = 0;
        m.observe(t0 + ms(700), Signal::Extracted);
        t = t.max(700);
        run(&mut m, t0, &mut t, 120_000, &mut seen);
        let last = seen.last().unwrap().1;
        assert_eq!(last.step, Step::Copy);
        assert!(last.fraction < 0.90, "{}", last.fraction);
        assert!(last.fraction > 0.5, "the estimate should have moved the bar: {}", last.fraction);
        // Unpacked bytes at 100% still do not reach 90% either.
        let s = m.observe(t0 + ms(121_000), Signal::Unpacked { bytes: 1000, total: 1000 });
        assert!(s.fraction < 0.90);
        let s = m.observe(t0 + ms(121_100), Signal::MainComplete);
        let s2 = m.observe(t0 + ms(121_800), Signal::Tick);
        assert!(s2.fraction >= 0.90 && s2.step == Step::Icons, "{s:?} {s2:?}");
    }

    #[test]
    fn progress_respects_minimum_durations() {
        let t0 = Instant::now();
        let mut m = ProgressModel::new_install(t0, Duration::from_secs(2));
        // A blazing fast install: every milestone at t=0.
        for s in [Signal::Extracted, Signal::MainComplete, Signal::NsisExited, Signal::Finished] {
            m.observe(t0, s);
        }
        let mut seen = vec![(0, m.observe(t0, Signal::Tick))];
        let mut t = 0;
        run(&mut m, t0, &mut t, 5_000, &mut seen);
        let done_at = seen.iter().find(|(_, s)| s.done).map(|(t, _)| *t).unwrap();
        assert!(done_at >= 3000, "done at {done_at}");
        assert!(done_at <= 3200, "done at {done_at}");
        // Each step stays at least 600 ms on screen.
        let mut start = 0;
        let mut current = seen[0].1.step;
        let mut order = vec![current];
        for (t, s) in &seen {
            if s.step != current {
                assert!(*t - start >= 600, "{current:?} lasted {}", *t - start);
                start = *t;
                current = s.step;
                order.push(current);
            }
        }
        assert_eq!(order, [Step::Prepare, Step::Copy, Step::Icons, Step::Finish]);
        assert!(seen.iter().filter(|(_, s)| !s.done).all(|(_, s)| s.fraction < 1.0));
        assert_keeps_moving(&seen);
    }

    #[test]
    fn progress_glides_instead_of_jumping() {
        let t0 = Instant::now();
        let mut m = ProgressModel::new_install(t0, Duration::from_secs(10));
        let mut seen = vec![];
        let mut t = 0;
        for (at, s) in [
            (300, Signal::Extracted),
            (1000, Signal::MainComplete),
            (1200, Signal::NsisExited),
            (1500, Signal::Finished),
        ] {
            run(&mut m, t0, &mut t, at - 100, &mut seen);
            t = at;
            seen.push((at, m.observe(t0 + ms(at), s)));
        }
        run(&mut m, t0, &mut t, 3_200, &mut seen);
        let mut worst = 0.0f32;
        let mut prev = 0.0f32;
        for (at, s) in seen.iter().filter(|(_, s)| !s.done) {
            if *at > 600 {
                worst = worst.max(s.fraction - prev);
            }
            prev = s.fraction;
        }
        assert!(worst < 0.12, "largest step {worst}");
        assert_keeps_moving(&seen);
        let done_at = seen.iter().find(|(_, s)| s.done).map(|(t, _)| *t).unwrap();
        assert!((3000..=3200).contains(&done_at), "done at {done_at}");
    }

    /// Every 100 ms tick moves the bar until `done`: it never holds at a band edge
    /// or just below 100% waiting for the minimum times.
    fn assert_keeps_moving(seen: &[(u64, Snapshot)]) {
        let end = seen.iter().position(|(_, s)| s.done).expect("never done");
        for w in seen[..=end].windows(2) {
            let ((t1, a), (t2, b)) = (w[0], w[1]);
            if t2 > t1 {
                assert!(b.fraction > a.fraction, "held at {} from {t1} to {t2} ms", a.fraction);
            }
        }
    }

    #[test]
    fn progress_follows_unpacked_bytes() {
        let t0 = Instant::now();
        let mut m = ProgressModel::new_install(t0, Duration::from_secs(30));
        m.observe(t0 + ms(700), Signal::Extracted);
        let s = m.observe(t0 + ms(1000), Signal::Unpacked { bytes: 500, total: 1000 });
        assert_eq!(s.step, Step::Copy);
        assert!((s.fraction - 0.49).abs() < 0.01, "{}", s.fraction);
        let s = m.observe(t0 + ms(1100), Signal::Unpacked { bytes: 900, total: 1000 });
        assert!((s.fraction - (0.08 + 0.82 * 0.9) as f32).abs() < 0.01, "{}", s.fraction);
    }

    #[test]
    fn update_ignores_old_main_exe() {
        // An update starts with a full-size old exe: only MainComplete moves past 90%.
        let t0 = Instant::now();
        let mut m = ProgressModel::new_install(t0, Duration::from_secs(1));
        let mut seen = vec![];
        let mut t = 0;
        run(&mut m, t0, &mut t, 10_000, &mut seen);
        assert!(seen.iter().all(|(_, s)| s.fraction < 0.90 && !s.done));
    }

    #[test]
    fn uninstall_progress_skips_data_band_when_keeping() {
        let steps = |delete: bool| {
            let t0 = Instant::now();
            let mut m = ProgressModel::new_uninstall(t0, Duration::from_secs(4), delete);
            let mut seen = vec![];
            let mut t = 0;
            run(&mut m, t0, &mut t, 700, &mut seen);
            seen.push((t, m.observe(t0 + ms(t), Signal::AppRemoved)));
            run(&mut m, t0, &mut t, 1_500, &mut seen);
            seen.push((t, m.observe(t0 + ms(t), Signal::DataRemoved)));
            run(&mut m, t0, &mut t, 2_200, &mut seen);
            seen.push((t, m.observe(t0 + ms(t), Signal::Finished)));
            run(&mut m, t0, &mut t, 6_000, &mut seen);
            let mut order: Vec<Step> = vec![];
            for (_, s) in &seen {
                if order.last() != Some(&s.step) {
                    order.push(s.step);
                }
            }
            let mut last = 0.0;
            for (_, s) in &seen {
                assert!(s.fraction >= last);
                last = s.fraction;
            }
            assert!(seen.last().unwrap().1.done);
            assert_keeps_moving(&seen);
            order
        };
        assert_eq!(steps(false), [Step::RemoveApp, Step::Finish]);
        assert_eq!(steps(true), [Step::RemoveApp, Step::RemoveData, Step::Finish]);
    }
}
