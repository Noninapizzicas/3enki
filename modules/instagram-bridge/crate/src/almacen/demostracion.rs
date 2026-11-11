//! A4.2 · SembradorDeDemostracion · CONVERSOR del aparato.
//!
//! Una receta no se inventa: nace de que una PERSONA haga la operacion una vez y
//! alguien la observe. Este grabador vive en el aparato porque es el unico sitio
//! donde la observacion ocurre: el cerebro recibe hechos ya tomados (D12), pero
//! los pasos se anotan aqui, en el momento en que el dedo toca la pantalla.
//!
//! # Las dos reglas duras
//!
//! 1. **La demostracion produce una PROPUESTA, nunca una receta vigente.** No es
//!    una convencion: `EstadoPropuesta` solo tiene la variante `Propuesta`, asi
//!    que en este modulo no existe ningun valor que diga "vigente". La vigencia la
//!    dan una persona (Q5) y el catalogo (A4.4); el aparato no puede concederla ni
//!    por error de programacion.
//!
//! 2. **Lo que no se vio no se rellena.** Un paso sin ancla se ANOTA (se grabo lo
//!    que paso) pero al cerrar es un defecto con su numero de paso: no se produce
//!    receta. Inventar el ancla "mas probable" es como una receta acaba tocando el
//!    boton equivocado con toda la confianza.
//!
//! Ademas: si un toque resuelve DOS cosas nombradas a la vez, el paso es ambiguo y
//! se pide repetir la demostracion. El grabador no adivina que gesto produjo que
//! consecuencia.
//!
//! Puro: sin reloj, sin red, sin estado global. Todo entra por argumento y todo lo
//! que decide sale por el valor devuelto.

use std::fmt;

/// Tipo de ancla, espejo de `TIPOS_ANCLA` en `core/formas.js`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TipoAncla {
    Boton,
    Campo,
    Texto,
    Imagen,
    Desconocido,
}

impl TipoAncla {
    pub fn como_str(&self) -> &'static str {
        match self {
            TipoAncla::Boton => "boton",
            TipoAncla::Campo => "campo",
            TipoAncla::Texto => "texto",
            TipoAncla::Imagen => "imagen",
            TipoAncla::Desconocido => "desconocido",
        }
    }

    /// Lo que se vio en el arbol de accesibilidad, degradado a la lista cerrada.
    /// Un tipo que no se reconoce NO se adivina: pasa a `Desconocido`.
    pub fn desde_nombre(tipo: &str) -> Self {
        match tipo.trim().to_ascii_lowercase().as_str() {
            "boton" | "button" => TipoAncla::Boton,
            "campo" | "edittext" | "textfield" => TipoAncla::Campo,
            "texto" | "text" => TipoAncla::Texto,
            "imagen" | "image" => TipoAncla::Imagen,
            _ => TipoAncla::Desconocido,
        }
    }
}

/// El ancla de un paso: lo que se ve y se puede nombrar en pantalla.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ancla {
    pub nombre_visible: String,
    pub tipo: TipoAncla,
}

impl Ancla {
    pub fn nueva(nombre_visible: impl Into<String>, tipo: TipoAncla) -> Self {
        Self { nombre_visible: nombre_visible.into(), tipo }
    }
}

/// Direccion de un desplazamiento.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direccion {
    Arriba,
    Abajo,
    Izquierda,
    Derecha,
}

impl Direccion {
    pub fn como_str(&self) -> &'static str {
        match self {
            Direccion::Arriba => "arriba",
            Direccion::Abajo => "abajo",
            Direccion::Izquierda => "izquierda",
            Direccion::Derecha => "derecha",
        }
    }

    pub fn desde_nombre(v: &str) -> Option<Self> {
        match v.trim().to_ascii_lowercase().as_str() {
            "arriba" => Some(Direccion::Arriba),
            "abajo" => Some(Direccion::Abajo),
            "izquierda" => Some(Direccion::Izquierda),
            "derecha" => Some(Direccion::Derecha),
            _ => None,
        }
    }
}

