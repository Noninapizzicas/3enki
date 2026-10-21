use axum::extract::Request;
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::Response;
use std::sync::Arc;

pub struct TokenStore {
    token: Vec<u8>,
}

impl TokenStore {
    pub fn load(path: &str) -> Result<Self, String> {
        let token_str = match std::fs::read_to_string(path) {
            Ok(s) => {
                let t = s.trim().to_string();
                if t.len() < 32 {
                    return Err(format!("token too short ({} chars)", t.len()));
                }
                t
            }
            Err(e) => return Err(format!("cannot read token file {path}: {e}")),
        };
        Ok(Self { token: token_str.into_bytes() })
    }

    fn verify(&self, presented: &[u8]) -> bool {
        if presented.len() != self.token.len() {
            return false;
        }
        presented
            .iter()
            .zip(self.token.iter())
            .fold(0u8, |acc, (a, b)| acc | (a ^ b))
            == 0
    }
}

pub async fn auth_middleware(
    store: Arc<TokenStore>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth = req
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    match auth {
        Some(h) if h.starts_with("Bearer ") => {
            let presented = h[7..].trim().as_bytes();
            if store.verify(presented) {
                Ok(next.run(req).await)
            } else {
                Err(StatusCode::UNAUTHORIZED)
            }
        }
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}
