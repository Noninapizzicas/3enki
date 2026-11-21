//! instagram-bridge · BLOQUE 19b · EL PUENTE DEL VOLCADO (tests puros)
//!
//! Dos promesas, y las dos se pueden romper sin que nada avise:
//!
//!   1. **El volcado viaja TAL CUAL.** El borde no parsea, no reescribe y no
//!      normaliza: mete el JSON de Kotlin dentro del sobre del bus byte a byte.
//!      Si un dia alguien "arregla" el volcado en el camino (recortando campos,
//!      reescapando comillas, ordenando claves), el servidor recibiria una
//!      pantalla que el aparato no vio, y la receta se escribiria sobre un ancla
//!      que no existe. Eso no da error en ningun sitio: da una receta que falla
//!      el dia que se usa.
//!   2. **Sin canal no se encola nada y el motivo se nombra.** `publicarObservacion`
//!      solo puede contestar un booleano; si el "no" no dijera POR QUE, el dueno
//!      pulsaria el boton para siempre sin saber que el canal esta en
//!      `desconectado`.
//!
//! Estos dos tests corren en escritorio, sin movil y sin NDK: `canal::observacion`
//! esta fuera de `cfg(android)` justo para esto.

use enki_instagram_bridge::canal::observacion::{self, FalloDeObservacion, TOPIC_OBSERVACION};

// ---------------------------------------------------------------------------
// 1 · El puente no parsea ni cambia el JSON
// ---------------------------------------------------------------------------

#[test]
fn el_puente_no_parsea_ni_cambia_el_json() {
    // Un volcado "raro" a proposito. Tiene TODO lo que un parser de este crate
    // rechazaria o reescribiria:
    //   - comillas escapadas y un salto de linea dentro de un texto;
    //   - una barra invertida escapada (que un reescapado ingenuo doblaria);
    //   - `1e999` (infinito en coma flotante: `Valor::Numero` no lo puede
    //     representar sin perderlo);
    //   - claves repetidas (`nodos` dos veces) y en orden raro;
    //   - un `]` dentro de una cadena, que un recortador de corchetes romperia;
    //   - un emoji fuera del plano basico (par suplente).
    let raro = concat!(
        r#"{"nodos":[{"texto":"dijo \"hola\"\ny adios","x":-0.5,"raro":1e999,"n":null}],"#,
        r#""nodos":[[1,2,{"a":"]"}]],"emoji":"🙂","k":"a\\b"}"#
    );

    let sobre = observacion::envolver("obs-1", 1_700_000_000_000, raro);

    // (a) El volcado esta DENTRO, contiguo y sin tocar. Esta es la promesa.
    assert!(
        sobre.contains(raro),
        "el JSON recibido no viaja tal cual dentro del sobre: se transformo en el camino\nsobre: {sobre}"
    );

    // (b) El sobre es el del bus: event_id, tipo, momento, source y data.
    assert!(
        sobre.starts_with('{') && sobre.ends_with('}'),
        "el sobre tiene que ser UN objeto JSON: {sobre}"
    );
    assert!(
        sobre.contains("\"event_id\":\"obs-1\""),
        "el sobre no lleva el event_id que se le dio: {sobre}"
    );
    assert!(
        sobre.contains("\"event_type\":\"bridge.observacion\""),
        "el sobre no declara el tipo de evento del contrato: {sobre}"
    );
    assert!(
        sobre.contains("\"timestamp\":1700000000000"),
        "el sobre no lleva el momento del aparato: {sobre}"
    );
    // `core_id: external` no es cosmetico: como `core-a` el bus descarta el
    // evento por self-loop y el volcado no llega nunca.
    assert!(
        sobre.contains("\"source\":{\"core_id\":\"external\""),
        "el sobre no se presenta como `external`: el bus lo tiraria como self-loop: {sobre}"
    );
    assert!(
        sobre.contains("\"module\":\"instagram-bridge\""),
        "el sobre no dice de que modulo viene: {sobre}"
    );
    assert!(sobre.contains("\"data\":"), "el sobre no lleva el volcado en `data`: {sobre}");

    // (c) NO se reescapa: las comillas escapadas del volcado siguen siendo dos
    // bytes en el sobre (si se hubieran vuelto a escapar, serian cuatro).
    let desde_data = &sobre[sobre.find("\"data\":").expect("clave data")..];
    assert!(
        desde_data.contains("\\\"hola\\\""),
        "el volcado se reescapo por el camino: {desde_data}"
    );
    assert!(
        desde_data.contains("a\\\\b"),
        "la barra invertida del volcado cambio de forma: {desde_data}"
    );
    assert!(desde_data.contains("🙂"), "el emoji se perdio por el camino (¿se recorto por bytes?): {desde_data}");
    assert!(
        desde_data.contains("1e999"),
        "un numero raro se reescribio: el puente no puede decidir que numeros valen: {desde_data}"
    );

    // (d) Y no se le exige ser un objeto para ENVOLVER: `envolver` es el sobre
    // crudo. La comprobacion de forma vive en `encolar`, en un solo sitio.
    let crudo = observacion::envolver("obs-2", 7, "esto no es json");
    assert!(
        crudo.ends_with("\"data\":esto no es json}"),
        "envolver no puede negarse a envolver: la comprobacion de forma es de `encolar`: {crudo}"
    );
}

