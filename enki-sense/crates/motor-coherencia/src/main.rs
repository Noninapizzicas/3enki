//! motor-coherencia — el JUEZ de coherencia de operaciones, conectado al bus por MQTT.
//!
//! No es un freno: VALORA la coherencia de un acto. Crear/escribir de cero fluye;
//! un write que borra o trunca el contenido pide CONFIRMACIÓN (con el porqué), no deniega.
//!
//! Contrato del bus (RPC request/response correlado por request_id):
//!   subscribe  coherencia.juzgar.request   { request_id, path, nuevo, actual?, confirmado? }
//!   publish    coherencia.juzgar.response  { request_id, veredicto: "ok" |
//!                                            { veredicto: "confirmar", motivo, detalle } }
//!
//! Juicio PURO (juicio.rs, determinista, testeable). Broker: mqtt://<host>:1883 (TCP,
//! bus-guard OFF = anónimo). Env: MOTOR_COHERENCIA_BROKER (host, default 127.0.0.1),
//! MOTOR_COHERENCIA_PORT (default 1883).

mod juicio;

use juicio::{juzgar_escritura, OpEscritura};
use rumqttc::{AsyncClient, Event, MqttOptions, Packet, QoS};
use serde_json::{json, Value};
use std::time::Duration;

const VERSION: &str = env!("CARGO_PKG_VERSION");
const REQ: &str = "coherencia.juzgar.request";
const RESP: &str = "coherencia.juzgar.response";

/// Del payload del bus saca (request_id, OpEscritura). Tolera envoltorio { data: {...} }.
fn parsear(payload: &[u8]) -> Option<(Value, OpEscritura)> {
    let root: Value = serde_json::from_slice(payload).ok()?;
    let cuerpo = root.get("data").cloned().unwrap_or_else(|| root.clone());
    let request_id = root
        .get("request_id")
        .or_else(|| cuerpo.get("request_id"))
        .cloned()
        .unwrap_or(Value::Null);
    let op: OpEscritura = serde_json::from_value(cuerpo).ok()?;
    Some((request_id, op))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_target(false).init();

    let host = std::env::var("MOTOR_COHERENCIA_BROKER").unwrap_or_else(|_| "127.0.0.1".into());
    let port: u16 = std::env::var("MOTOR_COHERENCIA_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(1883);

    let mut opts = MqttOptions::new("motor-coherencia", &host, port);
    opts.set_keep_alive(Duration::from_secs(30));
    let (client, mut eventloop) = AsyncClient::new(opts, 32);

    // Suscripción resiliente: si el broker aún no está, el eventloop reintenta solo.
    if let Err(e) = client.subscribe(REQ, QoS::AtLeastOnce).await {
        tracing::warn!("suscripción diferida a {REQ}: {e}");
    }
    tracing::info!("motor-coherencia v{VERSION} → mqtt://{host}:{port}, escuchando {REQ}");

    loop {
        match eventloop.poll().await {
            Ok(Event::Incoming(Packet::Publish(p))) if p.topic == REQ => {
                let Some((request_id, op)) = parsear(&p.payload) else {
                    tracing::warn!("payload de {REQ} no parseable; ignorado");
                    continue;
                };
                let veredicto = juzgar_escritura(&op);
                let mut resp = serde_json::to_value(&veredicto).unwrap_or_else(|_| json!({ "veredicto": "ok" }));
                if let Value::Object(ref mut m) = resp {
                    m.insert("request_id".into(), request_id);
                }
                let payload = serde_json::to_vec(&resp).unwrap_or_default();
                if let Err(e) = client.publish(RESP, QoS::AtLeastOnce, false, payload).await {
                    tracing::warn!("no pude publicar {RESP}: {e}");
                }
            }
            Ok(Event::Incoming(Packet::ConnAck(_))) => {
                // Reconexión: re-suscribir (el broker no recuerda suscripciones de sesiones limpias).
                let _ = client.subscribe(REQ, QoS::AtLeastOnce).await;
                tracing::info!("conectado al broker; suscrito a {REQ}");
            }
            Ok(_) => {}
            Err(e) => {
                tracing::warn!("bus caído ({e}); reintento en 2s");
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }
}
