//! Query result caching layer.
//!
//! Caches query results keyed by compiled query hash, with configurable TTL,
//! optional size limits, and table-based invalidation for CDC events.

use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};
use tracing::debug;

/// A cached query result.
#[derive(Debug, Clone)]
struct CacheEntry {
    data: Vec<serde_json::Value>,
    inserted_at: Instant,
    ttl: Duration,
    /// Table names this query touches — used for table-based invalidation.
    tables: HashSet<String>,
}

impl CacheEntry {
    fn is_expired(&self) -> bool {
        self.inserted_at.elapsed() > self.ttl
    }
}

/// Configuration for the query cache, loaded from environment variables.
#[derive(Debug, Clone)]
pub struct CacheConfig {
    pub max_entries: usize,
    pub default_ttl_secs: u64,
}

impl CacheConfig {
    /// Load configuration from environment variables with sensible defaults.
    ///
    /// - `CACHE_MAX_ENTRIES` (default: 1000)
    /// - `CACHE_TTL_SECS` (default: 300, i.e. 5 minutes)
    pub fn from_env() -> Self {
        let max_entries = std::env::var("CACHE_MAX_ENTRIES")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(1000);
        let default_ttl_secs = std::env::var("CACHE_TTL_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(300);
        Self {
            max_entries,
            default_ttl_secs,
        }
    }
}

/// In-memory query result cache.
///
/// Results are keyed by the SHA-256 hash of the compiled SQL. The cache has a
/// maximum number of entries and per-entry TTL. Entries are tagged with table
/// names so that CDC events can invalidate all queries touching a table.
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

    /// Create a cache from a [`CacheConfig`].
    pub fn from_config(config: &CacheConfig) -> Self {
        Self::new(
            config.max_entries,
            Duration::from_secs(config.default_ttl_secs),
        )
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

    /// Insert a result into the cache (no table tags).
    pub fn insert(&mut self, hash: String, data: Vec<serde_json::Value>) {
        self.insert_with_tables(hash, data, self.default_ttl, HashSet::new());
    }

    /// Insert a result with a custom TTL.
    pub fn insert_with_ttl(
        &mut self,
        hash: String,
        data: Vec<serde_json::Value>,
        ttl: Duration,
    ) {
        self.insert_with_tables(hash, data, ttl, HashSet::new());
    }

    /// Insert a result tagged with the table names the query touches.
    pub fn insert_with_tables(
        &mut self,
        hash: String,
        data: Vec<serde_json::Value>,
        ttl: Duration,
        tables: HashSet<String>,
    ) {
        // Evict oldest if at capacity.
        if self.entries.len() >= self.max_entries {
            self.evict_oldest();
        }

        debug!(hash = %hash, ttl_secs = ttl.as_secs(), tables = ?tables, "cache insert");
        self.entries.insert(
            hash,
            CacheEntry {
                data,
                inserted_at: Instant::now(),
                ttl,
                tables,
            },
        );
    }

    /// Remove a specific entry (e.g. on invalidation by hash).
    pub fn invalidate(&mut self, hash: &str) -> bool {
        self.entries.remove(hash).is_some()
    }

    /// Remove all entries that touch a given table (used for CDC invalidation).
    pub fn invalidate_table(&mut self, table: &str) -> usize {
        let before = self.entries.len();
        self.entries
            .retain(|_, entry| !entry.tables.contains(table));
        let removed = before - self.entries.len();
        if removed > 0 {
            debug!(table = %table, removed, "invalidated cache entries for table");
        }
        removed
    }

    /// Remove all entries that touch any of the given tables.
    pub fn invalidate_tables(&mut self, tables: &HashSet<String>) -> usize {
        let before = self.entries.len();
        self.entries
            .retain(|_, entry| entry.tables.is_disjoint(tables));
        let removed = before - self.entries.len();
        if removed > 0 {
            debug!(?tables, removed, "invalidated cache entries for tables");
        }
        removed
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

    #[test]
    fn test_invalidate_table() {
        let mut cache = QueryCache::new(10, Duration::from_secs(60));
        let mut tables_a = HashSet::new();
        tables_a.insert("orders".to_string());
        cache.insert_with_tables("h1".to_string(), vec![], Duration::from_secs(60), tables_a);

        let mut tables_b = HashSet::new();
        tables_b.insert("customers".to_string());
        cache.insert_with_tables("h2".to_string(), vec![], Duration::from_secs(60), tables_b);

        let mut tables_c = HashSet::new();
        tables_c.insert("orders".to_string());
        tables_c.insert("customers".to_string());
        cache.insert_with_tables("h3".to_string(), vec![], Duration::from_secs(60), tables_c);

        // Invalidate "orders" — h1 and h3 should be removed.
        let removed = cache.invalidate_table("orders");
        assert_eq!(removed, 2);
        assert!(cache.get("h1").is_none());
        assert!(cache.get("h2").is_some());
        assert!(cache.get("h3").is_none());
    }

    #[test]
    fn test_invalidate_tables() {
        let mut cache = QueryCache::new(10, Duration::from_secs(60));
        let mut t1 = HashSet::new();
        t1.insert("a".to_string());
        cache.insert_with_tables("h1".to_string(), vec![], Duration::from_secs(60), t1);

        let mut t2 = HashSet::new();
        t2.insert("b".to_string());
        cache.insert_with_tables("h2".to_string(), vec![], Duration::from_secs(60), t2);

        let mut invalidate = HashSet::new();
        invalidate.insert("a".to_string());
        invalidate.insert("b".to_string());
        let removed = cache.invalidate_tables(&invalidate);
        assert_eq!(removed, 2);
        assert!(cache.is_empty());
    }

    #[test]
    fn test_insert_with_tables_no_tables() {
        let mut cache = QueryCache::new(10, Duration::from_secs(60));
        let tables = HashSet::new();
        cache.insert_with_tables(
            "h1".to_string(),
            vec![],
            Duration::from_secs(60),
            tables,
        );
        // Should not be invalidated by any table.
        assert_eq!(cache.invalidate_table("anything"), 0);
        assert!(cache.get("h1").is_some());
    }

    #[test]
    fn test_from_config() {
        let config = CacheConfig {
            max_entries: 50,
            default_ttl_secs: 120,
        };
        let cache = QueryCache::from_config(&config);
        assert_eq!(cache.max_entries, 50);
        assert_eq!(cache.default_ttl, Duration::from_secs(120));
    }
}
