//! O1 · VerificadorDeConsecuencia — el que decide si lo que tenia que pasar pasó.
//!
//! Este fichero existe por una sola razon: impedir que el sistema diga "hecho"
//! sin prueba. Recibe lo que se esperaba (una `ConsecuenciaEsperada`) y una
//! mirada NUEVA (`HechoVisible` de A1) y contesta una de tres cosas:
//!
//! ```text
//! Ocurrio    — se vio el ancla, con nodo, momento y cuenta (hay prueba)
//! NoOcurrio  — hay prueba de que no ocurrio (ausencia en mirada completa,
//!              plazo agotado y consecuencia persistente)
//! NoSeSabe   — no hay con que afirmar nada, y se dice QUE HACE FALTA para saberlo
//! ```
//!
//! # La regla sagrada
//!
//! ```text
//! espera agotada  ->  NO SE  (nunca SI)
//! ```
//!
//! Agotar el plazo no demuestra nada: solo dice que se dejo de esperar. Si al
//! agotarse la espera no hay prueba visible, el resultado es `NoSeSabe` con su
//! `que_haria_falta`. Convertirlo en `Ocurrio` "para quedar bien" es exactamente
//! lo que este testigo existe para que no pase.
//!
//! # Las tres salidas no se colapsan
//!
//! `NoSeSabe` y `NoOcurrio` son distintos y se quedan distintos:
//!
//!   - `NoOcurrio` exige prueba positiva de ausencia: mirada COMPLETA, plazo
//!     agotado y una consecuencia declarada PERSISTENTE (un post en la parrilla
//!     sigue ahi; un dialogo abierto puede haberse cerrado). Un dialogo que no
//!     se ve ahora pudo abrirse y cerrarse: eso es `NoSeSabe`.
//!   - `NoSeSabe` SIEMPRE viaja con `que_haria_falta`. Un no-saber sin motivo es
//!     una excusa, y este tipo no deja construir uno.
//!
//! # Otras dos puertas
//!
//!   - **La foto tiene que ser de la misma cuenta** (P1): si el sello de la
//!     mirada no es el de la consecuencia, lo visto es de otro sitio.
//!   - **La foto tiene que ser NUEVA**: una mirada anterior al momento en que se
//!     ejecuto el paso no puede confirmar nada. Se reutiliza lo de antes y se
//!     publica en la cuenta equivocada.
//!   - **Un ancla que ya estaba antes no prueba el paso**: si el ancla estaba
//!     visible antes de ejecutar, verla despues no distingue "ocurrio" de "ya
//!     estaba". Eso tambien es `NoSeSabe`.
//!
//! Puro: sin IO, sin reloj, sin estado global. `momento` entra dentro del hecho
//! y `desde_momento` dentro de la consecuencia; el verificador no llama a nadie.

use std::fmt;

use crate::percepcion::observador::{Ancla, HechoVisible, SelloDeCuenta};
use crate::percepcion::Mirada;

// ---------------------------------------------------------------------------
// Lo que se espera
// ---------------------------------------------------------------------------

/// La consecuencia que un paso tenia que dejar en el mundo, con la ventana en la
/// que se le concede aparecer.
///
/// `plazo_ms` se mide con el mismo reloj inyectado que fecha las miradas: es un
/// plazo de la receta, no una espera real de este fichero (aqui no se duerme).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConsecuenciaEsperada {
    /// Numero de paso al que se imputa la consecuencia.
    pub paso: usize,
    /// Lo que tiene que verse.
    pub ancla: Ancla,
    /// De quien es la pantalla en la que se espera verlo (P1).
    pub sello: SelloDeCuenta,
    /// Momento en que se ejecuto el paso: ninguna foto anterior vale.
    pub desde_momento: u64,
    /// Ventana concedida, en milisegundos del reloj inyectado. `0` = sin espera:
    /// la primera mirada posterior al paso ya esta fuera de plazo.
    pub plazo_ms: u64,
    /// ¿La consecuencia, una vez ocurrida, SIGUE viendose? Un post en la parrilla
    /// si; un dialogo abierto no. Sin persistencia, la ausencia no prueba nada.
    pub persistente: bool,
    /// ¿El ancla ya estaba visible ANTES del paso? Entonces verla despues no
    /// distingue el efecto del estado previo.
    pub estaba_antes: bool,
}

