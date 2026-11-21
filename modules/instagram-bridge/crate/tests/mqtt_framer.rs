//! instagram-bridge · el framer y los paquetes del canal MQTT (PUROS, sin red)
//!
//! Esta suite existe por una sola cosa que cuesta una tarde cada vez que se
//! rompe: **un mensaje WebSocket no es un paquete MQTT**.
//!
//! Algunos brokers entregan el CONNACK partido en frames de un byte. Un cliente
//! que lee "un paquete por mensaje" recibe `[0x20]`, lo interpreta como un
//! CONNACK truncado y se declara rechazado — sin que el broker haya rechazado
//! nada. Los tres primeros tests fijan las tres formas de partir y juntar
//! bytes; los dos ultimos, que lo que escribimos cumple MQTT 3.1.1.
//!
//! Nada de red aqui: el `Framer` es aritmetica sobre bytes y se prueba como tal.

use enki_instagram_bridge::canal::mqtt::{
    escribir_longitud_variable, longitud_variable, paquete_connect, paquete_publish,
    tipo_de, Framer, CONNACK, NIVEL_MQTT, PUBLISH,
};

/// Un CONNACK aceptado de verdad: cabecera 0x20, longitud 2, flags 0, codigo 0.
const CONNACK_OK: [u8; 4] = [0x20, 0x02, 0x00, 0x00];

// ---------------------------------------------------------------------------
// 1 · Un paquete partido en frames de un byte
// ---------------------------------------------------------------------------

#[test]
fn el_framer_extrae_paquetes_partidos() {
    let mut framer = Framer::nuevo();

    // El broker entrega el CONNACK byte a byte. Los tres primeros NO forman un
    // paquete: el framer tiene que devolver `None` y guardarlos.
    for (i, byte) in CONNACK_OK.iter().enumerate().take(3) {
        framer.empujar(&[*byte]);
        assert_eq!(
            framer.siguiente(),
            None,
            "con {} bytes no hay paquete completo (byte {i} del CONNACK)",
            i + 1
        );
        assert_eq!(framer.en_espera(), i + 1, "los bytes se acumulan, no se tiran");
    }

    // El cuarto byte completa el paquete: y sale ENTERO, no el ultimo trozo.
    framer.empujar(&[CONNACK_OK[3]]);
    assert_eq!(framer.siguiente(), Some(CONNACK_OK.to_vec()));
    assert_eq!(framer.en_espera(), 0, "no queda nada pendiente");
    assert_eq!(framer.siguiente(), None);

    // Y la lectura que de verdad importa: el paquete es un CONNACK aceptado, no
    // un rechazo. Este es el falso negativo que la trampa 3 provoca.
    assert_eq!(tipo_de(&CONNACK_OK), Some(CONNACK));
}

// ---------------------------------------------------------------------------
// 2 · Dos paquetes en un solo frame
// ---------------------------------------------------------------------------

