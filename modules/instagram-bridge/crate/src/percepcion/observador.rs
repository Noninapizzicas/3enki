//! A1 · ObservadorDeEstado · PUENTE del aparato.
//!
//! Mira el estado visible —que hay, con que nombre, en que caja y si se puede
//! tocar— y lo entrega como `HechoVisible` fechado y sellado. No interpreta: no
//! dice "parece el boton de publicar", dice "hay un elemento con este nombre
//! visible en esta posicion". Lo que decide es A2, A3 y A5; A1 solo mira.
//!
//! # La regla dura: sin mirada nueva NO SE RELLENA CON LA MIRADA ANTERIOR
//!
//! Es la primera tentacion comoda del sistema: "no pude mirar, uso lo de antes".
//! Asi se publica en la cuenta equivocada, porque "lo de antes" era otra
//! pantalla. Por eso:
//!
//! ```text
//! mirar() sin poder mirar  -> Vista::Desconocido(motivo)   (se nombra)
//! hay(ancla) sin mirada    -> Presencia::Desconocido       (no el Presente viejo)
//! ```
//!
//! El observador guarda la ultima vista para poder contarla (`ultima_vista()`),
//! pero **no la usa para contestar**: `hay()` mira el estado actual y, si es
//! `Desconocido`, contesta `Desconocido`. Un ancla no se sabe porque se viera
//! mil veces antes.
//!
//! # La segunda regla: una mirada parcial no afirma ausencias
//!
//! Con media pantalla leida se puede afirmar lo que SE VE (`Presente`), pero no
//! lo que no: que un ancla no aparezca en una mirada parcial es `Desconocido`,
//! nunca `Ausente`. Y una foto parcial que no dice POR QUE es parcial no entra:
//! se devuelve `Desconocido`, porque una laguna sin motivo es una opinion.
//!
//! Puro por dentro: no lee el reloj (`momento` entra por argumento), no habla
//! por red y no tiene estado global. La fuente del arbol se inyecta por
//! parametro (`FuenteDeArbol`): en produccion, el puente de accesibilidad; en
//! los tests, el `Simulador`.

use std::fmt;

use super::simulador::{Arbol, Caja, Nodo, Pantalla, Tipo};
use super::{Mirada, SinMirada};

/// La plataforma de la que se leen hechos. Hoy solo hay una declarada.
pub const PLATAFORMA: &str = "instagram";

// ---------------------------------------------------------------------------
// El ambito (P1: el hecho nace sellado)
// ---------------------------------------------------------------------------

/// De quien es la pantalla que se mira: proyecto, cuenta y plataforma.
///
/// Es el `SelloDeCuenta` de `core/formas.js`. Sin los tres, un hecho no se puede
/// atribuir a nadie y no entra en ningun almacen: `mirar()` devuelve
/// `Desconocido(AmbitoIncompleto)` en vez de un hecho huerfano.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SelloDeCuenta {
    pub proyecto: String,
    pub cuenta: String,
    pub plataforma: String,
}

impl SelloDeCuenta {
    pub fn nuevo(proyecto: impl Into<String>, cuenta: impl Into<String>) -> Self {
        Self {
            proyecto: proyecto.into(),
            cuenta: cuenta.into(),
            plataforma: PLATAFORMA.to_string(),
        }
    }

    pub fn con_plataforma(mut self, plataforma: impl Into<String>) -> Self {
        self.plataforma = plataforma.into();
        self
    }

    /// ¿Se puede sellar con esto? Los campos en blanco no valen.
    pub fn completo(&self) -> bool {
        !self.proyecto.trim().is_empty()
            && !self.cuenta.trim().is_empty()
            && !self.plataforma.trim().is_empty()
    }
}

// ---------------------------------------------------------------------------
// El ancla y la etiqueta
// ---------------------------------------------------------------------------

/// El ancla por la que se pregunta: el nombre visible y de que tipo es.
///
/// Espejo de `Ancla` en `core/formas.js` (`nombre_visible`, `tipo`). Solo se
/// compara el NOMBRE: un boton y un texto con la misma etiqueta son el mismo
/// nombre visible, y A4.3 tampoco distingue. El tipo se conserva para el
/// informe y para A3, no para descartar coincidencias.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ancla {
    pub nombre_visible: String,
    pub tipo: Tipo,
}

