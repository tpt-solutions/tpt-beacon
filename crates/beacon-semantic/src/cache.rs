//! Query result caching layer.
//!
//! Caches query results keyed by compiled query hash, with configurable TTL
//! and optional size limits.

use std::collections::HashMap;
use std::time::{Duration, Instant};
use tracing::debug;

/// A cached query result.
#[derive(Debug, Clone)]
struct CacheEntry {
    data: Vec<serde_json::Value>,
    inserted_at: Instant,
    ttl: Duration,
}

impl CacheEntry {
    fn is_expired(&self) -> bool {
        self.inserted_at.elapsed() > self.ttl
    }
}

/// In-memory query result cache.
///
/// Results are keyed by the SHA-256 hash of the compiled SQL. The cache has a
/// maximum number of entries and per-entry TTL.
pub struct QueryCache {
    entries: HashMap<String, CacheEntry>,
    max_entries: usize,
    default_ttl: Duration,
}

impl QueryCache {
    /// Create a new cache with the given capacity and default TTL.
    pub fn new(max_entries: usize, default_ttl: Duration) -> Self {
        Self {
            entries: HashMap::with_capacity(max_entries),
            max_entries,
            default_ttl,
        }
    }

    /// Create a cache with sensible defaults (1000 entries, 5-minute TTL).
    pub fn defaults() -> Self {
        Self::new(1000, Duration::from_secs(300))
    }

    /// Look up a cached result by query hash.
    pub fn get(&mut self, hash: &str) -> Option<Vec<serde_json::Value>> {
        if let Some(entry) = self.entries.get(hash) {
            if entry.is_expired() {
                debug!(hash = %hash, "cache entry expired, removing");
                self.entries.remove(hash);
                return None;
            }
            debug!(hash = %hash, "cache hit");
            Some(entry.data.clone())
        } else {
            None
        }
    }

    /// Insert a result into the cache.
    pub fn insert(&mut self, hash: String, data: Vec<serde_json::Value>) {
        self.insert_with_ttl(hash, data, self.default_ttl);
    }

    /// Insert a result with a custom TTL.
    pub fn insert_with_ttl(
        &mut self,
        hash: String,
        data: Vec<serde_json::Value>,
        ttl: Duration,
    ) {
        // Evict oldest if at capacity.
        if self.entries.len() >= self.max_entries {
            self.evict_oldest();
        }

        debug!(hash = %hash, ttl_secs = ttl.as_secs(), "cache insert");
        self.entries.insert(
            hash,
            CacheEntry {
                data,
                inserted_at: Instant::now(),
                ttl,
            },
        );
    }

    /// Remove a specific entry (e.g. on invalidation).
    pub fn invalidate(&mut self, hash: &str) -> bool {
        self.entries.remove(hash).is_some()
    }

    /// Clear all expired entries.
    pub fn cleanup(&mut self) {
        let before = self.entries.len();
        self.entries.retain(|_, entry| !entry.is_expired());
        let removed = before - self.entries.len();
        if removed > 0 {
            debug!(removed, remaining = self.entries.len(), "cache cleanup");
        }
    }

    /// Clear the entire cache.
    pub fn clear(&mut self) {
        self.entries.clear();
    }

    /// Current number of entries (including expired ones not yet cleaned up).
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Whether the cache is empty.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    fn evict_oldest(&mut self) {
        if let Some(oldest_key) = self
            .entries
            .iter()
            .min_by_key(|(_, e)| e.inserted_at)
            .map(|(k, _)| k.clone())
        {
            self.entries.remove(&oldest_key);
            debug!(key = %oldest_key, "evicted oldest cache entry");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_insert_and_get() {
        let mut cache = QueryCache::new(10, Duration::from_secs(60));
        cache.insert(
            "hash1".to_string(),
            vec![serde_json::json!({"id": 1})],
        );
        let result = cache.get("hash1");
        assert!(result.is_some());
        assert_eq!(result.unwrap().len(), 1);
    }

    #[test]
    fn test_miss() {
        let mut cache = QueryCache::defaults();
        assert!(cache.get("nonexistent").is_none());
    }

    #[test]
    fn test_invalidate() {
        let mut cache = QueryCache::defaults();
        cache.insert("hash1".to_string(), vec![]);
        assert!(cache.invalidate("hash1"));
        assert!(cache.get("hash1").is_none());
    }

    #[test]
    fn test_eviction() {
        let mut cache = QueryCache::new(2, Duration::from_secs(60));
        cache.insert("a".to_string(), vec![]);
        cache.insert("b".to_string(), vec![]);
        cache.insert("c".to_string(), vec![]); // should evict oldest
        assert_eq!(cache.len(), 2);
        assert!(cache.get("a").is_none());
        assert!(cache.get("b").is_some());
        assert!(cache.get("c").is_some());
    }

    #[test]
    fn test_clear() {
        let mut cache = QueryCache::defaults();
        cache.insert("a".to_string(), vec![]);
        cache.insert("b".to_string(), vec![]);
        cache.clear();
        assert!(cache.is_empty());
    }
}
