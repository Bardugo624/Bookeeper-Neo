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

    /// `Err(retry_after_secs)` if the key already reached the limit inside the window.
    pub fn check(&self, key: &str, rule: Rule, now: i64) -> Result<(), u64> {
        let mut map = self.lock();
        let Some(entry) = map.get_mut(key) else {
            return Ok(());
        };
        entry.prune(now);
        if entry.failures.is_empty() {
            map.remove(key);
            return Ok(());
        }
        if entry.failures.len() < rule.max_failures as usize {
            return Ok(());
        }
        let oldest = entry.failures.front().copied().unwrap_or(now);
        let wait = oldest.saturating_add(rule.window_secs).saturating_sub(now);
        Err(wait.max(1) as u64)
    }

    pub fn record_failure(&self, key: &str, rule: Rule, now: i64) {
        let mut map = self.lock();
        if map.len() >= SWEEP_THRESHOLD && !map.contains_key(key) {
            map.retain(|_, e| {
                e.prune(now);
                !e.failures.is_empty()
            });
        }
        let entry = map.entry(key.to_string()).or_insert_with(|| Entry {
            window_secs: rule.window_secs,
            failures: VecDeque::new(),
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