// ---------------------------------------------------------------------------
// 2 · Sin canal devuelve falso con motivo
// ---------------------------------------------------------------------------

#[test]
fn sin_canal_devuelve_falso_con_motivo() {
    let buzon = observacion::Buzon::nuevo();
    let volcado = r#"{"paquete":"com.instagram.android","actividad":null,"momento":1,"truncado":false,"nodos":[{"id":0,"padre":null,"texto":"Publicar"}]}"#;

    // (a) Con el canal CONECTADO, el volcado se encola y se puede sacar.
    let recado = observacion::encolar(&buzon, volcado, "conectado", 1_700_000_000_100)
        .expect("con el canal conectado el volcado tiene que encolarse");
    assert_eq!(recado.topic, TOPIC_OBSERVACION, "el recado no apunta al topic del contrato");
    assert_eq!(
        TOPIC_OBSERVACION, "core/core-a/events/bridge/observacion",
        "el topic del volcado cambio: es el que escucha el servidor"
    );
    assert!(recado.payload.contains(volcado), "el recado no lleva el volcado dentro");
    assert_eq!(buzon.cuantos(), 1);
    assert_eq!(buzon.sacar().as_ref(), Some(&recado), "lo encolado no se puede sacar");
    assert_eq!(buzon.cuantos(), 0, "sacar no deja copia: un volcado no se publica dos veces");

    // (b) Sin canal (o arrancando, o roto): no se encola NADA y el motivo dice
    // en que estado esta el canal. `conectando` tampoco vale: un PUBLISH antes
    // del CONNACK lo cierra el broker.
    for estado in ["desconectado", "conectando", "error:transporte"] {
        let fallo = observacion::encolar(&buzon, volcado, estado, 1)
            .expect_err("sin canal no se puede encolar un volcado");
        assert_eq!(
            fallo.codigo(),
            "sin_canal",
            "el motivo del 'no' tiene que ser `sin_canal`, no un generico: {fallo}"
        );
        assert!(
            fallo.descripcion().contains(estado),
            "el motivo tiene que decir EN QUE ESTADO esta el canal ('{estado}'): {}",
            fallo.descripcion()
        );
    }
    assert_eq!(
        buzon.cuantos(),
        0,
        "sin canal no se guarda nada: un volcado esperando a un canal que no existe es basura que se publicaria luego"
    );

    // (c) `comprobar_canal` es la unica tabla de "se puede publicar".
    assert_eq!(observacion::comprobar_canal("conectado"), Ok(()));
    assert_eq!(
        observacion::comprobar_canal("otra_cosa"),
        Err(FalloDeObservacion::SinCanal { estado: "otra_cosa".to_string() }),
        "un estado que no es `conectado` no puede pasar por canal sano"
    );

    // (d) Un volcado vacio o que no es un objeto se rechaza con su nombre, y
    // tampoco ocupa sitio en el buzon.
    assert_eq!(
        observacion::encolar(&buzon, "   ", "conectado", 1).expect_err("vacio").codigo(),
        "json_vacio"
    );
    assert_eq!(
        observacion::encolar(&buzon, "[1,2,3]", "conectado", 1).expect_err("no objeto").codigo(),
        "json_no_objeto"
    );
    assert_eq!(buzon.cuantos(), 0, "lo rechazado no se queda en el buzon");

    // (e) El buzon tiene tope: un canal que no recoge no puede llenar la memoria
    // del aparato con volcados de 4000 nodos.
    for _ in 0..observacion::TOPE_DE_RECADOS {
        observacion::encolar(&buzon, volcado, "conectado", 1).expect("cabe");
    }
    let lleno = observacion::encolar(&buzon, volcado, "conectado", 1)
        .expect_err("el buzon lleno tiene que decirlo");
    assert_eq!(lleno.codigo(), "buzon_lleno");
    assert_eq!(buzon.cuantos(), observacion::TOPE_DE_RECADOS);
}
