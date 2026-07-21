//! motor-voz — servidor HTTP del órgano de VOZ (enki-sense).
//!
//! Contrato (lo consume el puente 2enki modules/motor-voz por HTTP):
//!   GET  /health              → { "status": "ok", "motor": "voz", ... }
//!   POST /speak { texto, voz? }
//!        → 200 { "audio_base64": "<WAV>", "sample_rate": 22050, "voz": "..." }
//!        →     { "fallo": { "tipo": "voz_no_disponible" | "error", "motivo": "..." } }
//!
//! Nativo (piper-rs = voces Piper ONNX vía ort), cero nube. 127.0.0.1:8124
//! (env MOTOR_VOZ_PORT). Cada voz se carga perezosa y se cachea.

mod speak;

use axum::{routing::{get, post}, Json, Router};
use base64::Engine;
use serde::Deserialize;
use serde_json::{json, Value};
use speak::{Locutor, VOZ_DEFECTO};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

const VERSION: &str = env!("CARGO_PKG_VERSION");

type Cache = Arc<Mutex<HashMap<String, Arc<Mutex<Locutor>>>>>;

#[derive(Deserialize)]
struct SpeakReq {
    texto: String,
    #[serde(default)]
    voz: Option<String>,
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "motor": "voz", "version": VERSION }))
}

fn decir_sync(cache: &Cache, req: &SpeakReq) -> Result<(String, u32, String), (String, String)> {
    let voz = req.voz.clone().unwrap_or_else(|| VOZ_DEFECTO.to_string());
    let loc = {
        let mapa = cache.lock().unwrap();
        if let Some(l) = mapa.get(&voz) {
            l.clone()
        } else {
            drop(mapa);
            let cargado = Locutor::cargar(&voz).map_err(|e| {
                let m = e.to_string();
                let tipo = if m.contains("voz_no_disponible") { "voz_no_disponible" } else { "error" };
                (tipo.to_string(), m)
            })?;
            let arc = Arc::new(Mutex::new(cargado));
            cache.lock().unwrap().insert(voz.clone(), arc.clone());
            arc
        }
    };
    let mut l = loc.lock().unwrap();
    let (wav, sr) = l.decir(&req.texto).map_err(|e| ("error".to_string(), e.to_string()))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&wav);
    Ok((b64, sr, voz))
}

async fn speak_handler(
    axum::extract::State(cache): axum::extract::State<Cache>,
    Json(req): Json<SpeakReq>,
) -> Json<Value> {
    let res = tokio::task::spawn_blocking(move || decir_sync(&cache, &req))
        .await
        .unwrap_or_else(|e| Err(("error".to_string(), format!("panic: {e}"))));
    match res {
        Ok((audio_base64, sample_rate, voz)) => {
            Json(json!({ "audio_base64": audio_base64, "sample_rate": sample_rate, "voz": voz }))
        }
        Err((tipo, motivo)) => Json(json!({ "fallo": { "tipo": tipo, "motivo": motivo } })),
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_target(false).init();
    let cache: Cache = Arc::new(Mutex::new(HashMap::new()));
    let app = Router::new()
        .route("/health", get(health))
        .route("/speak", post(speak_handler))
        .with_state(cache);
    let port: u16 = std::env::var("MOTOR_VOZ_PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(8124);
    let addr = format!("127.0.0.1:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap_or_else(|e| panic!("no pude escuchar en {addr}: {e}"));
    tracing::info!("motor-voz v{VERSION} escuchando en {addr}");
    axum::serve(listener, app).await.unwrap();
}
