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
//!     fallo que impide dar un envio por hecho. Dos acciones: `publicar` (mueve
//!     el mundo, pasa por el veto de simulacion) y `observar` (bloque 19c:
//!     lectura pura, devuelve el volcado de la ventana activa y NO se veta).
//!   - `json`: el lector y escritor de JSON minimo, porque una orden es JSON y
//!     buscarla con subcadenas es la clase de atajo que ejecuta lo que no era.
//!   - `observacion` (bloque 19b): el volcado de pantalla del aparato camino del
//!     bus. Es un puente TONTO a proposito: envuelve el JSON que le dan y no lo
//!     parsea, porque un volcado transformado ya no es lo que el aparato vio.
//!     Lleva un buzon para que el hilo de la UI de Android no toque la red.
//!
//! # Lo que el canal NO hace
//!
//!   - No decide **si** se puede publicar. Eso lo decidio el cerebro (ritmo,
//!     autonomia, ventana). El canal solo lleva la orden y trae la respuesta.
//!   - No guarda la llave. La llave viaja en la URL (`wss://.../mqtt?k=<llave>`)
//!     y se pasa por argumento: el crate no la escribe en ningun sitio, ni en
//!     logs. Un canal que loguea su URL loguea la llave.
//!   - No reintenta ni reconecta: eso es politica y vive fuera de aqui.

pub mod bucle;
pub mod json;
pub mod mqtt;
pub mod observacion;

pub use bucle::{
    atender, servir, Bus, HechoDeMano, ManoAusente, ManoDeOrdenes, Opcion, Orden, Resultado,
    ACCIONES, ACCION_OBSERVAR, ACCION_PUBLICAR,
};
pub use mqtt::{url_con_llave, Canal, FalloDeCanal, Framer};
