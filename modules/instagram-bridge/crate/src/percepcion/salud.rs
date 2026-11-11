//! D3 · SaludDelAparato · REFLEJO del aparato.
//!
//! El aparato dice si esta en condiciones de trabajar. No dice "todo bien": dice
//! que indicadores estan, cuales faltan y cuales no se pudieron leer, y de ahi
//! sale una de tres: `Sano`, `Degradado` o `Fuera`.
//!
//! # La regla dura
//!
//! ```text
//! un indicador ESENCIAL ausente  ->  fuera
//! ```
//!
//! Sin servicio de accesibilidad no hay mano; con la pantalla apagada no hay
//! nada que mirar; con el aparato bloqueado no se toca; con la app en una version
//! que la plataforma ya no acepta no se publica; sin sitio para escribir la
//! evidencia no se trabaja (el testigo no podria probar nada).
//!
//! Un indicador esencial que NO se pudo leer tambien deja fuera, pero **no es una
//! averia**: es un no-saber, y su remedio es volver a mirar, no reparar. La
//! etiqueta dice la verdad (`esencial_no_se`), la decision es la misma que la de
//! un ausente (no se opera), y la diferencia importa: a una persona se le manda
//! "mira el movil otra vez" o "activa el servicio", que no es lo mismo.
//!
//! # Lo deseable degrada, no echa fuera
//!
//! Bateria baja o sin red el puente sigue leyendo lo ya traido (H3,
//! `ModoDegradado`). Por eso son DESEABLES: su falta no prohibe operar, la
//! limita, y eso lo decide el modo degradado, no esta pieza.
//!
//! # Estado por parametro
//!
//! Las lecturas se anaden a mano (`leer`); esta pieza no pregunta al sistema.
//! El aparato (Kotlin) lee, el crate dictamina: asi se prueba en escritorio.

use std::fmt;

/// Los indicadores que el aparato puede declarar. Lista CERRADA: uno nuevo se
/// anade aqui y en su clase (esencial o deseable), y entonces se decide su
/// efecto. Un indicador que no esta en esta lista no existe para el puente.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Indicador {
    /// El servicio de accesibilidad esta activo y responde.
    ServicioDeAccesibilidad,
    /// La pantalla esta encendida.
    PantallaEncendida,
    /// El aparato esta desbloqueado.
    Desbloqueado,
    /// La version de la app es la que la receta espera (no la rechaza la plataforma).
    VersionDeApp,
    /// Hay sitio para escribir la evidencia del testigo.
    AlmacenamientoLibre,
    /// Bateria suficiente para terminar el trabajo en curso.
    Bateria,
    /// La plataforma contesta.
    Red,
}

impl Indicador {
    /// Todos, en el orden en que se dictamina (el orden es estable: el primer
    /// esencial que falla es el que se nombra).
    pub const TODOS: [Indicador; 7] = [
        Indicador::ServicioDeAccesibilidad,
        Indicador::PantallaEncendida,
        Indicador::Desbloqueado,
        Indicador::VersionDeApp,
        Indicador::AlmacenamientoLibre,
        Indicador::Bateria,
        Indicador::Red,
    ];

    pub fn como_str(&self) -> &'static str {
        match self {
            Indicador::ServicioDeAccesibilidad => "servicio_de_accesibilidad",
            Indicador::PantallaEncendida => "pantalla_encendida",
            Indicador::Desbloqueado => "desbloqueado",
            Indicador::VersionDeApp => "version_de_app",
            Indicador::AlmacenamientoLibre => "almacenamiento_libre",
            Indicador::Bateria => "bateria",
            Indicador::Red => "red",
        }
    }

    /// Si sin el no se opera. Es la unica clasificacion que decide.
    pub fn es_esencial(&self) -> bool {
        match self {
            Indicador::ServicioDeAccesibilidad
            | Indicador::PantallaEncendida
            | Indicador::Desbloqueado
            | Indicador::VersionDeApp
            | Indicador::AlmacenamientoLibre => true,
            Indicador::Bateria | Indicador::Red => false,
        }
    }

    /// Que hace falta para tenerlo, dicho como accion.
    pub fn que_hace_falta(&self) -> &'static str {
        match self {
            Indicador::ServicioDeAccesibilidad => "activar el servicio de accesibilidad del puente",
            Indicador::PantallaEncendida => "encender la pantalla del aparato",
            Indicador::Desbloqueado => "desbloquear el aparato",
            Indicador::VersionDeApp => "instalar la version de la app que la receta espera",
            Indicador::AlmacenamientoLibre => "liberar sitio para la evidencia del testigo",
            Indicador::Bateria => "cargar el aparato antes de un trabajo largo",
            Indicador::Red => "esperar a que vuelva la plataforma (se sigue leyendo lo ya traido)",
        }
    }
}