impl ConsecuenciaEsperada {
    pub fn nueva(
        paso: usize,
        ancla: Ancla,
        sello: &SelloDeCuenta,
        desde_momento: u64,
    ) -> Self {
        Self {
            paso,
            ancla,
            sello: sello.clone(),
            desde_momento,
            plazo_ms: 0,
            persistente: false,
            estaba_antes: false,
        }
    }

    pub fn con_plazo(mut self, plazo_ms: u64) -> Self {
        self.plazo_ms = plazo_ms;
        self
    }

    /// Declara que la consecuencia, si ocurre, permanece visible.
    pub fn persistente(mut self) -> Self {
        self.persistente = true;
        self
    }

    /// Declara que el ancla ya se veia antes de ejecutar el paso.
    pub fn estaba_antes(mut self) -> Self {
        self.estaba_antes = true;
        self
    }

    /// Ultimo momento en el que la consecuencia todavia se considera "a tiempo".
    pub fn momento_limite(&self) -> u64 {
        self.desde_momento.saturating_add(self.plazo_ms)
    }

    /// ¿La foto cae dentro de la ventana concedida?
    pub fn dentro_de_plazo(&self, momento: u64) -> bool {
        momento <= self.momento_limite()
    }
}

// ---------------------------------------------------------------------------
// Que hace falta para saberlo
// ---------------------------------------------------------------------------

/// Lo que falta para poder afirmar algo. SIEMPRE nombrado, nunca un "no se"
/// generico: el que lee tiene que saber que hacer a continuacion.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QueHariaFalta {
    /// La foto es anterior al paso: hace falta una mirada posterior.
    MiradaNueva {
        momento_minimo: u64,
        momento_de_la_foto: u64,
    },
    /// La foto es parcial: se puede afirmar lo que se vio, no lo que no.
    MiradaCompleta { mirada: Mirada },
    /// El plazo no se ha agotado: hay que volver a mirar mas tarde.
    EsperarHasta { momento_limite: u64 },
    /// El ancla ya estaba antes: hace falta una prueba que distinga el efecto.
    PruebaQueDistinga { ancla: String },
    /// La consecuencia no es persistente: su ausencia no prueba que no ocurriera.
    PruebaDeNoOcurrio { ancla: String },
    /// La mirada es de otra cuenta (o no se sabe de cual).
    MiradaDeLaCuenta {
        esperada: String,
        vista: Option<String>,
    },
    /// El ancla no tiene nombre visible que buscar.
    AnclaSinNombre,
    /// No hay ni un paso que juzgar.
    SinPasos,
    /// El mismo paso llega con dos resultados distintos: no hay un veredicto.
    UnSoloResultadoPorPaso { paso: usize },
}

