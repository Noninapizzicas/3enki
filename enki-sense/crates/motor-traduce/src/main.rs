//! motor-traduce — servidor HTTP fino del órgano de TRADUCCIÓN (enki-sense).
//!
//! Contrato (lo consume el puente 2enki modules/motor-traduce por HTTP):
//!   GET  /health                → { "status": "ok", "motor": "traduce", ... }
//!   POST /translate { texto, de, a }
//!        → 200 { "texto_traducido": "..." }
//!        →     { "fallo": { "tipo": "par_no_soportado" | "error", "motivo": "..." } }
//!
//! Nativo (candle + MarianMT/Opus-MT), cero nube. Escucha en 127.0.0.1:8121
//! (env MOTOR_TRADUCE_PORT). Solo loopback: lo llama el core. Cada par se carga
//! perezoso y se cachea (arrancar un modelo es caro; reusar es barato).

mod translate;

use axum::{routing::{get, post}, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use translate::Translator;

const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Cache de traductores por par "de-a". Mutex: cargar/traducir necesitan &mut (kv-cache).
type Cache = Arc<Mutex<HashMap<String, Arc<Mutex<Translator>>>>>;

#[derive(Deserialize)]
struct TranslateReq {
    texto: String,
    de: String,
    a: String,
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "motor": "traduce", "version": VERSION }))
}

fn traducir_sync(cache: &Cache, req: &TranslateReq) -> Result<String, (String, String)> {
    let clave = format!("{}-{}", req.de, req.a);
    // ¿Ya cargado? Si no, cargar (fuera del lock del mapa para no bloquear a otros pares).
    let tr = {
        let mapa = cache.lock().unwrap();
        if let Some(t) = mapa.get(&clave) {
            t.clone()
        } else {
            drop(mapa);
            let cargado = Translator::cargar(&req.de, &req.a).map_err(|e| {
                let m = e.to_string();
                let tipo = if m.contains("par_no_soportado") { "par_no_soportado" } else { "error" };
                (tipo.to_string(), m)
            })?;
            let arc = Arc::new(Mutex::new(cargado));
            cache.lock().unwrap().insert(clave.clone(), arc.clone());
            arc
        }
    };
    let mut t = tr.lock().unwrap();
    t.traducir(&req.texto).map_err(|e| ("error".to_string(), e.to_string()))
}

async fn translate_handler(
    axum::extract::State(cache): axum::extract::State<Cache>,
    Json(req): Json<TranslateReq>,
) -> Json<Value> {
    // El trabajo candle es bloqueante (CPU): lo movemos a un hilo del pool.
    let res = tokio::task::spawn_blocking(move || traducir_sync(&cache, &req))
        .await
        .unwrap_or_else(|e| Err(("error".to_string(), format!("panic: {e}"))));
    match res {
        Ok(texto_traducido) => Json(json!({ "texto_traducido": texto_traducido })),
        Err((tipo, motivo)) => Json(json!({ "fallo": { "tipo": tipo, "motivo": motivo } })),
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_target(false).init();
    let cache: Cache = Arc::new(Mutex::new(HashMap::new()));

    let app = Router::new()
        .route("/health", get(health))
        .route("/translate", post(translate_handler))
        .with_state(cache);

    let port: u16 = std::env::var("MOTOR_TRADUCE_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8121);
    let addr = format!("127.0.0.1:{port}");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("no pude escuchar en {addr}: {e}"));
    tracing::info!("motor-traduce v{VERSION} escuchando en {addr}");
    axum::serve(listener, app).await.unwrap();
}
