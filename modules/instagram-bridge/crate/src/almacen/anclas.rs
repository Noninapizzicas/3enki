//! F1b · AnclasCandidatas · almacen del aparato (lo que el aparato guarda mientras trabaja).
//!
//! Cuando la interfaz cambia, el ancla de un paso deja de estar. Antes de reparar
//! la receta (F2, en el cerebro) hay que saber QUE hay ahora en la pantalla que
//! pueda ocupar su sitio. Eso es lo que hace esta pieza: proponer anclas
//! CANDIDATAS **sacadas de lo observado**.
//!
//! # La regla dura: no se inventa ninguna ancla
//!
//! Cada candidata sale de un nodo que estaba en el `HechoVisible` de AHORA, con su
//! `nodo_id` y su nombre visible. No hay ninguna ruta en la que esta pieza devuelva
//! una etiqueta que no se haya visto: ni siquiera "la mas probable" por parecido con
//! la que se perdio. Inventar el ancla plausible es como una receta reparada empieza
//! a tocar el boton de al lado con toda la confianza.
//!
//! Por eso:
//!   - un nodo sin nombre visible (`ancla: None` o en blanco) NO es una candidata:
//!     no hay etiqueta que poner en la receta;
//!   - el ancla que se perdio no se propone a si misma (reproponerla no arregla nada);
//!   - un ancla que otro paso ya usa no se propone: dos pasos con la misma ancla es
//!     una ambiguedad, no una reparacion;
//!   - si el paso toca, lo que no es tocable no vale.
//!
//! # Una mirada parcial no propone nada
//!
//! Con media pantalla leida se puede afirmar lo que se ve, pero no que lo demas no
//! este. Proponer con una foto parcial es elegir entre los nodos que entraron por
//! casualidad. Asi que `candidatas()` con `Mirada::Parcial` devuelve vacio y lo dice
//! (`MotivoVacio::MiradaParcial`): se pide otra mirada, no se adivina.
//!
//! # Y no responde por su cuenta
//!
//! Esta pieza NO guarda una cache que conteste sin mirar. Su unico estado es el que
//! le pasan: el hecho de ahora. Lo que hace es ordenar lo observado para que el
//! cerebro tenga por donde empezar, con una confianza que se puede explicar: mas
//! confianza si el nodo es del mismo tipo que el ancla perdida, si comparte alguna
//! palabra con ella y si se vio mas de una vez.
//!
//! Puro: sin reloj, sin red, sin estado global, sin dependencias.

use std::fmt;

use crate::percepcion::observador::{normalizar_etiqueta, Ancla, HechoVisible, NodoVisible};
use crate::percepcion::simulador::Tipo;
use crate::percepcion::Mirada;

/// Cuantas candidatas se devuelven como maximo si no se pide otra cosa.
pub const MAX_POR_DEFECTO: usize = 3;

/// Lo que se pregunta: que ancla puede ocupar el sitio de la que se perdio.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SolicitudDeAncla {
    /// Numero de paso de la receta que se esta reparando (1..N).
    pub paso: u32,
    /// La etiqueta que ya no esta. No se propone a si misma.
    pub ancla_que_falta: Option<String>,
    /// De que tipo era, si se sabe. Solo ordena; no descarta.
    pub tipo_esperado: Option<Tipo>,
    /// Las etiquetas que otros pasos ya usan. No se proponen.
    pub en_uso: Vec<String>,
    /// ¿El paso toca? Entonces solo valen nodos tocables.
    pub requiere_tocable: bool,
    /// Tope de candidatas devueltas.
    pub max: usize,
}

impl SolicitudDeAncla {
    /// El caso normal: un paso que se toca y perdio su ancla.
    pub fn nueva(paso: u32, ancla_que_falta: impl Into<String>) -> Self {
        Self {
            paso,
            ancla_que_falta: Some(ancla_que_falta.into()),
            tipo_esperado: Some(Tipo::Boton),
            en_uso: Vec::new(),
            requiere_tocable: true,
            max: MAX_POR_DEFECTO,
        }
    }

    /// Una solicitud sin expectativa de tipo: solo lo que se ve.
    pub fn a_ciegas(paso: u32) -> Self {
        Self {
            paso,
            ancla_que_falta: None,
            tipo_esperado: None,
            en_uso: Vec::new(),
            requiere_tocable: true,
            max: MAX_POR_DEFECTO,
        }
    }

    pub fn con_tipo(mut self, tipo: Tipo) -> Self {
        self.tipo_esperado = Some(tipo);
        self
    }

    /// Anclas que otros pasos ya usan (no se vuelven a proponer).
    pub fn excluyendo(mut self, en_uso: impl IntoIterator<Item = impl Into<String>>) -> Self {
        self.en_uso = en_uso.into_iter().map(Into::into).collect();
        self
    }