impl QueHariaFalta {
    /// Codigo estable y sin tildes, para payloads y logs.
    pub fn como_str(&self) -> &'static str {
        match self {
            QueHariaFalta::MiradaNueva { .. } => "mirada_nueva",
            QueHariaFalta::MiradaCompleta { .. } => "mirada_completa",
            QueHariaFalta::EsperarHasta { .. } => "esperar_hasta",
            QueHariaFalta::PruebaQueDistinga { .. } => "prueba_que_distinga",
            QueHariaFalta::PruebaDeNoOcurrio { .. } => "prueba_de_no_ocurrio",
            QueHariaFalta::MiradaDeLaCuenta { .. } => "mirada_de_la_cuenta",
            QueHariaFalta::AnclaSinNombre => "ancla_sin_nombre",
            QueHariaFalta::SinPasos => "sin_pasos",
            QueHariaFalta::UnSoloResultadoPorPaso { .. } => "un_solo_resultado_por_paso",
        }
    }

    /// Frase para una persona: que falta, con el dato concreto cuando lo hay.
    pub fn descripcion(&self) -> String {
        match self {
            QueHariaFalta::MiradaNueva {
                momento_minimo,
                momento_de_la_foto,
            } => format!(
                "una mirada nueva posterior a {momento_minimo}: la foto es de {momento_de_la_foto}"
            ),
            QueHariaFalta::MiradaCompleta { mirada } => format!(
                "una mirada completa: la que hay es {mirada} y con ella no se puede afirmar una ausencia"
            ),
            QueHariaFalta::EsperarHasta { momento_limite } => format!(
                "volver a mirar hasta {momento_limite}: el plazo de la consecuencia no se ha agotado"
            ),
            QueHariaFalta::PruebaQueDistinga { ancla } => format!(
                "'{ancla}' ya estaba visible antes del paso: verla ahora no prueba que el paso lo causara"
            ),
            QueHariaFalta::PruebaDeNoOcurrio { ancla } => format!(
                "una prueba de que '{ancla}' no ocurrio: la consecuencia no es persistente y su ausencia no distingue 'no paso' de 'paso y se fue'"
            ),
            QueHariaFalta::MiradaDeLaCuenta { esperada, vista } => match vista {
                Some(vista) => format!(
                    "una mirada de la cuenta '{esperada}': la foto es de '{vista}'"
                ),
                None => format!(
                    "una mirada de la cuenta '{esperada}': la foto no dice de quien es"
                ),
            },
            QueHariaFalta::AnclaSinNombre => {
                "un ancla con nombre visible: sin nombre no hay nada que buscar".to_string()
            }
            QueHariaFalta::SinPasos => {
                "al menos un paso con su consecuencia: sin pasos no hay nada que juzgar".to_string()
            }
            QueHariaFalta::UnSoloResultadoPorPaso { paso } => format!(
                "un solo resultado para el paso {paso}: llego dos veces con resultados distintos"
            ),
        }
    }
}

impl fmt::Display for QueHariaFalta {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.como_str(), self.descripcion())
    }
}

// ---------------------------------------------------------------------------
// La prueba
// ---------------------------------------------------------------------------

/// La prueba de que ocurrio: el nodo que se vio, cuando y en que cuenta.
///
/// Si no hay `nodo_id`, no hay prueba: `Ocurrio` se construye solo con esto.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Prueba {
    pub paso: usize,
    pub ancla: String,
    pub nodo_id: String,
    pub momento: u64,
    pub cuenta: String,
}

impl Prueba {
    pub fn descripcion(&self) -> String {
        format!(
            "paso {}: '{}' visto en el nodo {} a las {} en la cuenta {}",
            self.paso, self.ancla, self.nodo_id, self.momento, self.cuenta
        )
    }
}

/// La prueba de que NO ocurrio: una mirada COMPLETA, ya agotado el plazo, sin el
/// ancla de una consecuencia persistente.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PruebaDeAusencia {
    pub paso: usize,
    pub ancla: String,
    pub momento: u64,
    pub mirada: Mirada,
}

impl PruebaDeAusencia {
    pub fn descripcion(&self) -> String {
        format!(
            "paso {}: '{}' no estaba en una mirada {} a las {} (plazo agotado y consecuencia persistente)",
            self.paso, self.ancla, self.mirada, self.momento
        )
    }
}

// ---------------------------------------------------------------------------
// El resultado: tres salidas, ninguna colapsable
// ---------------------------------------------------------------------------

/// Lo que el testigo puede decir. Ni una cuarta, ni una que sea "mas o menos".
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResultadoDeConsecuencia {
    /// Se vio el ancla con una prueba: nodo, momento y cuenta.
    Ocurrio(Prueba),
    /// Hay prueba de ausencia (mirada completa, plazo agotado, persistente).
    NoOcurrio(PruebaDeAusencia),
    /// No hay con que afirmar nada, y se dice que hace falta.
    NoSeSabe { paso: usize, falta: QueHariaFalta },
}

