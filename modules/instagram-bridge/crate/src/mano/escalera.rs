//! A5 · EscaleraDeRecuperacion · REFLEJO del aparato.
//!
//! Ante un fallo de un paso, decide **una** de tres cosas: reintentar, volver o
//! escalar. Recibe el hecho y contesta. No ejecuta nada, no mira nada, no
//! espera nada: no tiene reloj, ni red, ni IO y no guarda estado entre
//! llamadas. Es el dueno de la familia `plataforma` en R1
//! (`FamiliaDeFallo::Plataforma.dueno()` es este fichero).
//!
//! # La regla dura y sagrada
//!
//! ```text
//! un paso que YA CAMBIO EL MUNDO no se reintenta NUNCA
//! si no se sabe si cambio el mundo -> NO se reintenta (conservador)
//! ```
//!
//! No es una precaucion: es la unica forma de que un reintento no se convierta
//! en un duplicado. Un post publicado dos veces, un comentario escrito dos
//! veces, un mensaje enviado dos veces: **el duplicado es peor que el retraso**,
//! porque el retraso se arregla con tiempo y el duplicado ya lo vio alguien.
//!
//! Por eso el orden de la tabla es el que es, y la regla va la primera:
//!
//! ```text
//! 1 (SAGRADA)  efecto Indeterminado  -> escalar   (no se sabe: no se reintenta)
//! 2 (SAGRADA)  efecto EfectoPosible  -> escalar   (cambio el mundo: jamas)
//! 3            intentos >= techo     -> escalar   (ya se gasto el segundo intento)
//! 4            familia reintentable  -> reintentar (solo `plataforma`, R1)
//! 5            interfaz con vuelta   -> volver     (la pantalla ya no es la que era)
//! 6            el resto              -> escalar   (con el remedio de su familia)
//! ```
//!
//! Si la regla 1 estuviera detras del techo, un hecho indeterminado con
//! intentos libres saldria `reintentar` y el sistema tocaria a ciegas. El orden
//! ES la regla.
//!
//! # Las tres salidas
//!
//! - **Reintentar** — el mismo paso, el mismo ancla, con **mirada nueva**
//!   (eso lo garantiza quien ejecuta, no esta pieza). Solo se llega aqui si el
//!   paso no toco nada y la familia declara `reintentar`.
//! - **Volver** — no se repite el paso que fallo: se retrocede al paso anterior
//!   conocido. Se usa cuando la pantalla ya no es la que la receta supone y
//!   hay un sitio al que volver; volver no duplica nada.
//! - **Escalar** — se para y se avisa. Lleva el `Remedio` que la taxonomia (R1)
//!   declara para esa familia, para que quien recoja la senal sepa a quien
//!   buscar: `pedir_persona` (sesion), `declarar_rotura` (interfaz),
//!   `preguntar` (dato que falta), `regular` (freno de la plataforma).
//!
//! # Una sola lista de remedios
//!
//! `Escalada.remedio` es el `Remedio` de `contrato::fallo`, no una segunda
//! lista. Y cuando la familia declara `reintentar` pero la decision es escalar
//! (porque el mundo cambio o no se sabe), el remedio que viaja es `escalar`:
//! una escalada que pide reintentar seria una contradiccion con la regla
//! sagrada escrita en el mismo objeto.
//!
//! Puro: sin reloj, sin red, sin IO, sin estado global. `Escalera` solo guarda
//! su techo de intentos, que es configuracion y no se mueve sola.

use std::fmt;

use crate::contrato::fallo::{FamiliaDeFallo, Remedio};
use crate::percepcion::observador::Ancla;

/// El efecto en el mundo que reporta A3. Se REEXPORTA desde `ejecutor` para que
/// A5 y A3 compartan un solo enum: dos copias del mismo vocabulario acaban
/// diciendo cosas distintas del mismo paso.
pub use crate::mano::ejecutor::EfectoEnElMundo;

/// Cuantos reintentos permite la escalera por defecto.
///
/// Uno, y no mas: R1 dice que un paso que no movio nada "se puede repetir UNA
/// vez". El segundo intento fallido ya no es un temblor, es un sintoma.
pub const TECHO_POR_DEFECTO: u32 = 1;

// ---------------------------------------------------------------------------
// El hecho del fallo (lo que entra)
// ---------------------------------------------------------------------------

