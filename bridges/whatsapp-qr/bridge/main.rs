//! Puente WhatsApp para Enki: N sesiones en UN proceso, con API HTTP local.
//!
//! Uso:
//!   cargo run --release --example enki-wa-bridge -- /ruta/accounts.json
//!
//! El fichero de cuentas:
//! {
//!   "port": 8235,
//!   "eventos": "$WA_BASE/wa-rust/data/eventos-tienda.jsonl",
//!   "accounts": [
//!     { "slug": "rapitvapers", "db": "data/rapitvapers.db", "phone": "34600111222" },
//!     { "slug": "the-pirate",  "db": "data/the-pirate.db" }
//!   ]
//! }
//!
//! `phone` es opcional: si está, además del QR se pide código de emparejamiento de
//! 8 dígitos (alta remota sin tener el móvil delante de la pantalla).
//!
//! API local (127.0.0.1):
//!   GET  /health              → estado por sesión + RSS del proceso
//!   GET  /codigo/<slug>       → último QR y último código de emparejamiento
//!   POST /send                → {"slug":"x","to":"34600111222","text":"hola"}
//!
//! Los mensajes entrantes se anexan como JSONL en `eventos` (un evento por línea)
//! para que un publicador (Node) los meta en el bus de Enki sin acoplar este
//! binario al broker.

#![recursion_limit = "512"]

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use log::{error, info, warn};
use serde::Deserialize;
use whatsapp_rust::pair_code::PairCodeOptions;
use whatsapp_rust::prelude::*;

#[derive(Deserialize, Clone, Debug)]
struct AccountCfg {
    slug: String,
    db: String,
    #[serde(default)]
    phone: Option<String>,
    #[serde(default)]
    code: Option<String>,
    #[serde(default = "default_true")]
    enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Deserialize, Debug)]
struct BridgeCfg {
    #[serde(default = "default_port")]
    port: u16,
    #[serde(default = "default_events")]
    eventos: String,
    accounts: Vec<AccountCfg>,
}

/// Construye la JID destino de un envío.
///
/// WhatsApp ya entrega casi todo lo entrante con LID (`<id>@lid`), y el LID no es
/// un teléfono: no se puede "adivinar" el número. Por eso `to` admite la JID entera
/// (con sufijo `@lid`, `@s.whatsapp.net`, `@hosted.lid`, con o sin dispositivo) y
/// solo cuando llega un número pelado se asume el clásico PN.
fn jid_destino(to: &str) -> Jid {
    let t = to.trim().trim_start_matches('+');
    if t.contains('@') {
        if let Ok(j) = t.parse::<Jid>() {
            return j;
        }
    }
    Jid::pn(t)
}

fn default_port() -> u16 {
    8235
}

fn default_events() -> String {
    "data/eventos.jsonl".to_string()
}

struct Session {
    slug: String,
    client: Arc<Client>,
    connected: Arc<AtomicBool>,
    qr: Arc<Mutex<Option<String>>>,
    pair: Arc<Mutex<Option<String>>>,
    recv: Arc<AtomicU64>,
    sent: Arc<AtomicU64>,
}

fn ahora_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Append de una línea JSON. Abre y cierra por evento: el volumen aquí es de
/// decenas al día, no de miles por segundo.
fn emitir(path: &str, mut v: serde_json::Value) {
    if let Some(obj) = v.as_object_mut() {
        obj.insert("ts_ms".into(), serde_json::json!(ahora_ms()));
    }
    let linea = format!("{v}\n");
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = f.write_all(linea.as_bytes());
    }
}

fn rss_kb() -> u64 {
    if let Ok(s) = std::fs::read_to_string("/proc/self/status") {
        for l in s.lines() {
            if let Some(rest) = l.strip_prefix("VmRSS:") {
                if let Some(n) = rest.split_whitespace().next() {
                    return n.parse().unwrap_or(0);
                }
            }
        }
    }
    0
}