impl ResultadoDeConsecuencia {
    pub fn ocurrio(paso: usize, ancla: &Ancla, nodo_id: impl Into<String>, momento: u64, cuenta: impl Into<String>) -> Self {
        ResultadoDeConsecuencia::Ocurrio(Prueba {
            paso,
            ancla: ancla.nombre_visible.clone(),
            nodo_id: nodo_id.into(),
            momento,
            cuenta: cuenta.into(),
        })
    }

    pub fn no_ocurrio(paso: usize, ancla: &Ancla, momento: u64, mirada: Mirada) -> Self {
        ResultadoDeConsecuencia::NoOcurrio(PruebaDeAusencia {
            paso,
            ancla: ancla.nombre_visible.clone(),
            momento,
            mirada,
        })
    }

    pub fn no_se_sabe(paso: usize, falta: QueHariaFalta) -> Self {
        ResultadoDeConsecuencia::NoSeSabe { paso, falta }
    }

    pub fn es_ocurrio(&self) -> bool {
        matches!(self, ResultadoDeConsecuencia::Ocurrio(_))
    }

    pub fn es_no_ocurrio(&self) -> bool {
        matches!(self, ResultadoDeConsecuencia::NoOcurrio(_))
    }

    /// El unico predicado que autoriza a decir "hecho".
    pub fn es_no_se_sabe(&self) -> bool {
        matches!(self, ResultadoDeConsecuencia::NoSeSabe { .. })
    }

    pub fn paso(&self) -> usize {
        match self {
            ResultadoDeConsecuencia::Ocurrio(p) => p.paso,
            ResultadoDeConsecuencia::NoOcurrio(p) => p.paso,
            ResultadoDeConsecuencia::NoSeSabe { paso, .. } => *paso,
        }
    }

    pub fn como_str(&self) -> &'static str {
        match self {
            ResultadoDeConsecuencia::Ocurrio(_) => "ocurrio",
            ResultadoDeConsecuencia::NoOcurrio(_) => "no_ocurrio",
            ResultadoDeConsecuencia::NoSeSabe { .. } => "no_se_sabe",
        }
    }

    pub fn prueba(&self) -> Option<&Prueba> {
        match self {
            ResultadoDeConsecuencia::Ocurrio(p) => Some(p),
            _ => None,
        }
    }

    pub fn prueba_de_ausencia(&self) -> Option<&PruebaDeAusencia> {
        match self {
            ResultadoDeConsecuencia::NoOcurrio(p) => Some(p),
            _ => None,
        }
    }

    /// `Some` si y solo si el resultado es `NoSeSabe`: asi el llamante no puede
    /// quedarse con un no-saber sin motivo.
    pub fn que_haria_falta(&self) -> Option<&QueHariaFalta> {
        match self {
            ResultadoDeConsecuencia::NoSeSabe { falta, .. } => Some(falta),
            _ => None,
        }
    }

    pub fn descripcion(&self) -> String {
        match self {
            ResultadoDeConsecuencia::Ocurrio(p) => format!("ocurrio ({})", p.descripcion()),
            ResultadoDeConsecuencia::NoOcurrio(p) => format!("no ocurrio ({})", p.descripcion()),
            ResultadoDeConsecuencia::NoSeSabe { falta, .. } => {
                format!("no se sabe: hace falta {}", falta.descripcion())
            }
        }
    }
}

impl fmt::Display for ResultadoDeConsecuencia {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.como_str(), self.descripcion())
    }
}

// ---------------------------------------------------------------------------
// O1 · El verificador
// ---------------------------------------------------------------------------

/// O1. Sin estado: se le da lo esperado y la mirada, y contesta.
///
/// Es un tipo (y no una funcion suelta) para que la firma del puerto sea la del
/// plano: `VerificadorDeConsecuencia::verificar(esperada, mirada)`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct VerificadorDeConsecuencia;

