// enki-movil — App nativa de Enki (Dioxus)
// Monitor del sistema + botones de acción (interruptores, ciclos).
// Cara nueva de la plataforma: isla MQTT que refleja el estado del bus.

mod bridge;

use bridge::EnkiClient;
use dioxus::prelude::*;
use serde_json::{json, Value};

// ── Estado de la app (stores-reflejo, patrón ui-store-mqtt en Rust) ──

#[derive(Clone, Debug)]
struct ModuloInfo {
    nombre: String,
    estado: String,
}

#[derive(Clone, Debug)]
struct SenalInfo {
    titulo: String,
    estado: String,
    fuente: String,
}

// Cliente global compartido (conexión única al bus)
static CLIENTE: std::sync::OnceLock<tokio::sync::Mutex<Option<EnkiClient>>> =
    std::sync::OnceLock::new();

async fn request_bus(dominio: &str, accion: &str, data: Value) -> Result<Value, String> {
    let celda = CLIENTE.get_or_init(|| tokio::sync::Mutex::new(None));
    let guard = celda.lock().await;
    match guard.as_ref() {
        Some(c) => c.request(dominio, accion, data).await,
        None => Err("no conectado".to_string()),
    }
}

fn main() {
    dioxus::launch(App);
}

fn App() -> Element {
    let conectado = use_signal(|| false);
    let mensaje = use_signal(|| "Conectando...".to_string());
    let modulos = use_signal(Vec::<ModuloInfo>::new);
    let senales = use_signal(Vec::<SenalInfo>::new);

    // ── Carga inicial ──
    let conectado_c = conectado.clone();
    let mensaje_c = mensaje.clone();
    let modulos_c = modulos.clone();
    let senales_c = senales.clone();
    use_effect(move || {
        let mut conectado = conectado_c.clone();
        let mut mensaje = mensaje_c.clone();
        let mut modulos = modulos_c.clone();
        let mut senales = senales_c.clone();
        spawn(async move {
            let token = std::fs::read_to_string("enki-token.txt")
                .unwrap_or_else(|_| "demo".to_string());
            let url = "ws://localhost:9001/mqtt";
            match EnkiClient::conectar(url, &token, "enki-movil-app").await {
                Ok(c) => {
                    let celda = CLIENTE.get_or_init(|| tokio::sync::Mutex::new(None));
                    *celda.lock().await = Some(c);
                    conectado.set(true);
                    mensaje.set("Conectado al bus de Enki".to_string());

                    match request_bus("interruptores", "listar", json!({})).await {
                        Ok(data) => {
                            if let Some(arr) = data.get("interruptores").and_then(|v| v.as_array()) {
                                let mods: Vec<ModuloInfo> = arr.iter().map(|m| ModuloInfo {
                                    nombre: m.get("id").and_then(|v| v.as_str()).unwrap_or("?").to_string(),
                                    estado: if m.get("activo").and_then(|v| v.as_bool()).unwrap_or(false) {
                                        "activo".to_string()
                                    } else { "apagado".to_string() },
                                }).collect();
                                modulos.set(mods);
                            }
                        }
                        Err(e) => mensaje.set(format!("Error modulos: {e}")),
                    }

                    match request_bus("banco", "listar", json!({"project_id": "f57dfb78-ea42-472c-8fa3-69bcfbca646d"})).await {
                        Ok(data) => {
                            if let Some(arr) = data.get("candidatos").and_then(|v| v.as_array()) {
                                let sen: Vec<SenalInfo> = arr.iter().map(|s| SenalInfo {
                                    titulo: s.get("titulo").and_then(|v| v.as_str()).unwrap_or("?").to_string(),
                                    estado: s.get("estado").and_then(|v| v.as_str()).unwrap_or("?").to_string(),
                                    fuente: s.get("fuente").and_then(|v| v.as_str()).unwrap_or("?").to_string(),
                                }).collect();
                                senales.set(sen);
                            }
                        }
                        Err(e) => mensaje.set(format!("Error senales: {e}")),
                    }
                }
                Err(e) => {
                    conectado.set(false);
                    mensaje.set(format!("Error de conexion: {e}"));
                }
            }
        });
    });

    // ── UI ──
    rsx! {
        div {
            style: "font-family: system-ui; padding: 16px; max-width: 600px; margin: 0 auto;",
            h1 { "Enki Monitor" }
            p { style: "color: #2e7d32;", "{mensaje}" }
            hr {}
            h2 { "Modulos del sistema" }
            div {
                for m in modulos() {
                    div {
                        style: "display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee;",
                        span { "{m.nombre}" }
                        span { "{m.estado}" }
                        button {
                            onclick: move |_| {
                                let id = m.nombre.clone();
                                let nuevo_estado = if m.estado == "activo" { "apagar" } else { "encender" };
                                spawn(async move {
                                    let _ = request_bus("interruptores", nuevo_estado, json!({"id": id})).await;
                                });
                            },
                            "Alternar"
                        }
                    }
                }
            }
            hr {}
            h2 { "Senales del radar de nichos" }
            div {
                for s in senales() {
                    div {
                        style: "padding: 6px 0; border-bottom: 1px solid #eee;",
                        div { "s.titulo" }
                        span { style: "color: #888; font-size: 0.85em;", "{s.estado} - {s.fuente}" }
                    }
                }
            }
            hr {}
            h2 { "Acciones" }
            div {
                button {
                    onclick: move |_| {
                        spawn(async move {
                            let _ = request_bus("scheduler", "trigger_job", json!({"jobId": "b79af013-4fc8-472d-8e44-86e5df72e44d"})).await;
                        });
                    },
                    "Disparar ciclo del radar"
                }
            }
        }
    }
}
