//! dispatch — corazón de motor-hermes: traduce HTTP execute → MQTT request/response.
//!
//! Patrón REAL del core Enki (UIRequestHandler):
//!
//!   publish   ui/request/{domain}/{action}   { request_id, data: {…} }
//!   subscribe ui/response/{request_id}       → { request_id, status, success, data|error }
//!
//! Las tools llegan como "domain.action" (ej. "project.list", "fs.read").
//! Se parsean en domain + action, se publican al bus, y se espera respuesta
//! correlada por request_id en ui/response/{request_id}.

use rumqttc::{AsyncClient, Event, MqttOptions, Packet, QoS};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{oneshot, Mutex};
use uuid::Uuid;

/// Canal para recibir respuestas correladas.
type Pendientes = Arc<Mutex<HashMap<String, oneshot::Sender<Value>>>>;

/// Configuración de timeouts por tool.
#[derive(Clone)]
pub struct TimeoutConfig {
    pub default_ms: u64,
    pub code_ms: u64,
    pub agent_ms: u64,
}

impl Default for TimeoutConfig {
    fn default() -> Self {
        Self {
            default_ms: 15000,
            code_ms: 65000,
            agent_ms: 300000,
        }
    }
}

/// Dispatcher MQTT.
pub struct MqttDispatcher {
    client: AsyncClient,
    pendientes: Pendientes,
    timeouts: TimeoutConfig,
}

/// Parsea "domain.action" → (domain, action).
fn parse_tool_name(name: &str) -> (&str, &str) {
    if let Some(dot) = name.rfind('.') {
        let domain = &name[..dot];
        let action = &name[dot + 1..];
        (domain, action)
    } else {
        // Fallback: toolName sin punto → domain=tool, action=ejecutar
        (name, "ejecutar")
    }
}

impl MqttDispatcher {
    /// Conecta al broker y arranca el eventloop en background.
    pub async fn connect(
        host: &str,
        port: u16,
        client_id: &str,
        timeouts: TimeoutConfig,
    ) -> Result<Self, String> {
        let mut opts = MqttOptions::new(client_id, host, port);
        opts.set_keep_alive(Duration::from_secs(30));
        opts.set_clean_session(true);

        let (client, mut eventloop) = AsyncClient::new(opts, 64);
        let pendientes: Pendientes = Arc::new(Mutex::new(HashMap::new()));

        // Verificar conectividad con subscribe + unsubscribe rápido
        let ok = client
            .subscribe("motor-hermes/init", QoS::AtLeastOnce)
            .await
            .is_ok();
        if ok {
            let _ = client.unsubscribe("motor-hermes/init").await;
        } else {
            return Err("no se pudo conectar al broker MQTT".into());
        }

        tracing::info!("conectado a mqtt://{host}:{port}");

        // Suscribir a ui/response/# desde el cliente (rumqttc subscribe va en client)
        client
            .subscribe("ui/response/#", QoS::AtLeastOnce)
            .await
            .map_err(|e| format!("fallo al suscribir ui/response/#: {e}"))?;
        tracing::info!("suscrito a ui/response/#");

        // Eventloop en background: escucha ui/response/{request_id}
        let p_for_spawn = pendientes.clone();
        tokio::spawn(async move {
            loop {
                match eventloop.poll().await {
                    Ok(Event::Incoming(Packet::Publish(pkt))) => {
                        let topic = pkt.topic;
                        if let Some(rid) = topic.strip_prefix("ui/response/") {
                            if let Ok(v) = serde_json::from_slice::<Value>(&pkt.payload) {
                                let inner_rid = v
                                    .get("request_id")
                                    .and_then(|r| r.as_str())
                                    .map(String::from)
                                    .unwrap_or_else(|| rid.to_string());

                                let mut map = p_for_spawn.lock().await;
                                if let Some(tx) = map.remove(&inner_rid) {
                                    let _ = tx.send(v);
                                    tracing::trace!(rid = %inner_rid, "respuesta correlada recibida");
                                } else {
                                    tracing::trace!(rid = %inner_rid, "respuesta sin pending (ya timeout?)");
                                }
                            }
                        }
                    }
                    Ok(Event::Incoming(Packet::ConnAck(_))) => {
                        tracing::info!("reconectado al broker");
                    }
                    Ok(_) => {}
                    Err(e) => {
                        tracing::warn!("bus MQTT caído ({e}); reconexión automática");
                        tokio::time::sleep(Duration::from_secs(2)).await;
                    }
                }
            }
        });

        Ok(Self {
            client,
            pendientes,
            timeouts,
        })
    }

