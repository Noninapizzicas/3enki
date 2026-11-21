//! D4 · ArbitroDelAparato · custodio de la posesion del aparato.
//!
//! El aparato es UNO y lo pueden querer dos: la persona que lo tiene en la mano y
//! el puente que quiere publicar. Este arbitro decide quien lo tiene, y sobre
//! todo decide que NO se puede hacer cuando el otro lo esta usando.
//!
//! # La regla dura
//!
//! ```text
//! NO se aborta a mitad de un paso con consecuencia INCIERTA:
//! se termina (con mirada nueva) o se para LIMPIO.
//! ```
//!
//! `PararLimpio` solo es posible cuando el paso no entrego nada al mundo
//! (`EfectoEnElMundo::SinEfecto`). Si el paso entrego un gesto
//! (`EfectoPosible`) o no se sabe si lo entrego (`Indeterminado`), abandonarlo a
//! medias deja la cuenta en un estado que nadie ha comprobado: un comentario a
//! medio escribir, una publicacion empezada, un doble toque. Por eso el arbitro
//! contesta `TerminarPrimero`, deja el paso ABIERTO y no suelta el aparato. Quien
//! llamo tiene que terminar el paso y comprobar su consecuencia con una mirada
//! nueva (O1) antes de volver a pedir el aparato.
//!
//! # Lo que la pieza NO decide
//!
//! No decide si el paso salio bien (eso es O1/O2) ni si hay que reintentar (A5).
//! Solo dice quien manda en el aparato y si se puede soltar ahora mismo.
//!
//! # Sin reloj
//!
//! `momento` entra por parametro en cada operacion; los tiempos que se guardan
//! son los que trajo quien llamo.

use std::fmt;

use crate::mano::ejecutor::EfectoEnElMundo;

/// Quien quiere el aparato. Dos, y ninguno mas: una persona o el puente.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Quien {
    Humano,
    Puente,
}

impl Quien {
    pub fn como_str(&self) -> &'static str {
        match self {
            Quien::Humano => "humano",
            Quien::Puente => "puente",
        }
    }

    pub fn descripcion(&self) -> &'static str {
        match self {
            Quien::Humano => "la persona que tiene el aparato en la mano",
            Quien::Puente => "el puente que opera la cuenta",
        }
    }
}

impl fmt::Display for Quien {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.como_str())
    }
}

/// Por que no se concede. Cada negativa nombra el motivo y, cuando hay un paso
/// abierto, su numero: una negativa sin numero no se puede resolver.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MotivoDeDenegacion {
    /// Lo tiene la otra parte y no lo ha soltado.
    LoTieneOtraParte { quien: Quien, desde: u64 },
    /// Hay un paso abierto: el aparato no se entrega a medias.
    HayPasoEnCurso { quien: Quien, numero: usize },
    /// Quien pide no es el dueno actual.
    NoEsTuyo { quien: Quien },
    /// No hay paso abierto, asi que no hay nada que cerrar ni abortar.
    NoHayPaso { quien: Quien },
    /// El paso que se quiere cerrar no es el abierto.
    PasoDistinto { abierto: usize, pedido: usize },
}

impl MotivoDeDenegacion {
    pub fn como_str(&self) -> &'static str {
        match self {
            MotivoDeDenegacion::LoTieneOtraParte { .. } => "lo_tiene_otra_parte",
            MotivoDeDenegacion::HayPasoEnCurso { .. } => "hay_paso_en_curso",
            MotivoDeDenegacion::NoEsTuyo { .. } => "no_es_tuyo",
            MotivoDeDenegacion::NoHayPaso { .. } => "no_hay_paso",
            MotivoDeDenegacion::PasoDistinto { .. } => "paso_distinto",
        }
    }

    pub fn que_hace_falta(&self) -> &'static str {
        match self {
            MotivoDeDenegacion::LoTieneOtraParte { .. } => {
                "esperar a que la otra parte suelte el aparato"
            }
            MotivoDeDenegacion::HayPasoEnCurso { .. } => {
                "terminar el paso en curso y comprobar su consecuencia antes de entregar el aparato"
            }
            MotivoDeDenegacion::NoEsTuyo { .. } => "pedir el aparato antes de operar",
            MotivoDeDenegacion::NoHayPaso { .. } => "abrir un paso antes de cerrarlo",
            MotivoDeDenegacion::PasoDistinto { .. } => {
                "cerrar el paso que esta abierto, no otro (un paso sin numero es un paso perdido)"
            }
        }
    }
}

impl fmt::Display for MotivoDeDenegacion {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.como_str(), self.que_hace_falta())
    }
}

/// El resultado de pedir o soltar el aparato.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cesion {
    /// Se concede: quien pide es el dueno desde `momento`.
    Concedido { quien: Quien, momento: u64 },
    /// Ya era suyo: idempotente, no se reinicia el turno.
    YaEsTuyo { quien: Quien, desde: u64 },
    /// No se concede, con motivo.
    Denegado { motivo: MotivoDeDenegacion },
}

impl Cesion {
    pub fn concedida(&self) -> bool {
        matches!(self, Cesion::Concedido { .. } | Cesion::YaEsTuyo { .. })
    }