/// Construye una sesión. Cada bot = un fichero SQLite propio = una cuenta.
async fn construir(
    cfg: AccountCfg,
    eventos: String,
) -> Option<(Bot, Session)> {
    let store = match SqliteStore::open(&cfg.db).await {
        Ok(s) => s,
        Err(e) => {
            error!("[{}] no se pudo abrir SQLite {}: {e}", cfg.slug, cfg.db);
            return None;
        }
    };

    let connected = Arc::new(AtomicBool::new(false));
    let qr = Arc::new(Mutex::new(None));
    let pair = Arc::new(Mutex::new(None));
    let recv = Arc::new(AtomicU64::new(0));
    let sent = Arc::new(AtomicU64::new(0));

    let (slug_qr, ev_qr) = (cfg.slug.clone(), eventos.clone());
    let (slug_pc, ev_pc) = (cfg.slug.clone(), eventos.clone());
    let (slug_conn, ev_conn) = (cfg.slug.clone(), eventos.clone());
    let (slug_out, ev_out) = (cfg.slug.clone(), eventos.clone());
    let (slug_msg, ev_msg) = (cfg.slug.clone(), eventos.clone());

    let c_qr = connected.clone();
    let q_qr = qr.clone();
    let q_pc = pair.clone();
    let c_conn = connected.clone();
    let c_out = connected.clone();
    let r_msg = recv.clone();

    let mut builder = Bot::builder()
        .with_backend(store)
        .on_qr_code(move |code, timeout| {
            let (slug, ev, q, c) = (slug_qr.clone(), ev_qr.clone(), q_qr.clone(), c_qr.clone());
            async move {
                info!("[{slug}] QR (valido {}s):\n{code}", timeout.as_secs());
                if let Ok(mut g) = q.lock() {
                    *g = Some(code.clone());
                }
                c.store(false, Ordering::Relaxed);
                emitir(
                    &ev,
                    serde_json::json!({"tipo":"qr","slug":slug,"qr":code,"validez_s":timeout.as_secs()}),
                );
            }
        })
        .on_pair_code(move |code, timeout| {
            let (slug, ev, q) = (slug_pc.clone(), ev_pc.clone(), q_pc.clone());
            async move {
                info!("[{slug}] CODIGO DE EMPAREJAMIENTO ({}s): {code}", timeout.as_secs());
                info!("[{slug}] WhatsApp > Dispositivos vinculados > Vincular con numero de telefono");
                if let Ok(mut g) = q.lock() {
                    *g = Some(code.clone());
                }
                emitir(
                    &ev,
                    serde_json::json!({"tipo":"pair_code","slug":slug,"codigo":code,"validez_s":timeout.as_secs()}),
                );
            }
        })
        .on_connected(move |_client| {
            let (slug, ev, c) = (slug_conn.clone(), ev_conn.clone(), c_conn.clone());
            async move {
                info!("[{slug}] CONECTADO");
                c.store(true, Ordering::Relaxed);
                emitir(&ev, serde_json::json!({"tipo":"conectado","slug":slug}));
            }
        })
        .on_logged_out(move |_info| {
            let (slug, ev, c) = (slug_out.clone(), ev_out.clone(), c_out.clone());
            async move {
                error!("[{slug}] SESION CERRADA (logout desde el movil)");
                c.store(false, Ordering::Relaxed);
                emitir(&ev, serde_json::json!({"tipo":"logout","slug":slug}));
            }
        })
        .on_message(move |ctx| {
            let (slug, ev) = (slug_msg.clone(), ev_msg.clone());
            let r_msg = r_msg.clone();
            async move {
                let texto = ctx.message.text_content().unwrap_or("").to_string();
                let de = ctx.info.source.sender.to_string();
                let push = ctx.info.push_name.to_string();
                let id = ctx.info.id.to_string();
                let grupo = ctx.info.source.is_group;
                r_msg.fetch_add(1, Ordering::Relaxed);
                info!("[{slug}] <- {de} ({push}): {texto}");
                emitir(
                    &ev,
                    serde_json::json!({
                        "tipo":"mensaje",
                        "slug":slug,
                        "de":de,
                        "push_name":push,
                        "texto":texto,
                        "id":id,
                        "grupo":grupo,
                        "timestamp":ctx.info.timestamp.to_rfc3339(),
                    }),
                );
            }
        });

    if let Some(phone) = cfg.phone.clone() {
        builder = builder.with_pair_code(PairCodeOptions {
            phone_number: phone,
            custom_code: cfg.code.clone(),
            ..Default::default()
        });
    }

    let bot = match builder.build().await {
        Ok(b) => b,
        Err(e) => {
            error!("[{}] no se pudo construir el bot: {e}", cfg.slug);
            return None;
        }
    };
    let client = bot.client();

    Some((
        bot,
        Session {
            slug: cfg.slug,
            client,
            connected,
            qr,
            pair,
            recv,
            sent,
        },
    ))
}

