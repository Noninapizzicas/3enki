//! O2 · VeredictoDeEjecucion — UN veredicto por ejecucion, y nada de "parcial".
//!
//! O1 contesta paso a paso. Este fichero junta esos resultados en un solo
//! veredicto, porque quien lee el resultado de una publicacion no puede quedarse
//! con "mas o menos se hizo": o la ejecucion ocurrio entera, o no ocurrio, o no
//! se sabe. Las tres, y ninguna cuarta.
//!
//! # La regla que ordena todo
//!
//! ```text
//! algun paso NoSeSabe  ->  el veredicto es NoSeSabe   (NO Ocurrio)
//! ```
//!
//! Un paso que no se pudo verificar envenena el veredicto: no hay ejecucion
//! entera si hay un paso del que no se sabe. Convertir ese `NoSeSabe` en
//! `Ocurrio` "para quedar bien" esta prohibido por construccion: este fichero
//! nunca devuelve `Ocurrio` si algun resultado es `NoSeSabe`.
//!
//! Precedencia (de mas fuerte a mas debil):
//!
//! ```text
//! NoSeSabe  >  NoOcurrio  >  Ocurrio
//! ```
//!
//! # Un paso, un resultado
//!
//! Si el mismo paso llega dos veces con resultados distintos, no hay veredicto
//! posible: el ejecutor esta contando dos veces lo mismo o dos cosas distintas
//! con el mismo numero. Eso tambien es `NoSeSabe`, con el paso nombrado.
//!
//! # NoSeSabe viaja con lo que falta
//!
//! El veredicto `NoSeSabe` lleva SIEMPRE al menos una `QueHariaFalta`. Es la
//! diferencia entre "no se" y "no se, y he aqui que haria falta para saberlo".
//!
//! Puro: sin IO, sin reloj, sin estado global. Todo entra por argumento.

use std::fmt;

use super::verificador::{Prueba, QueHariaFalta, ResultadoDeConsecuencia};

// ---------------------------------------------------------------------------
// El veredicto (tres valores, cerrados)
// ---------------------------------------------------------------------------

/// El veredicto de UNA ejecucion. Cerrado: no hay `Parcial`, ni `CasiSeguro`, ni
/// `ParcialmenteHecho`. Una ejecucion entera o no.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Veredicto {
    /// Todos los pasos ocurrieron, cada uno con su prueba visible.
    Ocurrio,
    /// Hay prueba de que algun paso no ocurrio.
    NoOcurrio,
    /// Hay al menos un paso del que no se sabe: no se puede afirmar la ejecucion.
    NoSeSabe,
}

impl Veredicto {
    /// Los tres, en el orden del diseno. Un cuarto valor se ve aqui.
    pub const TODOS: [Veredicto; 3] = [
        Veredicto::Ocurrio,
        Veredicto::NoOcurrio,
        Veredicto::NoSeSabe,
    ];

    pub fn como_str(&self) -> &'static str {
        match self {
            Veredicto::Ocurrio => "ocurrio",
            Veredicto::NoOcurrio => "no_ocurrio",
            Veredicto::NoSeSabe => "no_se_sabe",
        }
    }

    pub fn es_ocurrio(&self) -> bool {
        matches!(self, Veredicto::Ocurrio)
    }

    pub fn es_no_se_sabe(&self) -> bool {
        matches!(self, Veredicto::NoSeSabe)
    }

    /// Solo un `Ocurrio` autoriza a escribir "hecho" en la bitacora.
    pub fn autoriza_hecho(&self) -> bool {
        self.es_ocurrio()
    }
}

impl fmt::Display for Veredicto {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.como_str())
    }
}

// ---------------------------------------------------------------------------
// El veredicto con su detalle
// ---------------------------------------------------------------------------

/// El veredicto de la ejecucion entera, con lo que lo sostiene: que pasos
/// ocurrieron (y con que prueba), cuales no, cuales no se saben y que falta.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VeredictoDeEjecucion {
    pub veredicto: Veredicto,
    /// Pasos con prueba visible, en orden.
    pub pasos_ocurridos: Vec<usize>,
    /// Pasos con prueba de ausencia.
    pub pasos_no_ocurridos: Vec<usize>,
    /// Pasos de los que no se sabe.
    pub pasos_no_se: Vec<usize>,
    /// Lo que haria falta para saberlo. Vacio salvo en `NoSeSabe`.
    pub faltas: Vec<QueHariaFalta>,
    /// Las pruebas de lo que SI ocurrio (evidencia para O3).
    pub pruebas: Vec<Prueba>,
}