    pub fn como_str(&self) -> &'static str {
        match self {
            Cesion::Concedido { .. } => "concedido",
            Cesion::YaEsTuyo { .. } => "ya_es_tuyo",
            Cesion::Denegado { .. } => "denegado",
        }
    }
}

impl fmt::Display for Cesion {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.como_str())
    }
}

/// Un paso abierto en el aparato. `efecto` empieza en `SinEfecto` y sube cuando
/// el ejecutor entrega el gesto: esa transicion es la que decide si el paso se
/// puede abandonar.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PasoEnCurso {
    pub quien: Quien,
    pub numero: usize,
    pub efecto: EfectoEnElMundo,
    pub abierto_en: u64,
}

impl PasoEnCurso {
    /// Si el mundo pudo cambiar con este paso. `None` = no se sabe (y entonces
    /// tampoco se abandona: el lado caro).
    pub fn pudo_cambiar_el_mundo(&self) -> Option<bool> {
        self.efecto.cambio_el_mundo()
    }
}

/// Lo que contesta el arbitro cuando alguien quiere abortar o relevar.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Aborto {
    /// No hay paso abierto: se puede soltar sin consecuencia.
    NoHayPaso { aparato_libre: bool },
    /// El paso entrego (o pudo entregar) algo: se TERMINA antes de soltar.
    /// El paso sigue abierto y el aparato sigue en las mismas manos.
    TerminarPrimero { paso: PasoEnCurso },
    /// El paso no toco nada: se para limpio. El paso queda cerrado por el
    /// arbitro, con el efecto que tenia (`SinEfecto`).
    PararLimpio { paso: PasoEnCurso },
    /// El paso abierto no es de quien lo pide.
    Ajeno { paso: PasoEnCurso },
}

impl Aborto {
    /// Si el aparato se puede soltar ya. Solo dos salidas lo permiten.
    pub fn se_puede_soltar(&self) -> bool {
        matches!(
            self,
            Aborto::NoHayPaso { .. } | Aborto::PararLimpio { .. }
        )
    }

    pub fn como_str(&self) -> &'static str {
        match self {
            Aborto::NoHayPaso { .. } => "no_hay_paso",
            Aborto::TerminarPrimero { .. } => "terminar_primero",
            Aborto::PararLimpio { .. } => "parar_limpio",
            Aborto::Ajeno { .. } => "ajeno",
        }
    }

    /// Que hace falta, en una frase accionable.
    pub fn que_hace_falta(&self) -> &'static str {
        match self {
            Aborto::NoHayPaso { .. } => "nada: no hay paso abierto en el aparato",
            Aborto::TerminarPrimero { .. } => {
                "terminar el paso y comprobar su consecuencia con una mirada nueva; \
                 no se abandona a mitad de un paso que pudo cambiar el mundo"
            }
            Aborto::PararLimpio { .. } => {
                "nada mas: el paso no entrego ningun gesto y queda cerrado sin consecuencia"
            }
            Aborto::Ajeno { .. } => "que aborte el paso quien lo abrio",
        }
    }
}

impl fmt::Display for Aborto {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.como_str(), self.que_hace_falta())
    }
}

/// D4 · El arbitro. Un dueno y, como mucho, un paso abierto.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArbitroDelAparato {
    dueno: Option<(Quien, u64)>,
    paso: Option<PasoEnCurso>,
}

impl Default for ArbitroDelAparato {
    fn default() -> Self {
        Self::nuevo()
    }
}

impl ArbitroDelAparato {
    pub fn nuevo() -> Self {
        Self {
            dueno: None,
            paso: None,
        }
    }

    pub fn dueno(&self) -> Option<Quien> {
        self.dueno.map(|(q, _)| q)
    }

    pub fn dueno_desde(&self) -> Option<u64> {
        self.dueno.map(|(_, m)| m)
    }

    pub fn paso_en_curso(&self) -> Option<PasoEnCurso> {
        self.paso
    }

    pub fn esta_libre(&self) -> bool {
        self.dueno.is_none()
    }

    /// Pedir el aparato. Un paso abierto bloquea la cesion, aunque quien pida
    /// sea el dueno: no se entrega a medias.
    pub fn tomar(&mut self, quien: Quien, momento: u64) -> Cesion {
        if let Some(paso) = self.paso {
            return Cesion::Denegado {
                motivo: MotivoDeDenegacion::HayPasoEnCurso {
                    quien: paso.quien,
                    numero: paso.numero,
                },
            };
        }
        match self.dueno {
            Some((actual, desde)) if actual == quien => Cesion::YaEsTuyo { quien, desde },
            Some((actual, desde)) => Cesion::Denegado {
                motivo: MotivoDeDenegacion::LoTieneOtraParte {
                    quien: actual,
                    desde,
                },
            },
            None => {
                self.dueno = Some((quien, momento));
                Cesion::Concedido { quien, momento }
            }
        }
    }