/// El gesto que hizo la persona. Espejo de las acciones que A3 sabe ejecutar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Gesto {
    Tocar,
    Escribir { texto: String },
    Desplazar { direccion: Direccion, distancia: Option<u32> },
    Esperar { ventana_ms: u64 },
}

impl Gesto {
    pub fn tipo_como_str(&self) -> &'static str {
        match self {
            Gesto::Tocar => "tocar",
            Gesto::Escribir { .. } => "escribir",
            Gesto::Desplazar { .. } => "desplazar",
            Gesto::Esperar { .. } => "esperar",
        }
    }

    /// Solo estos gestos pueden "resolver dos cosas" en un solo movimiento.
    /// Escribir abre un teclado (muchos nodos nuevos que no son una segunda
    /// decision) y esperar no toca nada.
    fn un_solo_efecto(&self) -> bool {
        matches!(self, Gesto::Tocar | Gesto::Desplazar { .. })
    }
}

/// Un paso tal y como se observo. `Option` no es pereza: es la forma de decir
/// "no se vio" sin rellenarlo con nada.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PasoObservado {
    pub ancla: Option<Ancla>,
    pub gesto: Gesto,
    pub consecuencia: Option<String>,
    pub espera_maxima_ms: Option<u64>,
    /// Cuantos nodos NOMBRADOS aparecieron con el gesto. Es lo que distingue un
    /// paso de dos pasos disfrazados.
    pub aparecen_nombrados: usize,
}

impl PasoObservado {
    pub fn nuevo(ancla: Option<Ancla>, gesto: Gesto) -> Self {
        Self { ancla, gesto, consecuencia: None, espera_maxima_ms: None, aparecen_nombrados: 0 }
    }

    pub fn con_consecuencia(mut self, consecuencia: impl Into<String>) -> Self {
        self.consecuencia = Some(consecuencia.into());
        self
    }

    pub fn medido(mut self, espera_maxima_ms: u64) -> Self {
        self.espera_maxima_ms = Some(espera_maxima_ms);
        self
    }

    pub fn con_aparecidos(mut self, aparecen_nombrados: usize) -> Self {
        self.aparecen_nombrados = aparecen_nombrados;
        self
    }
}

/// Situacion de la demostracion en curso.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EstadoDemostracion {
    EnCurso,
    Descartada,
}

/// Situacion de una receta sembrada. **Solo hay una**: propuesta. No existe
/// `Vigente` aqui a proposito; la vigencia es de A4.4 y de una persona.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EstadoPropuesta {
    Propuesta,
}

impl EstadoPropuesta {
    pub fn como_str(&self) -> &'static str {
        match self {
            EstadoPropuesta::Propuesta => "propuesta",
        }
    }
}

/// Un paso ya traducido a receta: sin huecos, porque si hubiera huecos no habria
/// receta.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PasoDeReceta {
    pub numero: u32,
    pub ancla: Ancla,
    pub gesto: Gesto,
    pub consecuencia: String,
    pub espera_maxima_ms: u64,
}

/// Lo que sale de cerrar una demostracion: una propuesta, jamas una vigente.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecetaPropuesta {
    pub capacidad: String,
    pub cuenta: String,
    pub pasos: Vec<PasoDeReceta>,
    /// Suma de las esperas medidas. No se anade margen: un techo inventado es un
    /// techo que nadie comprobo.
    pub techo_ms: u64,
    estado: EstadoPropuesta,
}

impl RecetaPropuesta {
    pub fn estado(&self) -> EstadoPropuesta {
        self.estado
    }

    /// Siempre `false`. Existe para que el payload del bus lo diga en voz alta y
    /// para que nadie tenga que deducirlo del tipo.
    pub fn es_vigente(&self) -> bool {
        false
    }

