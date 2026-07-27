//! API route definitions for beacon-server.

use axum::{
    extract::{
        ws::{Message, WebSocket},
        Extension, Path, State, WebSocketUpgrade,
    },
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use futures_util::StreamExt;
use beacon_anvil_client::{
    ColumnContext, SchemaContext, TableContext,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{Column, Row, TypeInfo};

use crate::AppState;

/// Build the API router (all routes prefixed with `/api`).
pub fn api_router() -> Router<AppState> {
    Router::new()
        // Health / status
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
        // Auth (public — no JWT required)
        .route("/auth/signup", axum::routing::post(auth_signup))
        .route("/auth/login", axum::routing::post(auth_login))
        .route("/auth/me", get(auth_me))
        .route("/auth/users", get(list_users))
        .route("/auth/users/{id}/role", axum::routing::put(set_user_role))
        .route("/auth/users/{id}", axum::routing::delete(delete_user))
        // API tokens
        .route("/tokens", get(list_api_tokens))
        .route("/tokens", axum::routing::post(create_api_token))
        .route("/tokens/{id}", axum::routing::delete(delete_api_token))
        // Share links
        .route("/shares", get(list_share_links))
        .route("/shares", axum::routing::post(create_share_link))
        .route("/shares/{id}", axum::routing::delete(delete_share_link))
        .route("/shares/{id}/validate", get(validate_share_link))
        // Audit log
        .route("/audit", get(get_audit_log))
        // Dashboard CRUD + versioning
        .route("/dashboards", get(list_dashboards))
        .route("/dashboards", axum::routing::post(create_dashboard))
        .route("/dashboards/{id}", get(get_dashboard))
        .route("/dashboards/{id}", axum::routing::put(update_dashboard))
        .route("/dashboards/{id}", axum::routing::delete(delete_dashboard))
        .route("/dashboards/{id}/revisions", get(list_revisions))
        .route("/dashboards/{id}/revisions/{version}", get(get_revision))
        .route("/dashboards/{id}/restore/{version}", axum::routing::post(restore_revision))
        // Schema introspection
        .route("/schema/tables", get(list_tables))
        .route("/schema/tables/{table}/columns", get(list_columns))
        .route(
            "/schema/tables/{table}/extensions",
            get(detect_extensions),
        )
        .route("/schema/flux", get(detect_flux))
        // Query execution & compilation
        .route("/query", axum::routing::post(execute_query))
        .route("/compile", axum::routing::post(compile_query))
        // Saved queries CRUD
        .route("/queries", get(list_saved_queries))
        .route("/queries", axum::routing::post(create_saved_query))
        .route("/queries/{id}", get(get_saved_query))
        .route("/queries/{id}", axum::routing::put(update_saved_query))
        .route("/queries/{id}", axum::routing::delete(delete_saved_query))
        // AI layer (Anvil)
        .route("/ai/nl-to-query", axum::routing::post(nl_to_query))
        .route("/ai/suggest", axum::routing::post(ai_suggest))
        .route("/ai/explain", axum::routing::post(ai_explain))
        // Real-time WebSocket subscriptions
        .route("/ws/subscribe", get(ws_upgrade_handler))
        // Embed tokens
        .route("/embed/tokens", axum::routing::post(create_embed_token))
        .route("/embed/tokens/{id}/validate", get(validate_embed_token))
        // Cache management (admin)
        .route("/cache/stats", get(cache_stats))
        .route("/cache/invalidate", axum::routing::post(cache_invalidate))
        .route("/cache/invalidate/table", axum::routing::post(cache_invalidate_table))
        // Scheduled snapshots
        .route("/dashboards/{id}/snapshots", get(list_snapshots))
        .route("/dashboards/{id}/snapshots", axum::routing::post(create_snapshot_schedule))
        .route("/dashboards/{id}/snapshots/{snapshot_id}", axum::routing::delete(delete_snapshot_schedule))
        // Dashboard dependency graph
        .route("/dashboards/{id}/dependencies", get(get_dashboard_dependencies))
}

// ------------------------------------------------------------------
// Health / readiness
// ------------------------------------------------------------------

/// Liveness probe — always returns 200 if the process is up.
async fn healthz() -> &'static str {
    "ok"
}

/// Readiness probe — checks Keystone connectivity.
async fn readyz(State(state): State<AppState>) -> impl IntoResponse {
    match state.keystone.health_check().await {
        Ok(version) => (
            StatusCode::OK,
            Json(json!({
                "status": "ready",
                "keystone": { "version": version },
                "anvil": { "available": state.anvil.is_available() },
            })),
        ),
        Err(e) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "status": "not ready",
                "error": e.to_string(),
            })),
        ),
    }
}