/// Lo que A5 sabe cuando un paso falla. Todo entra por aqui: no consulta nada.
///
/// `intentos` son los reintentos **ya hechos** de ESTE paso (0 la primera vez).
/// El techo lo pone la escalera, no el hecho: quien llama no decide cuantas
/// veces se insiste.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HechoDeFallo {
    /// Numero de paso 1..N. Un fallo sin numero no se puede ni contar.
    pub paso: usize,
    pub familia: FamiliaDeFallo,
    pub efecto: EfectoEnElMundo,
    pub intentos: u32,
    /// ¿Hay un paso anterior conocido al que volver? Lo declara quien conoce la
    /// receta (el paso 1 no tiene vuelta).
    pub hay_vuelta: bool,
    /// El ancla del paso que fallo, para que la escalada diga DONDE miraba.
    pub ancla: Option<Ancla>,
}

impl HechoDeFallo {
    pub fn nuevo(paso: usize, familia: FamiliaDeFallo, efecto: EfectoEnElMundo) -> Self {
        Self { paso, familia, efecto, intentos: 0, hay_vuelta: false, ancla: None }
    }

    pub fn con_intentos(mut self, intentos: u32) -> Self {
        self.intentos = intentos;
        self
    }

    pub fn con_vuelta(mut self, hay_vuelta: bool) -> Self {
        self.hay_vuelta = hay_vuelta;
        self
    }

    pub fn con_ancla(mut self, ancla: Ancla) -> Self {
        self.ancla = Some(ancla);
        self
    }
}

// ---------------------------------------------------------------------------
// La decision (lo que sale)
// ---------------------------------------------------------------------------

/// Por que se decidio eso. Un "escalar" sin motivo no se puede ni auditar ni
/// contar por causa.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MotivoDeDecision {
    /// El paso no toco nada y su familia admite un segundo intento.
    NoCambioElMundo,
    /// El paso pudo cambiar el mundo: no se reintenta jamas.
    CambioElMundo,
    /// No se sabe si el paso cambio el mundo: se trata como si lo hubiera hecho.
    NoSeSabeSiCambio,
    /// Ya se gastaron los intentos que permite la escalera.
    SeAgotoElTecho,
    /// La pantalla ya no es la que la receta supone (ancla ausente, accion que
    /// no vale, ancla que no se deja tocar).
    LaPantallaYaNoEsLaQueLaRecetaSupone,
    /// No hay paso anterior al que volver.
    SinCaminoDeVuelta,
    /// La sesion se cayo: hace falta una persona que vuelva a entrar.
    FaltaLaSesion,
    /// El aparato no responde.
    ElAparatoNoResponde,
    /// Falta un dato sin el cual la operacion no se puede completar.
    FaltaUnDato,
    /// La plataforma esta frenando: es una senal, no una averia (R1).
    LaPlataformaEstaFrenando,
}

impl MotivoDeDecision {
    pub fn como_str(&self) -> &'static str {
        match self {
            MotivoDeDecision::NoCambioElMundo => "no_cambio_el_mundo",
            MotivoDeDecision::CambioElMundo => "cambio_el_mundo",
            MotivoDeDecision::NoSeSabeSiCambio => "no_se_sabe_si_cambio",
            MotivoDeDecision::SeAgotoElTecho => "se_agoto_el_techo",
            MotivoDeDecision::LaPantallaYaNoEsLaQueLaRecetaSupone => {
                "la_pantalla_ya_no_es_la_que_la_receta_supone"
            }
            MotivoDeDecision::SinCaminoDeVuelta => "sin_camino_de_vuelta",
            MotivoDeDecision::FaltaLaSesion => "falta_la_sesion",
            MotivoDeDecision::ElAparatoNoResponde => "el_aparato_no_responde",
            MotivoDeDecision::FaltaUnDato => "falta_un_dato",
            MotivoDeDecision::LaPlataformaEstaFrenando => "la_plataforma_esta_frenando",
        }
    }

    pub fn descripcion(&self) -> &'static str {
        match self {
            MotivoDeDecision::NoCambioElMundo => {
                "el paso no llego a tocar nada: se puede intentar una vez mas"
            }
            MotivoDeDecision::CambioElMundo => {
                "el paso pudo cambiar el mundo: reintentarlo seria un duplicado"
            }
            MotivoDeDecision::NoSeSabeSiCambio => {
                "no se sabe si el paso cambio el mundo: se trata como si lo hubiera hecho"
            }
            MotivoDeDecision::SeAgotoElTecho => {
                "ya se gastaron los intentos de este paso; insistir mas no es recuperar, es repetir"
            }
            MotivoDeDecision::LaPantallaYaNoEsLaQueLaRecetaSupone => {
                "la pantalla ya no es la que la receta supone: el paso no vale y hay que retroceder"
            }
            MotivoDeDecision::SinCaminoDeVuelta => {
                "no hay paso anterior al que volver: se para y se avisa"
            }
            MotivoDeDecision::FaltaLaSesion => "la sesion se cayo: hace falta una persona",
            MotivoDeDecision::ElAparatoNoResponde => "el aparato no responde: hay que mirarlo",
            MotivoDeDecision::FaltaUnDato => "falta un dato para poder seguir: hay que preguntarlo",
            MotivoDeDecision::LaPlataformaEstaFrenando => {
                "la plataforma esta frenando: es una senal para el regulador, no una averia"
            }
        }
    }
}

