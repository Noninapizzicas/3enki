mod auth;
mod dispatch;

use auth::Token;
use axum::{
    extract::State,
    http::StatusCode,
    middleware::{self},
    routing::{get, post},
    Json, Router,
};
use dispatch::{ExecuteError, MqttDispatcher, TimeoutConfig};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Instant;
use tracing_subscriber;

const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Estado compartido del servidor.
struct AppState {
    dispatcher: MqttDispatcher,
    token: Arc<Token>,
    started: Instant,
}

#[derive(Deserialize)]
struct ExecuteBody {
    tool_name: String,
    #[serde(default)]
    args: Value,
    #[serde(default)]
    context: Option<Value>,
}

/// POST /execute — ejecuta una tool.
async fn handle_execute(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ExecuteBody>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if body.tool_name.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": {"code": "INVALID_INPUT", "message": "tool_name (string) required"}})),
        ));
    }

    // Fusionar args + context (como hace hermes-bridge)
    let mut args = body.args;
    if let Some(ctx) = &body.context {
        if let (Value::Object(ref mut args_map), Value::Object(ctx_map)) = (&mut args, ctx) {
            for (k, v) in ctx_map {
                args_map.entry(k.clone()).or_insert_with(|| v.clone());
            }
        }
    }

    tracing::debug!(tool = %body.tool_name, "execute");

    match state.dispatcher.execute(&body.tool_name, args).await {
        Ok(result) => Ok(Json(json!({"result": result}))),
        Err(ExecuteError::Mqtt(e)) => Err((
            StatusCode::BAD_GATEWAY,
            Json(json!({"error": {"code": "MQTT_ERROR", "message": e}})),
        )),
        Err(ExecuteError::Internal(e)) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": {"code": "INTERNAL_ERROR", "message": e}})),
        )),
        Err(ExecuteError::Timeout(ms, tool)) => Err((
            StatusCode::GATEWAY_TIMEOUT,
            Json(json!({"error": {"code": "UPSTREAM_TIMEOUT", "message": format!("timeout after {ms}ms ({tool})")}})),
        )),
        Err(ExecuteError::Tool { code, message, status }) => {
            let http_status = StatusCode::from_u16(status).unwrap_or(match code.as_str() {
                "TOOL_NOT_FOUND" => StatusCode::NOT_FOUND,
                "INVALID_INPUT" => StatusCode::BAD_REQUEST,
                _ => StatusCode::INTERNAL_SERVER_ERROR,
            });
            Err((
                http_status,
                Json(json!({"error": {"code": code, "message": message}})),
            ))
        }
    }
}

/// GET /catalog — catálogo de tools.
/// EXPERIMENTO MÍNIMO: devuelve catálogo vacío + aviso.
/// En futura versión se obtendrá del bus MQTT.
async fn handle_catalog() -> Json<Value> {
    Json(json!({
        "tools": [],
        "note": "motor-hermes v{VERSION} — catálogo vía MQTT pendiente. Usa hermes-bridge (puerto 3000) para catalog por ahora.",
        "count": 0
    }))
}

/// GET /health — health check (sin auth).
async fn handle_health(State(state): State<Arc<AppState>>) -> Json<Value> {
    let uptime = state.started.elapsed().as_secs_f64();
    Json(json!({
        "ok": true,
        "service": "motor-hermes",
        "version": VERSION,
        "mqtt": state.dispatcher.is_connected(),
        "uptime_secs": uptime,
        "timestamp": chrono_now(),
    }))
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let d = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = d.as_secs();
    // ISO 8601 simple sin chrono dep
    let days = secs / 86400;
    let time_secs = secs % 86400;
    let hours = time_secs / 3600;
    let mins = (time_secs % 3600) / 60;
    let secs_remain = time_secs % 60;
    format!("2026-{:02}-{:02}T{:02}:{:02}:{:02}Z", 8, 22 + days as u8, hours, mins, secs_remain)
    // Nota: fecha aproximada; para prod meter crate chrono
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_target(false).init();

    // ── Config ────────────────────────────────────────────────
    let host: String = std::env::var("MOTOR_HERMES_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("MOTOR_HERMES_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8130);
    let broker_host: String =
        std::env::var("MOTOR_HERMES_BROKER").unwrap_or_else(|_| "127.0.0.1".into());
    let broker_port: u16 = std::env::var("MOTOR_HERMES_BROKER_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(1883);
    let client_id = format!("motor-hermes-{}", std::process::id());

    let timeouts = TimeoutConfig {
        default_ms: std::env::var("MOTOR_HERMES_TIMEOUT_MS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(15000),
        code_ms: std::env::var("MOTOR_HERMES_TIMEOUT_CODE_MS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(65000),
        agent_ms: std::env::var("MOTOR_HERMES_TIMEOUT_AGENT_MS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(300000),
    };

    // ── Conectar al bus ──────────────────────────────────────
    let dispatcher = MqttDispatcher::connect(&broker_host, broker_port, &client_id, timeouts)
        .await
        .expect("Fallo conexión MQTT");

    // ── Token ────────────────────────────────────────────────
    let token = Arc::new(Token::load(None));

    // ── Router ───────────────────────────────────────────────
    let state = Arc::new(AppState {
        dispatcher,
        token: token.clone(),
        started: Instant::now(),
    });

    let app = Router::new()
        // /health sin auth
        .route("/health", get(handle_health))
        // /execute y /catalog con auth
        .nest(
            "/",
            Router::new()
                .route("/execute", post(handle_execute))
                .route("/catalog", get(handle_catalog))
                .layer(middleware::from_fn_with_state(token.clone(), auth::auth_middleware)),
        )
        .with_state(state);

    let addr = format!("{host}:{port}");
    tracing::info!("motor-hermes v{VERSION} → http://{addr}");
    tracing::info!("  MQTT broker: mqtt://{broker_host}:{broker_port}");

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("no se pudo bindear puerto");

    axum::serve(listener, app)
        .await
        .expect("servidor cayó");
}
