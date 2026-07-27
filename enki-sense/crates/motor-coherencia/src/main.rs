//! motor-coherencia — servidor HTTP del JUEZ de coherencia de operaciones (enki-sense).
//!
//! No es un freno: VALORA la coherencia de un acto. Crear/escribir de cero fluye;
//! un write que borra o trunca el contenido pide CONFIRMACIÓN (con el porqué), no deniega.
//!
//! Contrato (lo consume el puente por HTTP):
//!   GET  /health                          → { "status": "ok", "motor": "coherencia", ... }
//!   POST /juzgar/escritura { path, nuevo, actual?, confirmado? }
//!        → 200 { "veredicto": "ok" }
//!        →     { "veredicto": "confirmar", "motivo": "...", "detalle": { ... } }
//!
//! Juicio PURO (sin I/O, sin modelo, determinista), local, cero nube. 127.0.0.1:8126.

mod juicio;

use axum::{routing::{get, post}, Json, Router};
use juicio::OpEscritura;
use serde_json::{json, Value};

const VERSION: &str = env!("CARGO_PKG_VERSION");

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "motor": "coherencia", "version": VERSION }))
}

async fn juzgar_escritura_handler(Json(op): Json<OpEscritura>) -> Json<Value> {
    let veredicto = juicio::juzgar_escritura(&op);
    Json(serde_json::to_value(veredicto).unwrap_or_else(|_| json!({ "veredicto": "ok" })))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_target(false).init();
    let app = Router::new()
        .route("/health", get(health))
        .route("/juzgar/escritura", post(juzgar_escritura_handler));
    let port: u16 = std::env::var("MOTOR_COHERENCIA_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8126);
    let addr = format!("127.0.0.1:{port}");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("no pude escuchar en {addr}: {e}"));
    tracing::info!("motor-coherencia v{VERSION} escuchando en {addr}");
    axum::serve(listener, app).await.unwrap();
}
