//! `paso` — UN paso suelto del aparato, pedido desde el bus (bloque 19d).
//!
//! # Que resuelve
//!
//! Para grabar la receta de `publicar` hace falta descubrir el flujo REAL de
//! Instagram: que se toca, en que orden, que aparece despues. Eso no se puede
//! escribir desde el servidor adivinando `view_id`s. Este modulo es el
//! vocabulario de cuatro pasos sueltos con los que se pilota el movil de uno en
//! uno, comprobando cada uno con una mirada nueva:
//!
//! ```text
//! tocar    {"tipo":"tocar","ancla":{"view_id":"action_bar_left_button"}}
//!          {"tipo":"tocar","ancla":{"texto":"Crear"}}
//!          {"tipo":"tocar","ancla":{"desc":"Crear"}}
//! escribir {"tipo":"escribir","texto":"hola"}
//! esperar  {"tipo":"esperar","ms":800}
//! atras    {"tipo":"atras"}
//! ```
//!
//! Son CUATRO y no hay mas en este bloque. Una receta tiene cinco acciones
//! (`tocar`, `escribir`, `desplazar`, `esperar` y la navegacion de A5); esto es
//! otra cosa: el vocabulario minimo para MOVER el aparato a mano y mirar que
//! pasa. `desplazar` llegara cuando alguien lo necesite de verdad, y entonces se
//! añade aqui y en `Gestos.kt` con su prueba.
//!
//! # Las tres reglas de este fichero
//!
//! 1. **Un ancla que no se ve NO se sustituye.** Ni por el nodo mas parecido ni
//!    por el padre "que seguro que recibe el toque". Si no esta: `ancla_no_encontrada`
//!    con el ancla dentro. Si esta dos veces: `ancla_ambigua` **con cuantos**, y
//!    no se elige uno al azar (Instagram repite `image_button` diez veces; elegir
//!    el primero es tocar el que no era).
//! 2. **El que decide es el crate; el aparato solo obedece.** Aqui se resuelve el
//!    ancla sobre la foto del aparato y sale un `Objetivo` con id y punto (el
//!    centro de la caja). `Gestos.kt` no busca anclas: recibe donde tocar.
//! 3. **Escribir va al campo ENFOCADO, y si no hay, se dice.** El paso `escribir`
//!    NO lleva ancla a proposito: si el que teclea elige el campo, dos pasos con
//!    el mismo payload escriben en sitios distintos. Quien sabe que campo tiene el
//!    foco es el aparato (`campo_no_enfocado`), no este modulo.
//!
//! # Lo que NO hace
//!
//!   - **No mira.** La foto entra por argumento (`Arbol`). Mirar es de A1 y de la
//!     mano; resolver un ancla sobre una foto vieja es exactamente el fallo que
//!     `mano::ejecutor` documenta con su regla de la foto repetida.
//!   - **No encadena.** Un paso por orden: quien quiera el siguiente manda otra
//!     orden. Es la regla del bloque ("un solo paso por orden") y la razon es que
//!     entre paso y paso TIENE que haber una mirada nueva.
//!   - **No publica.** Ninguno de los cuatro pasos sabe lo que es un post. La
//!     receta que los encadene (bloque siguiente) es la que declara el paso
//!     irreversible y su comprobacion.
//!   - **No decide si se puede.** Ritmo, autonomia y ventana son del cerebro. El
//!     veto de `simulacion` es del bucle (`bucle::atender`), no de aqui.
//!
//! Solo `std`: esto se prueba en escritorio con `cargo test`, sin movil.

use std::fmt;

use super::json::{self, Valor};
use crate::mano::ejecutor::Objetivo;
use crate::percepcion::observador::normalizar_etiqueta;
use crate::percepcion::simulador::{Arbol, Nodo, LIMITE_DE_NODOS};
use crate::percepcion::Mirada;

/// Los cuatro tipos de paso de este bloque, en el orden del catalogo.
pub const TIPOS: [&str; 4] = ["tocar", "escribir", "esperar", "atras"];

