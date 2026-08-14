// enki-movil — Bridge MQTT hacia Enki
// Porta el contrato del frontend (mqtt-request.ts + client.ts) a Rust:
//   request:  publicar  ui/request/<dominio>/<accion>  { request_id, data }
//   response: escuchar  ui/response/<request_id>       { status, data, error }
//   eventos:  escuchar  <dominio>.<evento>             (tiempo real)
//
// La app es una ISLA más del bus: habla MQTT, no toca el core.

use rumqttc::{AsyncClient, MqttOptions, QoS};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{oneshot, Mutex};
use tokio::time::timeout;

pub type Respuesta = Result<Value, String>;

/// Contrato de respuesta del bus (espejo de UIResponse en TS)
#[derive(Debug, Clone)]
pub struct EnkiResponse {
    pub request_id: String,
    pub status: u16,
    pub success: bool,
    pub data: Value,
    pub error: Option<String>,
}

/// Cliente del bus de Enki.
pub struct EnkiClient {
    mqtt: AsyncClient,
    pendientes: Arc<Mutex<HashMap<String, oneshot::Sender<EnkiResponse>>>>,
    suscripciones: Arc<Mutex<Vec<String>>>,
}

impl EnkiClient {
    /// Conecta al broker de Enki.
    /// url: wss://enki-ai.online/mqtt  (o ws://localhost:9001/mqtt en dev)
    /// token: el token del bus (data/.hermes-bridge-token o el del frontend)
    pub async fn conectar(url: &str, token: &str, client_id: &str) -> Result<Self, String> {
        let mut opts = MqttOptions::new(client_id, url.replace("wss://", "").replace("/mqtt", ""), 9001);
        opts.set_keep_alive(Duration::from_secs(30));
        opts.set_credentials("enki-movil", token);
        let (mqtt, mut eventloop) = AsyncClient::new(opts, 256);
        let client = Self {
            mqtt,
            pendientes: Arc::new(Mutex::new(HashMap::new())),
            suscripciones: Arc::new(Mutex::new(Vec::new())),
        };

        // Tarea de fondo: procesa el eventloop (mensajes + respuestas)
        let pendientes = client.pendientes.clone();
        tokio::spawn(async move {
            loop {
                match eventloop.poll().await {
                    Ok(rumqttc::Event::Incoming(rumqttc::Packet::Publish(p))) => {
                        let topic = p.topic.to_string();
                        let payload = p.payload.to_vec();
                        let text = String::from_utf8_lossy(&payload).to_string();
                        // ¿Es una response de un request nuestro? ui/response/<request_id>
                        if topic.starts_with("ui/response/") {
                            let rid = topic.trim_start_matches("ui/response/");
                            let mut pend = pendientes.lock().await;
                            if let Some(tx) = pend.remove(rid) {
                                // parsear el envelope
                                if let Ok(v) = serde_json::from_str::<Value>(&text) {
                                    let resp = EnkiResponse {
                                        request_id: rid.to_string(),
                                        status: v.get("status").and_then(|s| s.as_u64()).unwrap_or(0) as u16,
                                        success: v.get("success").and_then(|s| s.as_bool()).unwrap_or(false),
                                        data: v.get("data").cloned().unwrap_or(Value::Null),
                                        error: v.get("error").map(|e| e.to_string()),
                                    };
                                    let _ = tx.send(resp);
                                }
                            }
                        }
                    }
                    Ok(_) => {}
                    Err(e) => {
                        eprintln!("[enki-movil] eventloop error: {e}");
                        // reconexión: el AsyncClient de rumqttc reintenta solo
                    }
                }
            }
        });

        Ok(client)
    }

    /// Request/response sobre MQTT — espejo de mqttRequest(dominio, accion, data)
    pub async fn request(&self, dominio: &str, accion: &str, data: Value) -> Respuesta {
        let request_id = uuid_v4();
        let topic = format!("ui/request/{dominio}/{accion}");
        let payload = json!({
            "request_id": request_id,
            "data": data,
            "timestamp": now_iso(),
            "source": { "client_id": "enki-movil" }
        });

        let (tx, rx) = oneshot::channel();
        {
            let mut pend = self.pendientes.lock().await;
            pend.insert(request_id.clone(), tx);
        }

        self.mqtt
            .publish(&topic, QoS::AtLeastOnce, false, payload.to_string().as_bytes())
            .await
            .map_err(|e| format!("publish error: {e}"))?;

        // timeout de respuesta (10s por defecto, como el frontend)
        match timeout(Duration::from_secs(10), rx).await {
            Ok(Ok(resp)) => {
                if resp.success {
                    Ok(resp.data)
                } else {
                    Err(resp.error.unwrap_or_else(|| "error desconocido".into()))
                }
            }
            Ok(Err(_)) => Err("canal roto".into()),
            Err(_) => Err(format!("timeout: {dominio}.{accion} tras 10s")),
        }
    }

    /// Suscribe a un evento de dominio (tiempo real)
    pub async fn suscribirse(&self, evento: &str) -> Result<(), String> {
        self.mqtt.subscribe(evento, QoS::AtLeastOnce).await.map_err(|e| e.to_string())
    }
}

// ── helpers ──
fn uuid_v4() -> String {
    // uuid simple sin dependencia extra (suficiente para request_id)
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let rand = std::process::id();
    format!("enki-movil-{ts:x}-{rand:x}")
}

fn now_iso() -> String {
    let d = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}.{:03}Z", d.as_secs(), d.subsec_millis())
}

// re-export para el resto de la app