    /// Soltar el aparato. Con un paso abierto se niega: se para limpio (o se
    /// termina) primero. `abortar` es la puerta que decide cual de las dos.
    pub fn soltar(&mut self, quien: Quien, momento: u64) -> Cesion {
        match self.dueno {
            None => Cesion::Denegado {
                motivo: MotivoDeDenegacion::NoEsTuyo { quien },
            },
            Some((actual, desde)) => {
                if actual != quien {
                    return Cesion::Denegado {
                        motivo: MotivoDeDenegacion::LoTieneOtraParte {
                            quien: actual,
                            desde,
                        },
                    };
                }
                if let Some(paso) = self.paso {
                    return Cesion::Denegado {
                        motivo: MotivoDeDenegacion::HayPasoEnCurso {
                            quien: paso.quien,
                            numero: paso.numero,
                        },
                    };
                }
                self.dueno = None;
                Cesion::Concedido { quien, momento }
            }
        }
    }

    /// Abrir un paso. Exige ser el dueno y no tener otro abierto.
    pub fn abrir_paso(
        &mut self,
        quien: Quien,
        numero: usize,
        momento: u64,
    ) -> Result<PasoEnCurso, MotivoDeDenegacion> {
        if self.dueno.map(|(q, _)| q) != Some(quien) {
            return Err(MotivoDeDenegacion::NoEsTuyo { quien });
        }
        if let Some(paso) = self.paso {
            return Err(MotivoDeDenegacion::HayPasoEnCurso {
                quien: paso.quien,
                numero: paso.numero,
            });
        }
        let paso = PasoEnCurso {
            quien,
            numero,
            efecto: EfectoEnElMundo::SinEfecto,
            abierto_en: momento,
        };
        self.paso = Some(paso);
        Ok(paso)
    }

    /// Anotar el efecto de un paso abierto. Es la transicion que prohibe
    /// abandonarlo: en cuanto deja de ser `SinEfecto`, el paso se termina.
    pub fn anotar_efecto(
        &mut self,
        quien: Quien,
        numero: usize,
        efecto: EfectoEnElMundo,
    ) -> Result<PasoEnCurso, MotivoDeDenegacion> {
        let mut paso = self.paso_que_es_de(quien, numero)?;
        paso.efecto = efecto;
        self.paso = Some(paso);
        Ok(paso)
    }

    /// Cerrar un paso con su efecto final. Cerrar es lo que libera el aparato.
    pub fn cerrar_paso(
        &mut self,
        quien: Quien,
        numero: usize,
        efecto: EfectoEnElMundo,
    ) -> Result<PasoEnCurso, MotivoDeDenegacion> {
        let mut paso = self.paso_que_es_de(quien, numero)?;
        paso.efecto = efecto;
        self.paso = None;
        Ok(paso)
    }

    /// Abortar el paso abierto. **La regla dura vive aqui.**
    ///
    /// - sin paso: `NoHayPaso` (y dice si el aparato esta libre);
    /// - paso ajeno: `Ajeno`, no se toca;
    /// - paso con `SinEfecto`: `PararLimpio`, y el paso se cierra aqui;
    /// - paso con `EfectoPosible` / `Indeterminado`: `TerminarPrimero`, el paso
    ///   SIGUE abierto y el aparato NO se suelta.
    pub fn abortar(&mut self, quien: Quien, numero: usize) -> Aborto {
        let paso = match self.paso {
            None => {
                return Aborto::NoHayPaso {
                    aparato_libre: self.dueno.is_none(),
                }
            }
            Some(paso) => paso,
        };
        if paso.quien != quien {
            return Aborto::Ajeno { paso };
        }
        if paso.numero != numero {
            return Aborto::Ajeno { paso };
        }
        match paso.efecto {
            EfectoEnElMundo::SinEfecto => {
                self.paso = None;
                Aborto::PararLimpio { paso }
            }
            EfectoEnElMundo::EfectoPosible | EfectoEnElMundo::Indeterminado => {
                Aborto::TerminarPrimero { paso }
            }
        }
    }

    /// Pasar el aparato a la otra parte SIN pasar por alto un paso abierto. Es
    /// azucar de `soltar` + `tomar`, con la misma negativa: `Denegado` con
    /// `HayPasoEnCurso` si hay un paso abierto.
    pub fn relevar(&mut self, a: Quien, momento: u64) -> Cesion {
        if let Some(paso) = self.paso {
            return Cesion::Denegado {
                motivo: MotivoDeDenegacion::HayPasoEnCurso {
                    quien: paso.quien,
                    numero: paso.numero,
                },
            };
        }
        self.dueno = Some((a, momento));
        Cesion::Concedido {
            quien: a,
            momento,
        }
    }

    fn paso_que_es_de(
        &self,
        quien: Quien,
        numero: usize,
    ) -> Result<PasoEnCurso, MotivoDeDenegacion> {
        if self.dueno.map(|(q, _)| q) != Some(quien) {
            return Err(MotivoDeDenegacion::NoEsTuyo { quien });
        }
        match self.paso {
            None => Err(MotivoDeDenegacion::NoHayPaso { quien }),
            Some(paso) if paso.numero != numero => Err(MotivoDeDenegacion::PasoDistinto {
                abierto: paso.numero,
                pedido: numero,
            }),
            Some(paso) => Ok(paso),
        }
    }
}