/// Las tres pistas con las que se puede nombrar un ancla.
pub const PISTAS: [&str; 3] = ["view_id", "texto", "desc"];

// ---------------------------------------------------------------------------
// El ancla
// ---------------------------------------------------------------------------

/// Como se nombra el nodo que se quiere tocar.
///
/// Tres variantes porque son las tres cosas que un volcado declara de un nodo:
/// su identidad de Android (`view_id`), el texto que se lee y la descripcion de
/// accesibilidad. **Una sola por paso**: dos pistas a la vez son dos anclas y
/// nadie ha dicho cual manda, asi que se rechazan en vez de elegir.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AnclaDePaso {
    /// `view_id` de Android: completo (`com.instagram.android:id/crear`) o su
    /// ultima pieza (`crear`).
    ViewId(String),
    /// El texto visible del nodo.
    Texto(String),
    /// La descripcion de accesibilidad (`contentDescription`).
    Desc(String),
}

impl AnclaDePaso {
    /// La pista y su valor, para un `detalle` que se pueda leer.
    pub fn descripcion(&self) -> String {
        match self {
            AnclaDePaso::ViewId(v) => format!("view_id '{v}'"),
            AnclaDePaso::Texto(t) => format!("texto '{t}'"),
            AnclaDePaso::Desc(d) => format!("desc '{d}'"),
        }
    }

    pub fn pista(&self) -> &'static str {
        match self {
            AnclaDePaso::ViewId(_) => "view_id",
            AnclaDePaso::Texto(_) => "texto",
            AnclaDePaso::Desc(_) => "desc",
        }
    }

    pub fn valor(&self) -> &str {
        match self {
            AnclaDePaso::ViewId(v) | AnclaDePaso::Texto(v) | AnclaDePaso::Desc(v) => v,
        }
    }

    /// Lee el objeto `ancla` del payload.
    fn desde_valor(valor: &Valor) -> Result<AnclaDePaso, FalloDePaso> {
        if !matches!(valor, Valor::Objeto(_)) {
            return Err(FalloDePaso::CampoDeTipoEquivocado {
                campo: "ancla",
                esperaba: "objeto",
                llego: valor.tipo(),
            });
        }

        let mut pistas: Vec<AnclaDePaso> = Vec::with_capacity(1);
        for pista in PISTAS {
            match valor.obtener(pista) {
                None | Some(Valor::Nulo) => {}
                Some(Valor::Texto(t)) if t.trim().is_empty() => {
                    return Err(FalloDePaso::AnclaInvalida {
                        motivo: format!("la pista '{pista}' del ancla esta en blanco"),
                    })
                }
                Some(Valor::Texto(t)) => {
                    let limpio = t.trim().to_string();
                    pistas.push(match pista {
                        "view_id" => AnclaDePaso::ViewId(limpio),
                        "texto" => AnclaDePaso::Texto(limpio),
                        _ => AnclaDePaso::Desc(limpio),
                    });
                }
                Some(otro) => {
                    return Err(FalloDePaso::CampoDeTipoEquivocado {
                        campo: "ancla",
                        esperaba: "texto en cada pista",
                        llego: otro.tipo(),
                    })
                }
            }
        }

        match pistas.len() {
            0 => Err(FalloDePaso::AnclaInvalida {
                motivo: "el ancla no trae ninguna de las tres pistas (view_id, texto, desc)".to_string(),
            }),
            1 => Ok(pistas.remove(0)),
            cuantas => Err(FalloDePaso::AnclaInvalida {
                motivo: format!(
                    "el ancla trae {cuantas} pistas a la vez: no se elige cual manda, se manda una"
                ),
            }),
        }
    }
}

// ---------------------------------------------------------------------------
// El paso
// ---------------------------------------------------------------------------

/// Un paso ya validado. Las cuatro formas son las cuatro del catalogo y ninguna
/// lleva datos opcionales: si existe un `Paso`, se puede ejecutar tal cual.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Paso {
    Tocar { ancla: AnclaDePaso },
    /// El texto va al campo que tenga el FOCO (el aparato dira si no hay).
    Escribir { texto: String },
    Esperar { ms: u64 },
    Atras,
}

