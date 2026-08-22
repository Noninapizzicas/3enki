//! auth — autenticación Bearer token para motor-hermes.
//!
//! Lee el token compartido de data/.hermes-bridge-token (mismo fichero que
//! genera hermes-bridge Node.js). Valida con comparación de tiempo constante.
//!
//! ENV:
//!   ENKI_BRIDGE_TOKEN — token directo (sobreescribe fichero)
//!   MOTOR_HERMES_TOKEN_PATH — ruta alternativa al fichero token

use axum::{
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::Response,
    Json,
};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::SystemTime;

/// Token cargado con metadatos.
pub struct Token {
    value: Arc<str>,
    loaded_at: SystemTime,
    #[allow(dead_code)]
    path: PathBuf,
}

impl Token {
    /// Carga el token: prioridad env var → fichero.
    /// Si el fichero no existe, genera uno (como hermes-bridge).
    pub fn load(token_path: Option<PathBuf>) -> Self {
        let path = token_path
            .or_else(|| std::env::var("MOTOR_HERMES_TOKEN_PATH").ok().map(PathBuf::from))
            .unwrap_or_else(|| PathBuf::from("data/.hermes-bridge-token"));

        let value: Arc<str> = if let Ok(t) = std::env::var("ENKI_BRIDGE_TOKEN") {
            Arc::from(t.trim().to_string())
        } else if let Ok(content) = std::fs::read_to_string(&path) {
            Arc::from(content.trim().to_string())
        } else {
            let token = hex_token();
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(&path, format!("{token}\n"));
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
            }
            tracing::info!(?path, "token generado");
            Arc::from(token)
        };

        tracing::info!(len = value.len(), "token cargado");
        Self { value, loaded_at: SystemTime::now(), path }
    }

    fn verify(&self, presented: &str) -> bool {
        if presented.len() != self.value.len() {
            return false;
        }
        let mut acc: u8 = 0;
        for (a, b) in presented.bytes().zip(self.value.bytes()) {
            acc |= a ^ b;
        }
        acc == 0
    }
}

fn hex_token() -> String {
    let seed = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut out = String::with_capacity(64);
    let mut s = seed;
    for _ in 0..32 {
        s ^= s >> 12;
        s ^= s << 25;
        s ^= s >> 27;
        out.push_str(&format!("{:02x}", (s & 0xFF) as u8));
    }
    out
}

/// Middleware de axum que valida el Bearer token.
/// Se usa como `.route_layer(middleware::from_fn_with_state(token, auth_middleware))`
pub async fn auth_middleware(
    State(token): State<Arc<Token>>,
    req: Request,
    next: Next,
) -> Result<Response, (StatusCode, Json<Value>)> {
    let auth = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let presented = auth.strip_prefix("Bearer ").unwrap_or("");

    if presented.is_empty() || !token.verify(presented) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({
                "error": {
                    "code": "UNAUTHORIZED",
                    "message": "Bearer token required or invalid"
                }
            })),
        ));
    }

    Ok(next.run(req).await)
}