// ------------------------------------------------------------------
// Auth
// ------------------------------------------------------------------

#[derive(Deserialize)]
struct SignupRequest {
    email: String,
    password: String,
    display_name: String,
}

#[derive(Deserialize)]
struct LoginRequest {
    email: String,
    password: String,
}

#[derive(Deserialize)]
struct SetRoleRequest {
    role: crate::auth::Role,
}

async fn auth_signup(
    State(state): State<AppState>,
    Json(req): Json<SignupRequest>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let user = state
        .user_store
        .register(&req.email, &req.password, &req.display_name, crate::auth::Role::Viewer)
        .map_err(|e| (StatusCode::CONFLICT, Json(json!({ "error": e }))))?;

    let token = crate::auth::create_token(&user, state.user_store.config())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))))?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "user": user, "token": token })),
    ))
}

async fn auth_login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let user = state
        .user_store
        .authenticate(&req.email, &req.password)
        .map_err(|e| (StatusCode::UNAUTHORIZED, Json(json!({ "error": e }))))?;

    let token = crate::auth::create_token(&user, state.user_store.config())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))))?;

    Ok(Json(json!({ "user": user, "token": token })))
}

async fn auth_me(
    Extension(claims): Extension<crate::auth::Claims>,
    State(state): State<AppState>,
) -> Result<Json<Value>, StatusCode> {
    match state.user_store.get_user(&claims.sub) {
        Some(user) => Ok(Json(json!(user))),
        None => Err(StatusCode::NOT_FOUND),
    }
}

async fn list_users(
    Extension(claims): Extension<crate::auth::Claims>,
    State(state): State<AppState>,
) -> Result<Json<Value>, StatusCode> {
    if !claims.role.can_admin() {
        return Err(StatusCode::FORBIDDEN);
    }
    let users = state.user_store.list_users();
    Ok(Json(json!({ "users": users })))
}

async fn set_user_role(
    Extension(claims): Extension<crate::auth::Claims>,
    State(state): State<AppState>,
    Path(user_id): Path<String>,
    Json(req): Json<SetRoleRequest>,
) -> Result<Json<Value>, StatusCode> {
    if !claims.role.can_admin() {
        return Err(StatusCode::FORBIDDEN);
    }
    match state.user_store.set_role(&user_id, req.role) {
        Ok(user) => Ok(Json(json!(user))),
        Err(_e) => Err(StatusCode::NOT_FOUND),
    }
}

async fn delete_user(
    Extension(claims): Extension<crate::auth::Claims>,
    State(state): State<AppState>,
    Path(user_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    if !claims.role.can_admin() {
        return Err(StatusCode::FORBIDDEN);
    }
    state.user_store.delete_user(&user_id)
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|_| StatusCode::NOT_FOUND)
}

// ------------------------------------------------------------------
// API Tokens
// ------------------------------------------------------------------

#[derive(Deserialize)]
struct CreateTokenRequest {
    name: String,
    #[serde(default)]
    scopes: Vec<String>,
    expires_in_hours: Option<u64>,
}

async fn list_api_tokens(
    Extension(claims): Extension<crate::auth::Claims>,
    State(state): State<AppState>,
) -> Result<Json<Value>, StatusCode> {
    let tokens = state.user_store.list_api_tokens(&claims.sub);
    // Redact the token hash from the response.
    let safe: Vec<Value> = tokens
        .iter()
        .map(|t| {
            json!({
                "id": t.id,
                "user_id": t.user_id,
                "name": t.name,
                "scopes": t.scopes,
                "expires_at": t.expires_at,
                "created_at": t.created_at,
                "last_used": t.last_used,
            })
        })
        .collect();
    Ok(Json(json!({ "tokens": safe })))
}

async fn create_api_token(
    Extension(claims): Extension<crate::auth::Claims>,
    State(state): State<AppState>,
    Json(req): Json<CreateTokenRequest>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let expires_at = req.expires_in_hours.map(|h| {
        Utc::now() + chrono::Duration::hours(h as i64)
    });

    let (token, raw_token) = state
        .user_store
        .create_api_token(&claims.sub, &req.name, req.scopes, expires_at)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))))?;

    state.user_store.audit(
        &claims.sub,
        "create",
        "api_token",
        &token.id,
        Some(format!("name={}", token.name)),
    );

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "token": {
                "id": token.id,
                "name": token.name,
                "scopes": token.scopes,
                "expires_at": token.expires_at,
                "created_at": token.created_at,
            },
            "raw_token": raw_token,
        })),
    ))
}