impl Paso {
    /// Lee el objeto `paso` del payload de la orden.
    ///
    /// Cada tipo exige SUS campos y rechaza el `ancla` donde no significa nada
    /// (escribir, esperar, atras): un ancla ahi no es un dato de mas, es que el
    /// emisor cree estar pidiendo otra cosa.
    pub fn desde_valor(valor: &Valor) -> Result<Paso, FalloDePaso> {
        if !matches!(valor, Valor::Objeto(_)) {
            return Err(FalloDePaso::NoEsObjeto { tipo: valor.tipo() });
        }

        let tipo = match valor.obtener("tipo") {
            Some(Valor::Texto(t)) if !t.trim().is_empty() => t.trim().to_ascii_lowercase(),
            None | Some(Valor::Nulo) => return Err(FalloDePaso::SinTipo),
            Some(Valor::Texto(_)) => return Err(FalloDePaso::SinTipo),
            Some(otro) => {
                return Err(FalloDePaso::CampoDeTipoEquivocado {
                    campo: "tipo",
                    esperaba: "texto",
                    llego: otro.tipo(),
                })
            }
        };

        let ancla = match valor.obtener("ancla") {
            None | Some(Valor::Nulo) => None,
            Some(objeto) => Some(AnclaDePaso::desde_valor(objeto)?),
        };

        match tipo.as_str() {
            "tocar" => match ancla {
                Some(ancla) => Ok(Paso::Tocar { ancla }),
                None => Err(FalloDePaso::SinAncla { tipo }),
            },
            "escribir" => {
                if ancla.is_some() {
                    return Err(FalloDePaso::AnclaSobrante { tipo });
                }
                match texto_de(valor, "texto")? {
                    Some(texto) => Ok(Paso::Escribir { texto }),
                    None => Err(FalloDePaso::SinTexto),
                }
            }
            "esperar" => {
                if ancla.is_some() {
                    return Err(FalloDePaso::AnclaSobrante { tipo });
                }
                match valor.obtener("ms") {
                    Some(Valor::Numero(n)) if *n > 0.0 && n.fract() == 0.0 => {
                        Ok(Paso::Esperar { ms: *n as u64 })
                    }
                    Some(Valor::Numero(n)) => Err(FalloDePaso::EsperaInvalida { valor: n.to_string() }),
                    Some(otro) => Err(FalloDePaso::CampoDeTipoEquivocado {
                        campo: "ms",
                        esperaba: "numero entero de milisegundos",
                        llego: otro.tipo(),
                    }),
                    None => Err(FalloDePaso::EsperaInvalida { valor: "ausente".to_string() }),
                }
            }
            "atras" => {
                if ancla.is_some() {
                    return Err(FalloDePaso::AnclaSobrante { tipo });
                }
                Ok(Paso::Atras)
            }
            otro => Err(FalloDePaso::TipoFueraDelCatalogo { tipo: otro.to_string() }),
        }
    }

    /// El nombre del tipo, para payloads y logs.
    pub fn como_str(&self) -> &'static str {
        match self {
            Paso::Tocar { .. } => "tocar",
            Paso::Escribir { .. } => "escribir",
            Paso::Esperar { .. } => "esperar",
            Paso::Atras => "atras",
        }
    }

    /// ¿Este paso puede cambiar el mundo?
    ///
    /// `esperar` no: el reloj corre y nada mas. Es el unico que se puede repetir
    /// sin miedo, y por eso se distingue aqui.
    pub fn puede_cambiar_el_mundo(&self) -> bool {
        !matches!(self, Paso::Esperar { .. })
    }

    /// Una frase que dice QUE se pidio, sin volcar el texto entero.
    pub fn describe(&self) -> String {
        match self {
            Paso::Tocar { ancla } => format!("tocar {}", ancla.descripcion()),
            Paso::Escribir { texto } => {
                format!("escribir {} caracteres en el campo enfocado", texto.chars().count())
            }
            Paso::Esperar { ms } => format!("esperar {ms} ms"),
            Paso::Atras => "atras (boton del sistema)".to_string(),
        }
    }
}

