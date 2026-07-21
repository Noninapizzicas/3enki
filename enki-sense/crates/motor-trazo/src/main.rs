//! motor-trazo — servidor HTTP del perceptor de TRAZO (enki-sense).
//!
//! Contrato (lo consume el puente 2enki modules/motor-trazo por HTTP):
//!   GET  /health                    → { "status": "ok", "motor": "trazo", ... }
//!   POST /interpret { trazos: [[{x,y}...]...] }
//!        → 200 { "elementos": [ { tipo, bbox, cerrado, n_puntos, n_vertices } ] }
//!        →     { "fallo": { "tipo": "demasiado_grande", "motivo": "..." } }
//!
//! Geometría pura (sin modelo), cero nube. 127.0.0.1:8125 (env MOTOR_TRAZO_PORT).
//! Da GEOMETRÍA cruda; la INTENCIÓN (flecha, boceto, tachón) la infiere el LLM.

mod geometry;

use axum::{routing::{get, post}, Json, Router};
use geometry::Punto;
use serde::Deserialize;
use serde_json::{json, Value};

const VERSION: &str = env!("CARGO_PKG_VERSION");

// Cotas de sanidad: un canvas real no manda millones de puntos.
const MAX_TRAZOS: usize = 2000;
const MAX_PUNTOS: usize = 100_000;

#[derive(Deserialize)]
struct InterpretReq {
    trazos: Vec<Vec<Punto>>,
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "motor": "trazo", "version": VERSION }))
}

async fn interpret_handler(Json(req): Json<InterpretReq>) -> Json<Value> {
    let n_trazos = req.trazos.len();
    let n_puntos: usize = req.trazos.iter().map(|t| t.len()).sum();
    if n_trazos > MAX_TRAZOS || n_puntos > MAX_PUNTOS {
        return Json(json!({
            "fallo": { "tipo": "demasiado_grande", "motivo": format!("{n_trazos} trazos / {n_puntos} puntos exceden el límite ({MAX_TRAZOS}/{MAX_PUNTOS})") }
        }));
    }
    let elementos = geometry::interpretar(&req.trazos);
    Json(json!({ "elementos": elementos }))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_target(false).init();
    let app = Router::new()
        .route("/health", get(health))
        .route("/interpret", post(interpret_handler));
    let port: u16 = std::env::var("MOTOR_TRAZO_PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(8125);
    let addr = format!("127.0.0.1:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap_or_else(|e| panic!("no pude escuchar en {addr}: {e}"));
    tracing::info!("motor-trazo v{VERSION} escuchando en {addr}");
    axum::serve(listener, app).await.unwrap();
}
