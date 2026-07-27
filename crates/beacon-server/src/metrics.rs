//! Observability middleware for beacon-server.
//!
//! Provides:
//! - Request count and latency metrics (structured logs consumable by Prometheus/Grafana)
//! - Simple in-memory rate limiter per IP

use axum::{
    extract::{ConnectInfo, Request},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::Arc,
    time::Instant,
};
use tokio::sync::RwLock;

/// Rate limiter state: tracks requests per IP within a sliding window.
struct RateLimiterInner {
    /// IP -> (count, window_start)
    hits: RwLock<HashMap<IpKey, (u64, Instant)>>,
    max_requests: u64,
    window_secs: u64,
}

#[derive(Debug, Clone, Hash, Eq, PartialEq)]
struct IpKey(String);

/// In-memory rate limiter.
pub struct RateLimiter {
    inner: Arc<RateLimiterInner>,
}

impl RateLimiter {
    pub fn new(max_requests: u64, window_secs: u64) -> Self {
        Self {
            inner: Arc::new(RateLimiterInner {
                hits: RwLock::new(HashMap::new()),
                max_requests,
                window_secs,
            }),
        }
    }

    /// Returns `true` if the request is allowed, `false` if rate-limited.
    pub async fn check(&self, ip: &str) -> bool {
        let mut hits = self.inner.hits.write().await;
        let now = Instant::now();
        let key = IpKey(ip.to_string());

        if let Some((count, window_start)) = hits.get_mut(&key) {
            if now.duration_since(*window_start).as_secs() > self.inner.window_secs {
                // Window expired, reset.
                *count = 1;
                *window_start = now;
                return true;
            }
            if *count >= self.inner.max_requests {
                return false;
            }
            *count += 1;
            return true;
        }

        hits.insert(key, (1, now));
        true
    }
}

/// Middleware: log request metrics and enforce rate limits.
pub async fn metrics_middleware(
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let start = Instant::now();
    let method = req.method().clone();
    let path = req.uri().path().to_string();

    // Extract client IP.
    let ip = req
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|ci| ci.0.ip().to_string())
        .or_else(|| {
            req.headers()
                .get("x-forwarded-for")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.split(',').next())
                .map(|s| s.trim().to_string())
        })
        .unwrap_or_else(|| "unknown".to_string());

    // Enforce rate limit via AppState.
    if let Some(state) = req.extensions().get::<crate::AppState>().cloned() {
        if !state.rate_limiter.check(&ip).await {
            tracing::warn!(client_ip = %ip, path = %path, "rate limited");
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
    }

    let response = next.run(req).await;

    let elapsed = start.elapsed().as_millis();
    let status = response.status().as_u16();

    // Structured log for Prometheus/Grafana consumption.
    tracing::info!(
        method = %method,
        path = %path,
        status = status,
        elapsed_ms = elapsed as u64,
        client_ip = %ip,
        "request"
    );

    Ok(response)
}