fn texto_de(valor: &Valor, campo: &'static str) -> Result<Option<String>, FalloDePaso> {
    match valor.obtener(campo) {
        None | Some(Valor::Nulo) => Ok(None),
        Some(Valor::Texto(t)) if t.trim().is_empty() => Err(FalloDePaso::SinTexto),
        Some(Valor::Texto(t)) => Ok(Some(t.clone())),
        Some(otro) => Err(FalloDePaso::CampoDeTipoEquivocado {
            campo,
            esperaba: "texto",
            llego: otro.tipo(),
        }),
    }
}

// ---------------------------------------------------------------------------
// El fallo del paso (con nombre, siempre)
// ---------------------------------------------------------------------------

/// Por que un paso no se acepta. Todos los nombres llevan `paso_` delante: en el
/// resultado del bus un `campo_ausente` no distingue cual de los dos payloads
/// estaba mal.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FalloDePaso {
    NoEsObjeto { tipo: &'static str },
    SinTipo,
    TipoFueraDelCatalogo { tipo: String },
    CampoDeTipoEquivocado { campo: &'static str, esperaba: &'static str, llego: &'static str },
    /// `tocar` sin ancla: no hay a donde tocar.
    SinAncla { tipo: String },
    /// Un ancla en un paso que no va a ningun nodo.
    AnclaSobrante { tipo: String },
    /// `escribir` sin texto (o en blanco).
    SinTexto,
    /// `esperar` sin milisegundos validos.
    EsperaInvalida { valor: String },
    /// El objeto `ancla` sin pistas o con varias.
    AnclaInvalida { motivo: String },
}

impl FalloDePaso {
    pub fn codigo(&self) -> &'static str {
        match self {
            FalloDePaso::NoEsObjeto { .. } => "paso_no_objeto",
            FalloDePaso::SinTipo => "paso_sin_tipo",
            FalloDePaso::TipoFueraDelCatalogo { .. } => "paso_tipo_fuera_del_catalogo",
            FalloDePaso::CampoDeTipoEquivocado { .. } => "paso_campo_de_tipo_equivocado",
            FalloDePaso::SinAncla { .. } => "paso_sin_ancla",
            FalloDePaso::AnclaSobrante { .. } => "paso_ancla_sobrante",
            FalloDePaso::SinTexto => "paso_sin_texto",
            FalloDePaso::EsperaInvalida { .. } => "paso_espera_invalida",
            FalloDePaso::AnclaInvalida { .. } => "paso_ancla_invalida",
        }
    }

    pub fn descripcion(&self) -> String {
        match self {
            FalloDePaso::NoEsObjeto { tipo } => {
                format!("el paso tiene que ser un objeto y llego un {tipo}")
            }
            FalloDePaso::SinTipo => {
                "al paso le falta 'tipo': no se puede saber que hay que hacer".to_string()
            }
            FalloDePaso::TipoFueraDelCatalogo { tipo } => format!(
                "el tipo de paso '{tipo}' no esta en el catalogo ({})",
                TIPOS.join(", ")
            ),
            FalloDePaso::CampoDeTipoEquivocado { campo, esperaba, llego } => format!(
                "el campo '{campo}' del paso tenia que ser {esperaba} y llego un {llego}"
            ),
            FalloDePaso::SinAncla { tipo } => format!(
                "el paso '{tipo}' necesita 'ancla' (view_id, texto o desc): sin ancla no hay a donde tocar"
            ),
            FalloDePaso::AnclaSobrante { tipo } => format!(
                "el paso '{tipo}' no va a ningun nodo y trae 'ancla': el emisor cree estar pidiendo otra cosa"
            ),
            FalloDePaso::SinTexto => {
                "el paso 'escribir' necesita 'texto' con algo dentro".to_string()
            }
            FalloDePaso::EsperaInvalida { valor } => format!(
                "el paso 'esperar' necesita 'ms' entero y mayor que cero (llego '{valor}')"
            ),
            FalloDePaso::AnclaInvalida { motivo } => format!("el ancla no vale: {motivo}"),
        }
    }
}

