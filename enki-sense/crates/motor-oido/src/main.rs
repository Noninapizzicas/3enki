//! motor-oido — servidor HTTP fino del órgano de TRANSCRIPCIÓN (enki-sense).
//!
//! Contrato (lo consume el puente 2enki modules/motor-oido por HTTP):
//!   GET  /health                     → { "status": "ok", "motor": "oido", ... }
//!   POST /transcribe { audio_base64, idioma? }
//!        → 200 { "texto": "...", "idioma": "es", "confianza": 0.87 }
//!        →     { "fallo": { "tipo": "error", "motivo": "..." } }
//!
//! Nativo (candle-whisper), cero nube. Escucha en 127.0.0.1:8122
//! (env MOTOR_OIDO_PORT). Solo loopback: lo llama el core. El modelo se carga
//! perezoso una vez y se reutiliza (cargarlo es caro).

mod transcribe;

use axum::{routing::{get, post}, Json, Router};
use base64::Engine;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use transcribe::Transcriber;

const VERSION: &str = env!("CARGO_PKG_VERSION");

type Modelo = Arc<Mutex<Option<Transcriber>>>;

#[derive(Deserialize)]
struct TranscribeReq {
    audio_base64: String,
    #[serde(default)]
    idioma: Option<String>,
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "motor": "oido", "version": VERSION }))
}

fn transcribir_sync(modelo: &Modelo, req: &TranscribeReq) -> Result<(String, String, f64), String> {
    let wav = base64::engine::general_purpose::STANDARD
        .decode(req.audio_base64.trim())
        .map_err(|e| format!("base64 inválido: {e}"))?;
    let mut guard = modelo.lock().unwrap();
    if guard.is_none() {
        *guard = Some(Transcriber::cargar().map_err(|e| e.to_string())?);
    }
    let t = guard.as_mut().unwrap();
    t.transcribir(&wav, req.idioma.as_deref()).map_err(|e| e.to_string())
}

async fn transcribe_handler(
    axum::extract::State(modelo): axum::extract::State<Modelo>,
    Json(req): Json<TranscribeReq>,
) -> Json<Value> {
    let res = tokio::task::spawn_blocking(move || transcribir_sync(&modelo, &req))
        .await
        .unwrap_or_else(|e| Err(format!("panic: {e}")));
    match res {
        Ok((texto, idioma, avg_logprob)) => {
            // avg_logprob (≤0) → confianza aproximada en [0,1] (media geométrica de probs).
            let confianza = avg_logprob.exp().clamp(0.0, 1.0);
            Json(json!({ "texto": texto, "idioma": idioma, "confianza": confianza }))
        }
        Err(motivo) => Json(json!({ "fallo": { "tipo": "error", "motivo": motivo } })),
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_target(false).init();
    let modelo: Modelo = Arc::new(Mutex::new(None));

    let app = Router::new()
        .route("/health", get(health))
        .route("/transcribe", post(transcribe_handler))
        .with_state(modelo);

    let port: u16 = std::env::var("MOTOR_OIDO_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8122);
    let addr = format!("127.0.0.1:{port}");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("no pude escuchar en {addr}: {e}"));
    tracing::info!("motor-oido v{VERSION} escuchando en {addr}");
    axum::serve(listener, app).await.unwrap();
}
