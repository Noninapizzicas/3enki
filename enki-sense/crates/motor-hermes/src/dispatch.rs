use rumqttc::{AsyncClient, QoS};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{oneshot, Mutex};

#[derive(Debug)]
pub enum DispatchError {
    Timeout(String, u64),
    ToolError { code: String, message: String },
    MqttPublish(String),
}

impl std::fmt::Display for DispatchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Timeout(tool, ms) => write!(f, "tool timeout: {tool} ({ms}ms)"),
            Self::ToolError { code, message } => write!(f, "[{code}] {message}"),
            Self::MqttPublish(e) => write!(f, "mqtt publish: {e}"),
        }
    }
}

impl DispatchError {
    pub fn code(&self) -> &str {
        match self {
            Self::Timeout(..) => "UPSTREAM_TIMEOUT",
            Self::ToolError { code, .. } => code,
            Self::MqttPublish(_) => "MQTT_ERROR",
        }
    }

    pub fn status_code(&self) -> u16 {
        match self {
            Self::Timeout(..) => 504,
            Self::ToolError { code, .. } => match code.as_str() {
                "TOOL_NOT_FOUND" => 404,
                "INVALID_INPUT" => 400,
                _ => 500,
            },
            Self::MqttPublish(_) => 502,
        }
    }
}

type PendingMap = HashMap<String, oneshot::Sender<Result<Value, DispatchError>>>;

pub struct Dispatcher {
    client: AsyncClient,
    pending: Mutex<PendingMap>,
    counter: AtomicU64,
    prefix: String,
}

impl Dispatcher {
    pub fn new(client: AsyncClient, prefix: String) -> Self {
        Self {
            client,
            pending: Mutex::new(HashMap::new()),
            counter: AtomicU64::new(0),
            prefix,
        }
    }

    pub async fn execute(
        &self,
        tool_name: &str,
        args: Value,
        context: Value,
        timeout: Duration,
    ) -> Result<Value, DispatchError> {
        let request_id = format!("mh-{}", self.counter.fetch_add(1, Ordering::Relaxed));
        let (tx, rx) = oneshot::channel();

        self.pending.lock().await.insert(request_id.clone(), tx);

        let mut payload = json!({
            "request_id": request_id,
            "args": args
        });
        if !context.is_null() && !context.as_object().map(|o| o.is_empty()).unwrap_or(true) {
            payload["context"] = context;
        }
        let topic = format!("hermes/tool/{tool_name}");
        let bytes = serde_json::to_vec(&payload).unwrap_or_default();

        if let Err(e) = self.client.publish(&topic, QoS::AtLeastOnce, false, bytes).await {
            self.pending.lock().await.remove(&request_id);
            return Err(DispatchError::MqttPublish(e.to_string()));
        }

        match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => {
                self.pending.lock().await.remove(&request_id);
                Err(DispatchError::Timeout(tool_name.to_string(), timeout.as_millis() as u64))
            }
            Err(_) => {
                self.pending.lock().await.remove(&request_id);
                Err(DispatchError::Timeout(tool_name.to_string(), timeout.as_millis() as u64))
            }
        }
    }

    pub async fn request_catalog(&self) -> Result<Value, DispatchError> {
        let request_id = format!("mh-cat-{}", self.counter.fetch_add(1, Ordering::Relaxed));
        let (tx, rx) = oneshot::channel();

        self.pending.lock().await.insert(request_id.clone(), tx);

        let payload = json!({ "request_id": request_id });
        let topic = format!("{}/catalog", self.prefix);
        let bytes = serde_json::to_vec(&payload).unwrap_or_default();

        if let Err(e) = self.client.publish(&topic, QoS::AtLeastOnce, false, bytes).await {
            self.pending.lock().await.remove(&request_id);
            return Err(DispatchError::MqttPublish(e.to_string()));
        }

        match tokio::time::timeout(Duration::from_secs(10), rx).await {
            Ok(Ok(result)) => result,
            _ => {
                self.pending.lock().await.remove(&request_id);
                Err(DispatchError::Timeout("catalog".to_string(), 10000))
            }
        }
    }

    pub async fn route_response(&self, request_id: &str, payload: &Value) {
        // Gateway responde: {status: 'success'|'error', result, error}
        // o {success: true, data}, {status: 200, data}
        let gateway_status = payload.get("status").and_then(|s| s.as_str()).unwrap_or("");
        let success = gateway_status == "success"
            || payload.get("success").and_then(|s| s.as_bool()).unwrap_or(false)
            || payload.get("status").and_then(|s| s.as_u64()).map(|n| n < 400).unwrap_or(false);

        let result = if success {
            Ok(payload.get("result").or_else(|| payload.get("data")).cloned().unwrap_or(payload.clone()))
        } else {
            let err = payload.get("error").cloned().unwrap_or(payload.clone());
            Err(DispatchError::ToolError {
                code: err.get("code").and_then(|c| c.as_str()).unwrap_or("UNKNOWN_ERROR").to_string(),
                message: err.get("message").and_then(|m| m.as_str()).unwrap_or("unknown error").to_string(),
            })
        };

        if let Some(tx) = self.pending.lock().await.remove(request_id) {
            let _ = tx.send(result);
        }
    }

    pub fn response_topic_prefix(&self) -> String {
        format!("{}/response/", self.prefix)
    }

    pub fn catalog_response_prefix(&self) -> String {
        format!("{}/catalog/response/", self.prefix)
    }

    pub async fn subscribe_responses(&self) {
        let _ = self.client.subscribe(format!("{}/response/#", self.prefix), QoS::AtLeastOnce).await;
        let _ = self.client.subscribe(format!("{}/catalog/response/#", self.prefix), QoS::AtLeastOnce).await;
    }
}

pub type SharedDispatcher = Arc<Dispatcher>;
