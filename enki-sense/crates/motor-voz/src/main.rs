//! motor-voz — servidor HTTP del órgano de VOZ (enki-sense).
//!
//! Contrato (lo consume el puente 2enki modules/motor-voz por HTTP):
//!   GET  /health              → { "status": "ok", "motor": "voz", ... }
//!   POST /speak { texto, voz?, idioma? }
//!        → 200 { "audio_base64": "<WAV>", "sample_rate": 44100, "voz": "..." }
//!        →     { "fallo": { "tipo": "voz_no_disponible" | "error", "motivo": "..." } }
//!
//! Supertonic ONNX (sin espeak-ng, sin piper-rs), 44.1kHz, 31 idiomas.
//! 127.0.0.1:8124 (env MOTOR_VOZ_PORT). El engine se carga una vez al arrancar.

mod speak;

use axum::{routing::{get, post}, Json, Router};
use base64::Engine;
use serde::Deserialize;
use serde_json::{json, Value};
use speak::{Motor, VOZ_DEFECTO};
use std::sync::Arc;

const VERSION: &str = env!("CARGO_PKG_VERSION");

type AppState = Arc<Motor>;

#[derive(Deserialize)]
struct SpeakReq {
    texto: String,
    #[serde(default)]
    voz: Option<String>,
    #[serde(default)]
    idioma: Option<String>,
}

async fn health(axum::extract::State(motor): axum::extract::State<AppState>) -> Json<Value> {
    Json(json!({
        "status": "ok",
        "motor": "voz",
        "version": VERSION,
        "engine": "supertonic",
        "sample_rate": motor.sample_rate,
        "voces": motor.voces_disponibles()
    }))
}

async fn speak_handler(
    axum::extract::State(motor): axum::extract::State<AppState>,
    Json(req): Json<SpeakReq>,
) -> Json<Value> {
    let voz = req.voz.unwrap_or_else(|| VOZ_DEFECTO.to_string());
    let idioma = req.idioma.unwrap_or_else(|| "es".to_string());

    let voz_ret = voz.clone();
    let res = tokio::task::spawn_blocking(move || motor.decir(&req.texto, &voz, &idioma))
        .await
        .unwrap_or_else(|e| Err(anyhow::anyhow!("panic: {e}")));

    match res {
        Ok((wav, sr)) => {
            let b64 = base64::engine::general_purpose::STANDARD.encode(&wav);
            Json(json!({ "audio_base64": b64, "sample_rate": sr, "voz": voz_ret }))
        }
        Err(e) => {
            let m = e.to_string();
            let tipo = if m.contains("voz_no_disponible") { "voz_no_disponible" }
                       else if m.contains("idioma no soportado") { "idioma_no_soportado" }
                       else { "error" };
            Json(json!({ "fallo": { "tipo": tipo, "motivo": m } }))
        }
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_target(false).init();

    let models_dir = std::env::var("MOTOR_VOZ_MODELS")
        .unwrap_or_else(|_| "/opt/enki-sense/models/voz".to_string());

    let motor = match Motor::cargar(&models_dir) {
        Ok(m) => Arc::new(m),
        Err(e) => {
            tracing::error!("no pude cargar el motor TTS: {e}");
            tracing::error!("ejecuta get-models.sh para provisionar los modelos ONNX");
            std::process::exit(1);
        }
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/speak", post(speak_handler))
        .with_state(motor);

    let port: u16 = std::env::var("MOTOR_VOZ_PORT")
        .ok().and_then(|s| s.parse().ok()).unwrap_or(8124);
    let addr = format!("127.0.0.1:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await
        .unwrap_or_else(|e| panic!("no pude escuchar en {addr}: {e}"));
    tracing::info!("motor-voz v{VERSION} (Supertonic ONNX) escuchando en {addr}");
    axum::serve(listener, app).await.unwrap();
}
