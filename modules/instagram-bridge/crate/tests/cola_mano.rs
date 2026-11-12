//! instagram-bridge · BLOQUE 19a · LA COLA DE LA MANO (puro, sin Android)
//!
//! Estos tests NO compilan nada de Android ni tocan un movil: la cola es `std`
//! puro a proposito, para que la pieza que decide si el aparato se cuelga o no
//! se pueda probar en el servidor, en cada `cargo test`.
//!
//! Lo que se comprueba, y por que cada cosa:
//!
//!   1. **Encolar y recibir.** La peticion que sale lleva el id que le dio la
//!      cola y los datos tal cual: si el id se perdiera, la respuesta de un
//!      gesto se emparejaria con la espera de otro.
//!   2. **El plazo se nombra.** Sin respuesta, `mano_sin_respuesta` con el id y
//!      el plazo. Un plazo agotado NUNCA es un panic ni un bloqueo.
//!   3. **Dos peticiones, dos respuestas, cada una con la suya**, aunque el
//!      aparato conteste al reves. Kotlin atiende de una en una, pero la cola no
//!      puede depender de eso: es una garantia, no una costumbre.
//!   4. **Una respuesta de un id desconocido se cuenta y no rompe nada.** Es el
//!      caso de la respuesta que llega despues de que su peticion caducara.
//!   5. **Una peticion se entrega UNA vez.** Dos `siguiente()` no pueden dar la
//!      misma peticion: dos toques son un post duplicado.

use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use enki_instagram_bridge::mano::cola::{
    ColaDeMano, TipoDePeticion, MOTIVO_SIN_RESPUESTA, PLAZO_DE_RESPUESTA,
};

/// Un plazo corto para los tests: no se espera 10 s para probar que caduca.
const CORTO: Duration = Duration::from_millis(80);

