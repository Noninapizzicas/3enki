//! instagram-bridge · el canal contra el bus REAL de Enki (`#[ignore]`)
//!
//! **No corre en CI**: necesita llave y red. Se ejecuta a mano:
//!
//! ```bash
//! cd modules/instagram-bridge/crate
//! ENKI_BUS_URL='wss://enki-ai.online/mqtt?k=<llave>' \
//!   cargo test --test canal_integracion -- --ignored --nocapture
//! ```
//!
//! Lo que comprueba, y nada mas: que el handshake lleva el subprotocolo `mqtt`,
//! que la llave de la query llega al broker (CONNACK aceptado), que la
//! suscripcion se concede y que el PINGREQ vuelve. **No publica nada en el bus**:
//! un test que publica en produccion para probar que el canal funciona deja
//! basura que alguien lee como una orden.
//!
//! La variable es `ENKI_BUS_URL` y lleva la query completa porque la llave no se
//! escribe en ningun fichero del repo: viaja por el entorno de quien lo lanza.

use std::time::Duration;

use enki_instagram_bridge::canal::bucle::TOPIC_ORDENES;
use enki_instagram_bridge::canal::mqtt::{Canal, CONNACK, PINGRESP};

fn url_del_bus() -> String {
    match std::env::var("ENKI_BUS_URL") {
        Ok(url) if !url.trim().is_empty() => url,
        _ => panic!(
            "falta ENKI_BUS_URL: exporta 'wss://enki-ai.online/mqtt?k=<llave>' y repite"
        ),
    }
}

#[test]
#[ignore = "necesita el bus real y una llave: se ejecuta a mano con --ignored"]
fn conecta_al_bus_real_y_recibe_un_ping() {
    let url = url_del_bus();

    // 1 · CONNECT + CONNACK. Si la llave no llegara al broker, aqui saldria
    // `connack_rechazado` con el codigo 5 (no autorizado) y el test lo dice con
    // el motivo del canal, no con un "fallo de red".
    let mut canal = Canal::conectar(&url, "enki-puente-test-integracion")
        .unwrap_or_else(|e| panic!("el canal no se abrio: {e}"));
    println!("canal: CONNACK aceptado (cliente_id={})", canal.cliente_id());

    // 2 · SUBSCRIBE del topic de ordenes: que el broker nos deje escuchar.
    canal
        .suscribir(TOPIC_ORDENES, 0)
        .unwrap_or_else(|e| panic!("no se pudo suscribir a {TOPIC_ORDENES}: {e}"));
    println!("canal: suscrito a {TOPIC_ORDENES}");

    // 3 · PINGREQ y su PINGRESP: el canal esta vivo en los dos sentidos.
    canal.ping().unwrap_or_else(|e| panic!("el PINGREQ no volvio: {e}"));
    println!("canal: PINGRESP recibido");

    // Se lee un poco mas sin ejecutar nada: si el broker manda algo, se ve; si
    // no, el test pasa igual. NO se publica ni se ejecuta ninguna orden.
    let limite = std::time::Instant::now() + Duration::from_secs(2);
    let mut paquetes = 0u32;
    while std::time::Instant::now() < limite {
        match canal.leer_paquete(Duration::from_millis(500)) {
            Ok(Some(paquete)) => {
                paquetes += 1;
                let tipo = enki_instagram_bridge::canal::mqtt::tipo_de(&paquete);
                assert!(
                    tipo != Some(CONNACK) || paquetes > 1,
                    "un segundo CONNACK no tiene sentido en una conexion limpia"
                );
                println!(
                    "canal: paquete tipo {} mientras se escuchaba",
                    enki_instagram_bridge::canal::mqtt::nombre_de_paquete(tipo.unwrap_or(0))
                );
                if tipo == Some(PINGRESP) {
                    break;
                }
            }
            Ok(None) => continue,
            Err(e) => panic!("el canal se rompio leyendo: {e}"),
        }
    }
    println!("canal: paquetes vistos en la ventana de escucha = {paquetes}");

    canal.desconectar();
    println!("canal: DISCONNECT enviado. Nada se publico.");
}