impl fmt::Display for Indicador {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.como_str())
    }
}

/// Lo que se pudo leer de un indicador. `NoSe` NO es `No`: un servicio que no
/// contesta no es un servicio apagado.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Valor {
    Si,
    No,
    NoSe,
}

impl Valor {
    pub fn como_str(&self) -> &'static str {
        match self {
            Valor::Si => "si",
            Valor::No => "no",
            Valor::NoSe => "no_se",
        }
    }
}

impl fmt::Display for Valor {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.como_str())
    }
}

/// Por que el aparato esta fuera.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MotivoDeFuera {
    /// Se leyo el indicador y dijo que no (o no se declaro: ausente es ausente).
    EsencialAusente { indicador: Indicador },
    /// No se pudo leer el indicador esencial: no se opera, pero NO es averia.
    EsencialNoSe { indicador: Indicador },
}

impl MotivoDeFuera {
    pub fn indicador(&self) -> Indicador {
        match self {
            MotivoDeFuera::EsencialAusente { indicador } => *indicador,
            MotivoDeFuera::EsencialNoSe { indicador } => *indicador,
        }
    }

    pub fn como_str(&self) -> &'static str {
        match self {
            MotivoDeFuera::EsencialAusente { .. } => "esencial_ausente",
            MotivoDeFuera::EsencialNoSe { .. } => "esencial_no_se",
        }
    }

    /// Si es una averia de verdad. Un no-saber no lo es: se vuelve a mirar.
    pub fn es_averia(&self) -> bool {
        matches!(self, MotivoDeFuera::EsencialAusente { .. })
    }

    pub fn remedio(&self) -> &'static str {
        match self {
            MotivoDeFuera::EsencialAusente { .. } => "reparar",
            MotivoDeFuera::EsencialNoSe { .. } => "mirar_otra_vez",
        }
    }

    /// Que hace falta, en una frase que se le puede mandar a una persona.
    pub fn que_hace_falta(&self) -> &'static str {
        match self {
            MotivoDeFuera::EsencialAusente { indicador } => indicador.que_hace_falta(),
            MotivoDeFuera::EsencialNoSe { indicador } => match indicador {
                Indicador::ServicioDeAccesibilidad => {
                    "volver a preguntar al servicio de accesibilidad: no contesto (puede estar activo)"
                }
                Indicador::PantallaEncendida => {
                    "volver a mirar la pantalla: no se sabe si esta encendida"
                }
                Indicador::Desbloqueado => {
                    "volver a mirar el bloqueo: no se sabe si el aparato esta desbloqueado"
                }
                Indicador::VersionDeApp => {
                    "volver a leer la version de la app: no se pudo consultar"
                }
                Indicador::AlmacenamientoLibre => {
                    "volver a preguntar por el sitio libre antes de escribir evidencia"
                }
                Indicador::Bateria => "volver a leer la bateria: no contesto",
                Indicador::Red => "volver a probar la plataforma: no contesto",
            },
        }
    }
}

impl fmt::Display for MotivoDeFuera {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.como_str(), self.indicador())
    }
}

/// El dictamen. Tres salidas y ninguna a medias.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Salud {
    /// Todos los esenciales en `Si`. (Los deseables pueden faltar: eso ya es
    /// `Degradado`, no `Sano`, para no disfrazar una limitacion de salud.)
    Sano,
    /// Los esenciales estan; falta algo deseable. Se opera, con limite (H3).
    Degradado {
        faltan: Vec<Indicador>,
        sin_dato: Vec<Indicador>,
    },
    /// Falta un esencial. No se opera.
    Fuera { motivo: MotivoDeFuera },
}

impl Salud {
    pub fn puede_operar(&self) -> bool {
        !matches!(self, Salud::Fuera { .. })
    }