#[test]
fn encolar_y_recibir() {
    let cola = ColaDeMano::nueva();

    let id = cola.encolar(TipoDePeticion::Observar, "");
    assert_eq!(id, 1, "el primer id es 1: 0 se confunde con 'sin id'");

    let peticion = cola.siguiente().expect("la peticion tiene que salir");
    assert_eq!(peticion.id, id);
    assert_eq!(peticion.tipo, TipoDePeticion::Observar);
    assert_eq!(cola.pendientes(), 0);
    assert_eq!(cola.en_vuelo(), 1, "entregada y sin respuesta: en vuelo");

    // El JSON que lee Kotlin, con las claves exactas del contrato.
    assert_eq!(peticion.a_json(), r#"{"id":1,"tipo":"observar"}"#);

    let paso = cola.encolar_ejecutar(r#"{"accion":"tocar","id":"n1","x":10,"y":20}"#);
    let peticion = cola.siguiente().expect("la segunda tambien sale");
    assert_eq!(peticion.id, paso);
    assert_eq!(
        peticion.a_json(),
        r#"{"id":2,"tipo":"ejecutar","paso":{"accion":"tocar","id":"n1","x":10,"y":20}}"#
    );

    assert!(cola.siguiente().is_none(), "sin peticiones, siguiente() es None");
}

#[test]
fn timeout_sin_respuesta_es_error_nombrado() {
    let cola = ColaDeMano::nueva();
    let id = cola.encolar_observar();
    assert_eq!(cola.siguiente().map(|p| p.id), Some(id), "Kotlin la recoge y se muere");

    let comienzo = Instant::now();
    let fallo = cola
        .esperar_respuesta(id, CORTO)
        .expect_err("nadie contesta: el plazo se acaba");
    let transcurrido = comienzo.elapsed();

    assert_eq!(fallo.codigo(), MOTIVO_SIN_RESPUESTA);
    assert_eq!(fallo.codigo(), "mano_sin_respuesta", "el nombre es el del contrato");
    assert_eq!(fallo.id, id);
    assert_eq!(fallo.plazo, CORTO);
    assert!(
        transcurrido >= CORTO && transcurrido < PLAZO_DE_RESPUESTA,
        "el plazo se respeta de verdad: {transcurrido:?}"
    );

    // La peticion caducada ya no esta en vuelo, y su respuesta (si llegara
    // tarde) no puede quedarse guardada para siempre.
    assert_eq!(cola.en_vuelo(), 0);
    assert_eq!(cola.entregar(id, r#"{"ok":true}"#), Err(id), "ya nadie la espera");
    assert_eq!(cola.huerfanas(), 1);
}

#[test]
fn dos_peticiones_se_resuelven_en_orden() {
    let cola = ColaDeMano::nueva();

    let primera = cola.encolar_observar();
    let segunda = cola.encolar_ejecutar(r#"{"accion":"esperar","ms":0}"#);

    // Se entregan en el orden en que se encolaron: es una cola, no un monton.
    assert_eq!(cola.siguiente().map(|p| p.id), Some(primera));
    assert_eq!(cola.siguiente().map(|p| p.id), Some(segunda));
    assert!(cola.siguiente().is_none());
    assert_eq!(cola.en_vuelo(), 2);

    // El aparato contesta al reves (no deberia, pero la cola no depende de eso).
    assert_eq!(cola.entregar(segunda, r#"{"ok":true}"#), Ok(TipoDePeticion::Ejecutar));
    assert_eq!(
        cola.entregar(primera, r#"{"lectura":"observada","nodos":[]}"#),
        Ok(TipoDePeticion::Observar)
    );

    let de_la_segunda = cola.esperar_respuesta(segunda, CORTO).expect("llego");
    let de_la_primera = cola.esperar_respuesta(primera, CORTO).expect("llego");

    assert_eq!(de_la_segunda.json, r#"{"ok":true}"#);
    assert_eq!(de_la_primera.json, r#"{"lectura":"observada","nodos":[]}"#);
    assert_eq!(de_la_primera.id, primera);
    assert_eq!(de_la_segunda.id, segunda);
}

#[test]
fn respuesta_de_id_desconocido_no_rompe() {
    let cola = ColaDeMano::nueva();

    // Un id que no existe.
    assert_eq!(cola.entregar(999, r#"{"ok":true}"#), Err(999));
    // Un id que existe pero que nadie ha entregado todavia (sigue pendiente).
    let pendiente = cola.encolar_observar();
    assert_eq!(cola.entregar(pendiente, r#"{"ok":true}"#), Err(pendiente));
    assert_eq!(cola.huerfanas(), 2);
    assert_eq!(cola.pendientes(), 1, "la peticion sigue pendiente, no se toco");

    // Y la cola sigue funcionando exactamente igual.
    let id = cola.encolar_ejecutar(r#"{"accion":"esperar","ms":0}"#);
    assert_eq!(cola.siguiente().map(|p| p.id), Some(pendiente));
    assert_eq!(cola.siguiente().map(|p| p.id), Some(id));
    assert_eq!(cola.entregar(id, r#"{"ok":false,"motivo":"nodo_perdido"}"#), Ok(TipoDePeticion::Ejecutar));
    assert_eq!(
        cola.esperar_respuesta(id, CORTO).expect("llego").json,
        r#"{"ok":false,"motivo":"nodo_perdido"}"#
    );
}

#[test]
fn una_peticion_entregada_no_se_entrega_dos_veces() {
    let cola = ColaDeMano::nueva();
    let id = cola.encolar_ejecutar(r#"{"accion":"tocar","id":"n1","x":1,"y":2}"#);

    let primera_entrega = cola.siguiente().expect("sale una vez");
    assert_eq!(primera_entrega.id, id);
    assert!(
        cola.siguiente().is_none(),
        "la misma peticion no puede salir dos veces: dos toques son un post duplicado"
    );
    assert_eq!(cola.pendientes(), 0);
}

#[test]
fn la_respuesta_que_llega_antes_de_esperar_se_encuentra() {
    let cola = ColaDeMano::nueva();
    let id = cola.encolar_observar();
    assert_eq!(cola.siguiente().map(|p| p.id), Some(id));

    // El aparato contesta rapido: antes de que el bucle llame a esperar.
    assert_eq!(cola.entregar(id, r#"{"lectura":"observada"}"#), Ok(TipoDePeticion::Observar));

    let respuesta = cola.esperar_respuesta(id, CORTO).expect("ya estaba");
    assert_eq!(respuesta.json, r#"{"lectura":"observada"}"#);
    assert!(
        cola.esperar_respuesta(id, CORTO).is_err(),
        "una respuesta se consume una vez: la segunda espera caduca"
    );
}

#[test]
fn un_hilo_que_espera_se_despierta_al_entregar() {
    // La prueba de la Condvar de verdad: el que espera esta en OTRO hilo y la
    // respuesta llega mientras duerme. Si el aviso no despertara, el test
    // tardaria el plazo entero (y fallaria por el tiempo, no por el dato).
    let cola = Arc::new(ColaDeMano::nueva());
    let id = cola.encolar_observar();
    assert_eq!(cola.siguiente().map(|p| p.id), Some(id));

    let para_el_hilo = Arc::clone(&cola);
    let esperando = thread::spawn(move || para_el_hilo.esperar_respuesta(id, PLAZO_DE_RESPUESTA));

    // Un respiro para que el hilo llegue al `wait` (si no, la respuesta se
    // guardaria antes y el test no probaria el aviso).
    thread::sleep(Duration::from_millis(50));
    let comienzo = Instant::now();
    assert_eq!(cola.entregar(id, r#"{"ok":true}"#), Ok(TipoDePeticion::Observar));

    let respuesta = esperando.join().expect("el hilo no entro en panic").expect("llego");
    assert_eq!(respuesta.json, r#"{"ok":true}"#);
    assert!(
        comienzo.elapsed() < PLAZO_DE_RESPUESTA,
        "el aviso despierta al que espera; no se agota el plazo"
    );
}