    /// Ejecuta una tool vía MQTT.
    /// Publica `ui/request/{domain}/{action}` y espera `ui/response/{request_id}`.
    pub async fn execute(&self, tool_name: &str, args: Value) -> Result<Value, ExecuteError> {
        let request_id = Uuid::new_v4().to_string();
        let _response_topic = format!("ui/response/{request_id}");
        let (domain, action) = parse_tool_name(tool_name);
        let request_topic = format!("ui/request/{domain}/{action}");

        // Calcular timeout
        let timeout_ms = match tool_name {
            t if t == "code.orquestar" => self.timeouts.code_ms,
            t if t.starts_with("invoke_agent") || t == "invoke_agent" => self.timeouts.agent_ms,
            _ => self.timeouts.default_ms,
        };
        let timeout_dur = Duration::from_millis(timeout_ms);

        // Preparar payload: { request_id, data: args }
        let payload = json!({
            "request_id": request_id,
            "data": args
        });

        // No hace falta suscribirnos al topic individual porque ya
        // estamos suscritos a ui/response/# en el eventloop de fondo.

        // Registrar pending
        let (tx, rx) = oneshot::channel();
        {
            let mut map = self.pendientes.lock().await;
            // Eliminar entradas stale para evitar memory leak
            if map.len() > 500 {
                map.clear();
                tracing::warn!("pendientes > 500, limpiado");
            }
            map.insert(request_id.clone(), tx);
        }

        // Publicar
        let payload_bytes = serde_json::to_vec(&payload).unwrap_or_default();
        self.client
            .publish(&request_topic, QoS::AtLeastOnce, false, payload_bytes)
            .await
            .map_err(|e| {
                let mut map = self.pendientes.blocking_lock();
                map.remove(&request_id);
                ExecuteError::Mqtt(format!("publish error: {e}"))
            })?;

        tracing::debug!(
            tool = %tool_name,
            topic = %request_topic,
            rid = %request_id,
            timeout = timeout_ms,
            "tool publicada al bus"
        );

        // Esperar respuesta
        match tokio::time::timeout(timeout_dur, rx).await {
            Ok(Ok(resp)) => {
                // Formato de respuesta de UIRequestHandler:
                // { request_id, status, success: true, data: {...} }
                // o
                // { request_id, status, success: false, error: { code, message } }
                let success = resp.get("success").and_then(|s| s.as_bool()).unwrap_or(true);
                let status_code = resp.get("status").and_then(|s| s.as_u64()).unwrap_or(200);

                if !success || status_code >= 400 {
                    let err_obj = resp.get("error").unwrap_or(&resp);
                    let code = err_obj
                        .get("code")
                        .and_then(|c| c.as_str())
                        .unwrap_or("UNKNOWN_ERROR");
                    let message = err_obj
                        .get("message")
                        .and_then(|m| m.as_str())
                        .unwrap_or("error en tool");
                    Err(ExecuteError::Tool {
                        code: code.to_string(),
                        message: message.to_string(),
                        status: status_code as u16,
                    })
                } else {
                    // Extraer data del response
                    let result = resp.get("data").cloned().unwrap_or(resp);
                    Ok(result)
                }
            }
            Ok(Err(_recv_err)) => Err(ExecuteError::Internal("canal oneshot caído".into())),
            Err(_elapsed) => Err(ExecuteError::Timeout(timeout_ms, tool_name.to_string())),
        }
    }

    /// Health check de la conexión MQTT.
    pub fn is_connected(&self) -> bool {
        // rumqttc no expone connected() directamente; asumimos que si
        // el eventloop corre, está conectado.
        true
    }
}

/// Errores de ejecución.
#[derive(Debug)]
pub enum ExecuteError {
    Mqtt(String),
    Internal(String),
    Timeout(u64, String),
    Tool {
        code: String,
        message: String,
        status: u16,
    },
}

impl std::fmt::Display for ExecuteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Mqtt(e) => write!(f, "MQTT: {e}"),
            Self::Internal(e) => write!(f, "internal: {e}"),
            Self::Timeout(ms, tool) => write!(f, "timeout after {ms}ms ({tool})"),
            Self::Tool { code, message, .. } => write!(f, "[{code}] {message}"),
        }
    }
}