impl fmt::Display for MotivoDeDecision {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.como_str(), self.descripcion())
    }
}

/// Reintentar el mismo paso, con mirada nueva.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Reintento {
    pub paso: usize,
    pub motivo: MotivoDeDecision,
    pub ancla: Option<Ancla>,
}

/// Volver al paso anterior conocido, sin repetir el que fallo.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Vuelta {
    pub paso: usize,
    pub motivo: MotivoDeDecision,
    pub ancla: Option<Ancla>,
}

/// Parar y avisar, con el remedio declarado por la taxonomia.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Escalada {
    pub paso: usize,
    pub motivo: MotivoDeDecision,
    pub remedio: Remedio,
    pub ancla: Option<Ancla>,
}

/// Lo que A5 decide. Tres formas cerradas; ninguna cuarta.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decision {
    Reintentar(Reintento),
    Volver(Vuelta),
    Escalar(Escalada),
}

impl Decision {
    /// `reintentar` | `volver` | `escalar`: lo que viaja en el payload.
    pub fn como_str(&self) -> &'static str {
        match self {
            Decision::Reintentar(_) => "reintentar",
            Decision::Volver(_) => "volver",
            Decision::Escalar(_) => "escalar",
        }
    }

    pub fn paso(&self) -> usize {
        match self {
            Decision::Reintentar(r) => r.paso,
            Decision::Volver(v) => v.paso,
            Decision::Escalar(e) => e.paso,
        }
    }

    pub fn motivo(&self) -> MotivoDeDecision {
        match self {
            Decision::Reintentar(r) => r.motivo,
            Decision::Volver(v) => v.motivo,
            Decision::Escalar(e) => e.motivo,
        }
    }

    /// ¿Se puede volver a ejecutar el paso con esta decision?
    ///
    /// Es la unica pregunta que necesita el bucle de `publicar`. Falla cerrado:
    /// solo `Reintentar` contesta que si.
    pub fn permite_reintentar(&self) -> bool {
        matches!(self, Decision::Reintentar(_))
    }

    pub fn permite_volver(&self) -> bool {
        matches!(self, Decision::Volver(_))
    }

    pub fn escala(&self) -> bool {
        matches!(self, Decision::Escalar(_))
    }

    /// El remedio que viaja: el de la escalada, y `None` en las otras dos (no
    /// hay a quien avisar de algo que se va a reintentar o a deshacer).
    pub fn remedio(&self) -> Option<Remedio> {
        match self {
            Decision::Escalar(e) => Some(e.remedio),
            _ => None,
        }
    }
}

impl fmt::Display for Decision {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.como_str(), self.motivo())
    }
}

// ---------------------------------------------------------------------------
// A5 · EscaleraDeRecuperacion
// ---------------------------------------------------------------------------

/// La clase A5. Guarda UNA cosa: cuantos reintentos permite por paso.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Escalera {
    techo_de_intentos: u32,
}

impl Default for Escalera {
    fn default() -> Self {
        Self::nueva()
    }
}

impl Escalera {
    pub fn nueva() -> Self {
        Self { techo_de_intentos: TECHO_POR_DEFECTO }
    }

    /// Un techo distinto. `0` desactiva el reintento por completo: es una
    /// configuracion legitima y no la convierte en una escalera distinta.
    pub fn con_techo(techo_de_intentos: u32) -> Self {
        Self { techo_de_intentos }
    }

    pub fn techo(&self) -> u32 {
        self.techo_de_intentos
    }

    /// ¿Este hecho admite un segundo intento?
    ///
    /// La respuesta a la regla sagrada, en un solo sitio y en una sola linea
    /// visible: **sin efecto** (`Some(false)`), familia que lo permite y techo
    /// libre. Todo lo demas —incluido `None`, que es "no se sabe"— contesta NO.
    fn se_puede_reintentar(&self, hecho: &HechoDeFallo) -> bool {
        hecho.efecto.cambio_el_mundo() == Some(false)
            && hecho.familia.es_reintentable()
            && hecho.intentos < self.techo_de_intentos
    }