    /// Un paso que NO se toca (por ejemplo la comprobacion de la postcondicion):
    /// tambien vale un texto que no se puede pulsar.
    pub fn sin_tocar(mut self) -> Self {
        self.requiere_tocable = false;
        self
    }

    pub fn con_max(mut self, max: usize) -> Self {
        self.max = max.max(1);
        self
    }

    fn falta_normalizada(&self) -> Option<String> {
        self.ancla_que_falta
            .as_deref()
            .map(normalizar_etiqueta)
            .filter(|n| !n.is_empty())
    }

    fn en_uso_normalizadas(&self) -> Vec<String> {
        self.en_uso.iter().map(|a| normalizar_etiqueta(a)).filter(|a| !a.is_empty()).collect()
    }
}

/// Una candidata: el ancla que se vio y de donde salio.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AnclaCandidata {
    /// El ancla tal y como se vio (nombre visible + tipo del nodo).
    pub ancla: Ancla,
    /// El nodo del hecho del que sale. Es la prueba de que no se invento.
    pub nodo_id: String,
    /// Cuantos nodos del hecho tienen esa misma etiqueta.
    pub veces: usize,
    /// ¿Es del mismo tipo que el ancla perdida?
    pub del_mismo_tipo: bool,
    /// Palabras en comun con la etiqueta perdida (0 si no hay o si no habia).
    pub parecido: usize,
    /// 1..=4. Se explica: tipo + parecido + repetido. No es una probabilidad.
    pub confianza: u8,
}

impl AnclaCandidata {
    pub fn nombre(&self) -> &str {
        &self.ancla.nombre_visible
    }
}

/// Por que no hay candidatas. Vacio es una respuesta, no un fallo: se nombra.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MotivoVacio {
    /// La mirada fue parcial: no se puede proponer con media pantalla.
    MiradaParcial,
    /// El hecho no trae ni un nodo.
    SinNodos,
    /// Habia nodos, pero ninguno sirve (sin nombre, ya en uso, no tocable...).
    NadaQueProponer,
}

impl MotivoVacio {
    pub fn como_str(&self) -> &'static str {
        match self {
            MotivoVacio::MiradaParcial => "mirada_parcial",
            MotivoVacio::SinNodos => "sin_nodos",
            MotivoVacio::NadaQueProponer => "nada_que_proponer",
        }
    }

    pub fn descripcion(&self) -> &'static str {
        match self {
            MotivoVacio::MiradaParcial => {
                "con media pantalla leida no se propone un ancla: se puede confundir el boton de al lado"
            }
            MotivoVacio::SinNodos => "el hecho no trae nodos: no hay nada observado de donde sacar un ancla",
            MotivoVacio::NadaQueProponer => {
                "ningun nodo observado sirve: sin nombre, ya usado por otro paso o no tocable"
            }
        }
    }
}

impl fmt::Display for MotivoVacio {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.como_str(), self.descripcion())
    }
}

/// El resultado: candidatas ordenadas y, si no hay, por que.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Candidatas {
    pub paso: u32,
    pub lista: Vec<AnclaCandidata>,
    pub motivo_vacio: Option<MotivoVacio>,
    /// Cuantos nodos del hecho se miraron (para poder decir "mire y no habia").
    pub considerados: usize,
}

impl Candidatas {
    fn vacia(paso: u32, motivo: MotivoVacio, considerados: usize) -> Self {
        Self { paso, lista: Vec::new(), motivo_vacio: Some(motivo), considerados }
    }

    pub fn es_vacia(&self) -> bool {
        self.lista.is_empty()
    }

    pub fn nombres(&self) -> Vec<String> {
        self.lista.iter().map(|c| c.ancla.nombre_visible.clone()).collect()
    }

    /// La primera candidata: lo que la regla propondria sin juicio.
    pub fn primera(&self) -> Option<&AnclaCandidata> {
        self.lista.first()
    }
}

// ---------------------------------------------------------------------------
// utilidades de comparacion
// ---------------------------------------------------------------------------

fn palabras(v: &str) -> Vec<String> {
    normalizar_etiqueta(v)
        .split(|c: char| !c.is_alphanumeric())
        .filter(|p| p.chars().count() > 1)
        .map(|p| p.to_string())
        .collect()
}

/// Palabras en comun entre dos etiquetas. Es una forma de ORDENAR, no de entender.
fn parecido(antes: Option<&str>, ahora: &str) -> usize {
    let antes = match antes {
        Some(a) if !a.trim().is_empty() => palabras(a),
        _ => return 0,
    };
    let despues = palabras(ahora);
    antes.iter().filter(|p| despues.iter().any(|d| d == *p)).count()
}

