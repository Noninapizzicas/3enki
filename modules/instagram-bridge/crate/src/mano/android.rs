//! `android` — la MANO de verdad: el aparato, por la cola (bloque 19a).
//!
//! Este fichero es el que convierte "el crate sabe decidir" en "el aparato se
//! mueve". NO habla JNI y NO sabe nada de `AccessibilityService`: solo encola
//! peticiones en `mano::cola` y espera la respuesta que deja `BucleDeMano.kt`.
//!
//! ```text
//! A1 (observador)  ->  ManoAndroid::observar()   -> cola: observar  -> Kotlin: Volcado.leer()
//! A3 (ejecutor)    ->  ManoAndroid::tocar/...    -> cola: ejecutar  -> Kotlin: Gestos.tocar/...
//! ```
//!
//! El volcado que contesta Kotlin es el de `Volcado.kt` (los 18 campos del
//! nodo), NO la vista filtrada de `Accesibilidad.mirar()`: quien pide `observar`
//! escribe una receta, y una receta necesita los nodos `visible:false` y los
//! `hint`. `arbol_json` es el unico sitio que conoce ese JSON; aqui no se
//! reinterpreta nada.
//!
//! # Por que esta pieza implementa DOS puertos y no es una clase nueva
//!
//! Porque el crate ya tenia los puertos escritos y probados: `FuenteDeArbol`
//! (percepcion) y `Superficie` (mano::ejecutor), con sus dobles de escritorio
//! (`Simulador`, `SuperficieGrabada`). La mano Android es la implementacion de
//! produccion de esos dos puertos y nada mas: si tuviera su propia interfaz, A1 y
//! A3 tendrian dos caminos y el de produccion seria el que nadie prueba.
//!
//! Un solo `ManoAndroid` sirve para los dos porque comparten UNA cola: mirar y
//! tocar son dos peticiones a la MISMA mano, y separarlas en dos objetos daria
//! dos colas y por tanto dos ordenes posibles (mirar mientras se toca).
//!
//! # La regla del plazo
//!
//! Toda peticion espera con tope (`PLAZO_DE_RESPUESTA`, 10 s) y un plazo agotado
//! es `FalloDeMano::SinRespuesta`, con nombre (`mano_sin_respuesta`). Nunca un
//! panic y nunca un bloqueo eterno: el hilo del canal puede quedarse 10 s sin
//! atender ordenes, pero vuelve.
//!
//! La excepcion es `esperar(ms)`: ahi el plazo es `10 s + ms`, porque el paso
//! pide dormir y dormir mas que el plazo no es un fallo de nadie.
//!
//! # Lo que esta mano NO hace todavia (y por que)
//!
//! **No ejecuta una `Orden` entera.** Una orden es "publica este texto en
//! Instagram": para eso hace falta una RECETA (que ancla se toca, en que orden,
//! que se comprueba despues) y el encadenado con `mano::publicar` es el bloque
//! siguiente. Inventar aqui un `match` con dos toques fijos seria escribir una
//! receta escondida en el borde, que es justo lo que este crate no hace. Por eso
//! `ManoDeOrdenes::ejecutar` contesta `sin_receta` y NO toca nada: una mano que
//! improvisa el camino es una mano que publica en la cuenta equivocada.

use std::sync::OnceLock;
use std::time::Duration;

use crate::canal::bucle::{HechoDeMano, ManoDeOrdenes, Orden};
use crate::canal::json::{self, Valor};
use crate::mano::arbol_json::{self, FalloDeArbol};
use crate::mano::cola::{ColaDeMano, EsperaAgotada, TipoDePeticion, PLAZO_DE_RESPUESTA};
use crate::mano::ejecutor::{Direccion, FalloDeGesto, Gesto, Objetivo, Superficie};
use crate::percepcion::observador::FuenteDeArbol;
use crate::percepcion::simulador::Arbol;
use crate::percepcion::SinMirada;

/// El motivo con el que esta mano dice que no tiene receta. El encadenado con
/// receta es `mano::publicar`, y ese bloque aun no esta cableado en el aparato.
pub const MOTIVO_SIN_RECETA: &str = "sin_receta";

/// El motivo con el que se nombra una respuesta que llego y no se entiende.
pub const MOTIVO_RESPUESTA_ILEGIBLE: &str = "respuesta_ilegible";

