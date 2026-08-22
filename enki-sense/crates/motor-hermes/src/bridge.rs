use crate::config::Config;
use crate::dispatch::SharedDispatcher;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;

#[derive(Deserialize)]
pub struct ExecuteRequest {
    pub tool_name: String,
    #[serde(default)]
    pub args: Value,
    #[serde(default)]
    pub context: Value,
}

pub struct AppState {
    pub dispatcher: SharedDispatcher,
    pub config: Arc<Config>,
    pub catalog_cache: RwLock<CatalogCache>,
}

pub struct CatalogCache {
    tools: Value,
    fetched_at: Option<Instant>,
}

impl Default for CatalogCache {
    fn default() -> Self {
        Self { tools: json!([]), fetched_at: None }
    }
}

pub async fn handle_execute(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ExecuteRequest>,
) -> impl IntoResponse {
    if body.tool_name.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": { "code": "INVALID_INPUT", "message": "tool_name required" } })),
        );
    }

    let timeout = state.config.timeout_for(&body.tool_name);

    match state.dispatcher.execute(&body.tool_name, body.args, body.context, timeout).await {
        Ok(result) => (StatusCode::OK, Json(json!({ "result": result }))),
        Err(e) => {
            let status = StatusCode::from_u16(e.status_code()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
            (status, Json(json!({ "error": { "code": e.code(), "message": e.to_string() } })))
        }
    }
}

pub async fn handle_catalog(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    {
        let cache = state.catalog_cache.read().await;
        if let Some(fetched_at) = cache.fetched_at {
            if fetched_at.elapsed() < state.config.catalog_ttl {
                let tools = cache.tools.clone();
                let count = tools.as_array().map(|a| a.len()).unwrap_or(0);
                return (StatusCode::OK, Json(json!({ "tools": tools, "count": count })));
            }
        }
    }

    match state.dispatcher.request_catalog().await {
        Ok(tools) => {
            let count = tools.as_array().map(|a| a.len()).unwrap_or(0);
            let mut cache = state.catalog_cache.write().await;
            cache.tools = tools.clone();
            cache.fetched_at = Some(Instant::now());
            (StatusCode::OK, Json(json!({ "tools": tools, "count": count })))
        }
        Err(e) => {
            let cache = state.catalog_cache.read().await;
            if cache.fetched_at.is_some() {
                let tools = cache.tools.clone();
                let count = tools.as_array().map(|a| a.len()).unwrap_or(0);
                tracing::warn!("catalog refresh failed, serving stale: {e}");
                (StatusCode::OK, Json(json!({ "tools": tools, "count": count })))
            } else {
                (StatusCode::BAD_GATEWAY, Json(json!({ "error": { "code": "CATALOG_UNAVAILABLE", "message": e.to_string() } })))
            }
        }
    }
}

pub async fn handle_health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let cache = state.catalog_cache.read().await;
    let tool_count = cache.tools.as_array().map(|a| a.len()).unwrap_or(0);
    Json(json!({
        "ok": true,
        "tools": tool_count,
        "timestamp": chrono_now()
    }))
}

fn chrono_now() -> String {
    let d = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}s", d.as_secs())
}