    pub fn como_str(&self) -> &'static str {
        match self {
            Salud::Sano => "sano",
            Salud::Degradado { .. } => "degradado",
            Salud::Fuera { .. } => "fuera",
        }
    }

    /// Si es una averia (algo roto) y no solo una limitacion o una duda.
    pub fn es_averia(&self) -> bool {
        match self {
            Salud::Fuera { motivo } => motivo.es_averia(),
            _ => false,
        }
    }

    pub fn remedio(&self) -> &'static str {
        match self {
            Salud::Sano => "operar",
            Salud::Degradado { .. } => "operar_degradado",
            Salud::Fuera { motivo } => motivo.remedio(),
        }
    }

    pub fn que_hace_falta(&self) -> &'static str {
        match self {
            Salud::Sano => "nada: el aparato esta en condiciones",
            Salud::Degradado { faltan, sin_dato } => {
                if let Some(i) = faltan.first() {
                    i.que_hace_falta()
                } else if let Some(i) = sin_dato.first() {
                    i.que_hace_falta()
                } else {
                    "nada: el aparato esta en condiciones"
                }
            }
            Salud::Fuera { motivo } => motivo.que_hace_falta(),
        }
    }
}

impl fmt::Display for Salud {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.como_str())
    }
}

/// D3 · La salud del aparato, leida indicador a indicador.
///
/// Un indicador NO declarado cuenta como ausente si es esencial (no se puede
/// afirmar que este) y como `sin_dato` si es deseable. Guardar solo lo leido y
/// suponer el resto es como se opera con el servicio de accesibilidad apagado.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SaludDelAparato {
    lecturas: Vec<(Indicador, Valor)>,
}

impl Default for SaludDelAparato {
    fn default() -> Self {
        Self::nuevo()
    }
}

impl SaludDelAparato {
    pub fn nuevo() -> Self {
        Self {
            lecturas: Vec::new(),
        }
    }

    /// Declara una lectura. Repetir un indicador SUSTITUYE la anterior: manda la
    /// ultima, que es lo que se acaba de leer.
    pub fn leer(&mut self, indicador: Indicador, valor: Valor) -> &mut Self {
        if let Some(hueco) = self.lecturas.iter_mut().find(|(i, _)| *i == indicador) {
            hueco.1 = valor;
        } else {
            self.lecturas.push((indicador, valor));
        }
        self
    }

    /// Encadenable, para construir un caso en una linea.
    pub fn con(mut self, indicador: Indicador, valor: Valor) -> Self {
        self.leer(indicador, valor);
        self
    }

    /// Lo leido de un indicador. `None` = no se declaro.
    pub fn valor(&self, indicador: Indicador) -> Option<Valor> {
        self.lecturas
            .iter()
            .find(|(i, _)| *i == indicador)
            .map(|(_, v)| *v)
    }

    pub fn cuantas_lecturas(&self) -> usize {
        self.lecturas.len()
    }

    /// El dictamen, en orden estable: primero un esencial ausente (evidencia),
    /// despues un esencial sin dato (duda), despues lo deseable.
    pub fn salud(&self) -> Salud {
        let mut sin_dato: Vec<Indicador> = Vec::new();
        let mut faltan: Vec<Indicador> = Vec::new();
        let mut esencial_sin_dato: Option<Indicador> = None;

        for indicador in Indicador::TODOS {
            let valor = self.valor(indicador);
            if indicador.es_esencial() {
                match valor {
                    Some(Valor::Si) => {}
                    Some(Valor::No) | None => {
                        // Evidencia de que no esta (o no se declaro): fuera, y es
                        // lo primero que se nombra.
                        return Salud::Fuera {
                            motivo: MotivoDeFuera::EsencialAusente { indicador },
                        };
                    }
                    Some(Valor::NoSe) => {
                        if esencial_sin_dato.is_none() {
                            esencial_sin_dato = Some(indicador);
                        }
                    }
                }
            } else {
                match valor {
                    Some(Valor::Si) => {}
                    Some(Valor::No) | None => faltan.push(indicador),
                    Some(Valor::NoSe) => sin_dato.push(indicador),
                }
            }
        }

        // Un esencial que no se pudo leer deja fuera igual, pero con la etiqueta
        // honesta: no se sabe, no se declara averia.
        if let Some(indicador) = esencial_sin_dato {
            return Salud::Fuera {
                motivo: MotivoDeFuera::EsencialNoSe { indicador },
            };
        }

        if faltan.is_empty() && sin_dato.is_empty() {
            Salud::Sano
        } else {
            Salud::Degradado { faltan, sin_dato }
        }
    }

    pub fn puede_operar(&self) -> bool {
        self.salud().puede_operar()
    }
}
