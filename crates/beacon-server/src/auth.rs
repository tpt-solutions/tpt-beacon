//! Authentication and authorization for Beacon (single-tenant).
//!
//! Provides user accounts, password hashing (Argon2), JWT sessions,
//! and role-based access control (admin / editor / viewer).

use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use chrono::{DateTime, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;

// ── Types ───────────────────────────────────────────────────────

/// User roles in a single-tenant instance.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "text", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Admin,
    Editor,
    Viewer,
}

impl Role {
    /// Can this role create/edit dashboards and queries?
    pub fn can_edit(&self) -> bool {
        matches!(self, Role::Admin | Role::Editor)
    }

    /// Can this role manage users and instance settings?
    pub fn can_admin(&self) -> bool {
        matches!(self, Role::Admin)
    }

    /// Minimum role level (for comparisons).
    pub fn level(&self) -> u8 {
        match self {
            Role::Viewer => 1,
            Role::Editor => 2,
            Role::Admin => 3,
        }
    }
}

/// A user account.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub role: Role,
    pub created_at: DateTime<Utc>,
    pub last_login: Option<DateTime<Utc>>,
}

/// API token for programmatic access (Phase 8).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiToken {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub token_hash: String,   // sha256 of the raw token
    pub scopes: Vec<String>,  // e.g. ["read", "write", "queries", "dashboards"]
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub last_used: Option<DateTime<Utc>>,
}

/// Share link for a dashboard or saved query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShareLink {
    pub id: String,
    pub resource_type: String, // "dashboard" or "query"
    pub resource_id: String,
    pub created_by: String,
    pub permission: SharePermission,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SharePermission {
    View,
    Edit,
}

/// Audit log entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub id: String,
    pub user_id: String,
    pub action: String,        // "view", "edit", "create", "delete", "share", "api_call"
    pub resource_type: String, // "dashboard", "query", "user"
    pub resource_id: String,
    pub timestamp: DateTime<Utc>,
    pub details: Option<String>,
}

/// Scoped embed token for embedded analytics (Phase 9).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbedToken {
    pub id: String,
    pub dashboard_id: String,
    pub created_by: String,
    pub row_filter: Option<Value>,   // row-level filter applied at embed time
    pub theme: Option<Value>,        // custom theme overrides
    pub permissions: Vec<String>,    // ["view"] at minimum
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

/// Stored user record (includes password hash).
#[derive(Debug, Clone)]
pub struct UserRecord {
    pub user: User,
    pub password_hash: String,
}

/// JWT claims embedded in tokens.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,       // user id
    pub email: String,
    pub role: Role,
    pub exp: usize,        // expiration (unix timestamp)
    pub iat: usize,        // issued at (unix timestamp)
}

/// Auth configuration.
#[derive(Debug, Clone)]
pub struct AuthConfig {
    /// JWT signing secret (at least 32 bytes).
    pub jwt_secret: String,
    /// Token lifetime in hours (default: 24).
    pub token_lifetime_hours: u64,
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            jwt_secret: "change-me-in-production-use-a-real-secret-key-at-least-32-bytes".into(),
            token_lifetime_hours: 24,
        }
    }
}

// ── Password hashing ────────────────────────────────────────────

/// Hash a password using Argon2id.
pub fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    use argon2::password_hash::{rand_core::OsRng, SaltString};
    use argon2::{Argon2, PasswordHasher};
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)?
        .to_string();
    Ok(hash)
}

/// Verify a password against a stored hash.
pub fn verify_password(password: &str, hash: &str) -> Result<bool, argon2::password_hash::Error> {
    use argon2::password_hash::PasswordHash;
    use argon2::{Argon2, PasswordVerifier};
    let parsed = PasswordHash::new(hash)?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

// ── JWT ─────────────────────────────────────────────────────────

/// Create a JWT for a user.
pub fn create_token(user: &User, config: &AuthConfig) -> Result<String, jsonwebtoken::errors::Error> {
    let now = Utc::now().timestamp() as usize;
    let exp = now + (config.token_lifetime_hours * 3600) as usize;
    let claims = Claims {
        sub: user.id.clone(),
        email: user.email.clone(),
        role: user.role,
        exp,
        iat: now,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
    )
}

/// Validate a JWT and return the claims.
pub fn validate_token(token: &str, config: &AuthConfig) -> Result<Claims, jsonwebtoken::errors::Error> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(config.jwt_secret.as_bytes()),
        &Validation::default(),
    )?;
    Ok(data.claims)
}