impl Ancla {
    pub fn nueva(nombre_visible: impl Into<String>, tipo: Tipo) -> Self {
        Self { nombre_visible: nombre_visible.into(), tipo }
    }

    pub fn boton(nombre_visible: impl Into<String>) -> Self {
        Self::nueva(nombre_visible, Tipo::Boton)
    }

    pub fn normalizada(&self) -> String {
        normalizar_etiqueta(&self.nombre_visible)
    }
}

fn sin_tilde(c: char) -> char {
    match c {
        'a' => 'a',
        'e' => 'e',
        'i' => 'i',
        'o' => 'o',
        'u' => 'u',
        'n' => 'n',
        'c' => 'c',
        // Vocales acentuadas y dieresis del castellano. No se intenta transliterar
        // alfabetos enteros: se quita lo que hace que dos etiquetas iguales para
        // una persona no lo sean para el programa.
        'á' | 'à' | 'ä' | 'â' | 'ã' => 'a',
        'é' | 'è' | 'ë' | 'ê' => 'e',
        'í' | 'ì' | 'ï' | 'î' => 'i',
        'ó' | 'ò' | 'ö' | 'ô' | 'õ' => 'o',
        'ú' | 'ù' | 'ü' | 'û' => 'u',
        'ñ' => 'n',
        'ç' => 'c',
        otro => otro,
    }
}

/// Etiqueta comparable: minusculas, sin tildes y con los espacios colapsados.
///
/// Es cosmetico a proposito: no quita palabras ni intenta "entender" el texto.
/// Un ensayo que adivina etiquetas es un ensayo que miente, y este es el mismo
/// criterio que usa `normalizar_etiqueta` en `recetas/ensayo.js`: si los dos
/// lados normalizan distinto, el cerebro y el aparato no se ponen de acuerdo.
pub fn normalizar_etiqueta(v: &str) -> String {
    let mut salida = String::with_capacity(v.len());
    let mut pendiente_espacio = false;

    for original in v.chars() {
        let ch = original.to_lowercase().next().unwrap_or(original);
        if ch.is_whitespace() {
            pendiente_espacio = !salida.is_empty();
            continue;
        }
        if pendiente_espacio {
            salida.push(' ');
            pendiente_espacio = false;
        }
        salida.push(sin_tilde(ch));
    }

    salida
}

// ---------------------------------------------------------------------------
// El hecho visible
// ---------------------------------------------------------------------------

/// Un nodo tal y como se vio, aplanado (con su padre y su profundidad).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodoVisible {
    pub id: String,
    pub padre: Option<String>,
    pub profundidad: usize,
    /// El nombre visible efectivo: el texto y, si no hay, la descripcion.
    pub ancla: Option<String>,
    pub texto: Option<String>,
    pub tipo: Tipo,
    pub caja: Caja,
    pub tocable: bool,
}

impl NodoVisible {
    /// ¿Este nodo es el ancla? Se compara el nombre normalizado.
    pub fn coincide(&self, ancla: &Ancla) -> bool {
        match self.ancla.as_deref() {
            Some(nombre) => normalizar_etiqueta(nombre) == ancla.normalizada(),
            None => false,
        }
    }

    /// Centro de la caja: el punto que A3 tocaria. `None` si la caja esta vacia
    /// (un nodo sin sitio no se puede tocar, y decirlo es mas util que tocar 0,0).
    pub fn punto_de_toque(&self) -> Option<(i32, i32)> {
        if self.caja.esta_vacia() {
            None
        } else {
            Some(self.caja.centro())
        }
    }
}

/// Lo que el aparato vio, FECHADO (`momento`) y SELLADO (`sello`).
///
/// Es el `HechoVisible` de `core/formas.js`, reducido a lo que la mano necesita:
/// la pantalla, la cuenta visible, como de entera fue la mirada, por que no lo
/// fue si fue parcial, y los nodos que de verdad se veian.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HechoVisible {
    pub sello: SelloDeCuenta,
    /// Instante de la mirada. Lo trae quien invoca: el reloj es un puerto, no un
    /// `SystemTime::now()` escondido aqui.
    pub momento: u64,
    pub pantalla: Pantalla,
    pub plataforma: String,
    pub mirada: Mirada,
    pub motivo_sin_mirada: Option<String>,
    pub cuenta_visible: Option<String>,
    /// Version del arbol del que salio esta foto (sube con cada mutacion).
    pub version_del_arbol: u64,
    pub nodos: Vec<NodoVisible>,
}