impl fmt::Display for FalloDePaso {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.codigo(), self.descripcion())
    }
}

// ---------------------------------------------------------------------------
// Resolver el ancla sobre la foto
// ---------------------------------------------------------------------------

/// El nodo que se va a tocar, ya con su punto.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hallado {
    /// Id del nodo y centro de su caja: lo que se le manda al aparato.
    pub objetivo: Objetivo,
    /// El nombre visible del nodo (texto o desc), para el `detalle` del resultado.
    pub nombre: Option<String>,
    /// La caja del nodo, para poder decir donde se toco.
    pub caja: crate::percepcion::simulador::Caja,
}

/// Por que un ancla no da un nodo tocable. Cada variante lleva el ancla buscada:
/// un `ancla_no_encontrada` sin el ancla no se puede arreglar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MotivoDeAncla {
    NoEncontrada {
        ancla: String,
        /// La foto era parcial: no se puede afirmar que el ancla NO este.
        parcial: bool,
        motivo_parcial: Option<String>,
    },
    Ambigua {
        ancla: String,
        cuantos: usize,
    },
    NoTocable {
        ancla: String,
        nodo: String,
    },
    SinSitio {
        ancla: String,
        nodo: String,
    },
}

impl MotivoDeAncla {
    pub fn codigo(&self) -> &'static str {
        match self {
            MotivoDeAncla::NoEncontrada { .. } => "ancla_no_encontrada",
            MotivoDeAncla::Ambigua { .. } => "ancla_ambigua",
            MotivoDeAncla::NoTocable { .. } => "ancla_no_tocable",
            MotivoDeAncla::SinSitio { .. } => "ancla_sin_sitio",
        }
    }

    pub fn descripcion(&self) -> String {
        match self {
            MotivoDeAncla::NoEncontrada { ancla, parcial, motivo_parcial } => {
                let base = format!("no hay ningun nodo VISIBLE con {ancla}");
                if *parcial {
                    let porque = motivo_parcial.as_deref().unwrap_or("sin motivo declarado");
                    format!(
                        "{base}, pero la mirada fue parcial ({porque}): no se puede afirmar que no este, y con media pantalla no se toca a ciegas"
                    )
                } else {
                    format!("{base}: no se toca nada")
                }
            }
            MotivoDeAncla::Ambigua { ancla, cuantos } => format!(
                "{ancla} esta en {cuantos} nodos visibles: no se elige uno al azar, hay que afinar el ancla"
            ),
            MotivoDeAncla::NoTocable { ancla, nodo } => format!(
                "{ancla} esta en el nodo '{nodo}' pero el aparato no lo da por tocable: no se toca su padre por si acaso"
            ),
            MotivoDeAncla::SinSitio { ancla, nodo } => format!(
                "{ancla} esta en el nodo '{nodo}' pero su caja no ocupa sitio: no hay punto que tocar"
            ),
        }
    }
}

impl fmt::Display for MotivoDeAncla {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.codigo(), self.descripcion())
    }
}