impl VeredictoDeEjecucion {
    /// Juzga una ejecucion. Un veredicto, con todo lo que lo sostiene.
    pub fn juzgar(resultados: &[ResultadoDeConsecuencia]) -> Self {
        let mut pasos_ocurridos = Vec::new();
        let mut pasos_no_ocurridos = Vec::new();
        let mut pasos_no_se = Vec::new();
        let mut faltas: Vec<QueHariaFalta> = Vec::new();
        let mut pruebas: Vec<Prueba> = Vec::new();
        let mut hay_no_se = false;
        let mut hay_no_ocurrio = false;

        // Contraccion: el mismo paso dos veces con resultados distintos no es un
        // dato, es una contradiccion. Se nombra y envenena el veredicto.
        for (i, actual) in resultados.iter().enumerate() {
            for previo in &resultados[..i] {
                if previo.paso() == actual.paso() && previo.como_str() != actual.como_str() {
                    let falta = QueHariaFalta::UnSoloResultadoPorPaso { paso: actual.paso() };
                    if !faltas.contains(&falta) {
                        faltas.push(falta);
                    }
                    hay_no_se = true;
                }
            }
        }

        for resultado in resultados {
            match resultado {
                ResultadoDeConsecuencia::Ocurrio(prueba) => {
                    pasos_ocurridos.push(prueba.paso);
                    pruebas.push(prueba.clone());
                }
                ResultadoDeConsecuencia::NoOcurrio(prueba) => {
                    pasos_no_ocurridos.push(prueba.paso);
                    hay_no_ocurrio = true;
                }
                ResultadoDeConsecuencia::NoSeSabe { paso, falta } => {
                    pasos_no_se.push(*paso);
                    if !faltas.contains(falta) {
                        faltas.push(falta.clone());
                    }
                    hay_no_se = true;
                }
            }
        }

        let veredicto = if resultados.is_empty() {
            // Sin pasos no hay ejecucion que afirmar. Y se dice que faltaria.
            if !faltas.contains(&QueHariaFalta::SinPasos) {
                faltas.push(QueHariaFalta::SinPasos);
            }
            Veredicto::NoSeSabe
        } else if hay_no_se {
            Veredicto::NoSeSabe
        } else if hay_no_ocurrio {
            Veredicto::NoOcurrio
        } else {
            Veredicto::Ocurrio
        };

        // Invariante: un NoSeSabe sin que_haria_falta seria una excusa. No puede
        // ocurrir con las ramas de arriba, pero si un dia ocurre, se nombra en
        // vez de salir mudo.
        if veredicto == Veredicto::NoSeSabe && faltas.is_empty() {
            faltas.push(QueHariaFalta::SinPasos);
        }

        Self {
            veredicto,
            pasos_ocurridos,
            pasos_no_ocurridos,
            pasos_no_se,
            faltas,
            pruebas,
        }
    }

    pub fn es_ocurrio(&self) -> bool {
        self.veredicto.es_ocurrio()
    }

    pub fn es_no_se_sabe(&self) -> bool {
        self.veredicto.es_no_se_sabe()
    }

    /// Lo que haria falta para saberlo. Vacio cuando el veredicto es firme.
    pub fn que_haria_falta(&self) -> &[QueHariaFalta] {
        &self.faltas
    }

    /// Las pruebas de lo ocurrido: lo que O3 conserva.
    pub fn pruebas(&self) -> &[Prueba] {
        &self.pruebas
    }

    /// Total de pasos juzgados (ocurridos + no ocurridos + no sabidos).
    pub fn pasos(&self) -> usize {
        self.pasos_ocurridos.len() + self.pasos_no_ocurridos.len() + self.pasos_no_se.len()
    }

    pub fn descripcion(&self) -> String {
        let base = format!(
            "{} (ocurridos={} no_ocurridos={} no_se={})",
            self.veredicto,
            self.pasos_ocurridos.len(),
            self.pasos_no_ocurridos.len(),
            self.pasos_no_se.len()
        );
        if self.faltas.is_empty() {
            base
        } else {
            let faltas: Vec<String> = self.faltas.iter().map(|f| f.descripcion()).collect();
            format!("{base} hace falta: {}", faltas.join("; "))
        }
    }
}

impl fmt::Display for VeredictoDeEjecucion {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.descripcion())
    }
}

// ---------------------------------------------------------------------------
// Puente con O1
// ---------------------------------------------------------------------------

/// Lo que un publicador entrega a O2: el resultado de O1 por paso.
///
/// Es un alias con nombre para que el borde no invente otra forma: el veredicto
/// se construye con resultados del testigo, no con booleanos.
pub type ResultadoDePaso = ResultadoDeConsecuencia;

/// Atajo: juzga una lista de resultados de O1.
pub fn juzgar(resultados: &[ResultadoDeConsecuencia]) -> VeredictoDeEjecucion {
    VeredictoDeEjecucion::juzgar(resultados)
}