    pub fn pasos(&self) -> usize {
        self.pasos.len()
    }
}

/// Por que un paso no se puede traducir.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MotivoDefecto {
    SinAncla,
    SinConsecuencia,
    SinEspera,
    Ambigua,
    /// Se intento anotar un paso en una demostracion que ya no esta en curso.
    NoAbierta,
}

impl MotivoDefecto {
    pub fn como_str(&self) -> &'static str {
        match self {
            MotivoDefecto::SinAncla => "ancla_esperada",
            MotivoDefecto::SinConsecuencia => "consecuencia_esperada",
            MotivoDefecto::SinEspera => "espera_maxima",
            MotivoDefecto::Ambigua => "pasos_ambiguos",
            MotivoDefecto::NoAbierta => "demostracion_no_abierta",
        }
    }

    pub fn descripcion(&self) -> &'static str {
        match self {
            MotivoDefecto::SinAncla => {
                "el paso no dejo ancla observada: no se sabe donde tocar y no se inventa"
            }
            MotivoDefecto::SinConsecuencia => {
                "el gesto no cambio nada visible: no hay consecuencia que vigilar"
            }
            MotivoDefecto::SinEspera => {
                "no se midio cuanto tardo el paso: sin techo, la receta se puede colgar"
            }
            MotivoDefecto::Ambigua => {
                "el gesto resolvio dos cosas: hay que repetir la demostracion paso a paso"
            }
            MotivoDefecto::NoAbierta => {
                "la demostracion ya no esta en curso: no se anota nada mas"
            }
        }
    }
}

/// Un defecto, siempre con su numero de paso. Un fallo sin numero no se puede
/// reparar ni contar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Defecto {
    pub paso: u32,
    pub motivo: MotivoDefecto,
}

impl fmt::Display for Defecto {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "paso {}: {} ({})", self.paso, self.motivo.como_str(), self.motivo.descripcion())
    }
}

/// Por que no se pudo cerrar. No hay receta en ninguno de estos casos.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FalloCierre {
    NoAbierta,
    Vacia,
    ConDefectos(Vec<Defecto>),
}

impl fmt::Display for FalloCierre {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FalloCierre::NoAbierta => write!(f, "la demostracion no esta en curso"),
            FalloCierre::Vacia => write!(f, "la demostracion no tiene pasos: no hay nada que sembrar"),
            FalloCierre::ConDefectos(defectos) => {
                write!(f, "{} paso(s) no se pueden traducir:", defectos.len())?;
                for d in defectos {
                    write!(f, " {}", d)?;
                }
                Ok(())
            }
        }
    }
}

impl std::error::Error for FalloCierre {}

/// La demostracion en curso: capacidad, cuenta y los pasos observados.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Demostracion {
    capacidad: String,
    cuenta: String,
    pasos: Vec<PasoObservado>,
    estado: EstadoDemostracion,
}

impl Demostracion {
    /// Abre una demostracion para una capacidad y una cuenta. Sin capacidad no
    /// hay nada que sembrar, pero eso lo decide quien llama: aqui no se inventa.
    pub fn abrir(capacidad: impl Into<String>, cuenta: impl Into<String>) -> Self {
        Self {
            capacidad: capacidad.into(),
            cuenta: cuenta.into(),
            pasos: Vec::new(),
            estado: EstadoDemostracion::EnCurso,
        }
    }

    pub fn capacidad(&self) -> &str {
        &self.capacidad
    }

    pub fn cuenta(&self) -> &str {
        &self.cuenta
    }

    pub fn estado(&self) -> EstadoDemostracion {
        self.estado
    }

    pub fn pasos(&self) -> usize {
        self.pasos.len()
    }

    pub fn observados(&self) -> &[PasoObservado] {
        &self.pasos
    }