impl HechoVisible {
    pub fn nodo(&self, id: &str) -> Option<&NodoVisible> {
        self.nodos.iter().find(|n| n.id == id)
    }

    pub fn tocables(&self) -> Vec<&NodoVisible> {
        self.nodos.iter().filter(|n| n.tocable).collect()
    }

    /// Presencia BRUTA de un ancla dentro de este hecho. No dice `Desconocido`
    /// por mirada parcial: eso lo decide `Observador::hay`, que es quien tiene
    /// el estado. Aqui solo se responde "esta o no esta en esta foto".
    pub fn contiene(&self, ancla: &Ancla) -> bool {
        self.nodos.iter().any(|n| n.coincide(ancla))
    }

    /// El nodo que coincide con el ancla, si lo hay.
    ///
    /// O1 lo necesita para que `Ocurrio` lleve PRUEBA (`nodo_id`), no un simple
    /// booleano: "se vio" sin decir donde ni en que foto no es una prueba.
    pub fn nodo_que_coincide(&self, ancla: &Ancla) -> Option<&NodoVisible> {
        self.nodos.iter().find(|n| n.coincide(ancla))
    }

    /// Un hecho es utilizable por A3/O1 si se puede afirmar algo con el.
    pub fn es_completo(&self) -> bool {
        self.mirada == Mirada::Completa
    }
}

// ---------------------------------------------------------------------------
// Desconocido, Vista, Presencia
// ---------------------------------------------------------------------------

/// El estado DESCONOCIDO, siempre NOMBRADO. No hay un "desconocido generico":
/// cada caso dice que falta para poder afirmar algo.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Desconocido {
    /// Todavia no se ha mirado nada.
    NuncaSeMiro,
    /// Se intento mirar y no se pudo, por este motivo.
    NoSePudoMirar(SinMirada),
    /// La foto es parcial: lo que no aparece NO se puede dar por ausente.
    MiradaParcial,
    /// La foto es parcial y no dice por que: una laguna sin motivo no es un hecho.
    MiradaParcialSinMotivo,
    /// No se sabe de quien es la pantalla (proyecto, cuenta o plataforma en blanco).
    AmbitoIncompleto,
    /// Se pregunto por un ancla sin nombre: no hay nada que buscar.
    AnclaSinNombre,
}

impl Desconocido {
    /// Nombre estable y sin tildes, para payloads y logs.
    pub fn como_str(&self) -> &'static str {
        match self {
            Desconocido::NuncaSeMiro => "nunca_se_miro",
            Desconocido::NoSePudoMirar(motivo) => motivo.como_str(),
            Desconocido::MiradaParcial => "mirada_parcial",
            Desconocido::MiradaParcialSinMotivo => "mirada_parcial_sin_motivo",
            Desconocido::AmbitoIncompleto => "ambito_incompleto",
            Desconocido::AnclaSinNombre => "ancla_sin_nombre",
        }
    }

    /// Frase para una persona.
    pub fn descripcion(&self) -> &'static str {
        match self {
            Desconocido::NuncaSeMiro => "todavia no se ha mirado la pantalla",
            Desconocido::NoSePudoMirar(motivo) => motivo.descripcion(),
            Desconocido::MiradaParcial => {
                "la mirada fue parcial: se puede afirmar lo que se vio, no lo que no"
            }
            Desconocido::MiradaParcialSinMotivo => {
                "la mirada fue parcial y no dice por que: no se puede usar"
            }
            Desconocido::AmbitoIncompleto => {
                "no se sabe de quien es la pantalla: falta proyecto, cuenta o plataforma"
            }
            Desconocido::AnclaSinNombre => "el ancla no tiene nombre visible que buscar",
        }
    }
}

impl fmt::Display for Desconocido {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.como_str(), self.descripcion())
    }
}

/// El resultado de mirar: o un hecho, o el motivo por el que no lo hay.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Vista {
    Observado(HechoVisible),
    Desconocido(Desconocido),
}

impl Vista {
    pub fn observado(&self) -> bool {
        matches!(self, Vista::Observado(_))
    }

    pub fn hecho(&self) -> Option<&HechoVisible> {
        match self {
            Vista::Observado(h) => Some(h),
            Vista::Desconocido(_) => None,
        }
    }

    pub fn motivo(&self) -> Option<&Desconocido> {
        match self {
            Vista::Observado(_) => None,
            Vista::Desconocido(d) => Some(d),
        }
    }

