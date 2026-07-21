//! motor-sonido — servidor HTTP del perceptor de PROSODIA (enki-sense).
//!
//! Contrato (lo consume el puente 2enki modules/motor-sonido por HTTP):
//!   GET  /health                → { "status": "ok", "motor": "sonido", ... }
//!   POST /analyze { audio_base64 }
//!        → 200 { "features": { energia_rms, pitch_hz, tasa_silabas_s, ... } }
//!        →     { "fallo": { "tipo": "error", "motivo": "..." } }
//!
//! DSP puro (sin modelo), cero nube. 127.0.0.1:8123 (env MOTOR_SONIDO_PORT).
//! Da features CRUDAS; la etiqueta emocional la pone el LLM (no el motor).

mod analyze;

use axum::{routing::{get, post}, Json, Router};
use base64::Engine;
use serde::Deserialize;
use serde_json::{json, Value};

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Deserialize)]
struct AnalyzeReq {
    audio_base64: String,
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "motor": "sonido", "version": VERSION }))
}

async fn analyze_handler(Json(req): Json<AnalyzeReq>) -> Json<Value> {
    let res = (|| {
        let wav = base64::engine::general_purpose::STANDARD
            .decode(req.audio_base64.trim())
            .map_err(|e| format!("base64 inválido: {e}"))?;
        analyze::analizar(&wav).map_err(|e| e.to_string())
    })();
    match res {
        Ok(features) => Json(json!({ "features": features })),
        Err(motivo) => Json(json!({ "fallo": { "tipo": "error", "motivo": motivo } })),
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_target(false).init();
    let app = Router::new()
        .route("/health", get(health))
        .route("/analyze", post(analyze_handler));
    let port: u16 = std::env::var("MOTOR_SONIDO_PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(8123);
    let addr = format!("127.0.0.1:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap_or_else(|e| panic!("no pude escuchar en {addr}: {e}"));
    tracing::info!("motor-sonido v{VERSION} escuchando en {addr}");
    axum::serve(listener, app).await.unwrap();
}