    /// Anota un paso observado. El paso se guarda TAL CUAL se vio, con sus
    /// huecos: lo que no se puede admitir se rechaza aqui (ambiguo) o al cerrar,
    /// nunca rellenando.
    pub fn anotar_paso(&mut self, paso: PasoObservado) -> Result<(), Defecto> {
        if self.estado != EstadoDemostracion::EnCurso {
            return Err(Defecto {
                paso: self.pasos.len() as u32 + 1,
                motivo: MotivoDefecto::NoAbierta,
            });
        }
        let numero = self.pasos.len() as u32 + 1;

        // Dos cosas nombradas en un solo gesto: no se sabe que gesto produjo que.
        if paso.gesto.un_solo_efecto() && paso.aparecen_nombrados >= 2 {
            return Err(Defecto { paso: numero, motivo: MotivoDefecto::Ambigua });
        }

        self.pasos.push(paso);
        Ok(())
    }

    /// Cierra la demostracion. Devuelve la PROPUESTA o todos los defectos con su
    /// numero de paso. Nunca devuelve una receta a medias: si hay un hueco, no
    /// hay receta.
    pub fn cerrar(&self) -> Result<RecetaPropuesta, FalloCierre> {
        if self.estado != EstadoDemostracion::EnCurso {
            return Err(FalloCierre::NoAbierta);
        }
        if self.pasos.is_empty() {
            return Err(FalloCierre::Vacia);
        }

        let mut defectos: Vec<Defecto> = Vec::new();
        let mut pasos: Vec<PasoDeReceta> = Vec::with_capacity(self.pasos.len());

        for (i, observado) in self.pasos.iter().enumerate() {
            let numero = i as u32 + 1;
            let mut defectuoso = false;

            // 1 · ancla: si no se vio, hueco (y no se rellena).
            // El `Ancla::nueva("", ...)` del hueco es un relleno local que NUNCA
            // llega a una receta: si hay defecto, el paso no se empuja. Existe para
            // no inventar un ancla verosimil solo para satisfacer al tipo.
            let ancla = match &observado.ancla {
                Some(a) if !a.nombre_visible.trim().is_empty() => a.clone(),
                _ => {
                    defectos.push(Defecto { paso: numero, motivo: MotivoDefecto::SinAncla });
                    defectuoso = true;
                    Ancla::nueva("", TipoAncla::Desconocido)
                }
            };

            // 2 · consecuencia: lo que cambio. Sin cambio no hay que vigilar.
            let consecuencia = match &observado.consecuencia {
                Some(c) if !c.trim().is_empty() => c.trim().to_string(),
                _ => {
                    defectos.push(Defecto { paso: numero, motivo: MotivoDefecto::SinConsecuencia });
                    defectuoso = true;
                    String::new()
                }
            };

            // 3 · espera: medida. Sin medida, hueco.
            let espera = match observado.espera_maxima_ms {
                Some(ms) if ms > 0 => ms,
                _ => {
                    defectos.push(Defecto { paso: numero, motivo: MotivoDefecto::SinEspera });
                    defectuoso = true;
                    0
                }
            };

            if !defectuoso {
                pasos.push(PasoDeReceta {
                    numero,
                    ancla,
                    gesto: observado.gesto.clone(),
                    consecuencia,
                    espera_maxima_ms: espera,
                });
            }
        }

        if !defectos.is_empty() {
            return Err(FalloCierre::ConDefectos(defectos));
        }

        let techo_ms = pasos.iter().map(|p| p.espera_maxima_ms).sum();

        Ok(RecetaPropuesta {
            capacidad: self.capacidad.clone(),
            cuenta: self.cuenta.clone(),
            pasos,
            techo_ms,
            // Unica variante posible: no hay constructor de "vigente".
            estado: EstadoPropuesta::Propuesta,
        })
    }

    /// Descarta la demostracion. El motivo lo guarda quien llama (chat/registro);
    /// aqui solo se marca, porque el aparato no escribe el diario del cerebro.
    pub fn descartar(&mut self) {
        self.estado = EstadoDemostracion::Descartada;
    }
}
