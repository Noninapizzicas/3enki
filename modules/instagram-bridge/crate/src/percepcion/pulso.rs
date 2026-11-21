//! D1 · PulsoDeSesion · REFLEJO del aparato.
//!
//! La senal de vida de la sesion: hay sesion abierta, no la hay, o no se sabe.
//! Tres estados y una decision, y ninguna de las dos cosas se confunde con la
//! otra.
//!
//! # La regla que esta pieza existe para no romper
//!
//! ```text
//! no se  !=  muerto
//! ```
//!
//! Antes de operar, un `no se` NO autoriza a declarar la sesion caida. Declarar
//! muerta una sesion que solo estaba sin mirar es la forma mas tonta de pedirle
//! la contrasena a una persona que no hacia falta molestar, y de paso perder la
//! sesion que si estaba viva. Por eso:
//!
//! ```text
//! Viva    -> operar
//! NoSe    -> mirar antes de operar   (una mirada nueva, no una reautenticacion)
//! Muerta  -> pedir persona           (la unica salida con evidencia)
//! ```
//!
//! `Muerta` exige PRUEBA de muerte: la pantalla de entrada delante, una sesion
//! que el aparato vio cerrarse, o la plataforma pidiendo volver a entrar. Un
//! latido viejo no es prueba de nada: es `NoSe` con motivo `lectura_vieja`.
//!
//! # El momento entra por parametro
//!
//! Nada de reloj dentro: la vigencia se declara al construir la pieza y el
//! `momento` de cada senal y de cada pregunta lo trae quien llama. Asi el mismo
//! par (senal, momento) produce siempre el mismo estado, y los tests no duermen.
//!
//! # Lo que esta pieza NO hace
//!
//!   - No reautentica: eso es D2 (`CaidaYReautenticacion`, cerebro). Aqui solo se
//!     dice que hace falta una persona, con el motivo.
//!   - No mira la pantalla: eso es A1. Aqui solo se anota la senal que A1 (o el
//!     aparato) ya produjo.
//!   - No borra el ultimo latido cuando llega un `no se`: la historia se queda
//!     (sirve para diagnosticar), pero no contesta.

use std::fmt;

/// Por que no hay senal. Un `no se` sin motivo es una laguna disfrazada de dato.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SinPulso {
    /// El aparato no responde o no esta: ni siquiera se pudo preguntar.
    AparatoAusente,
    /// Hay otra ventana por delante o la pantalla esta bloqueada.
    Ocupado,
    /// Sin red: la plataforma no contesta, pero el aparato esta.
    SinRed,
    /// El ultimo latido es mas viejo que la vigencia declarada.
    LecturaVieja,
    /// No se ha preguntado nunca: arranque en frio.
    NoSePregunto,
}

impl SinPulso {
    /// Nombre estable y sin tildes, para payloads y logs.
    pub fn como_str(&self) -> &'static str {
        match self {
            SinPulso::AparatoAusente => "aparato_ausente",
            SinPulso::Ocupado => "ocupado",
            SinPulso::SinRed => "sin_red",
            SinPulso::LecturaVieja => "lectura_vieja",
            SinPulso::NoSePregunto => "no_se_pregunto",
        }
    }

    /// Frase para una persona. Dice que pasa, no que "hay un error".
    pub fn descripcion(&self) -> &'static str {
        match self {
            SinPulso::AparatoAusente => "el aparato no responde o no esta",
            SinPulso::Ocupado => "hay otra ventana por delante o la pantalla esta bloqueada",
            SinPulso::SinRed => "el aparato esta pero la plataforma no contesta",
            SinPulso::LecturaVieja => "el ultimo latido es mas viejo que la vigencia declarada",
            SinPulso::NoSePregunto => "todavia no se ha mirado la sesion",
        }
    }
}

impl fmt::Display for SinPulso {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.como_str(), self.descripcion())
    }
}

/// La muerte de una sesion, SIEMPRE con evidencia. Sin evidencia no hay muerte:
/// hay `NoSe` (ver `SinPulso`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MuerteDeSesion {
    /// A1 vio delante la pantalla de entrada de la plataforma.
    PantallaDeEntrada,
    /// El aparato vio cerrarse la sesion (la cuenta salio o la app la expulso).
    SesionCerrada,
    /// La plataforma pide volver a entrar para seguir (aviso reconocido, D5).
    ReautenticacionExigida,
}

impl MuerteDeSesion {
    pub fn como_str(&self) -> &'static str {
        match self {
            MuerteDeSesion::PantallaDeEntrada => "pantalla_de_entrada",
            MuerteDeSesion::SesionCerrada => "sesion_cerrada",
            MuerteDeSesion::ReautenticacionExigida => "reautenticacion_exigida",
        }
    }

    pub fn descripcion(&self) -> &'static str {
        match self {
            MuerteDeSesion::PantallaDeEntrada => "la pantalla de entrada de la plataforma esta delante",
            MuerteDeSesion::SesionCerrada => "la cuenta se cerro en este aparato",
            MuerteDeSesion::ReautenticacionExigida => "la plataforma pide volver a entrar",
        }
    }
}

