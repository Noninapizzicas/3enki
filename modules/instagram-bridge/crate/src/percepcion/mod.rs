//! `percepcion` — lo que el aparato VE antes de tocar nada.
//!
//! Aqui vive A1 (`ObservadorDeEstado`), la unica pieza del bloque 5 que mira.
//! Su oficio es convertir lo que el arbol de accesibilidad tiene delante en un
//! `HechoVisible`: que hay, con que nombre, en que caja y si se puede tocar.
//! Hechos, no interpretaciones: nunca dice "parece un boton de publicar", dice
//! "hay un elemento con este nombre visible en esta posicion".
//!
//! # La regla dura: sin mirada nueva NO SE RELLENA
//!
//! Es la tentacion mas comoda del sistema y por eso esta escrita aqui arriba:
//! si no se pudo mirar, el estado es `Desconocido` y se nombra el motivo. La
//! mirada anterior sigue guardada, pero **no contesta**: `hay()` sobre un ancla
//! devuelve `Desconocido`, no el `Presente` de hace dos segundos. Rellenar con
//! lo de antes es como se publica en la cuenta equivocada cuando la app se
//! quedo en otra pantalla.
//!
//! Por eso esta pieza no tiene "memoria de anclas" que pueda responder por su
//! cuenta: un ancla que no se ha mirado ahora no se sabe, aunque se viera mil
//! veces.
//!
//! # Los ficheros
//!
//!   - `simulador.rs`: el arbol de nodos en memoria y la operacion de mutarlo.
//!     Es EL ARBOL FALSO que hace testeable toda la mano sin un movil: A1 y A3
//!     se prueban aqui, en escritorio, con `cargo test`.
//!   - `observador.rs`: el puerto (`FuenteDeArbol`), la proyeccion a
//!     `HechoVisible` y la clase A1 (`mirar`, `hay`, `elementos_visibles`,
//!     `mirar_antes_y_despues`).
//!
//! # Sin dependencias
//!
//! Ni serde, ni regex, ni una caja para las tildes. El crate del aparato se
//! compila con `cargo test --offline` en el servidor y en el portatil: cada
//! dependencia nueva es una cosa mas que puede no estar cuando hay que probar.

pub mod observador;
pub mod simulador;

use std::fmt;

/// Como de entera fue la mirada que produjo el hecho (`completa | parcial`).
///
/// Espejo del campo `mirada` de `HechoVisible` en `core/formas.js`. Lo produce
/// esta capa y lo consume U1 (`mano::exclusividad`, que lo reexporta): una sola
/// lista de valores, no dos que se puedan desincronizar.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mirada {
    Completa,
    Parcial,
}

impl Mirada {
    pub fn como_str(&self) -> &'static str {
        match self {
            Mirada::Completa => "completa",
            Mirada::Parcial => "parcial",
        }
    }
}

impl fmt::Display for Mirada {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.como_str())
    }
}

/// Por que no se pudo mirar. Un "no vi" sin motivo es una laguna disfrazada de
/// dato, asi que cada caso se nombra.
///
/// Los cuatro son los que el aparato puede declarar de verdad: servicio de
/// accesibilidad apagado, ventana ocupada o sin foco, sesion cerrada, y arbol
/// vacio (que NO es "pantalla en blanco": es que no se esta leyendo).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SinMirada {
    /// El servicio de accesibilidad no responde / el aparato no esta.
    AparatoAusente,
    /// Hay otra ventana por delante o la pantalla esta bloqueada.
    Ocupado,
    /// No hay sesion iniciada: la pantalla no es de nadie.
    SinSesion,
    /// El arbol llego sin un solo nodo: no se esta leyendo, no es una pantalla vacia.
    ArbolVacio,
}

impl SinMirada {
    /// Nombre estable y sin tildes, para payloads y logs.
    pub fn como_str(&self) -> &'static str {
        match self {
            SinMirada::AparatoAusente => "aparato_ausente",
            SinMirada::Ocupado => "ocupado",
            SinMirada::SinSesion => "sin_sesion",
            SinMirada::ArbolVacio => "arbol_vacio",
        }
    }

    /// Frase para una persona. R2 la reescribira; aqui dice que pasa.
    pub fn descripcion(&self) -> &'static str {
        match self {
            SinMirada::AparatoAusente => "el aparato no responde o no esta",
            SinMirada::Ocupado => "hay otra ventana por delante o la pantalla esta bloqueada",
            SinMirada::SinSesion => "no hay sesion iniciada: la pantalla no es de nadie",
            SinMirada::ArbolVacio => "el arbol llego sin nodos: no se esta leyendo la pantalla",
        }
    }
}

impl fmt::Display for SinMirada {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.como_str(), self.descripcion())
    }
}