/// La cola del proceso: UNA sola.
///
/// La comparten el hilo del canal (que encola y espera) y el borde JNI (que
/// entrega lo que contesta Kotlin). `OnceLock` porque no hay nada que
/// inicializar a mano y el primer usuario puede ser cualquiera de los dos.
static COLA: OnceLock<ColaDeMano> = OnceLock::new();

/// La cola de la mano de este proceso. Es lo que el borde JNI mira.
pub fn cola() -> &'static ColaDeMano {
    COLA.get_or_init(ColaDeMano::nueva)
}

// ---------------------------------------------------------------------------
// El fallo de la mano
// ---------------------------------------------------------------------------

/// Por que la mano no pudo hacer lo que se le pidio.
///
/// Tres casos y ninguno es "algo salio mal": o el otro lado no contesto, o
/// contesto algo que no se entiende, o contesto que el aparato no pudo (y
/// entonces el motivo es SUYO, sin traducir).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FalloDeMano {
    /// Se acabo el plazo sin respuesta de Kotlin.
    SinRespuesta(EsperaAgotada),
    /// Llego respuesta y el JSON no es del contrato.
    RespuestaIlegible { motivo: String },
    /// El aparato dijo que no pudo, con su motivo (sin tildes, de `Gestos.kt` o
    /// de `Accesibilidad.kt`).
    Aparato { motivo: String },
}

impl FalloDeMano {
    /// El nombre estable del fallo, tal y como viaja en un informe.
    pub fn codigo(&self) -> &'static str {
        match self {
            FalloDeMano::SinRespuesta(espera) => espera.codigo(),
            FalloDeMano::RespuestaIlegible { .. } => MOTIVO_RESPUESTA_ILEGIBLE,
            FalloDeMano::Aparato { .. } => "aparato_no_pudo",
        }
    }

    /// El motivo que se lleva A3 / A5 / el informe: el del aparato si lo hay.
    ///
    /// Para un plazo agotado se devuelve `mano_sin_respuesta` y no la frase
    /// larga: es el nombre que se compara y el que se puede buscar en un log.
    pub fn motivo(&self) -> String {
        match self {
            FalloDeMano::SinRespuesta(espera) => espera.codigo().to_string(),
            FalloDeMano::RespuestaIlegible { motivo } => {
                format!("{}: {motivo}", MOTIVO_RESPUESTA_ILEGIBLE)
            }
            FalloDeMano::Aparato { motivo } => motivo.clone(),
        }
    }

    pub fn descripcion(&self) -> String {
        match self {
            FalloDeMano::SinRespuesta(espera) => espera.descripcion(),
            FalloDeMano::RespuestaIlegible { motivo } => {
                format!("la mano Android contesto algo que no es del contrato: {motivo}")
            }
            FalloDeMano::Aparato { motivo } => {
                format!("el aparato no pudo entregar el paso: {motivo}")
            }
        }
    }

    /// Como se lee esto desde A1. Un plazo agotado es "el aparato no responde";
    /// un motivo del aparato se traduce por la tabla de `arbol_json`.
    pub fn sin_mirada(&self) -> SinMirada {
        match self {
            FalloDeMano::SinRespuesta(_) | FalloDeMano::RespuestaIlegible { .. } => {
                SinMirada::AparatoAusente
            }
            FalloDeMano::Aparato { motivo } => arbol_json::sin_mirada_de(motivo),
        }
    }
}

impl std::fmt::Display for FalloDeMano {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({})", self.codigo(), self.descripcion())
    }
}

// ---------------------------------------------------------------------------
// La mano
// ---------------------------------------------------------------------------

/// La mano del aparato. Sin estado propio: la cola es el estado, y es `static`
/// para que el borde JNI y el hilo del canal vean la MISMA.
#[derive(Debug, Clone, Copy)]
pub struct ManoAndroid {
    cola: &'static ColaDeMano,
}

impl Default for ManoAndroid {
    fn default() -> Self {
        Self::nueva()
    }
}

impl ManoAndroid {
    pub fn nueva() -> Self {
        Self { cola: cola() }
    }

    /// OBSERVAR: pide una mirada nueva y la devuelve ya proyectada a `Arbol`.
    ///
    /// Es una mirada NUEVA por llamada: no hay cache. Un arbol de hace dos
    /// segundos es exactamente lo que A1 prohibe usar para decidir.
    pub fn observar(&self) -> Result<Arbol, FalloDeMano> {
        let volcado = self.observar_volcado()?;
        arbol_json::desde_json(&volcado).map_err(|fallo| match fallo {
            FalloDeArbol::NoSePudoMirar { motivo } => FalloDeMano::Aparato { motivo },
            otro => FalloDeMano::RespuestaIlegible { motivo: otro.descripcion() },
        })
    }

