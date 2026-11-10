//! Binario de escritorio: prueba el canal contra el bus real de Enki.
//!
//! Uso:
//!   ENKI_BRIDGE_URL='wss://enki-ai.online/mqtt?k=LLAVE' cargo run
use enki_bridge::bus;

#[tokio::main]
async fn main() {
    env_logger::init();
    // rustls exige elegir un proveedor criptografico explicitamente.
    let _ = rustls::crypto::ring::default_provider().install_default();

    let url = match std::env::var("ENKI_BRIDGE_URL") {
        Ok(v) => v,
        Err(_) => {
            eprintln!("falta ENKI_BRIDGE_URL (wss://host/mqtt?k=llave)");
            std::process::exit(2);
        }
    };

    let id = format!("enki-bridge-cli-{}", std::process::id());
    let mut sesion = match bus::Sesion::abrir(&url, &id).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("no se pudo conectar: {e}");
            std::process::exit(3);
        }
    };

    if let Err(e) = sesion.suscribir(bus::TOPIC_ORDENES).await {
        eprintln!("no se pudo suscribir: {e}");
        std::process::exit(4);
    }

    println!("CONECTADO · escuchando {}", bus::TOPIC_ORDENES);

    while let Some(msg) = sesion.siguiente().await {
        match msg {
            Ok(r) => println!("ORDEN en {} → {}", r.topic, String::from_utf8_lossy(&r.payload)),
            Err(e) => eprintln!("canal: {e}"),
        }
    }

    println!("canal cerrado");
}