/// RESOLVER: el ancla sobre la foto, o el motivo por el que no da un nodo.
///
/// Reglas, y ninguna es negociable:
///
///   - **solo visibles**: un nodo `visible:false` no se toca. Tocar lo que el
///     usuario no ve es tocar a ciegas, aunque el `view_id` cuadre.
///   - **una coincidencia o ninguna**: dos coincidencias son `ancla_ambigua` con
///     el numero. Elegir la primera es como se toca el boton que no era.
///   - **el punto es el centro de la caja**, y una caja vacia es `ancla_sin_sitio`
///     (tocar (0,0) es tocar la esquina de la pantalla).
///   - **sin foto parcial no se afirma la ausencia**: si la mirada fue parcial, el
///     motivo lo dice, igual que A1.
pub fn resolver(arbol: &Arbol, ancla: &AnclaDePaso) -> Result<Hallado, MotivoDeAncla> {
    let mut hallados: Vec<&Nodo> = Vec::new();
    let mut restantes = LIMITE_DE_NODOS;
    for hijo in &arbol.raiz.hijos {
        recolectar(hijo, ancla, &mut hallados, &mut restantes);
    }

    match hallados.len() {
        0 => Err(MotivoDeAncla::NoEncontrada {
            ancla: ancla.descripcion(),
            parcial: arbol.mirada == Mirada::Parcial,
            motivo_parcial: arbol.motivo_sin_mirada.clone(),
        }),
        1 => {
            let nodo = hallados[0];
            if !nodo.tocable || !nodo.habilitado {
                return Err(MotivoDeAncla::NoTocable {
                    ancla: ancla.descripcion(),
                    nodo: nodo.id.clone(),
                });
            }
            if nodo.caja.esta_vacia() {
                return Err(MotivoDeAncla::SinSitio {
                    ancla: ancla.descripcion(),
                    nodo: nodo.id.clone(),
                });
            }
            Ok(Hallado {
                objetivo: Objetivo { id: nodo.id.clone(), punto: nodo.caja.centro() },
                nombre: nodo.ancla().map(str::to_string),
                caja: nodo.caja,
            })
        }
        cuantos => Err(MotivoDeAncla::Ambigua { ancla: ancla.descripcion(), cuantos }),
    }
}

/// Recorre el subarbol saltando lo invisible (y su descendencia, como A1) y
/// apunta los nodos que coinciden. Tope de nodos: un arbol de Android es ancho y
/// un recorrido sin freno es una forma comoda de colgar el aparato.
fn recolectar<'a>(
    nodo: &'a Nodo,
    ancla: &AnclaDePaso,
    hallados: &mut Vec<&'a Nodo>,
    restantes: &mut usize,
) {
    if *restantes == 0 || !nodo.visible_al_usuario {
        return;
    }
    *restantes -= 1;

    if coincide(nodo, ancla) {
        hallados.push(nodo);
    }
    for hijo in &nodo.hijos {
        recolectar(hijo, ancla, hallados, restantes);
    }
}

/// ¿Este nodo es el ancla?
///
/// `texto` y `desc` se comparan normalizados (minusculas, sin tildes, espacios
/// colapsados): el mismo criterio que A1, para que el cerebro y el aparato no
/// discrepen sobre si dos etiquetas son la misma.
///
/// `view_id` se compara de tres maneras porque el payload lo escribe una persona:
/// el id completo, la ultima pieza (`action_bar_left_button`) y con el sufijo de
/// desambiguacion ignorado (`...#3`, que pone `mano::arbol_json` cuando Instagram
/// repite el mismo id). Sin ese ultimo paso, diez `image_button` iguales no se
/// verian como ambiguos y se tocaria el primero en silencio.
fn coincide(nodo: &Nodo, ancla: &AnclaDePaso) -> bool {
    match ancla {
        AnclaDePaso::ViewId(valor) => coincide_por_view_id(&nodo.id, valor),
        AnclaDePaso::Texto(valor) => {
            let buscado = normalizar_etiqueta(valor);
            nodo.texto
                .as_deref()
                .map(|t| normalizar_etiqueta(t) == buscado)
                .unwrap_or(false)
        }
        AnclaDePaso::Desc(valor) => {
            let buscado = normalizar_etiqueta(valor);
            nodo.descripcion
                .as_deref()
                .map(|d| normalizar_etiqueta(d) == buscado)
                .unwrap_or(false)
        }
    }
}

fn coincide_por_view_id(id_del_nodo: &str, valor: &str) -> bool {
    let valor = valor.trim();
    if valor.is_empty() {
        return false;
    }
    let base = sin_sufijo(id_del_nodo);
    if base == valor {
        return true;
    }
    // La ultima pieza de `com.instagram.android:id/action_bar_left_button` es
    // `action_bar_left_button`; tambien vale escribir el id con `:id/` delante.
    match base.rsplit(['/', ':']).next() {
        Some(pieza) => pieza == valor,
        None => false,
    }
}