#[test]
fn el_framer_extrae_dos_paquetes_en_un_solo_frame() {
    let mut framer = Framer::nuevo();

    let primero = paquete_publish("bridge/resultado", br#"{"ok":false}"#);
    let segundo = [0xD0, 0x00]; // PINGRESP

    let mut juntos = Vec::new();
    juntos.extend_from_slice(&primero);
    juntos.extend_from_slice(&segundo);

    framer.empujar(&juntos);

    assert_eq!(
        framer.siguiente(),
        Some(primero.clone()),
        "el primero sale entero y con su topic"
    );
    assert_eq!(
        framer.siguiente(),
        Some(segundo.to_vec()),
        "el segundo estaba detras en el mismo frame y no se pierde"
    );
    assert_eq!(framer.siguiente(), None);
    assert_eq!(framer.en_espera(), 0);
}

// ---------------------------------------------------------------------------
// 3 · Un paquete incompleto no se escupe a medias
// ---------------------------------------------------------------------------

#[test]
fn el_framer_no_se_come_bytes_incompletos() {
    let mut framer = Framer::nuevo();

    let paquete = paquete_publish("core/core-a/events/bridge/orden/publicar", b"0123456789");
    let corte = paquete.len() - 4;

    // Media cabecera: ni un byte se pierde ni se devuelve nada.
    framer.empujar(&paquete[..2]);
    assert_eq!(framer.siguiente(), None);
    assert_eq!(framer.en_espera(), 2);

    // Casi todo el paquete: sigue sin estar completo.
    framer.empujar(&paquete[2..corte]);
    assert_eq!(
        framer.siguiente(),
        None,
        "faltan {} bytes: no se devuelve un paquete truncado",
        paquete.len() - corte
    );
    assert_eq!(framer.en_espera(), corte);

    // Los ultimos bytes: ahora si, y exactamente los mismos que se escribieron.
    framer.empujar(&paquete[corte..]);
    assert_eq!(framer.siguiente(), Some(paquete.clone()));
    assert_eq!(framer.en_espera(), 0, "se consumio justo el paquete, ni un byte mas");

    // Un byte suelto de un paquete siguiente no se pierde al consumir el
    // anterior: se queda esperando.
    framer.empujar(&[0xD0]);
    assert_eq!(framer.siguiente(), None);
    assert_eq!(framer.en_espera(), 1);
}

// ---------------------------------------------------------------------------
// 4 · El CONNECT dice lo que tiene que decir
// ---------------------------------------------------------------------------

#[test]
fn el_paquete_connect_lleva_el_nombre_y_la_version_correcta() {
    let cliente_id = "enki-puente-0.1.0";
    let paquete = paquete_connect(cliente_id, 60);

    assert_eq!(tipo_de(&paquete), Some(1), "CONNECT es el tipo 1");
    let cuerpo = enki_instagram_bridge::canal::mqtt::cuerpo_de(&paquete).expect("cuerpo");

    // 3.1.1 empieza por el nombre del protocolo: 0x00 0x04 'M' 'Q' 'T' 'T'.
    assert_eq!(&cuerpo[..6], b"\x00\x04MQTT", "el nombre del protocolo va literal");
    assert_eq!(cuerpo[6], NIVEL_MQTT, "nivel 4 = MQTT 3.1.1 (y no 3.1, que es 3)");
    assert_eq!(cuerpo[7] & 0b0000_0010, 0b0000_0010, "clean session");
    assert_eq!(&cuerpo[8..10], &60u16.to_be_bytes(), "keep alive en big endian");

    // El cliente id va al final, con su longitud de dos bytes.
    let largo = u16::from_be_bytes([cuerpo[10], cuerpo[11]]) as usize;
    assert_eq!(largo, cliente_id.len());
    assert_eq!(&cuerpo[12..12 + largo], cliente_id.as_bytes());

    // La longitud variable tiene que describir el cuerpo exacto: un byte de mas
    // o de menos y el broker lee basura (o se queda esperando).
    let (restante, bytes) = longitud_variable(&paquete[1..]).expect("longitud");
    assert_eq!(bytes, 1, "un CONNECT corto cabe en un byte de longitud");
    assert_eq!(restante, cuerpo.len());
}

// ---------------------------------------------------------------------------
// 5 · El topic del PUBLISH va con longitud variable
// ---------------------------------------------------------------------------

#[test]
fn el_publish_lleva_el_topic_codificado_con_longitud_variable() {
    // Un topic de mas de 127 bytes obliga a dos bytes de longitud variable en
    // la cabecera fija: es donde un cliente que escribe `len as u8` se rompe.
    let relleno = "x".repeat(120);
    let topic = format!("core/core-a/events/bridge/orden/{relleno}");
    assert!(topic.len() > 127, "el topic tiene que pasar de 127 bytes");

    let payload = br#"{"accion":"publicar"}"#;
    let paquete = paquete_publish(&topic, payload);

    assert_eq!(tipo_de(&paquete), Some(PUBLISH));
    assert_eq!(paquete[0], 0x30, "PUBLISH QoS 0, sin retener, sin duplicado");

    let (restante, bytes_de_longitud) = longitud_variable(&paquete[1..]).expect("longitud");
    assert_eq!(bytes_de_longitud, 2, "mas de 127 bytes de resto: dos bytes de longitud");
    assert_eq!(paquete.len(), 1 + bytes_de_longitud + restante);

    let cuerpo = enki_instagram_bridge::canal::mqtt::cuerpo_de(&paquete).expect("cuerpo");
    let largo_topic = u16::from_be_bytes([cuerpo[0], cuerpo[1]]) as usize;
    assert_eq!(largo_topic, topic.len());
    assert_eq!(&cuerpo[2..2 + largo_topic], topic.as_bytes());
    assert_eq!(&cuerpo[2 + largo_topic..], payload, "el payload va detras, intacto");

    // Y la longitud variable que escribimos se lee igual que la escribimos, en
    // los dos extremos del rango de un byte.
    for valor in [0usize, 127, 128, 16_383, 16_384, 2_097_151] {
        let mut salida = Vec::new();
        escribir_longitud_variable(valor, &mut salida);
        assert_eq!(
            longitud_variable(&salida),
            Some((valor, salida.len())),
            "ida y vuelta de la longitud {valor}"
        );
    }
}