impl fmt::Display for MuerteDeSesion {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.como_str(), self.descripcion())
    }
}

/// Lo que el aparato declara en cada lectura. Cuatro evidencias y un no-saber.
///
/// El latido y las muertes son hechos; `NoSe` es exactamente eso, y no se
/// convierte en `PantallaDeEntrada` "por si acaso".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SenalDeVida {
    /// La cuenta esta abierta y responde: hay sesion viva ahora mismo.
    Latido,
    /// Se vio la pantalla de entrada: prueba de que no hay sesion.
    PantallaDeEntrada,
    /// El aparato vio cerrarse la sesion.
    SesionCerrada,
    /// Lectura reconocida de la plataforma pidiendo volver a entrar.
    ReautenticacionExigida,
    /// No se pudo saber. NO es muerte.
    NoSe(SinPulso),
}

impl SenalDeVida {
    /// Un nombre estable para el payload. `no_se` viaja con su motivo aparte.
    pub fn como_str(&self) -> &'static str {
        match self {
            SenalDeVida::Latido => "latido",
            SenalDeVida::PantallaDeEntrada => "pantalla_de_entrada",
            SenalDeVida::SesionCerrada => "sesion_cerrada",
            SenalDeVida::ReautenticacionExigida => "reautenticacion_exigida",
            SenalDeVida::NoSe(_) => "no_se",
        }
    }

    /// Si la senal es evidencia de muerte (no de vida y no de duda).
    pub fn es_muerte(&self) -> bool {
        matches!(
            self,
            SenalDeVida::PantallaDeEntrada
                | SenalDeVida::SesionCerrada
                | SenalDeVida::ReautenticacionExigida
        )
    }

    /// Si la senal es un no-saber. Existe para que ningun `matches!` de fuera
    /// tenga que acordarse de la regla `no_se != muerto`.
    pub fn es_no_se(&self) -> bool {
        matches!(self, SenalDeVida::NoSe(_))
    }

    /// El motivo de la duda, si la hay.
    pub fn sin_pulso(&self) -> Option<SinPulso> {
        match self {
            SenalDeVida::NoSe(motivo) => Some(*motivo),
            _ => None,
        }
    }

    fn muerte(&self) -> Option<MuerteDeSesion> {
        match self {
            SenalDeVida::PantallaDeEntrada => Some(MuerteDeSesion::PantallaDeEntrada),
            SenalDeVida::SesionCerrada => Some(MuerteDeSesion::SesionCerrada),
            SenalDeVida::ReautenticacionExigida => Some(MuerteDeSesion::ReautenticacionExigida),
            _ => None,
        }
    }
}

impl fmt::Display for SenalDeVida {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.como_str())
    }
}

/// El estado de la sesion en un momento dado. Tres salidas, ninguna a medias.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EstadoDeSesion {
    Viva { ultimo_latido: u64 },
    Muerta { motivo: MuerteDeSesion, momento: u64 },
    NoSe { motivo: SinPulso },
}

impl EstadoDeSesion {
    pub fn es_viva(&self) -> bool {
        matches!(self, EstadoDeSesion::Viva { .. })
    }

    pub fn es_muerta(&self) -> bool {
        matches!(self, EstadoDeSesion::Muerta { .. })
    }

    /// Si el aparato sabe algo (viva o muerta). Un `false` aqui es la senal de
    /// que hay que mirar, no de que haya que pedir la contrasena.
    pub fn se_sabe(&self) -> bool {
        !matches!(self, EstadoDeSesion::NoSe { .. })
    }

    pub fn como_str(&self) -> &'static str {
        match self {
            EstadoDeSesion::Viva { .. } => "viva",
            EstadoDeSesion::Muerta { .. } => "muerta",
            EstadoDeSesion::NoSe { .. } => "no_se",
        }
    }

    pub fn sin_pulso(&self) -> Option<SinPulso> {
        match self {
            EstadoDeSesion::NoSe { motivo } => Some(*motivo),
            _ => None,
        }
    }
}

impl fmt::Display for EstadoDeSesion {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.como_str())
    }
}

/// Lo que el puente puede hacer con el aparato AHORA. Tres salidas, y solo una
/// autoriza a tocar.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DecisionDeSesion {
    /// Hay latido fresco: se puede operar.
    Operar { ultimo_latido: u64 },
    /// No se sabe: hay que mirar antes de operar. **No** es pedir persona.
    MirarAntesDeOperar { motivo: SinPulso },
    /// Hay evidencia de muerte: hace falta una persona (D2).
    PedirPersona { motivo: MuerteDeSesion },
}

impl DecisionDeSesion {
    pub fn puede_operar(&self) -> bool {
        matches!(self, DecisionDeSesion::Operar { .. })
    }

    pub fn exige_persona(&self) -> bool {
        matches!(self, DecisionDeSesion::PedirPersona { .. })
    }