fn confianza(del_mismo_tipo: bool, parecido: usize, veces: usize) -> u8 {
    let mut c: u8 = 1;
    if del_mismo_tipo {
        c += 1;
    }
    if parecido > 0 {
        c += 1;
    }
    if veces > 1 {
        c += 1;
    }
    c.min(4)
}

// ---------------------------------------------------------------------------
// la pieza
// ---------------------------------------------------------------------------

/// ¿Este ancla esta de verdad en el hecho? Es la comprobacion que hace imposible
/// colar una candidata inventada: se compara el nombre normalizado con los nodos
/// nombrados del hecho.
pub fn es_del_hecho(ancla: &Ancla, hecho: &HechoVisible) -> bool {
    let buscada = ancla.normalizada();
    if buscada.is_empty() {
        return false;
    }
    hecho.nodos.iter().any(|n| {
        n.ancla
            .as_deref()
            .map(normalizar_etiqueta)
            .map(|v| v == buscada)
            .unwrap_or(false)
    })
}

/// Propone anclas candidatas para un paso, SACADAS de lo observado.
///
/// Devuelve siempre un `Candidatas`: si no hay nada que proponer, `lista` vacia y
/// `motivo_vacio` diciendo por que. Nunca rellena con una etiqueta que no se vio.
pub fn candidatas(hecho: &HechoVisible, solicitud: &SolicitudDeAncla) -> Candidatas {
    // 1 · una mirada parcial no propone: elegir entre lo que entro por casualidad
    //     es peor que no elegir.
    if hecho.mirada == Mirada::Parcial {
        return Candidatas::vacia(solicitud.paso, MotivoVacio::MiradaParcial, 0);
    }
    if hecho.nodos.is_empty() {
        return Candidatas::vacia(solicitud.paso, MotivoVacio::SinNodos, 0);
    }

    let falta = solicitud.falta_normalizada();
    let en_uso = solicitud.en_uso_normalizadas();

    // 2 · solo nodos con nombre visible, no usados, no la que falta, y tocables si
    //     el paso toca. Se agrupan por etiqueta: dos nodos con el mismo nombre son
    //     la misma ancla vista dos veces.
    let mut vistos: Vec<(String, AnclaCandidata)> = Vec::new();
    for nodo in &hecho.nodos {
        let Some(nombre) = nodo_nombrado(nodo) else { continue };
        let normalizado = normalizar_etiqueta(nombre);
        if normalizado.is_empty() {
            continue;
        }
        if let Some(f) = falta.as_deref() {
            if normalizado == f {
                continue;
            }
        }
        if en_uso.iter().any(|u| u == &normalizado) {
            continue;
        }
        if solicitud.requiere_tocable && !nodo.tocable {
            continue;
        }

        let del_mismo_tipo = solicitud.tipo_esperado.map(|t| t == nodo.tipo).unwrap_or(false);
        let parecido_n = parecido(solicitud.ancla_que_falta.as_deref(), nombre);

        match vistos.iter_mut().find(|(n, _)| n == &normalizado) {
            Some((_, existente)) => {
                existente.veces += 1;
                existente.del_mismo_tipo = existente.del_mismo_tipo || del_mismo_tipo;
                existente.confianza = confianza(existente.del_mismo_tipo, existente.parecido, existente.veces);
            }
            None => {
                vistos.push((
                    normalizado,
                    AnclaCandidata {
                        ancla: Ancla::nueva(nombre, nodo.tipo),
                        nodo_id: nodo.id.clone(),
                        veces: 1,
                        del_mismo_tipo,
                        parecido: parecido_n,
                        confianza: confianza(del_mismo_tipo, parecido_n, 1),
                    },
                ));
            }
        }
    }

    let considerados = hecho.nodos.len();
    if vistos.is_empty() {
        return Candidatas::vacia(solicitud.paso, MotivoVacio::NadaQueProponer, considerados);
    }

    // 3 · orden explicable y determinista: lo que se parece a lo perdido, luego lo
    //     del mismo tipo, luego lo que mas se vio, y a igualdad el nombre (para que
    //     dos ejecuciones den el mismo orden).
    let mut lista: Vec<AnclaCandidata> = vistos.into_iter().map(|(_, c)| c).collect();
    lista.sort_by(|a, b| {
        b.parecido
            .cmp(&a.parecido)
            .then(b.del_mismo_tipo.cmp(&a.del_mismo_tipo))
            .then(b.veces.cmp(&a.veces))
            .then(a.ancla.nombre_visible.cmp(&b.ancla.nombre_visible))
    });
    lista.truncate(solicitud.max.max(1));

    Candidatas { paso: solicitud.paso, lista, motivo_vacio: None, considerados }
}

/// El nombre visible de un nodo, si lo tiene. Un nodo sin nombre no es un ancla.
fn nodo_nombrado(nodo: &NodoVisible) -> Option<&str> {
    nodo.ancla.as_deref().map(str::trim).filter(|v| !v.is_empty())
}
