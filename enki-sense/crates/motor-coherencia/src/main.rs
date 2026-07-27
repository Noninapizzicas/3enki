//! motor-coherencia — la PUERTA de coherencia delante de filesystem, por MQTT.
//!
//! No es un freno: valora la coherencia de una escritura. Crear/escribir de cero
//! fluye; borrar o truncar el contenido pide CONFIRMACIÓN (no deniega).
//!
//! Camino (el fs.write llega al motor 1, y si cumple llega a filesystem):
//!   caller ──fs.write.request──▶ [motor]
//!       motor ──fs.read.request──▶ filesystem ──fs.read.response──▶ motor   (trae lo ACTUAL)
//!       juzga(nuevo, actual):
//!         OK        → fs.write.commit.request ──▶ filesystem escribe (responde al caller)
//!         CONFIRMAR → fs.write.response {confirmar, motivo, detalle} ──▶ caller (no escribe)
//!
//! filesystem deja de escuchar fs.write.request y escucha fs.write.commit.request.
//! Juicio PURO (juicio.rs, 10 tests). Broker: mqtt://127.0.0.1:1883 (TCP, anónimo).

mod juicio;

use juicio::{juzgar_escritura, OpEscritura, Veredicto};
use rumqttc::{AsyncClient, Event, MqttOptions, Packet, QoS};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{oneshot, Mutex};

const VERSION: &str = env!("CARGO_PKG_VERSION");
const WRITE_REQ: &str = "fs.write.request";
const WRITE_COMMIT: &str = "fs.write.commit.request";
const WRITE_RESP: &str = "fs.write.response";
const READ_REQ: &str = "fs.read.request";
const READ_RESP: &str = "fs.read.response";
const READ_TIMEOUT: Duration = Duration::from_secs(3);

/// Reads pendientes: read_request_id → canal que despierta al que espera lo actual.
type Pendientes = Arc<Mutex<HashMap<String, oneshot::Sender<Option<String>>>>>;

/// De una fs.read.response saca el contenido actual (None = el archivo no existe).
fn contenido_de_read(v: &Value) -> Option<String> {
    if v.get("status").and_then(|s| s.as_u64()) == Some(404) || v.get("error").is_some() {
        return None;
    }
    v.get("content")
        .and_then(|c| c.as_str())
        .or_else(|| v.get("data").and_then(|d| d.get("content")).and_then(|c| c.as_str()))
        .map(String::from)
}

