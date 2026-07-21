//! motor-ojo — servidor HTTP fino del órgano de RENDER (enki-sense).
//!
//! Contrato (lo consume el puente 2enki modules/motor-ojo por HTTP):
//!   GET  /health           → { "status": "ok", "motor": "ojo", "version": "..." }
//!   POST /render { tipo, fuente, opts? }
//!        → 200 { "base64": "...", "ext": "png|pdf|svg" }
//!        →     { "fallo": { "tipo": "error", "motivo": "..." } }   (nunca inventa bytes)
//!
//! Nativo (Rust puro: resvg/usvg/svg2pdf, sin Chromium) — molde OCR4RS. Escucha
//! en 127.0.0.1:8120 (env MOTOR_OJO_PORT). Solo loopback: lo llama el core.

mod render;

use axum::{routing::{get, post}, Json, Router};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Deserialize)]
struct RenderReq {
    tipo: String,
    fuente: String,
    #[serde(default)]
    opts: Value,
}

#[derive(Serialize)]
struct RenderOk {
    base64: String,
    ext: String,
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "motor": "ojo", "version": VERSION }))
}

async fn render_handler(Json(req): Json<RenderReq>) -> Json<Value> {
    match render::render(&req.tipo, &req.fuente, &req.opts) {
        Ok(r) => {
            let base64 = base64::engine::general_purpose::STANDARD.encode(&r.bytes);
            Json(serde_json::to_value(RenderOk { base64, ext: r.ext.to_string() }).unwrap())
        }
        // Honestidad: el motivo real viaja en fallo.motivo — el puente lo mapea a 422.
        Err(motivo) => Json(json!({ "fallo": { "tipo": "error", "motivo": motivo } })),
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_target(false).init();

    let app = Router::new()
        .route("/health", get(health))
        .route("/render", post(render_handler));

    let port: u16 = std::env::var("MOTOR_OJO_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8120);
    let addr = format!("127.0.0.1:{port}");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("no pude escuchar en {addr}: {e}"));
    tracing::info!("motor-ojo v{VERSION} escuchando en {addr}");
    axum::serve(listener, app).await.unwrap();
}