    pub fn como_str(&self) -> &'static str {
        match self {
            DecisionDeSesion::Operar { .. } => "operar",
            DecisionDeSesion::MirarAntesDeOperar { .. } => "mirar_antes_de_operar",
            DecisionDeSesion::PedirPersona { .. } => "pedir_persona",
        }
    }

    /// Que hace falta, dicho como una accion y no como un diagnostico.
    pub fn que_hace_falta(&self) -> &'static str {
        match self {
            DecisionDeSesion::Operar { .. } => "operar con la cuenta del padron",
            DecisionDeSesion::MirarAntesDeOperar { .. } => {
                "mirar la pantalla otra vez antes de operar: no se sabe si la sesion esta viva"
            }
            DecisionDeSesion::PedirPersona { .. } => {
                "una persona delante del aparato: abrir sesion con la cuenta del padron (D2)"
            }
        }
    }
}

impl fmt::Display for DecisionDeSesion {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.como_str())
    }
}

/// D1 · El pulso de la sesion.
///
/// Guarda la ULTIMA senal (no solo el ultimo latido: una duda posterior manda
/// sobre un latido anterior) y el ultimo latido como historia. `vigencia_ms` es
/// lo que se considera fresco; un latido mas viejo no es muerte, es `NoSe`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PulsoDeSesion {
    ultima: Option<(SenalDeVida, u64)>,
    ultimo_latido: Option<u64>,
    vigencia_ms: u64,
}

impl PulsoDeSesion {
    /// Un pulso sin senales: arranca en `NoSe(NoSePregunto)`.
    ///
    /// `vigencia_ms` es la edad maxima de un latido para seguir contando como
    /// vivo. `0` significa "solo vale el latido del mismo momento": el defecto
    /// mas conservador, porque un cero no alarga la vida de nadie.
    pub fn nuevo(vigencia_ms: u64) -> Self {
        Self {
            ultima: None,
            ultimo_latido: None,
            vigencia_ms,
        }
    }

    pub fn vigencia_ms(&self) -> u64 {
        self.vigencia_ms
    }

    /// Anota una senal. Un `NoSe` NO borra el ultimo latido (la historia queda
    /// para diagnosticar) y NO mata la sesion: solo pasa a mandar la duda.
    pub fn anotar(&mut self, senal: SenalDeVida, momento: u64) {
        if senal == SenalDeVida::Latido {
            self.ultimo_latido = Some(momento);
        }
        self.ultima = Some((senal, momento));
    }

    /// Azucar para las muertes con evidencia, para que el llamante no tenga que
    /// construir el enum de senal a mano.
    pub fn declarar_muerte(&mut self, motivo: MuerteDeSesion, momento: u64) {
        let senal = match motivo {
            MuerteDeSesion::PantallaDeEntrada => SenalDeVida::PantallaDeEntrada,
            MuerteDeSesion::SesionCerrada => SenalDeVida::SesionCerrada,
            MuerteDeSesion::ReautenticacionExigida => SenalDeVida::ReautenticacionExigida,
        };
        self.anotar(senal, momento);
    }

    /// El ultimo latido visto (aunque ya no valga). Historia, no estado.
    pub fn ultimo_latido(&self) -> Option<u64> {
        self.ultimo_latido
    }

    /// La ultima senal anotada, con su momento.
    pub fn ultima_senal(&self) -> Option<(SenalDeVida, u64)> {
        self.ultima
    }

    /// El estado en `momento`. `momento` entra por parametro: aqui no hay reloj.
    pub fn estado(&self, momento: u64) -> EstadoDeSesion {
        match self.ultima {
            None => EstadoDeSesion::NoSe {
                motivo: SinPulso::NoSePregunto,
            },
            Some((senal, cuando)) => {
                if let Some(motivo) = senal.muerte() {
                    return EstadoDeSesion::Muerta { motivo, momento: cuando };
                }
                if let Some(motivo) = senal.sin_pulso() {
                    // La duda NO se convierte en muerte, ni siquiera si hubo un
                    // latido antes: lo que manda es la ultima lectura.
                    return EstadoDeSesion::NoSe { motivo };
                }
                let edad = momento.saturating_sub(cuando);
                if edad <= self.vigencia_ms {
                    EstadoDeSesion::Viva {
                        ultimo_latido: cuando,
                    }
                } else {
                    // Latido caducado: no se sabe si sigue viva. No es muerte.
                    EstadoDeSesion::NoSe {
                        motivo: SinPulso::LecturaVieja,
                    }
                }
            }
        }
    }

    /// La decision de antes de operar. Unica funcion que autoriza a tocar.
    pub fn decidir(&self, momento: u64) -> DecisionDeSesion {
        match self.estado(momento) {
            EstadoDeSesion::Viva { ultimo_latido } => DecisionDeSesion::Operar { ultimo_latido },
            EstadoDeSesion::Muerta { motivo, .. } => DecisionDeSesion::PedirPersona { motivo },
            EstadoDeSesion::NoSe { motivo } => DecisionDeSesion::MirarAntesDeOperar { motivo },
        }
    }

    /// Atajo: la pregunta que se hace en cada vuelta del bucle.
    pub fn puede_operar(&self, momento: u64) -> bool {
        self.decidir(momento).puede_operar()
    }
}
