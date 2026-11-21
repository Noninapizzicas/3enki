//! `canal` — hablar con el bus de Enki desde el aparato.
//!
//! Es la unica parte del crate que sale a la red, y por eso es la unica que
//! rompe la regla de "0 dependencias" (ver la nota del `Cargo.toml` y el bloque
//! 16 del README). Las otras cinco carpetas del crate (`mano`, `percepcion`,
//! `contrato`, `testigo`, `almacen`) siguen siendo `std` puro con puertos
//! inyectados: el canal no las toca, solo las llama por su puerto.
//!
//! Piezas, cada una con un oficio:
//!
//!   - `mqtt`: el cliente MQTT 3.1.1 minimo sobre WebSocket seguro — CONNECT,
//!     SUBSCRIBE, PUBLISH QoS 0, PINGREQ y DISCONNECT — con su `Framer`, que es
//!     lo que impide leer medio CONNACK como si fuera un rechazo.
//!   - `bucle`: el contrato de ordenes (`bridge/orden` -> la mano ->
//!     `bridge/resultado`), la validacion contra catalogo cerrado y el par de
//!     fallo que impide dar un envio por hecho. Tres acciones: `publicar` (mueve
//!     el mundo, pasa por el veto de simulacion), `observar` (bloque 19c:
//!     lectura pura, devuelve el volcado de la ventana activa y NO se veta) y
//!     `paso` (bloque 19d: UN paso suelto, la unica que toca el movil de
//!     verdad).
//!   - `paso` (bloque 19d): el vocabulario de UN paso suelto (`tocar` por
//!     `view_id`/`texto`/`desc`, `escribir` en el campo enfocado, `esperar`,
//!     `atras`), su validacion, y la resolucion del ancla sobre la foto con sus
//!     dos fallos con nombre: `ancla_no_encontrada` y `ancla_ambigua`. Rust puro:
//!     se prueba en escritorio, sin movil.
//!   - `json`: el lector y escritor de JSON minimo, porque una orden es JSON y
//!     buscarla con subcadenas es la clase de atajo que ejecuta lo que no era.
//!   - `observacion` (bloque 19b): el volcado de pantalla del aparato camino del
//!     bus. Es un puente TONTO a proposito: envuelve el JSON que le dan y no lo
//!     parsea, porque un volcado transformado ya no es lo que el aparato vio.
//!     Lleva un buzon para que el hilo de la UI de Android no toque la red.
//!   - `reconexion` (bloque 19e): la politica de reintento —espera creciente con
//!     tope de 60 s— y el vocabulario del estado `reconectando`. Rust puro y sin
//!     reloj: decide *cuanto* esperar, no duerme. Distingue la caida de la
//!     parada deliberada por un VALOR, no adivinando el estado.
//!
//! # Lo que el canal NO hace
//!
//!   - No decide **si** se puede publicar. Eso lo decidio el cerebro (ritmo,
//!     autonomia, ventana). El canal solo lleva la orden y trae la respuesta.
//!   - No guarda la llave. La llave viaja en la URL (`wss://.../mqtt?k=<llave>`)
//!     y se pasa por argumento: el crate no la escribe en ningun sitio, ni en
//!     logs. Un canal que loguea su URL loguea la llave.
//!   - No reintenta ni reconecta por su cuenta: la politica (cuanto esperar y
//!     cuando rendirse) es de `reconexion`, y quien la ejecuta es el hilo del
//!     borde (`jni`), que es el unico que sabe si la parada la pidio el dueno.

pub mod bucle;
pub mod json;
pub mod mqtt;
pub mod observacion;
pub mod paso;
pub mod reconexion;

pub use bucle::{
    atender, servir, Bus, HechoDeMano, ManoAusente, ManoDeOrdenes, Opcion, Orden, Resultado,
    ACCIONES, ACCION_OBSERVAR, ACCION_PASO, ACCION_PUBLICAR,
};
pub use paso::{AnclaDePaso, GestoDePaso, Paso};
pub use reconexion::{Decision, Desenlace, Reconexion, Reintento};
pub use mqtt::{url_con_llave, Canal, FalloDeCanal, Framer};