// ── In-memory user store (single-tenant) ────────────────────────

/// Simple in-memory user store for single-tenant deployment.
/// In production, users would be stored in Keystone's relational tables.
pub struct UserStore {
    users: std::sync::RwLock<Vec<UserRecord>>,
    api_tokens: std::sync::RwLock<Vec<ApiToken>>,
    share_links: std::sync::RwLock<Vec<ShareLink>>,
    embed_tokens: std::sync::RwLock<Vec<EmbedToken>>,
    audit_log: std::sync::RwLock<Vec<AuditEntry>>,
    config: AuthConfig,
}

impl UserStore {
    pub fn new(config: AuthConfig) -> Arc<Self> {
        Arc::new(Self {
            users: std::sync::RwLock::new(Vec::new()),
            api_tokens: std::sync::RwLock::new(Vec::new()),
            share_links: std::sync::RwLock::new(Vec::new()),
            embed_tokens: std::sync::RwLock::new(Vec::new()),
            audit_log: std::sync::RwLock::new(Vec::new()),
            config,
        })
    }

    /// Register a new user.
    pub fn register(
        &self,
        email: &str,
        password: &str,
        display_name: &str,
        role: Role,
    ) -> Result<User, String> {
        // Password strength validation.
        if password.len() < 8 {
            return Err("password must be at least 8 characters".into());
        }
        if password.len() > 128 {
            return Err("password must be at most 128 characters".into());
        }

        let mut users = self.users.write().map_err(|e| e.to_string())?;
        if users.iter().any(|u| u.user.email == email) {
            return Err("email already registered".into());
        }
        let password_hash = hash_password(password).map_err(|e| e.to_string())?;
        let user = User {
            id: format!("usr_{}", uuid::Uuid::new_v4().as_simple()),
            email: email.to_string(),
            display_name: display_name.to_string(),
            role,
            created_at: Utc::now(),
            last_login: None,
        };
        users.push(UserRecord {
            user: user.clone(),
            password_hash,
        });
        Ok(user)
    }

    /// Authenticate a user by email + password.
    pub fn authenticate(&self, email: &str, password: &str) -> Result<User, String> {
        let mut users = self.users.write().map_err(|e| e.to_string())?;
        let record = users
            .iter_mut()
            .find(|u| u.user.email == email)
            .ok_or("invalid credentials")?;
        if !verify_password(password, &record.password_hash).map_err(|e| e.to_string())? {
            return Err("invalid credentials".into());
        }
        record.user.last_login = Some(Utc::now());
        Ok(record.user.clone())
    }

    /// Get a user by ID.
    pub fn get_user(&self, id: &str) -> Option<User> {
        let users = self.users.read().ok()?;
        users.iter().find(|u| u.user.id == id).map(|u| u.user.clone())
    }

    /// List all users (admin only).
    pub fn list_users(&self) -> Vec<User> {
        self.users
            .read()
            .map(|users| users.iter().map(|u| u.user.clone()).collect())
            .unwrap_or_default()
    }

    /// Update a user's role (admin only).
    pub fn set_role(&self, user_id: &str, role: Role) -> Result<User, String> {
        let mut users = self.users.write().map_err(|e| e.to_string())?;
        let record = users
            .iter_mut()
            .find(|u| u.user.id == user_id)
            .ok_or("user not found")?;
        record.user.role = role;
        Ok(record.user.clone())
    }

    /// Delete a user (admin only).
    pub fn delete_user(&self, user_id: &str) -> Result<(), String> {
        let mut users = self.users.write().map_err(|e| e.to_string())?;
        let len_before = users.len();
        users.retain(|u| u.user.id != user_id);
        if users.len() == len_before {
            return Err("user not found".into());
        }
        Ok(())
    }

    // ── API Tokens ───────────────────────────────────────────────