struct Peticion {
    metodo: String,
    ruta: String,
    body: String,
    responder: std::sync::mpsc::Sender<String>,
}

fn leer_peticion(mut s: TcpStream) -> Option<Peticion> {
    s.set_read_timeout(Some(Duration::from_secs(5))).ok()?;
    let mut buf = Vec::new();
    let mut tmp = [0u8; 4096];
    let cabecera_fin = loop {
        let n = s.read(&mut tmp).ok()?;
        if n == 0 {
            return None;
        }
        buf.extend_from_slice(&tmp[..n]);
        if let Some(p) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            break p + 4;
        }
        if buf.len() > 1_048_576 {
            return None;
        }
    };
    let texto = String::from_utf8_lossy(&buf[..cabecera_fin]).to_string();
    let mut lineas = texto.lines();
    let primera = lineas.next()?;
    let mut partes = primera.split_whitespace();
    let metodo = partes.next()?.to_string();
    let ruta = partes.next()?.to_string();

    let mut largo = 0usize;
    for l in lineas {
        if let Some(v) = l.to_ascii_lowercase().strip_prefix("content-length:") {
            largo = v.trim().parse().unwrap_or(0);
        }
    }
    let mut body = buf[cabecera_fin..].to_vec();
    while body.len() < largo {
        let n = s.read(&mut tmp).ok()?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&tmp[..n]);
    }
    let body = String::from_utf8_lossy(&body).to_string();

    let (tx, _rx) = std::sync::mpsc::channel();
    Some(Peticion {
        metodo,
        ruta,
        body,
        responder: tx,
    })
}

fn responder_json(s: &mut TcpStream, code: u16, cuerpo: &str) {
    let resp = format!(
        "HTTP/1.1 {code} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        cuerpo.len(),
        cuerpo
    );
    let _ = s.write_all(resp.as_bytes());
    let _ = s.flush();
}

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let cfg_path = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "data/accounts.json".to_string());
    let raw = match std::fs::read_to_string(&cfg_path) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("No puedo leer {cfg_path}: {e}");
            std::process::exit(2);
        }
    };
    let cfg: BridgeCfg = match serde_json::from_str(&raw) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Config invalida {cfg_path}: {e}");
            std::process::exit(2);
        }
    };
    if let Some(dir) = std::path::Path::new(&cfg.eventos).parent() {
        let _ = std::fs::create_dir_all(dir);
    }

    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("tokio");

    rt.block_on(async move {
        let mut sesiones: HashMap<String, Session> = HashMap::new();
        let mut handles = Vec::new();

        for acc in cfg.accounts.iter().filter(|a| a.enabled).cloned() {
            match construir(acc, cfg.eventos.clone()).await {
                Some((bot, ses)) => {
                    sesiones.insert(ses.slug.clone(), ses);
                    handles.push(tokio::spawn(async move {
                        let _ = bot.run().await;
                    }));
                }
                None => warn!("cuenta omitida por error de arranque"),
            }
        }

        if sesiones.is_empty() {
            error!("sin sesiones: no arranco la API");
            return;
        }

        let sesiones = Arc::new(sesiones);
        let inicio = ahora_ms();
        println!(
            "BRIDGE READY puerto={} sesiones={} pid={} rss_kb={}",
            cfg.port,
            sesiones.len(),
            std::process::id(),
            rss_kb()
        );

        // --- API HTTP local (hilo std, habla con el runtime por canal) ---
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Peticion>();
        let puerto = cfg.port;
        std::thread::spawn(move || {
            let listener = match TcpListener::bind(("127.0.0.1", puerto)) {
                Ok(l) => l,
                Err(e) => {
                    eprintln!("no puedo escuchar en 127.0.0.1:{puerto}: {e}");
                    return;
                }
            };
            for stream in listener.incoming().flatten() {
                if let Some(p) = leer_peticion(stream.try_clone().unwrap()) {
                    let mut stream = stream;
                    let espera = Arc::new(Mutex::new(String::from(
                        "{\"ok\":false,\"error\":\"timeout\"}",
                    )));
                    let (txr, rxr) = std::sync::mpsc::channel::<String>();
                    let p = Peticion {
                        responder: txr,
                        ..p
                    };
                    if tx.send(p).is_ok() {
                        if let Ok(cuerpo) = rxr.recv_timeout(Duration::from_secs(20)) {
                            responder_json(&mut stream, 200, &cuerpo);
                        } else {
                            let g = espera.lock().unwrap();
                            responder_json(&mut stream, 504, &g);
                        }
                    }
                }
            }
        });

        let mut intervalo = tokio::time::interval(Duration::from_secs(300));
        loop {
            tokio::select! {
                Some(p) = rx.recv() => {
                    let respuesta = manejar(p.metodo, p.ruta, p.body, &sesiones, inicio).await;
                    let _ = p.responder.send(respuesta);
                }
                _ = intervalo.tick() => {
                    info!("RSS {} KB | sesiones {}", rss_kb(), sesiones.len());
                }
            }
        }
    });
}