    /// OBSERVAR (crudo): la foto de la ventana activa, tal y como la serializo
    /// `Volcado.kt`.
    ///
    /// Devuelve el JSON SIN proyectar porque es lo que pide una orden
    /// `observar`: los 18 campos del nodo (`view_id`, `clase`, `hint`,
    /// `habilitado`, `seleccionado`, `marcado`...) son justo lo que hace falta
    /// para escribir una receta, y `Arbol` no los modela todos.
    ///
    /// El volcado se valida ANTES de devolverlo (`arbol_json::desde_json`): una
    /// foto que no se puede leer no es una foto, es una respuesta rota, y se
    /// nombra aqui en vez de salir al bus como si fuera buena.
    pub fn observar_volcado(&self) -> Result<String, FalloDeMano> {
        let respuesta = self.pedir(TipoDePeticion::Observar, String::new(), PLAZO_DE_RESPUESTA)?;
        match arbol_json::desde_json(&respuesta) {
            Ok(_) => Ok(respuesta),
            Err(FalloDeArbol::NoSePudoMirar { motivo }) => Err(FalloDeMano::Aparato { motivo }),
            Err(otro) => Err(FalloDeMano::RespuestaIlegible { motivo: otro.descripcion() }),
        }
    }

    /// EJECUTAR UN PASO: entrega UN gesto y dice si el aparato lo acepto.
    ///
    /// "Aceptado" no es "ocurrio": eso lo dice la mirada siguiente, y por eso
    /// A3 nunca afirma el resultado con esto.
    pub fn ejecutar_paso(&self, gesto: &Gesto) -> Result<(), FalloDeMano> {
        // Un `esperar` larga el plazo: el paso pide dormir y dormir mas que el
        // plazo no es un fallo de nadie.
        let plazo = match gesto {
            Gesto::Esperar { ms } => PLAZO_DE_RESPUESTA + Duration::from_millis(*ms),
            _ => PLAZO_DE_RESPUESTA,
        };
        let respuesta = self.pedir(TipoDePeticion::Ejecutar, paso_json(gesto), plazo)?;
        desenlace(&respuesta)
    }

    /// Encola y espera, con el plazo ya decidido.
    fn pedir(&self, tipo: TipoDePeticion, datos: String, plazo: Duration) -> Result<String, FalloDeMano> {
        let peticion = self.cola.pedir(tipo, datos, plazo);
        match peticion {
            Ok(respuesta) => Ok(respuesta.json),
            Err(espera) => Err(FalloDeMano::SinRespuesta(espera)),
        }
    }
}

/// El JSON de un paso, con las claves que lee `BucleDeMano.kt`.
///
/// Se serializa aqui y no en Kotlin porque el que sabe que gesto quiere es A3:
/// mandar una frase ("toca el boton de publicar") obligaria al aparato a
/// interpretar, y el aparato solo obedece.
pub fn paso_json(gesto: &Gesto) -> String {
    match gesto {
        Gesto::Tocar { objetivo } => Valor::objeto(vec![
            ("accion", Valor::texto("tocar")),
            ("id", Valor::texto(objetivo.id.clone())),
            ("x", Valor::Numero(objetivo.punto.0 as f64)),
            ("y", Valor::Numero(objetivo.punto.1 as f64)),
        ])
        .a_texto(),
        Gesto::Escribir { objetivo, texto } => Valor::objeto(vec![
            ("accion", Valor::texto("escribir")),
            ("id", Valor::texto(objetivo.id.clone())),
            ("x", Valor::Numero(objetivo.punto.0 as f64)),
            ("y", Valor::Numero(objetivo.punto.1 as f64)),
            ("texto", Valor::texto(texto.clone())),
        ])
        .a_texto(),
        Gesto::Desplazar { direccion, distancia } => Valor::objeto(vec![
            ("accion", Valor::texto("desplazar")),
            ("direccion", Valor::texto(direccion.como_str())),
            ("distancia", Valor::Numero(*distancia as f64)),
        ])
        .a_texto(),
        Gesto::Esperar { ms } => Valor::objeto(vec![
            ("accion", Valor::texto("esperar")),
            ("ms", Valor::Numero(*ms as f64)),
        ])
        .a_texto(),
    }
}