    /// Create an API token for a user. Returns the raw token (only shown once).
    pub fn create_api_token(
        &self,
        user_id: &str,
        name: &str,
        scopes: Vec<String>,
        expires_at: Option<DateTime<Utc>>,
    ) -> Result<(ApiToken, String), String> {
        use sha2::{Digest, Sha256};
        let raw_token = format!("btk_{}", uuid::Uuid::new_v4().as_simple());
        let mut hasher = Sha256::new();
        hasher.update(raw_token.as_bytes());
        let token_hash = format!("{:x}", hasher.finalize());

        let api_token = ApiToken {
            id: format!("tok_{}", uuid::Uuid::new_v4().as_simple()),
            user_id: user_id.to_string(),
            name: name.to_string(),
            token_hash,
            scopes,
            expires_at,
            created_at: Utc::now(),
            last_used: None,
        };

        let mut tokens = self.api_tokens.write().map_err(|e| e.to_string())?;
        tokens.push(api_token.clone());
        Ok((api_token, raw_token))
    }

    /// Validate an API token by its raw value.
    pub fn validate_api_token(&self, raw_token: &str) -> Result<ApiToken, String> {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(raw_token.as_bytes());
        let hash = format!("{:x}", hasher.finalize());

        let mut tokens = self.api_tokens.write().map_err(|e| e.to_string())?;
        let token = tokens
            .iter_mut()
            .find(|t| t.token_hash == hash)
            .ok_or("invalid token")?;

        if let Some(exp) = token.expires_at {
            if Utc::now() > exp {
                return Err("token expired".into());
            }
        }

        token.last_used = Some(Utc::now());
        Ok(token.clone())
    }