    /// `observado` o `desconocido`: lo que viaja en el payload.
    pub fn como_str(&self) -> &'static str {
        match self {
            Vista::Observado(_) => "observado",
            Vista::Desconocido(_) => "desconocido",
        }
    }
}

/// La respuesta a "¿esta el ancla?": tres salidas, y la de no saber se nombra.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Presencia {
    Presente,
    Ausente,
    Desconocido(Desconocido),
}

impl Presencia {
    pub fn como_str(&self) -> &'static str {
        match self {
            Presencia::Presente => "presente",
            Presencia::Ausente => "ausente",
            Presencia::Desconocido(_) => "desconocido",
        }
    }

    pub fn es_presente(&self) -> bool {
        matches!(self, Presencia::Presente)
    }
}

impl fmt::Display for Presencia {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Presencia::Desconocido(d) => write!(f, "desconocido ({})", d),
            otra => f.write_str(otra.como_str()),
        }
    }
}

// ---------------------------------------------------------------------------
// El puerto: de donde salen los arboles
// ---------------------------------------------------------------------------

/// La fuente del arbol, inyectada. En produccion la implementa el puente de
/// accesibilidad (Kotlin -> JNI); en los tests, el `Simulador`.
///
/// Devolver `Err(SinMirada)` es el camino normal cuando no se puede mirar: no es
/// un fallo del sistema, es el estado del aparato, y se nombra.
pub trait FuenteDeArbol {
    fn leer(&self) -> Result<Arbol, SinMirada>;
}

/// Un arbol ya tomado tambien es una fuente: sirve para probar una foto fija.
impl FuenteDeArbol for Arbol {
    fn leer(&self) -> Result<Arbol, SinMirada> {
        Ok(self.clone())
    }
}

// ---------------------------------------------------------------------------
// A1 · ObservadorDeEstado
// ---------------------------------------------------------------------------

/// La clase A1. Guarda UNA cosa: el estado de la ultima mirada (hecho o motivo).
pub struct Observador {
    estado: Vista,
    miradas: u64,
}

impl Default for Observador {
    fn default() -> Self {
        Self::nuevo()
    }
}

impl Observador {
    pub fn nuevo() -> Self {
        Self {
            estado: Vista::Desconocido(Desconocido::NuncaSeMiro),
            miradas: 0,
        }
    }

    /// MIRAR: lee el arbol por el puerto y lo convierte en hecho, o en el motivo
    /// por el que no hay hecho.
    ///
    /// Cada llamada SUSTITUYE el estado. No hay camino en el que un fallo de
    /// lectura deje el hecho anterior como si fuera actual.
    pub fn mirar<F: FuenteDeArbol + ?Sized>(
        &mut self,
        fuente: &F,
        ambito: &SelloDeCuenta,
        momento: u64,
    ) -> Vista {
        self.miradas += 1;
        self.estado = Self::leer(fuente, ambito, momento);
        self.estado.clone()
    }

    fn leer<F: FuenteDeArbol + ?Sized>(
        fuente: &F,
        ambito: &SelloDeCuenta,
        momento: u64,
    ) -> Vista {
        if !ambito.completo() {
            return Vista::Desconocido(Desconocido::AmbitoIncompleto);
        }
        match fuente.leer() {
            Ok(arbol) => Self::proyectar(arbol, ambito, momento),
            Err(motivo) => Vista::Desconocido(Desconocido::NoSePudoMirar(motivo)),
        }
    }