/// Lee `{ok, motivo}` de la respuesta de un paso.
///
/// `ok` tiene que estar y ser booleano: una respuesta sin `ok` no es un "si" ni
/// un "no", es una respuesta que no se entiende, y se nombra.
fn desenlace(respuesta: &str) -> Result<(), FalloDeMano> {
    let valor = json::leer(respuesta)
        .map_err(|e| FalloDeMano::RespuestaIlegible { motivo: format!("no es json: {e}") })?;

    match valor.obtener("ok").and_then(Valor::como_bool) {
        Some(true) => Ok(()),
        Some(false) => {
            let motivo = valor
                .obtener("motivo")
                .and_then(Valor::como_texto)
                .map(|m| m.trim().to_string())
                .filter(|m| !m.is_empty())
                .unwrap_or_else(|| "el aparato dijo que no y no dijo por que".to_string());
            Err(FalloDeMano::Aparato { motivo })
        }
        None => Err(FalloDeMano::RespuestaIlegible {
            motivo: "la respuesta del paso no trae 'ok' booleano".to_string(),
        }),
    }
}

// ---------------------------------------------------------------------------
// Los dos puertos
// ---------------------------------------------------------------------------

impl FuenteDeArbol for ManoAndroid {
    fn leer(&self) -> Result<Arbol, SinMirada> {
        self.observar().map_err(|fallo| fallo.sin_mirada())
    }
}

impl Superficie for ManoAndroid {
    fn tocar(&mut self, objetivo: &Objetivo) -> Result<(), FalloDeGesto> {
        self.ejecutar_paso(&Gesto::Tocar { objetivo: objetivo.clone() })
            .map_err(|fallo| FalloDeGesto::nuevo(fallo.motivo()))
    }

    fn escribir(&mut self, objetivo: &Objetivo, texto: &str) -> Result<(), FalloDeGesto> {
        self.ejecutar_paso(&Gesto::Escribir {
            objetivo: objetivo.clone(),
            texto: texto.to_string(),
        })
        .map_err(|fallo| FalloDeGesto::nuevo(fallo.motivo()))
    }

    fn desplazar(&mut self, direccion: Direccion, distancia: i32) -> Result<(), FalloDeGesto> {
        self.ejecutar_paso(&Gesto::Desplazar { direccion, distancia })
            .map_err(|fallo| FalloDeGesto::nuevo(fallo.motivo()))
    }

    fn esperar(&mut self, ms: u64) -> Result<(), FalloDeGesto> {
        self.ejecutar_paso(&Gesto::Esperar { ms })
            .map_err(|fallo| FalloDeGesto::nuevo(fallo.motivo()))
    }
}

impl ManoDeOrdenes for ManoAndroid {
    fn ejecutar(&mut self, orden: &Orden) -> HechoDeMano {
        // Ni un gesto. Ver la cabecera: sin receta no hay camino, y un camino
        // inventado en el borde es un post en la cuenta equivocada.
        HechoDeMano::nada(
            MOTIVO_SIN_RECETA,
            format!(
                "la mano Android ejecuta PASOS (mirar, tocar, escribir, desplazar, esperar) y esta orden pide la accion '{}' de {}: el encadenado con receta es mano::publicar",
                orden.accion, orden.red
            ),
        )
    }

    /// MIRAR bajo demanda (bloque 19c). Devuelve el volcado CRUDO.
    ///
    /// La cola ya sabe nombrar los dos fallos que importan: sin respuesta
    /// (`mano_sin_respuesta`, el otro lado no contesta en 10 s) y aparato
    /// (`servicio_no_activo`, `sin_ventana`, `ocupado`...). Aqui no se traducen:
    /// el motivo viaja tal cual hasta el resultado del bus, que es donde alguien
    /// lo va a leer.
    fn observar(&mut self) -> HechoDeMano {
        match self.observar_volcado() {
            Ok(volcado) => {
                let bytes = volcado.len();
                HechoDeMano::con_volcado(
                    volcado,
                    format!("volcado de la ventana activa: {bytes} bytes"),
                )
            }
            Err(fallo) => HechoDeMano::nada(fallo.motivo(), fallo.descripcion()),
        }
    }
}