    /// List API tokens for a user.
    pub fn list_api_tokens(&self, user_id: &str) -> Vec<ApiToken> {
        self.api_tokens
            .read()
            .map(|tokens| {
                tokens
                    .iter()
                    .filter(|t| t.user_id == user_id)
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Delete an API token.
    pub fn delete_api_token(&self, token_id: &str) -> Result<(), String> {
        let mut tokens = self.api_tokens.write().map_err(|e| e.to_string())?;
        let len_before = tokens.len();
        tokens.retain(|t| t.id != token_id);
        if tokens.len() == len_before {
            return Err("token not found".into());
        }
        Ok(())
    }

    // ── Share Links ──────────────────────────────────────────────

    /// Create a share link for a dashboard or saved query.
    pub fn create_share_link(
        &self,
        resource_type: &str,
        resource_id: &str,
        created_by: &str,
        permission: SharePermission,
        expires_at: Option<DateTime<Utc>>,
    ) -> Result<ShareLink, String> {
        let link = ShareLink {
            id: format!("sh_{}", uuid::Uuid::new_v4().as_simple()),
            resource_type: resource_type.to_string(),
            resource_id: resource_id.to_string(),
            created_by: created_by.to_string(),
            permission,
            expires_at,
            created_at: Utc::now(),
        };

        let mut links = self.share_links.write().map_err(|e| e.to_string())?;
        links.push(link.clone());
        Ok(link)
    }

    /// Validate a share link. Returns the link if valid.
    pub fn validate_share_link(&self, link_id: &str) -> Result<ShareLink, String> {
        let links = self.share_links.read().map_err(|e| e.to_string())?;
        let link = links
            .iter()
            .find(|l| l.id == link_id)
            .ok_or("share link not found")?;

        if let Some(exp) = link.expires_at {
            if Utc::now() > exp {
                return Err("share link expired".into());
            }
        }

        Ok(link.clone())
    }

    /// List share links for a resource.
    pub fn list_share_links(&self, resource_type: &str, resource_id: &str) -> Vec<ShareLink> {
        self.share_links
            .read()
            .map(|links| {
                links
                    .iter()
                    .filter(|l| l.resource_type == resource_type && l.resource_id == resource_id)
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Delete a share link.
    pub fn delete_share_link(&self, link_id: &str) -> Result<(), String> {
        let mut links = self.share_links.write().map_err(|e| e.to_string())?;
        let len_before = links.len();
        links.retain(|l| l.id != link_id);
        if links.len() == len_before {
            return Err("share link not found".into());
        }
        Ok(())
    }

    // ── Embed Tokens ─────────────────────────────────────────────

    /// Create a scoped, short-lived embed token for a dashboard.
    pub fn create_embed_token(
        &self,
        dashboard_id: &str,
        created_by: &str,
        row_filter: Option<Value>,
        theme: Option<Value>,
        permissions: Vec<String>,
        expires_in_hours: u64,
    ) -> Result<EmbedToken, String> {
        let now = Utc::now();
        let token = EmbedToken {
            id: format!("emb_{}", uuid::Uuid::new_v4().as_simple()),
            dashboard_id: dashboard_id.to_string(),
            created_by: created_by.to_string(),
            row_filter,
            theme,
            permissions,
            expires_at: now + chrono::Duration::hours(expires_in_hours as i64),
            created_at: now,
        };

        let mut tokens = self.embed_tokens.write().map_err(|e| e.to_string())?;
        tokens.push(token.clone());
        Ok(token)
    }

    /// Validate an embed token.
    pub fn validate_embed_token(&self, token_id: &str) -> Result<EmbedToken, String> {
        let tokens = self.embed_tokens.read().map_err(|e| e.to_string())?;
        let token = tokens
            .iter()
            .find(|t| t.id == token_id)
            .ok_or("embed token not found")?;

        if Utc::now() > token.expires_at {
            return Err("embed token expired".into());
        }

        Ok(token.clone())
    }

    /// Delete an embed token.
    pub fn delete_embed_token(&self, token_id: &str) -> Result<(), String> {
        let mut tokens = self.embed_tokens.write().map_err(|e| e.to_string())?;
        let len_before = tokens.len();
        tokens.retain(|t| t.id != token_id);
        if tokens.len() == len_before {
            return Err("embed token not found".into());
        }
        Ok(())
    }

    // ── Audit Log ────────────────────────────────────────────────

    /// Record an audit log entry.
    pub fn audit(
        &self,
        user_id: &str,
        action: &str,
        resource_type: &str,
        resource_id: &str,
        details: Option<String>,
    ) {
        let entry = AuditEntry {
            id: format!("aud_{}", uuid::Uuid::new_v4().as_simple()),
            user_id: user_id.to_string(),
            action: action.to_string(),
            resource_type: resource_type.to_string(),
            resource_id: resource_id.to_string(),
            timestamp: Utc::now(),
            details,
        };
        if let Ok(mut log) = self.audit_log.write() {
            log.push(entry);
        }
    }

    /// Query the audit log (most recent first, with optional limit).
    pub fn query_audit_log(&self, limit: usize) -> Vec<AuditEntry> {
        self.audit_log
            .read()
            .map(|log| {
                let mut entries: Vec<_> = log.iter().cloned().collect();
                entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
                entries.into_iter().take(limit).collect()
            })
            .unwrap_or_default()
    }

    pub fn config(&self) -> &AuthConfig {
        &self.config
    }
}

// ── Axum middleware ──────────────────────────────────────────────

/// Extract the JWT from the Authorization header (or API token).
pub async fn auth_middleware(
    mut req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Skip auth for public routes.
    let path = req.uri().path().to_string();
    if path == "/api/healthz"
        || path == "/api/readyz"
        || path.starts_with("/api/auth/")
        || path.starts_with("/api/embed/")
    {
        return Ok(next.run(req).await);
    }

    let auth_header = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(StatusCode::UNAUTHORIZED)?;

    // Get AppState from extensions for JWT secret and API token validation.
    let state = req
        .extensions()
        .get::<crate::AppState>()
        .cloned()
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    // Try API token first (prefixed with "btk_"), then JWT.
    if token.starts_with("btk_") {
        // Validate the API token against the store.
        let api_token = state
            .user_store
            .validate_api_token(token)
            .map_err(|_| StatusCode::UNAUTHORIZED)?;

        // Get the user to determine their role.
        let user = state
            .user_store
            .get_user(&api_token.user_id)
            .ok_or(StatusCode::UNAUTHORIZED)?;

        let claims = Claims {
            sub: user.id,
            email: user.email,
            role: user.role,
            exp: api_token.expires_at.map(|e| e.timestamp() as usize).unwrap_or(usize::MAX),
            iat: 0,
        };
        req.extensions_mut().insert(claims);
        return Ok(next.run(req).await);
    }

    let claims = validate_token(token, &state.user_store.config())
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    // Insert claims into request extensions for downstream handlers.
    req.extensions_mut().insert(claims);

    Ok(next.run(req).await)
}