impl VerificadorDeConsecuencia {
    pub fn nuevo() -> Self {
        Self
    }

    /// ¿Ocurrio la consecuencia? La foto tiene que ser nueva, de la misma cuenta
    /// y con el ancla visible; si no, se dice que falta.
    pub fn verificar(
        &self,
        esperada: &ConsecuenciaEsperada,
        hecho: &HechoVisible,
    ) -> ResultadoDeConsecuencia {
        let paso = esperada.paso;

        // 0 · un ancla sin nombre no se puede buscar
        if esperada.ancla.nombre_visible.trim().is_empty() {
            return ResultadoDeConsecuencia::no_se_sabe(paso, QueHariaFalta::AnclaSinNombre);
        }

        // 1 · la foto tiene que ser de la MISMA cuenta (P1)
        if hecho.sello.proyecto != esperada.sello.proyecto
            || hecho.sello.cuenta != esperada.sello.cuenta
            || hecho.sello.plataforma != esperada.sello.plataforma
        {
            return ResultadoDeConsecuencia::no_se_sabe(
                paso,
                QueHariaFalta::MiradaDeLaCuenta {
                    esperada: esperada.sello.cuenta.clone(),
                    vista: Some(hecho.sello.cuenta.clone()),
                },
            );
        }

        // 2 · la foto tiene que ser NUEVA (posterior al paso)
        if hecho.momento < esperada.desde_momento {
            return ResultadoDeConsecuencia::no_se_sabe(
                paso,
                QueHariaFalta::MiradaNueva {
                    momento_minimo: esperada.desde_momento,
                    momento_de_la_foto: hecho.momento,
                },
            );
        }

        // 3 · ¿se ve el ancla?
        match hecho.nodo_que_coincide(&esperada.ancla) {
            Some(nodo) => {
                // Verla despues de que ya estuviera antes no prueba el paso.
                if esperada.estaba_antes {
                    return ResultadoDeConsecuencia::no_se_sabe(
                        paso,
                        QueHariaFalta::PruebaQueDistinga {
                            ancla: esperada.ancla.nombre_visible.clone(),
                        },
                    );
                }
                // Una mirada parcial SI afirma lo que se ve (A1): esto es prueba.
                ResultadoDeConsecuencia::ocurrio(
                    paso,
                    &esperada.ancla,
                    nodo.id.clone(),
                    hecho.momento,
                    hecho.sello.cuenta.clone(),
                )
            }
            None => {
                // No se vio. Ahora hay que ser honesto sobre POR QUE no se sabe.
                if hecho.mirada != Mirada::Completa {
                    return ResultadoDeConsecuencia::no_se_sabe(
                        paso,
                        QueHariaFalta::MiradaCompleta { mirada: hecho.mirada },
                    );
                }
                if esperada.dentro_de_plazo(hecho.momento) {
                    // Todavia se le puede conceder tiempo: no es un no.
                    return ResultadoDeConsecuencia::no_se_sabe(
                        paso,
                        QueHariaFalta::EsperarHasta {
                            momento_limite: esperada.momento_limite(),
                        },
                    );
                }
                // Plazo agotado. Aqui esta la regla sagrada: agotar la espera NO
                // es prueba de nada. Solo una consecuencia persistente, ausente en
                // una mirada completa posterior al plazo, permite decir NoOcurrio.
                if esperada.persistente {
                    ResultadoDeConsecuencia::no_ocurrio(
                        paso,
                        &esperada.ancla,
                        hecho.momento,
                        hecho.mirada,
                    )
                } else {
                    ResultadoDeConsecuencia::no_se_sabe(
                        paso,
                        QueHariaFalta::PruebaDeNoOcurrio {
                            ancla: esperada.ancla.nombre_visible.clone(),
                        },
                    )
                }
            }
        }
    }
}
