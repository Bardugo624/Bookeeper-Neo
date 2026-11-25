//! In-memory limiter for failed attempts (login, pairing redeem, setup code).

use std::collections::{HashMap, VecDeque};
use std::sync::{Mutex, MutexGuard};

#[derive(Debug, Clone, Copy)]
pub struct Rule {
    pub max_failures: u32,
    pub window_secs: i64,
}

/// Per email.
pub const LOGIN: Rule = Rule {
    max_failures: 5,
    window_secs: 900,
};
/// Global.
pub const REDEEM: Rule = Rule {
    max_failures: 10,
    window_secs: 600,
};
/// Global.
pub const SETUP: Rule = Rule {
    max_failures: 5,
    window_secs: 900,
};

/// Above this many keys, a record sweeps every expired entry.
const SWEEP_THRESHOLD: usize = 10_000;

struct Entry {
    window_secs: i64,
    /// Failure timestamps, oldest first; never more than `max_failures` of them.
    failures: VecDeque<i64>,
    /// Attempts reserved with `begin` and not yet resolved.
    pending: usize,
}

impl Entry {
    fn prune(&mut self, now: i64) {
        while let Some(&t) = self.failures.front() {
            if t <= now - self.window_secs {
                self.failures.pop_front();
            } else {
                break;
            }
        }
    }
}

#[derive(Default)]
pub struct RateLimiter {
    entries: Mutex<HashMap<String, Entry>>,
}

impl RateLimiter {
    fn lock(&self) -> MutexGuard<'_, HashMap<String, Entry>> {
        self.entries.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// `Err(retry_after_secs)` if the key already reached the limit inside the window,
    /// counting in-flight attempts too.
    pub fn check(&self, key: &str, rule: Rule, now: i64) -> Result<(), u64> {
        let mut map = self.lock();
        Self::check_locked(&mut map, key, rule, now)
    }

    fn check_locked(
        map: &mut HashMap<String, Entry>,
        key: &str,
        rule: Rule,
        now: i64,
    ) -> Result<(), u64> {
        let Some(entry) = map.get_mut(key) else {
            return Ok(());
        };
        entry.prune(now);
        if entry.failures.is_empty() && entry.pending == 0 {
            map.remove(key);
            return Ok(());
        }
        if entry.failures.len() + entry.pending < rule.max_failures as usize {
            return Ok(());
        }
        let wait = if entry.failures.len() < rule.max_failures as usize {
            // Without the in-flight attempts the key would be under the limit: they
            // resolve shortly.
            1
        } else {
            match entry.failures.front() {
                Some(&oldest) => oldest.saturating_add(rule.window_secs).saturating_sub(now),
                None => 1,
            }
        };
        Err(wait.max(1) as u64)
    }

    /// Reserves an attempt, atomically with the limit check. `Err(retry_after_secs)` if,
    /// counting in-flight attempts, the limit is reached. Dropping the returned
    /// [`Attempt`] without an outcome releases the reservation (same as `neutral`).
    pub fn begin(&self, key: &str, rule: Rule, now: i64) -> Result<Attempt<'_>, u64> {
        let mut map = self.lock();
        Self::check_locked(&mut map, key, rule, now)?;
        if map.len() >= SWEEP_THRESHOLD && !map.contains_key(key) {
            map.retain(|_, e| {
                e.prune(now);
                !e.failures.is_empty() || e.pending > 0
            });
        }
        let entry = map.entry(key.to_string()).or_insert_with(|| Entry {
            window_secs: rule.window_secs,
            failures: VecDeque::new(),
            pending: 0,
        });
        entry.window_secs = rule.window_secs;
        entry.pending += 1;
        Ok(Attempt {
            limiter: self,
            key: key.to_string(),
            rule,
            now,
            done: false,
        })
    }

    /// Releases one reservation; with `failed`, records a failure in its place.
    fn resolve(&self, key: &str, rule: Rule, now: i64, outcome: Outcome) {
        let mut map = self.lock();
        if outcome == Outcome::Success {
            // Other in-flight attempts keep their reservations.
            if let Some(entry) = map.get_mut(key) {
                entry.failures.clear();
                entry.pending = entry.pending.saturating_sub(1);
                if entry.pending == 0 {
                    map.remove(key);
                }
            }
            return;
        }
        let Some(entry) = map.get_mut(key) else {
            if outcome == Outcome::Failure {
                drop(map);
                self.record_failure(key, rule, now);
            }
            return;
        };
        entry.pending = entry.pending.saturating_sub(1);
        if outcome == Outcome::Failure {
            entry.window_secs = rule.window_secs;
            entry.prune(now);
            entry.failures.push_back(now);
            let cap = (rule.max_failures as usize).max(1);
            while entry.failures.len() > cap {
                entry.failures.pop_front();
            }
        } else if entry.failures.is_empty() && entry.pending == 0 {
            map.remove(key);
        }
    }

    pub fn record_failure(&self, key: &str, rule: Rule, now: i64) {
        let mut map = self.lock();
        if map.len() >= SWEEP_THRESHOLD && !map.contains_key(key) {
            map.retain(|_, e| {
                e.prune(now);
                !e.failures.is_empty() || e.pending > 0
            });
        }
        let entry = map.entry(key.to_string()).or_insert_with(|| Entry {
            window_secs: rule.window_secs,
            failures: VecDeque::new(),
            pending: 0,
        });
        entry.window_secs = rule.window_secs;
        entry.prune(now);
        entry.failures.push_back(now);
        let cap = (rule.max_failures as usize).max(1);
        while entry.failures.len() > cap {
            entry.failures.pop_front();
        }
    }

    pub fn reset(&self, key: &str) {
        self.lock().remove(key);
    }

    /// Number of keys currently stored (for tests).
    pub fn len(&self) -> usize {
        self.lock().len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Outcome {
    Success,
    Failure,
    Neutral,
}

/// A reserved attempt. Holds no lock, so it can live across an `.await`.
#[must_use = "an attempt must be resolved with succeeded, failed or neutral"]
pub struct Attempt<'a> {
    limiter: &'a RateLimiter,
    key: String,
    rule: Rule,
    now: i64,
    done: bool,
}

impl Attempt<'_> {
    fn finish(mut self, outcome: Outcome) {
        self.done = true;
        self.limiter
            .resolve(&self.key, self.rule, self.now, outcome);
    }

    /// Clears the key.
    pub fn succeeded(self) {
        self.finish(Outcome::Success);
    }

    /// The attempt stays counted as a failure.
    pub fn failed(self) {
        self.finish(Outcome::Failure);
    }

    /// Releases the reservation without counting it.
    pub fn neutral(self) {
        self.finish(Outcome::Neutral);
    }
}

impl Drop for Attempt<'_> {
    fn drop(&mut self) {
        if !self.done {
            self.limiter
                .resolve(&self.key, self.rule, self.now, Outcome::Neutral);
        }
    }
}