async fn delete_api_token(
    Extension(claims): Extension<crate::auth::Claims>,
    State(state): State<AppState>,
    Path(token_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    state.user_store.delete_api_token(&token_id)
        .map(|_| {
            state.user_store.audit(
                &claims.sub,
                "delete",
                "api_token",
                &token_id,
                None,
            );
            StatusCode::NO_CONTENT
        })
        .map_err(|_| StatusCode::NOT_FOUND)
}

// ------------------------------------------------------------------
// Share Links
// ------------------------------------------------------------------

#[derive(Deserialize)]
struct CreateShareLinkRequest {
    resource_type: String,
    resource_id: String,
    permission: crate::auth::SharePermission,
    expires_in_hours: Option<u64>,
}

async fn list_share_links(
    _claims: Extension<crate::auth::Claims>,
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, StatusCode> {
    let resource_type = params.get("resource_type").map(|s| s.as_str()).unwrap_or("dashboard");
    let resource_id = params.get("resource_id").map(|s| s.as_str()).unwrap_or("");
    let links = state.user_store.list_share_links(resource_type, resource_id);
    Ok(Json(json!({ "shares": links })))
}

async fn create_share_link_handler(
    Extension(claims): Extension<crate::auth::Claims>,
    State(state): State<AppState>,
    Json(req): Json<CreateShareLinkRequest>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let expires_at = req.expires_in_hours.map(|h| {
        Utc::now() + chrono::Duration::hours(h as i64)
    });

    let link = state
        .user_store
        .create_share_link(
            &req.resource_type,
            &req.resource_id,
            &claims.sub,
            req.permission,
            expires_at,
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))))?;

    state.user_store.audit(
        &claims.sub,
        "share",
        &req.resource_type,
        &req.resource_id,
        Some(format!("link_id={}", link.id)),
    );

    Ok((StatusCode::CREATED, Json(json!(link))))
}

async fn create_share_link(
    Extension(claims): Extension<crate::auth::Claims>,
    State(state): State<AppState>,
    Json(req): Json<CreateShareLinkRequest>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    create_share_link_handler(Extension(claims), State(state), Json(req)).await
}