/// `com.instagram.android:id/icono#3` -> `com.instagram.android:id/icono`.
fn sin_sufijo(id: &str) -> &str {
    match id.rsplit_once('#') {
        Some((base, sufijo)) if !base.is_empty() && sufijo.chars().all(|c| c.is_ascii_digit()) => base,
        _ => id,
    }
}

// ---------------------------------------------------------------------------
// El gesto que se le entrega al aparato
// ---------------------------------------------------------------------------

/// Lo que el aparato tiene que hacer, ya sin anclas ni decisiones.
///
/// `Escribir` no lleva objetivo a proposito: el texto va al campo que tenga el
/// foco, y si no hay ninguno el aparato contesta `campo_no_enfocado`. Elegir el
/// campo aqui seria elegir un nodo que nadie miro.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GestoDePaso {
    Tocar { objetivo: Objetivo },
    Escribir { texto: String },
    Esperar { ms: u64 },
    Atras,
}

impl GestoDePaso {
    pub fn como_str(&self) -> &'static str {
        match self {
            GestoDePaso::Tocar { .. } => "tocar",
            GestoDePaso::Escribir { .. } => "escribir",
            GestoDePaso::Esperar { .. } => "esperar",
            GestoDePaso::Atras => "atras",
        }
    }

    pub fn describe(&self) -> String {
        match self {
            GestoDePaso::Tocar { objetivo } => {
                format!("tocado '{}' en ({},{})", objetivo.id, objetivo.punto.0, objetivo.punto.1)
            }
            GestoDePaso::Escribir { texto } => {
                format!("escrito en el campo enfocado ({} caracteres)", texto.chars().count())
            }
            GestoDePaso::Esperar { ms } => format!("esperados {ms} ms"),
            GestoDePaso::Atras => "pulsado atras".to_string(),
        }
    }
}

/// El JSON del paso, con las claves que lee `BucleDeMano.kt`.
///
/// Se serializa aqui y no en Kotlin porque el que sabe que gesto quiere es el
/// crate: mandar una frase obligaria al aparato a interpretar, y el aparato solo
/// obedece. `tocar` lleva id **y** punto (el id para `ACTION_CLICK`, el punto para
/// `GestureDescription`); `escribir` no lleva id, y eso es lo que significa "en el
/// campo enfocado".
pub fn json_del_gesto(gesto: &GestoDePaso) -> String {
    let valor = match gesto {
        GestoDePaso::Tocar { objetivo } => Valor::objeto(vec![
            ("accion", Valor::texto("tocar")),
            ("id", Valor::texto(objetivo.id.clone())),
            ("x", Valor::Numero(objetivo.punto.0 as f64)),
            ("y", Valor::Numero(objetivo.punto.1 as f64)),
        ]),
        GestoDePaso::Escribir { texto } => Valor::objeto(vec![
            ("accion", Valor::texto("escribir")),
            ("texto", Valor::texto(texto.clone())),
        ]),
        GestoDePaso::Esperar { ms } => Valor::objeto(vec![
            ("accion", Valor::texto("esperar")),
            ("ms", Valor::Numero(*ms as f64)),
        ]),
        GestoDePaso::Atras => {
            Valor::objeto(vec![("accion", Valor::texto("atras"))])
        }
    };
    valor.a_texto()
}

/// Lee `{ok, motivo}` de la respuesta de un paso, sin tragarsela.
///
/// `ok` tiene que estar y ser booleano: una respuesta sin `ok` no es un "si" ni un
/// "no", es una respuesta que no se entiende.
pub fn desenlace(respuesta: &str) -> Result<(), String> {
    let valor = json::leer(respuesta).map_err(|e| format!("la respuesta no es json: {e}"))?;

    match valor.obtener("ok").and_then(Valor::como_bool) {
        Some(true) => Ok(()),
        Some(false) => {
            let motivo = valor
                .obtener("motivo")
                .and_then(Valor::como_texto)
                .map(|m| m.trim().to_string())
                .filter(|m| !m.is_empty())
                .unwrap_or_else(|| "el aparato dijo que no y no dijo por que".to_string());
            Err(motivo)
        }
        None => Err("la respuesta del paso no trae 'ok' booleano".to_string()),
    }
}