/// Maneja UNA escritura interceptada: lee lo actual, juzga, y reenvía o pide confirmación.
async fn manejar_escritura(client: AsyncClient, pend: Pendientes, contador: Arc<AtomicU64>, payload: Vec<u8>) {
    let Ok(root) = serde_json::from_slice::<Value>(&payload) else { return };
    let cuerpo = root.get("data").cloned().unwrap_or_else(|| root.clone());

    let request_id = root.get("request_id").or_else(|| cuerpo.get("request_id")).cloned().unwrap_or(Value::Null);
    let project_id = cuerpo.get("project_id").cloned().unwrap_or(Value::Null);
    let path = cuerpo.get("path").and_then(|p| p.as_str()).unwrap_or("").to_string();
    let encoding = cuerpo.get("encoding").and_then(|e| e.as_str()).unwrap_or("utf-8");
    let confirmado = cuerpo.get("confirmado").and_then(|c| c.as_bool()).unwrap_or(false);
    let nuevo = cuerpo.get("content").and_then(|c| c.as_str());

    // Binario/base64 o sin contenido texto → el juez es de texto: reenviar directo.
    if encoding == "base64" || nuevo.is_none() {
        let _ = client.publish(WRITE_COMMIT, QoS::AtLeastOnce, false, payload).await;
        return;
    }
    let nuevo = nuevo.unwrap().to_string();

    // Confirmado → la confirmación abre; no hace falta ni leer. Reenviar.
    if confirmado {
        let _ = client.publish(WRITE_COMMIT, QoS::AtLeastOnce, false, payload).await;
        return;
    }

    // Leer lo ACTUAL vía fs.read (la resolución de rutas se queda en filesystem: una sola verdad).
    let read_rid = format!("motor-coh-{}", contador.fetch_add(1, Ordering::Relaxed));
    let (tx, rx) = oneshot::channel();
    pend.lock().await.insert(read_rid.clone(), tx);
    let read_payload = json!({ "request_id": read_rid, "project_id": project_id, "path": path, "encoding": "utf-8" });
    let _ = client.publish(READ_REQ, QoS::AtLeastOnce, false, serde_json::to_vec(&read_payload).unwrap_or_default()).await;

    let actual = match tokio::time::timeout(READ_TIMEOUT, rx).await {
        Ok(Ok(a)) => a,
        _ => {
            // No pude leer lo actual → NO freno por no poder juzgar: dejo pasar (sin frenos).
            pend.lock().await.remove(&read_rid);
            tracing::warn!("no pude leer '{path}' para juzgar; reenvío sin juicio");
            let _ = client.publish(WRITE_COMMIT, QoS::AtLeastOnce, false, payload).await;
            return;
        }
    };

    let op = OpEscritura { path: path.clone(), nuevo, actual, confirmado: false };
    match juzgar_escritura(&op) {
        Veredicto::Ok => {
            let _ = client.publish(WRITE_COMMIT, QoS::AtLeastOnce, false, payload).await;
        }
        Veredicto::Confirmar { motivo, detalle } => {
            // NO escribe. Responde al caller con el porqué (info ampliada) para que confirme.
            let resp = json!({
                "request_id": request_id,
                "veredicto": "confirmar",
                "motivo": motivo,
                "detalle": detalle,
                "hint": "reintenta el mismo write con confirmado:true para que se escriba"
            });
            let _ = client.publish(WRITE_RESP, QoS::AtLeastOnce, false, serde_json::to_vec(&resp).unwrap_or_default()).await;
            tracing::info!("confirmar '{path}' ({motivo}) — devuelto al caller, no escrito");
        }
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_target(false).init();

    let host = std::env::var("MOTOR_COHERENCIA_BROKER").unwrap_or_else(|_| "127.0.0.1".into());
    let port: u16 = std::env::var("MOTOR_COHERENCIA_PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(1883);

    let mut opts = MqttOptions::new("motor-coherencia", &host, port);
    opts.set_keep_alive(Duration::from_secs(30));
    let (client, mut eventloop) = AsyncClient::new(opts, 64);

    let subscribe_all = |c: AsyncClient| async move {
        let _ = c.subscribe(WRITE_REQ, QoS::AtLeastOnce).await;
        let _ = c.subscribe(READ_RESP, QoS::AtLeastOnce).await;
    };
    subscribe_all(client.clone()).await;
    tracing::info!("motor-coherencia v{VERSION} → mqtt://{host}:{port} · puerta de {WRITE_REQ} → {WRITE_COMMIT}");

    let pendientes: Pendientes = Arc::new(Mutex::new(HashMap::new()));
    let contador = Arc::new(AtomicU64::new(0));

    loop {
        match eventloop.poll().await {
            Ok(Event::Incoming(Packet::Publish(p))) if p.topic == WRITE_REQ => {
                tokio::spawn(manejar_escritura(client.clone(), pendientes.clone(), contador.clone(), p.payload.to_vec()));
            }
            Ok(Event::Incoming(Packet::Publish(p))) if p.topic == READ_RESP => {
                if let Ok(v) = serde_json::from_slice::<Value>(&p.payload) {
                    if let Some(rid) = v.get("request_id").and_then(|r| r.as_str()) {
                        if let Some(tx) = pendientes.lock().await.remove(rid) {
                            let _ = tx.send(contenido_de_read(&v));
                        }
                    }
                }
            }
            Ok(Event::Incoming(Packet::ConnAck(_))) => {
                subscribe_all(client.clone()).await;
                tracing::info!("conectado al broker; suscrito a {WRITE_REQ} + {READ_RESP}");
            }
            Ok(_) => {}
            Err(e) => {
                tracing::warn!("bus caído ({e}); reintento en 2s");
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }
}