async fn delete_share_link(
    Extension(claims): Extension<crate::auth::Claims>,
    State(state): State<AppState>,
    Path(link_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    state.user_store.delete_share_link(&link_id)
        .map(|_| {
            state.user_store.audit(
                &claims.sub,
                "delete",
                "share_link",
                &link_id,
                None,
            );
            StatusCode::NO_CONTENT
        })
        .map_err(|_| StatusCode::NOT_FOUND)
}

async fn validate_share_link(
    State(state): State<AppState>,
    Path(link_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    match state.user_store.validate_share_link(&link_id) {
        Ok(link) => Ok(Json(json!(link))),
        Err(_e) => Err(StatusCode::NOT_FOUND),
    }
}

// ------------------------------------------------------------------
// Audit Log
// ------------------------------------------------------------------

async fn get_audit_log(
    Extension(claims): Extension<crate::auth::Claims>,
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>, StatusCode> {
    if !claims.role.can_admin() {
        return Err(StatusCode::FORBIDDEN);
    }
    let limit = params
        .get("limit")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(100);
    let entries = state.user_store.query_audit_log(limit);
    Ok(Json(json!({ "entries": entries })))
}

// ------------------------------------------------------------------
// Dashboard CRUD + versioning (in-memory, single-tenant)
// ------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
struct DashboardRecord {
    id: String,
    name: String,
    description: Option<String>,
    widgets: Value,
    filters: Value,
    columns: u32,
    row_height: u32,
    tags: Vec<String>,
    owner_id: Option<String>,
    created_at: String,
    updated_at: String,
    current_version: u32,
}

#[derive(Serialize, Deserialize, Clone)]
struct DashboardRevisionRecord {
    version: u32,
    dashboard_id: String,
    snapshot: Value,
    author: Option<String>,
    created_at: String,
}

#[derive(Deserialize)]
struct CreateDashboardRequest {
    id: Option<String>,
    name: String,
    description: Option<String>,
    #[serde(default)]
    widgets: Value,
    #[serde(default)]
    filters: Value,
    #[serde(default = "default_columns")]
    columns: u32,
    #[serde(default = "default_row_height")]
    row_height: u32,
    #[serde(default)]
    tags: Vec<String>,
}

fn default_columns() -> u32 { 12 }
fn default_row_height() -> u32 { 80 }

async fn list_dashboards(
    Extension(claims): Extension<crate::auth::Claims>,
) -> Result<Json<Value>, StatusCode> {
    // Placeholder — in production this would query Keystone's relational store.
    Ok(Json(json!({ "dashboards": [] })))
}

async fn create_dashboard(
    Extension(claims): Extension<crate::auth::Claims>,
    State(state): State<AppState>,
    Json(req): Json<CreateDashboardRequest>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let id = req.id.unwrap_or_else(|| {
        format!("dash_{}", uuid::Uuid::new_v4().as_simple())
    });
    let now = chrono::Utc::now().to_rfc3339();
    let record = DashboardRecord {
        id: id.clone(),
        name: req.name,
        description: req.description,
        widgets: req.widgets,
        filters: req.filters,
        columns: req.columns,
        row_height: req.row_height,
        tags: req.tags,
        owner_id: Some(claims.sub.clone()),
        created_at: now.clone(),
        updated_at: now.clone(),
        current_version: 1,
    };

    // Store initial revision.
    let revision = DashboardRevisionRecord {
        version: 1,
        dashboard_id: id.clone(),
        snapshot: json!(record),
        author: Some(claims.sub.clone()),
        created_at: now,
    };
    state.user_store.audit(
        &claims.sub, "create", "dashboard", &id, None,
    );

    Ok((
        StatusCode::CREATED,
        Json(json!({ "dashboard": record, "revision": revision })),
    ))
}

async fn get_dashboard(
    Extension(claims): Extension<crate::auth::Claims>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    // Placeholder — return 404 for now.
    Err(StatusCode::NOT_FOUND)
}

async fn update_dashboard(
    Extension(claims): Extension<crate::auth::Claims>,
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<CreateDashboardRequest>,
) -> Result<Json<Value>, StatusCode> {
    let now = chrono::Utc::now().to_rfc3339();
    let record = DashboardRecord {
        id: id.clone(),
        name: req.name,
        description: req.description,
        widgets: req.widgets.clone(),
        filters: req.filters.clone(),
        columns: req.columns,
        row_height: req.row_height,
        tags: req.tags,
        owner_id: Some(claims.sub.clone()),
        created_at: now.clone(),
        updated_at: now.clone(),
        current_version: 2,
    };

    state.user_store.audit(
        &claims.sub, "edit", "dashboard", &id, None,
    );

    Ok(Json(json!(record)))
}

async fn delete_dashboard(
    Extension(claims): Extension<crate::auth::Claims>,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    state.user_store.audit(
        &claims.sub, "delete", "dashboard", &id, None,
    );
    Ok(StatusCode::NO_CONTENT)
}

async fn list_revisions(
    Extension(claims): Extension<crate::auth::Claims>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    // Placeholder — return empty list.
    Ok(Json(json!({ "revisions": [], "dashboard_id": id })))
}

async fn get_revision(
    Extension(claims): Extension<crate::auth::Claims>,
    Path((id, version)): Path<(String, u32)>,
) -> Result<Json<Value>, StatusCode> {
    Err(StatusCode::NOT_FOUND)
}

async fn restore_revision(
    Extension(claims): Extension<crate::auth::Claims>,
    State(state): State<AppState>,
    Path((id, version)): Path<(String, u32)>,
) -> Result<Json<Value>, StatusCode> {
    state.user_store.audit(
        &claims.sub, "restore", "dashboard", &id,
        Some(format!("version={version}")),
    );
    Ok(Json(json!({ "status": "restored", "dashboard_id": id, "version": version })))
}

// ------------------------------------------------------------------
// Schema introspection
// ------------------------------------------------------------------

/// List all tables with columns and extension indexes.
async fn list_tables(
    State(state): State<AppState>,
) -> Result<Json<Value>, StatusCode> {
    state
        .keystone
        .full_introspection()
        .await
        .map(|tables| Json(json!({ "tables": tables })))
        .map_err(|e| {
            tracing::error!(error = %e, "introspection failed");
            StatusCode::INTERNAL_SERVER_ERROR
        })
}

/// List columns for a specific table.
async fn list_columns(
    State(state): State<AppState>,
    Path(table): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    state
        .keystone
        .list_columns(&table)
        .await
        .map(|columns| Json(json!({ "table": table, "columns": columns })))
        .map_err(|e| {
            tracing::error!(error = %e, table = %table, "column introspection failed");
            StatusCode::INTERNAL_SERVER_ERROR
        })
}

/// Detect Keystone extension indexes for a specific table.
async fn detect_extensions(
    State(state): State<AppState>,
    Path(table): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    state
        .keystone
        .detect_extension_indexes(&table)
        .await
        .map(|indexes| Json(json!({ "table": table, "extension_indexes": indexes })))
        .map_err(|e| {
            tracing::error!(error = %e, table = %table, "extension detection failed");
            StatusCode::INTERNAL_SERVER_ERROR
        })
}

/// Detect Flux (event-log) tables and their consumer groups.
async fn detect_flux(
    State(state): State<AppState>,
) -> Result<Json<Value>, StatusCode> {
    state
        .keystone
        .detect_flux_tables()
        .await
        .map(|flux_tables| Json(json!({ "flux_tables": flux_tables })))
        .map_err(|e| {
            tracing::error!(error = %e, "flux detection failed");
            StatusCode::INTERNAL_SERVER_ERROR
        })
}

// ------------------------------------------------------------------
// Query execution
// ------------------------------------------------------------------

/// A request body for ad-hoc query execution.
#[derive(serde::Deserialize)]
struct QueryBody {
    sql: String,
}

/// Execute an arbitrary SQL query.
///
/// **Note**: In production, this should be restricted to read-only queries or
/// use the semantic-layer compiler. The raw endpoint is for development.
async fn execute_query(
    State(state): State<AppState>,
    Json(body): Json<QueryBody>,
) -> Result<Json<Value>, StatusCode> {
    // Basic safety: reject writes in production-like mode.
    let trimmed = body.sql.trim().to_uppercase();
    if trimmed.starts_with("INSERT")
        || trimmed.starts_with("UPDATE")
        || trimmed.starts_with("DELETE")
        || trimmed.starts_with("DROP")
        || trimmed.starts_with("ALTER")
        || trimmed.starts_with("CREATE")
        || trimmed.starts_with("TRUNCATE")
    {
        return Err(StatusCode::FORBIDDEN);
    }

    state
        .keystone
        .query(&body.sql)
        .await
        .map(|rows| {
            let count = rows.len();
            // Return column metadata from the first row if available.
            let columns: Vec<Value> = if let Some(row) = rows.first() {
                row.columns()
                    .iter()
                    .map(|col| {
                        json!({
                            "name": col.name(),
                            "type": col.type_info().name(),
                        })
                    })
                    .collect()
            } else {
                Vec::new()
            };
            Json(json!({ "columns": columns, "count": count }))
        })
        .map_err(|e| {
            tracing::error!(error = %e, "query execution failed");
            StatusCode::BAD_REQUEST
        })
}

// ------------------------------------------------------------------
// Query compilation (server-side)
// ------------------------------------------------------------------

#[derive(Deserialize)]
struct CompileRequest {
    sql: String,
}

async fn compile_query(
    Json(req): Json<CompileRequest>,
) -> Result<Json<Value>, StatusCode> {
    // In production, this would invoke the beacon-semantic compiler.
    // For now, return the SQL as-is with a cost estimate.
    let cost_tier = estimate_cost_tier(&req.sql);
    Ok(Json(json!({
        "sql": req.sql,
        "hash": simple_hash(&req.sql),
        "cost_tier": cost_tier,
    })))
}

fn estimate_cost_tier(sql: &str) -> &'static str {
    let upper = sql.to_uppercase();
    if upper.contains("LIMIT") {
        if upper.contains("LIMIT 100") || upper.contains("LIMIT 50") || upper.contains("LIMIT 10") {
            "low"
        } else {
            "medium"
        }
    } else if upper.contains("JOIN") {
        "medium"
    } else if upper.contains("FULL") || upper.contains("CROSS") {
        "high"
    } else {
        "low"
    }
}

fn simple_hash(input: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    input.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

// ------------------------------------------------------------------
// Saved queries CRUD
// ------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
struct SavedQueryRecord {
    id: String,
    name: String,
    description: Option<String>,
    definition: Value,
    tags: Vec<String>,
    created_at: String,
    updated_at: String,
    owner_id: Option<String>,
}

#[derive(Deserialize)]
struct CreateSavedQueryRequest {
    id: Option<String>,
    name: String,
    description: Option<String>,
    definition: Value,
    #[serde(default)]
    tags: Vec<String>,
    owner_id: Option<String>,
}

async fn list_saved_queries() -> Result<Json<Value>, StatusCode> {
    // Placeholder — in production this would query Keystone's relational store.
    Ok(Json(json!({ "queries": [] })))
}

async fn create_saved_queries(
    Json(req): Json<CreateSavedQueryRequest>,
) -> Result<(StatusCode, Json<Value>), StatusCode> {
    let id = req.id.unwrap_or_else(|| {
        format!("sq_{}", uuid::Uuid::new_v4().as_simple())
    });
    let now = chrono::Utc::now().to_rfc3339();
    let record = SavedQueryRecord {
        id: id.clone(),
        name: req.name,
        description: req.description,
        definition: req.definition,
        tags: req.tags,
        created_at: now.clone(),
        updated_at: now,
        owner_id: req.owner_id,
    };
    Ok((
        StatusCode::CREATED,
        Json(json!(record)),
    ))
}

async fn create_saved_query(
    Json(req): Json<CreateSavedQueryRequest>,
) -> Result<(StatusCode, Json<Value>), StatusCode> {
    create_saved_queries(Json(req)).await
}

async fn get_saved_query(
    Path(_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    // Placeholder — return 404 for now.
    Err(StatusCode::NOT_FOUND)
}

async fn update_saved_query(
    Path(id): Path<String>,
    Json(req): Json<CreateSavedQueryRequest>,
) -> Result<Json<Value>, StatusCode> {
    // Placeholder — return updated record.
    let now = chrono::Utc::now().to_rfc3339();
    let record = SavedQueryRecord {
        id,
        name: req.name,
        description: req.description,
        definition: req.definition,
        tags: req.tags,
        created_at: now.clone(),
        updated_at: now,
        owner_id: req.owner_id,
    };
    Ok(Json(json!(record)))
}

async fn delete_saved_query(
    Path(_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    Ok(StatusCode::NO_CONTENT)
}

// ------------------------------------------------------------------
// AI layer (Anvil integration)
// ------------------------------------------------------------------

fn build_schema_context(tables: &[beacon_keystone_client::TableSchema]) -> SchemaContext {
    SchemaContext {
        tables: tables
            .iter()
            .map(|t| TableContext {
                name: t.name.clone(),
                columns: t
                    .columns
                    .iter()
                    .map(|c| ColumnContext {
                        name: c.name.clone(),
                        data_type: c.data_type.clone(),
                    })
                    .collect(),
                extensions: t
                    .extension_indexes
                    .iter()
                    .map(|e| format!("{:?}", e.extension))
                    .collect(),
            })
            .collect(),
    }
}

#[derive(Deserialize)]
struct NlToQueryRequest {
    prompt: String,
}

async fn nl_to_query(
    State(state): State<AppState>,
    Json(req): Json<NlToQueryRequest>,
) -> Result<Json<Value>, StatusCode> {
    if !state.anvil.is_available() {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }

    let tables = state.keystone.list_tables().await.unwrap_or_default();
    let schema_ctx = build_schema_context(&tables);

    match state.anvil.nl_to_query(&req.prompt, &schema_ctx).await {
        Ok(result) => Ok(Json(json!(result))),
        Err(e) => {
            tracing::error!(error = %e, "Anvil NL-to-query failed");
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

#[derive(Deserialize)]
struct AiSuggestRequest {
    recent_tables: Vec<String>,
}

async fn ai_suggest(
    State(state): State<AppState>,
    Json(req): Json<AiSuggestRequest>,
) -> Result<Json<Value>, StatusCode> {
    if !state.anvil.is_available() {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }

    let tables = state.keystone.list_tables().await.unwrap_or_default();
    let schema_ctx = build_schema_context(&tables);

    match state.anvil.suggest_queries(&schema_ctx, &req.recent_tables).await {
        Ok(suggestions) => Ok(Json(json!({ "suggestions": suggestions }))),
        Err(e) => {
            tracing::error!(error = %e, "Anvil suggest failed");
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

#[derive(Deserialize)]
struct AiExplainRequest {
    sql: String,
    columns: Vec<String>,
    row_count: usize,
}

async fn ai_explain(
    State(state): State<AppState>,
    Json(req): Json<AiExplainRequest>,
) -> Result<Json<Value>, StatusCode> {
    if !state.anvil.is_available() {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }

    match state
        .anvil
        .explain_result(&req.sql, &req.columns, req.row_count)
        .await
    {
        Ok(explanation) => Ok(Json(json!(explanation))),
        Err(e) => {
            tracing::error!(error = %e, "Anvil explain failed");
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

// ------------------------------------------------------------------
// Real-time WebSocket subscriptions (Flux)
// ------------------------------------------------------------------

/// A subscription message from the client.
#[derive(Deserialize)]
struct SubscribeRequest {
    /// The table or query to subscribe to.
    table: String,
    /// Optional consumer group.
    #[serde(default)]
    consumer_group: Option<String>,
}

/// A CDC event pushed to subscribers.
#[derive(Serialize)]
struct CdcEvent {
    event_type: String,
    table: String,
    data: Value,
    offset: Option<i64>,
}

/// Handle WebSocket upgrade for real-time subscriptions.
async fn ws_upgrade_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws_connection(socket, state))
}

/// Process a single WebSocket connection for Flux subscriptions.
async fn handle_ws_connection(mut socket: WebSocket, state: AppState) {
    // Wait for the initial subscription request.
    let msg = match socket.next().await {
        Some(Ok(Message::Text(text))) => text,
        _ => {
            tracing::warn!("WebSocket connection closed before subscription");
            return;
        }
    };

    let req: SubscribeRequest = match serde_json::from_str(&msg) {
        Ok(r) => r,
        Err(e) => {
            let _ = socket
                .send(Message::Text(
                    json!({ "error": format!("invalid subscription request: {e}") }).to_string(),
                ))
                .await;
            return;
        }
    };

    // Validate table name to prevent SQL injection.
    let table_name = match beacon_semantic::sql_safety::validate_table_name(&req.table) {
        Ok(name) => name,
        Err(e) => {
            let _ = socket
                .send(Message::Text(
                    json!({ "error": format!("invalid table name: {e}") }).to_string(),
                ))
                .await;
            return;
        }
    };

    tracing::info!(
        table = %table_name,
        consumer_group = ?req.consumer_group,
        "new Flux subscription"
    );

    // Send initial acknowledgment.
    let _ = socket
        .send(Message::Text(
            json!({
                "status": "subscribed",
                "table": table_name,
                "consumer_group": req.consumer_group,
            })
            .to_string(),
        ))
        .await;

    // Poll for changes using a simple interval.
    // In production, this would use Keystone's Flux WebSocket bridge.
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
    let mut offset: i64 = 0;

    loop {
        tokio::select! {
            _ = interval.tick() => {
                // Poll for new rows (placeholder — real implementation uses Flux bridge).
                let safe_table = beacon_semantic::sql_safety::safe_identifier(&table_name)
                    .unwrap_or_default();
                let query = format!(
                    "SELECT * FROM {safe_table} WHERE \"_offset\" > {offset} ORDER BY \"_offset\" LIMIT 10",
                );
                match state.keystone.query(&query).await {
                    Ok(rows) if !rows.is_empty() => {
                        for row in &rows {
                            offset = row.try_get::<i64, _>("_offset").unwrap_or(offset + 1);
                            let event = CdcEvent {
                                event_type: "insert".to_string(),
                                table: table_name.clone(),
                                data: json!({ "offset": offset }),
                                offset: Some(offset),
                            };
                            // Invalidate cache entries for this table on CDC events.
                            {
                                let mut cache = state.query_cache.write().await;
                                cache.invalidate_table(&table_name);
                            }
                            if socket
                                .send(Message::Text(serde_json::to_string(&event).unwrap()))
                                .await
                                .is_err()
                            {
                                tracing::info!("WebSocket client disconnected");
                                return;
                            }
                        }
                    }
                    Err(e) => {
                        tracing::debug!(error = %e, "Flux poll error (table may not exist)");
                    }
                    _ => {}
                }
            }
            msg = socket.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        // Handle subscription updates or unsubscribe.
                        if let Ok(val) = serde_json::from_str::<Value>(&text) {
                            if val.get("action").and_then(|v| v.as_str()) == Some("unsubscribe") {
                                tracing::info!("Client unsubscribed");
                                let _ = socket.send(Message::Text(
                                    json!({ "status": "unsubscribed" }).to_string(),
                                )).await;
                                return;
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        tracing::info!("WebSocket connection closed");
                        return;
                    }
                    _ => {}
                }
            }
        }
    }
}

// ------------------------------------------------------------------
// Embed tokens (Phase 9)
// ------------------------------------------------------------------

#[derive(Deserialize)]
struct CreateEmbedTokenRequest {
    dashboard_id: String,
    #[serde(default = "default_view")]
    permissions: Vec<String>,
    row_filter: Option<Value>,
    theme: Option<Value>,
    expires_in_hours: Option<u64>,
}

fn default_view() -> Vec<String> {
    vec!["view".to_string()]
}

async fn create_embed_token(
    Extension(claims): Extension<crate::auth::Claims>,
    State(state): State<AppState>,
    Json(req): Json<CreateEmbedTokenRequest>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let hours = req.expires_in_hours.unwrap_or(24);
    let token = state
        .user_store
        .create_embed_token(
            &req.dashboard_id,
            &claims.sub,
            req.row_filter,
            req.theme,
            req.permissions,
            hours,
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))))?;

    state.user_store.audit(
        &claims.sub,
        "create",
        "embed_token",
        &token.id,
        Some(format!("dashboard={}", req.dashboard_id)),
    );

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "id": token.id,
            "dashboard_id": token.dashboard_id,
            "expires_at": token.expires_at,
            "embed_url": format!("/embed?token={}", token.id),
        })),
    ))
}

async fn validate_embed_token(
    State(state): State<AppState>,
    Path(token_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    match state.user_store.validate_embed_token(&token_id) {
        Ok(token) => Ok(Json(json!({
            "valid": true,
            "dashboard_id": token.dashboard_id,
            "row_filter": token.row_filter,
            "theme": token.theme,
            "permissions": token.permissions,
        }))),
        Err(_) => Err(StatusCode::NOT_FOUND),
    }
}

// ------------------------------------------------------------------
// Cache management (Phase 10)
// ------------------------------------------------------------------

async fn cache_stats(
    State(state): State<AppState>,
) -> Json<Value> {
    let cache = state.query_cache.read().await;
    Json(json!({
        "entries": cache.len(),
        "is_empty": cache.is_empty(),
    }))
}

#[derive(Deserialize)]
struct CacheInvalidateRequest {
    hash: String,
}

async fn cache_invalidate(
    State(state): State<AppState>,
    Json(req): Json<CacheInvalidateRequest>,
) -> Json<Value> {
    let mut cache = state.query_cache.write().await;
    let removed = cache.invalidate(&req.hash);
    Json(json!({ "removed": removed }))
}

#[derive(Deserialize)]
struct CacheInvalidateTableRequest {
    table: String,
}

async fn cache_invalidate_table(
    State(state): State<AppState>,
    Json(req): Json<CacheInvalidateTableRequest>,
) -> Json<Value> {
    let mut cache = state.query_cache.write().await;
    let removed = cache.invalidate_table(&req.table);
    Json(json!({ "table": req.table, "removed": removed }))
}

// ------------------------------------------------------------------
// Scheduled snapshots (Phase 5)
// ------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub struct SnapshotSchedule {
    id: String,
    dashboard_id: String,
    interval_seconds: u64,
    last_snapshot_at: Option<String>,
    enabled: bool,
    created_at: String,
}

async fn list_snapshots(
    Extension(_claims): Extension<crate::auth::Claims>,
    State(state): State<AppState>,
    Path(dashboard_id): Path<String>,
) -> Json<Value> {
    let schedules = state.snapshot_schedules.read().await;
    let filtered: Vec<&SnapshotSchedule> = schedules
        .iter()
        .filter(|s| s.dashboard_id == dashboard_id)
        .collect();
    Json(json!({ "schedules": filtered }))
}

#[derive(Deserialize)]
struct CreateSnapshotScheduleRequest {
    interval_seconds: u64,
    #[serde(default = "default_true")]
    enabled: bool,
}

fn default_true() -> bool { true }

async fn create_snapshot_schedule(
    Extension(claims): Extension<crate::auth::Claims>,
    State(state): State<AppState>,
    Path(dashboard_id): Path<String>,
    Json(req): Json<CreateSnapshotScheduleRequest>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    if req.interval_seconds < 60 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "interval must be at least 60 seconds" })),
        ));
    }
    let id = format!("snap_{}", uuid::Uuid::new_v4().as_simple());
    let now = chrono::Utc::now().to_rfc3339();
    let schedule = SnapshotSchedule {
        id: id.clone(),
        dashboard_id: dashboard_id.clone(),
        interval_seconds: req.interval_seconds,
        last_snapshot_at: None,
        enabled: req.enabled,
        created_at: now,
    };
    state.snapshot_schedules.write().await.push(schedule.clone());
    state.user_store.audit(
        &claims.sub, "create", "snapshot_schedule", &id,
        Some(format!("dashboard={dashboard_id} interval={}s", req.interval_seconds)),
    );
    Ok((StatusCode::CREATED, Json(json!(schedule))))
}