async fn manejar(
    metodo: String,
    ruta: String,
    body: String,
    sesiones: &HashMap<String, Session>,
    inicio: u64,
) -> String {
    let path = ruta.split('?').next().unwrap_or("");

    if metodo == "GET" && path == "/health" {
        let mut arr = Vec::new();
        for s in sesiones.values() {
            let st = s.client.stats();
            arr.push(serde_json::json!({
                "slug": s.slug,
                "conectado": s.connected.load(Ordering::Relaxed),
                "bytes_in": st.bytes_received,
                "bytes_out": st.bytes_sent,
                "frames_in": st.frames_received,
                "frames_out": st.frames_sent,
                "msgs_recv": s.recv.load(Ordering::Relaxed),
                "reconexiones": st.reconnects,
            }));
        }
        return serde_json::json!({
            "ok": true,
            "uptime_s": (ahora_ms().saturating_sub(inicio)) / 1000,
            "rss_kb": rss_kb(),
            "sesiones": arr,
        })
        .to_string();
    }

    if metodo == "GET" && path.starts_with("/codigo/") {
        let slug = path.trim_start_matches("/codigo/");
        if let Some(s) = sesiones.get(slug) {
            let qr = s.qr.lock().unwrap().clone();
            let pc = s.pair.lock().unwrap().clone();
            return serde_json::json!({"ok": true, "slug": slug, "qr": qr, "pair_code": pc})
                .to_string();
        }
        return serde_json::json!({"ok": false, "error": "slug desconocido"}).to_string();
    }

    if metodo == "POST" && path == "/send" {
        let v: serde_json::Value = match serde_json::from_str(&body) {
            Ok(v) => v,
            Err(e) => return serde_json::json!({"ok": false, "error": format!("json: {e}")}).to_string(),
        };
        let slug = v["slug"].as_str().unwrap_or("");
        let to = v["to"].as_str().unwrap_or("");
        let text = v["text"].as_str().unwrap_or("");
        if slug.is_empty() || to.is_empty() || text.is_empty() {
            return serde_json::json!({"ok": false, "error": "faltan slug/to/text"}).to_string();
        }
        let Some(s) = sesiones.get(slug) else {
            return serde_json::json!({"ok": false, "error": "slug desconocido"}).to_string();
        };
        if !s.connected.load(Ordering::Relaxed) {
            return serde_json::json!({"ok": false, "error": "sesion no conectada"}).to_string();
        }
        let jid = jid_destino(to);
        return match s.client.send_text(jid, text).await {
            Ok(r) => {
                s.sent.fetch_add(1, Ordering::Relaxed);
                serde_json::json!({"ok": true, "id": r.message_id.to_string(), "slug": slug})
                    .to_string()
            }
            Err(e) => serde_json::json!({"ok": false, "error": format!("{e}")}).to_string(),
        };
    }

    serde_json::json!({"ok": false, "error": "ruta desconocida"}).to_string()
}

#[cfg(test)]
mod tests_jid_destino {
    use super::*;

    /// El destino de un envío no se adivina: se respeta lo que venga.
    /// - número pelado o con `+`  → PN clásico
    /// - JID completa con sufijo  → tal cual (LID incluido, que es lo que manda WhatsApp hoy)
    #[test]
    fn respeta_la_jid_y_solo_inventa_pn_con_numero_pelado() {
        for (entrada, esperado) in [
            ("34600111222", "34600111222@s.whatsapp.net"),
            ("+34600111222", "34600111222@s.whatsapp.net"),
            (" 34600111222 ", "34600111222@s.whatsapp.net"),
            ("34600111222@s.whatsapp.net", "34600111222@s.whatsapp.net"),
            ("191624311222342@lid", "191624311222342@lid"),
            (" 191624311222342@lid ", "191624311222342@lid"),
        ] {
            assert_eq!(jid_destino(entrada).to_string(), esperado, "entrada: {entrada:?}");
        }
    }
}