    /// Proyeccion arbol -> hecho. No rellena: si la foto no sirve, lo dice.
    fn proyectar(arbol: Arbol, ambito: &SelloDeCuenta, momento: u64) -> Vista {
        // Un arbol sin hijos no es "una pantalla en blanco": es que no se esta
        // leyendo. Se trata como no-mirada, por el lado seguro.
        if arbol.raiz.hijos.is_empty() {
            return Vista::Desconocido(Desconocido::NoSePudoMirar(SinMirada::ArbolVacio));
        }

        // Una mirada parcial tiene que decir por que. Sin motivo no es un hecho.
        if arbol.mirada == Mirada::Parcial {
            let motivo = arbol.motivo_sin_mirada.as_deref().map(str::trim).unwrap_or("");
            if motivo.is_empty() {
                return Vista::Desconocido(Desconocido::MiradaParcialSinMotivo);
            }
        }

        let mut nodos = Vec::new();
        for hijo in &arbol.raiz.hijos {
            // Lo que no se ve no es un hecho: ni el nodo ni su subarbol.
            hijo.recorrer_visibles(None, 1, &mut |nodo: &Nodo, padre: Option<&str>, profundidad| {
                nodos.push(NodoVisible {
                    id: nodo.id.clone(),
                    padre: padre.map(str::to_string),
                    profundidad,
                    ancla: nodo.ancla().map(str::to_string),
                    texto: nodo.texto.clone(),
                    tipo: nodo.tipo,
                    caja: nodo.caja,
                    tocable: nodo.tocable,
                });
            });
        }

        if nodos.is_empty() {
            // El arbol traia nodos, pero todos invisibles: lo mismo que no ver nada.
            return Vista::Desconocido(Desconocido::NoSePudoMirar(SinMirada::ArbolVacio));
        }

        Vista::Observado(HechoVisible {
            sello: ambito.clone(),
            momento,
            pantalla: arbol.pantalla,
            plataforma: ambito.plataforma.clone(),
            mirada: arbol.mirada,
            motivo_sin_mirada: arbol.motivo_sin_mirada.clone(),
            cuenta_visible: arbol.cuenta_visible.clone(),
            version_del_arbol: arbol.version,
            nodos,
        })
    }

    /// La ultima vista, para contarla o para el informe. NO es el estado actual
    /// si el ultimo intento fallo: en ese caso es `Desconocido` y lo dice.
    pub fn ultima_vista(&self) -> &Vista {
        &self.estado
    }

    /// Cuantas veces se intento mirar (con exito o sin el).
    pub fn miradas(&self) -> u64 {
        self.miradas
    }

    /// HAY: ¿esta el ancla AHORA?
    ///
    ///   Presente               — se vio un nodo con ese nombre visible.
    ///   Ausente                — mirada completa y no estaba.
    ///   Desconocido(motivo)    — no hay mirada, es parcial, o el ancla no tiene nombre.
    ///
    /// Con mirada parcial la ausencia NO se afirma: se vio media pantalla.
    pub fn hay(&self, ancla: &Ancla) -> Presencia {
        if ancla.nombre_visible.trim().is_empty() {
            return Presencia::Desconocido(Desconocido::AnclaSinNombre);
        }

        match &self.estado {
            Vista::Desconocido(motivo) => Presencia::Desconocido(motivo.clone()),
            Vista::Observado(hecho) => {
                if hecho.contiene(ancla) {
                    return Presencia::Presente;
                }
                if hecho.mirada == Mirada::Parcial {
                    Presencia::Desconocido(Desconocido::MiradaParcial)
                } else {
                    Presencia::Ausente
                }
            }
        }
    }

    /// Los elementos visibles de la ultima mirada. Sin mirada, `Err` con el motivo.
    pub fn elementos_visibles(&self) -> Result<&[NodoVisible], Desconocido> {
        match &self.estado {
            Vista::Observado(hecho) => Ok(&hecho.nodos),
            Vista::Desconocido(motivo) => Err(motivo.clone()),
        }
    }

    /// MIRAR ANTES Y DESPUES: rodea una operacion con dos miradas frescas.
    ///
    /// Regla: si la mirada de antes no se pudo tomar, **la operacion NO se
    /// ejecuta**. Operar sin saber donde estas es exactamente lo que este par de
    /// miradas existe para evitar; `se_opero: false` y `despues: None` lo dicen
    /// sin disimulo.
    pub fn mirar_antes_y_despues<F, O>(
        &mut self,
        fuente: &F,
        ambito: &SelloDeCuenta,
        momento_antes: u64,
        momento_despues: u64,
        operacion: O,
    ) -> ParDeMiradas
    where
        F: FuenteDeArbol + ?Sized,
        O: FnOnce(),
    {
        let antes = self.mirar(fuente, ambito, momento_antes);
        if !antes.observado() {
            return ParDeMiradas { antes, despues: None, se_opero: false };
        }

        operacion();

        let despues = self.mirar(fuente, ambito, momento_despues);
        ParDeMiradas { antes, despues: Some(despues), se_opero: true }
    }
}

/// Las dos miradas alrededor de una operacion. `despues` es `None` cuando no se
/// opero: no hay "despues" de algo que no paso.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParDeMiradas {
    pub antes: Vista,
    pub despues: Option<Vista>,
    pub se_opero: bool,
}