async fn delete_snapshot_schedule(
    Extension(claims): Extension<crate::auth::Claims>,
    State(state): State<AppState>,
    Path((dashboard_id, snapshot_id)): Path<(String, String)>,
) -> Result<StatusCode, StatusCode> {
    let mut schedules = state.snapshot_schedules.write().await;
    let before = schedules.len();
    schedules.retain(|s| !(s.dashboard_id == dashboard_id && s.id == snapshot_id));
    if schedules.len() == before {
        return Err(StatusCode::NOT_FOUND);
    }
    state.user_store.audit(
        &claims.sub, "delete", "snapshot_schedule", &snapshot_id, None,
    );
    Ok(StatusCode::NO_CONTENT)
}

// ------------------------------------------------------------------
// Dashboard dependency graph (Phase 5)
// ------------------------------------------------------------------

async fn get_dashboard_dependencies(
    Extension(_claims): Extension<crate::auth::Claims>,
    Path(dashboard_id): Path<String>,
) -> Json<Value> {
    // Extract query dependencies from dashboard widgets.
    // In production, this would read the dashboard config from the store.
    // For now, return the dependency graph structure.
    Json(json!({
        "dashboard_id": dashboard_id,
        "nodes": [],
        "edges": [],
        "description": "Dependency graph: widgets -> queries -> tables. Extracted from widget config at build time.",
    }))
}