    /// DECIDIR. No ejecuta nada: contesta y se calla.
    pub fn decidir(&self, hecho: &HechoDeFallo) -> Decision {
        // 1 y 2 · la regla sagrada, antes que el techo y antes que la familia.
        match hecho.efecto.cambio_el_mundo() {
            None => {
                return Decision::Escalar(Escalada {
                    paso: hecho.paso,
                    motivo: MotivoDeDecision::NoSeSabeSiCambio,
                    remedio: remedio_al_escalar(hecho.familia),
                    ancla: hecho.ancla.clone(),
                })
            }
            Some(true) => {
                return Decision::Escalar(Escalada {
                    paso: hecho.paso,
                    motivo: MotivoDeDecision::CambioElMundo,
                    remedio: remedio_al_escalar(hecho.familia),
                    ancla: hecho.ancla.clone(),
                })
            }
            Some(false) => {}
        }

        // 3 · el techo de intentos
        if hecho.intentos >= self.techo_de_intentos {
            return Decision::Escalar(Escalada {
                paso: hecho.paso,
                motivo: MotivoDeDecision::SeAgotoElTecho,
                remedio: remedio_al_escalar(hecho.familia),
                ancla: hecho.ancla.clone(),
            });
        }

        // 4 · la familia que admite un segundo intento (solo `plataforma`)
        if self.se_puede_reintentar(hecho) {
            return Decision::Reintentar(Reintento {
                paso: hecho.paso,
                motivo: MotivoDeDecision::NoCambioElMundo,
                ancla: hecho.ancla.clone(),
            });
        }

        // 5 · la pantalla ya no es la que era, y hay a donde volver
        if hecho.familia == FamiliaDeFallo::Interfaz && hecho.hay_vuelta {
            return Decision::Volver(Vuelta {
                paso: hecho.paso,
                motivo: MotivoDeDecision::LaPantallaYaNoEsLaQueLaRecetaSupone,
                ancla: hecho.ancla.clone(),
            });
        }

        // 6 · el resto: parar y avisar al dueno de la familia
        let motivo = if hecho.familia == FamiliaDeFallo::Interfaz {
            MotivoDeDecision::SinCaminoDeVuelta
        } else {
            motivo_de_la_familia(hecho.familia)
        };
        Decision::Escalar(Escalada {
            paso: hecho.paso,
            motivo,
            remedio: remedio_al_escalar(hecho.familia),
            ancla: hecho.ancla.clone(),
        })
    }
}

/// El motivo que corresponde a una familia cuando hay que escalar.
fn motivo_de_la_familia(familia: FamiliaDeFallo) -> MotivoDeDecision {
    match familia {
        FamiliaDeFallo::Sesion => MotivoDeDecision::FaltaLaSesion,
        FamiliaDeFallo::Aparato => MotivoDeDecision::ElAparatoNoResponde,
        FamiliaDeFallo::Interfaz => MotivoDeDecision::SinCaminoDeVuelta,
        // `plataforma` reintenta; si llega aqui es porque el techo esta a cero.
        FamiliaDeFallo::Plataforma => MotivoDeDecision::SeAgotoElTecho,
        FamiliaDeFallo::DatoQueFalta => MotivoDeDecision::FaltaUnDato,
        FamiliaDeFallo::LimiteAlcanzado => MotivoDeDecision::LaPlataformaEstaFrenando,
    }
}

/// El remedio que viaja en una escalada.
///
/// Es el de la familia, **salvo** `reintentar`: una escalada que pidiera
/// reintentar estaria contradiciendo la regla sagrada en el mismo objeto que la
/// aplica. Si la familia solo sabe decir "reintenta" y no se puede, el remedio
/// honesto es escalar.
fn remedio_al_escalar(familia: FamiliaDeFallo) -> Remedio {
    match familia.remedio() {
        Remedio::Reintentar => Remedio::Escalar,
        otro => otro,
    }
}

/// DECIDIR sin configuracion: la escalera por defecto (un reintento).
///
/// Es la forma que usan los tests y el camino normal. La clase existe para
/// quien necesite otro techo sin reescribir la tabla.
pub fn decidir(hecho: &HechoDeFallo) -> Decision {
    Escalera::nueva().decidir(hecho)
}

// Vista "clase" con el nombre del diseno, para quien lo prefiera explicito.
impl Escalera {
    /// Alias de `decidir` con el nombre del plano de obra (A5).
    pub fn decidir_ante_fallo(&self, hecho: &HechoDeFallo) -> Decision {
        self.decidir(hecho)
    }
}
