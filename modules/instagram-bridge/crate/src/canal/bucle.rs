//! El bucle de ordenes del canal: `bridge/orden` -> la mano -> `bridge/resultado`.
//!
//! # El contrato (el de la skill, sin inventar campos)
//!
//! ```text
//! core/core-a/events/bridge/orden/#      Enki -> aparato   (ordenes)
//! core/core-a/events/bridge/resultado    aparato -> Enki   (resultados)
//!
//! {"accion":"publicar","red":"instagram","texto":"...",
//!  "archivo":"/sdcard/f.jpg","simulacion":true}
//! ```
//!
//! # Las tres reglas de este fichero
//!
//! 1. **Una orden que no se entiende no se ejecuta y se contesta.** El payload
//!    se valida contra un catalogo **cerrado** de acciones y de redes: una
//!    `accion` desconocida no se degrada a `publicar` por comodidad, se nombra
//!    (`accion_fuera_del_catalogo`). Un payload que no es JSON tampoco se
//!    adivina: `json_invalido`.
//! 2. **La mano solo se mueve si `simulacion != false`.** Ausente se lee como
//!    simulacion: ejecutar de verdad sin que nadie lo haya pedido es
//!    irreversible, simular de mas solo cuesta un mensaje. La excepcion es
//!    `observar`: mirar no cambia nada en el aparato, asi que se atiende igual
//!    con `simulacion:true` (ver la nota de `atender`).
//! 3. **Siempre par de fallo.** Un resultado es `{ok, motivo}` y **nunca** sale
//!    `ok:true` de una publicacion simulada: si nada salio del aparato hacia la
//!    red, decir "hecho" es mentir. La unica forma de `ok:true` es que la mano
//!    confirme la publicacion con su postcondicion vista (`publicado`), y eso
//!    hoy no puede pasar en este binario: aqui no hay arbol ni gestos. La otra
//!    forma de `ok:true` es `observar`, donde lo que se pidio —la foto— se
//!    tiene en la mano: no afirma nada sobre la red, solo que se miro.
//!
//! # Lo que este fichero NO hace
//!
//!   - **No decide si se puede publicar.** Ritmo, autonomia, ventana, recetas
//!     y permisos son del cerebro y del regulador (bloques 7 y 9). Aqui se
//!     obedece una orden que ya paso por alli: si el bucle empezara a decidir,
//!     habria dos politicas y la del aparato ganaria por estar mas cerca.
//!   - **No ejecuta gestos.** Los pide a `ManoDeOrdenes` (A3 detras). En este
//!     binario de escritorio la unica mano es `ManoAusente`, que lo dice con su
//!     nombre en vez de fingir que toco algo.
//!   - **No reintenta.** Un PUBLISH de resultado en QoS 0 no tiene acuse; un
//!     reintento ciego duplicaria resultados. El cerebro que no lo reciba pedira
//!     otra orden, y esa decision es suya.

use crate::canal::json::{self, Valor};
use crate::canal::mqtt::{Canal, FalloDeCanal, PublicacionRecibida};
use crate::canal::paso::{self, FalloDePaso, GestoDePaso, Paso};
use crate::mano::arbol_json;

/// La suscripcion del aparato: todas las ordenes del bridge.
pub const TOPIC_ORDENES: &str = "core/core-a/events/bridge/orden/#";

/// El prefijo que tiene que llevar el topic de un mensaje para ser una orden.
///
/// Un mensaje que llegue por otro sitio (un `#` mal puesto en el broker, por
/// ejemplo) **no se ejecuta**: se cuenta como ignorado.
pub const PREFIJO_ORDENES: &str = "core/core-a/events/bridge/orden/";

/// Donde se contesta. Un solo topic: el aparato no elige destinatario.
pub const TOPIC_RESULTADO: &str = "core/core-a/events/bridge/resultado";

/// La accion que pide publicar el texto en la red.
pub const ACCION_PUBLICAR: &str = "publicar";

/// La accion que pide el VOLCADO de la ventana activa (bloque 19c).
///
/// Es una LECTURA: no toca el aparato, no gasta cuota y no tiene paso
/// irreversible. Existe para que el movil pueda enseñar su pantalla cuando se
/// lo piden por el bus, sin que nadie lo tenga en la mano. El boton de la app
/// no sirve para eso: al pulsarlo, la app pasa a primer plano y Android solo
/// deja leer la ventana EN PRIMER PLANO, asi que el volcado saldria de nuestra
/// pantalla y no de Instagram.
pub const ACCION_OBSERVAR: &str = "observar";

/// La accion que da UN paso suelto al aparato (bloque 19d).
///
/// Es la unica accion del catalogo que **cambia el movil**, y por eso es la unica
/// que pasa el veto de `simulacion` al reves: sin `simulacion:false` explicita no
/// se toca nada. Existe para pilotar el aparato paso a paso y descubrir el flujo
/// real de Instagram antes de escribir la receta; no es la receta.
pub const ACCION_PASO: &str = "paso";

/// El catalogo CERRADO de acciones (espejo del contrato de la skill).
///
/// Hoy hay tres: `publicar`, `observar` y `paso`. Añadir una accion es una
/// decision de contrato, no un `match` mas: si estuviera abierta, una orden con
/// `accion:"borrar_todo"` seria representable y alguien acabaria mapeandola a lo
/// que hubiera a mano.
pub const ACCIONES: &[&str] = &[ACCION_PUBLICAR, ACCION_OBSERVAR, ACCION_PASO];

/// Las plataformas que este crate opera. Es un crate de Instagram: una orden
/// para otra red no es "casi esto", es una orden que no se sabe hacer.
pub const REDES: &[&str] = &["instagram"];

/// El motivo con el que se contesta una simulacion. Nunca se omite: quien lea
/// `ok:false` tiene que poder saber si fallo algo o si nadie apreto el boton.
pub const MOTIVO_SIMULACION: &str = "simulacion";

/// El motivo con el que se contesta una orden que pide ejecucion real en un
/// binario que no la tiene.
pub const MOTIVO_SIN_MANO_REAL: &str = "ejecucion_real_no_habilitada";

/// El motivo con el que una mano sin arbol contesta que no hay nada que mirar.
///
/// Es el nombre que sale en un `observar` cuando el binario no tiene capa
/// Android (un servidor): lo contestan `ManoAusente` y el defecto del puerto. En
/// el aparato, si el otro lado no contesta, el motivo es `mano_sin_respuesta`
/// (lo pone `mano::cola`), que es otro fallo distinto y se nombra distinto. Se
/// compara por igualdad: sin nombre no se puede diagnosticar.
pub const MOTIVO_SIN_MANO: &str = "sin_mano";

/// El motivo de un paso que se entrego y cuya mirada de despues no llego.
///
/// El paso ocurrio (no se puede deshacer) y la comprobacion no: el `detalle` dice
/// cual de las dos cosas fallo y por que. Se nombra aparte porque un `ok:true` con
/// el volcado a `null` seria un exito sin el dato que se pidio.
pub const MOTIVO_OBSERVAR_DESPUES: &str = "observar_despues_fallo";

/// El motivo de una mano que dijo haber mirado y no trajo foto.
///
/// No deberia pasar nunca; se nombra igual porque un `ok:true` con `volcado`
/// nulo seria un exito sin dato, que es la peor clase de resultado.
pub const MOTIVO_VOLCADO_AUSENTE: &str = "volcado_ausente";

// ---------------------------------------------------------------------------
// La orden (lo que entra)
// ---------------------------------------------------------------------------

/// Una orden ya validada.
///
/// Que exista este tipo es la mitad de la garantia: si `atender` llega a tener
/// una `Orden`, el payload paso el catalogo cerrado y los tipos. No hay ninguna
/// rama que construya una `Orden` a medias.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Orden {
    /// El identificador que puso el cerebro, si lo puso. Sin el, una respuesta
    /// no se puede emparejar con su orden; se conserva tal cual y vacio si no
    /// venia, en vez de inventar uno.
    pub id: String,
    pub accion: String,
    pub red: String,
    pub texto: String,
    /// Ruta del fichero a publicar, si la orden la trae.
    pub archivo: Option<String>,
    /// Modo seco. Ausente = `true` (ver la regla 2 de arriba).
    pub simulacion: bool,
    /// El paso suelto, solo en `accion:"paso"` (bloque 19d). Ya validado: si
    /// existe, se puede ejecutar tal cual.
    pub paso: Option<Paso>,
    /// ¿Volver a mirar despues del paso y adjuntar el volcado? Ausente = si.
    ///
    /// Un paso y su comprobacion viajan juntos porque separarlos invita a leer el
    /// volcado de antes del toque creyendo que es el de despues.
    pub observar_despues: bool,
}

impl Orden {
    /// Valida un payload de texto contra el contrato.
    pub fn desde_payload(payload: &str) -> Result<Orden, FalloDeOrden> {
        let valor = json::leer(payload).map_err(|e| FalloDeOrden::JsonInvalido(e.to_string()))?;
        Orden::desde_valor(&valor)
    }

    /// Valida un payload ya parseado.
    pub fn desde_valor(valor: &Valor) -> Result<Orden, FalloDeOrden> {
        if !matches!(valor, Valor::Objeto(_)) {
            return Err(FalloDeOrden::PayloadNoObjeto { tipo: valor.tipo() });
        }

        let accion = texto_obligatorio(valor, "accion")?;
        if !ACCIONES.contains(&accion.as_str()) {
            return Err(FalloDeOrden::AccionFueraDelCatalogo { accion });
        }

        // `observar` es una LECTURA y `paso` no publica: en las dos, ni la red ni el
        // texto significan nada. Se aceptan ausentes (una orden
        // `{"accion":"observar"}` es la forma natural de pedir una foto) y, si
        // vienen, se validan igual que en `publicar`: una red desconocida sigue
        // siendo un fallo, no un "da igual porque no se publica".
        let es_lectura = accion == ACCION_OBSERVAR || accion == ACCION_PASO;

        let red = match texto_opcional(valor, "red")? {
            Some(red) => {
                if !REDES.contains(&red.as_str()) {
                    return Err(FalloDeOrden::RedDesconocida { red });
                }
                red
            }
            None if es_lectura => REDES[0].to_string(),
            None => return Err(FalloDeOrden::CampoAusente { campo: "red" }),
        };

        let texto = match texto_opcional(valor, "texto")? {
            Some(texto) => texto,
            None if es_lectura => String::new(),
            None => return Err(FalloDeOrden::CampoAusente { campo: "texto" }),
        };

        let archivo = match valor.obtener("archivo") {
            None | Some(Valor::Nulo) => None,
            Some(Valor::Texto(t)) if t.trim().is_empty() => {
                return Err(FalloDeOrden::CampoVacio { campo: "archivo" })
            }
            Some(Valor::Texto(t)) => Some(t.clone()),
            Some(otro) => {
                return Err(FalloDeOrden::CampoDeTipoEquivocado {
                    campo: "archivo",
                    esperaba: "texto o nulo",
                    llego: otro.tipo(),
                })
            }
        };

        // Ausente = simulacion. Presente tiene que ser un booleano de verdad: el
        // texto "false" no es `false` y tratarlo como tal es como se ejecuta lo
        // que no se pidio.
        let simulacion = match valor.obtener("simulacion") {
            None | Some(Valor::Nulo) => true,
            Some(Valor::Bool(b)) => *b,
            Some(otro) => {
                return Err(FalloDeOrden::CampoDeTipoEquivocado {
                    campo: "simulacion",
                    esperaba: "booleano",
                    llego: otro.tipo(),
                })
            }
        };

        // El paso suelto (19d). Ausente en cualquier otra accion: solo `paso` lo
        // exige, y `paso` sin el no tiene nada que hacer.
        let paso = match valor.obtener("paso") {
            None | Some(Valor::Nulo) if accion == ACCION_PASO => {
                return Err(FalloDeOrden::CampoAusente { campo: "paso" })
            }
            None | Some(Valor::Nulo) => None,
            Some(objeto) => Some(paso::Paso::desde_valor(objeto).map_err(FalloDeOrden::Paso)?),
        };

        // Ausente = mirar despues. Presente tiene que ser booleano, por la misma
        // razon que `simulacion`: el texto `"false"` no es `false`.
        let observar_despues = match valor.obtener("observar_despues") {
            None | Some(Valor::Nulo) => true,
            Some(Valor::Bool(b)) => *b,
            Some(otro) => {
                return Err(FalloDeOrden::CampoDeTipoEquivocado {
                    campo: "observar_despues",
                    esperaba: "booleano",
                    llego: otro.tipo(),
                })
            }
        };

        let id = match valor.obtener("id").or_else(|| valor.obtener("orden_id")) {
            None | Some(Valor::Nulo) => String::new(),
            Some(Valor::Texto(t)) => t.clone(),
            Some(otro) => {
                return Err(FalloDeOrden::CampoDeTipoEquivocado {
                    campo: "id",
                    esperaba: "texto",
                    llego: otro.tipo(),
                })
            }
        };

        Ok(Orden { id, accion, red, texto, archivo, simulacion, paso, observar_despues })
    }
}

fn texto_obligatorio(valor: &Valor, campo: &'static str) -> Result<String, FalloDeOrden> {
    match valor.obtener(campo) {
        None => Err(FalloDeOrden::CampoAusente { campo }),
        Some(Valor::Texto(t)) if t.trim().is_empty() => Err(FalloDeOrden::CampoVacio { campo }),
        Some(Valor::Texto(t)) => Ok(t.clone()),
        Some(otro) => Err(FalloDeOrden::CampoDeTipoEquivocado {
            campo,
            esperaba: "texto",
            llego: otro.tipo(),
        }),
    }
}

/// Igual que `texto_obligatorio`, pero ausente o nulo es `None` en vez de fallo.
///
/// Existe por `observar`: la orden que solo pide una foto no trae `red` ni
/// `texto`. Lo que SI llega se valida con el mismo rigor (un texto en blanco o
/// un tipo equivocado siguen siendo fallo): relajar la ausencia no es relajar el
/// contrato.
fn texto_opcional(valor: &Valor, campo: &'static str) -> Result<Option<String>, FalloDeOrden> {
    match valor.obtener(campo) {
        None | Some(Valor::Nulo) => Ok(None),
        Some(Valor::Texto(t)) if t.trim().is_empty() => Err(FalloDeOrden::CampoVacio { campo }),
        Some(Valor::Texto(t)) => Ok(Some(t.clone())),
        Some(otro) => Err(FalloDeOrden::CampoDeTipoEquivocado {
            campo,
            esperaba: "texto",
            llego: otro.tipo(),
        }),
    }
}

/// Por que una orden no se acepto. Todas las variantes llevan el nombre del
/// campo o del valor: "payload invalido" a secas no se puede arreglar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FalloDeOrden {
    JsonInvalido(String),
    PayloadNoObjeto { tipo: &'static str },
    CampoAusente { campo: &'static str },
    CampoVacio { campo: &'static str },
    CampoDeTipoEquivocado { campo: &'static str, esperaba: &'static str, llego: &'static str },
    AccionFueraDelCatalogo { accion: String },
    RedDesconocida { red: String },
    /// El objeto `paso` no pasa su contrato (bloque 19d). Se conserva el fallo
    /// entero en vez de un texto: su `codigo()` es el que viaja al resultado.
    Paso(FalloDePaso),
}

impl FalloDeOrden {
    pub fn codigo(&self) -> &'static str {
        match self {
            FalloDeOrden::JsonInvalido(_) => "json_invalido",
            FalloDeOrden::PayloadNoObjeto { .. } => "payload_no_objeto",
            FalloDeOrden::CampoAusente { .. } => "campo_ausente",
            FalloDeOrden::CampoVacio { .. } => "campo_vacio",
            FalloDeOrden::CampoDeTipoEquivocado { .. } => "campo_de_tipo_equivocado",
            FalloDeOrden::AccionFueraDelCatalogo { .. } => "accion_fuera_del_catalogo",
            FalloDeOrden::RedDesconocida { .. } => "red_desconocida",
            FalloDeOrden::Paso(fallo) => fallo.codigo(),
        }
    }

    pub fn descripcion(&self) -> String {
        match self {
            FalloDeOrden::JsonInvalido(motivo) => format!("el payload no es json: {motivo}"),
            FalloDeOrden::PayloadNoObjeto { tipo } => {
                format!("el payload tiene que ser un objeto y llego un {tipo}")
            }
            FalloDeOrden::CampoAusente { campo } => format!("a la orden le falta '{campo}'"),
            FalloDeOrden::CampoVacio { campo } => format!("la orden trae '{campo}' en blanco"),
            FalloDeOrden::CampoDeTipoEquivocado { campo, esperaba, llego } => format!(
                "el campo '{campo}' tenia que ser {esperaba} y llego un {llego}"
            ),
            FalloDeOrden::AccionFueraDelCatalogo { accion } => format!(
                "la accion '{accion}' no esta en el catalogo ({})",
                ACCIONES.join(", ")
            ),
            FalloDeOrden::RedDesconocida { red } => {
                format!("la red '{red}' no es de este crate ({})", REDES.join(", "))
            }
            FalloDeOrden::Paso(fallo) => fallo.descripcion(),
        }
    }
}

impl std::fmt::Display for FalloDeOrden {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({})", self.codigo(), self.descripcion())
    }
}

// ---------------------------------------------------------------------------
// La mano (el puerto hacia A3)
// ---------------------------------------------------------------------------

/// Lo que la mano devuelve despues de intentar una orden.
///
/// `publicado` es la unica afirmacion fuerte y solo puede venir de una
/// postcondicion vista (O1/O2). `ejecutado` sin `publicado` es "se corrieron
/// pasos y no se puede afirmar el resultado".
///
/// `volcado` (19c) es la foto CRUDA de la ventana activa: el JSON tal y como lo
/// serializo el aparato, sin proyectar. Se lleva crudo y no como `Arbol` porque
/// quien pide `observar` lo que quiere es justo lo que el crate NO modela (los
/// hints, los nodos invisibles, las clases): es el material con el que se
/// escribe una receta.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HechoDeMano {
    pub ejecutado: bool,
    pub publicado: bool,
    /// Gestos entregados al aparato: los que pudieron cambiar el mundo.
    pub gestos: u64,
    pub motivo: Option<String>,
    pub detalle: Option<String>,
    /// El JSON crudo del volcado, cuando la orden era `observar`.
    pub volcado: Option<String>,
}

impl HechoDeMano {
    /// La mano no llego a hacer nada, y lo dice.
    pub fn nada(motivo: impl Into<String>, detalle: impl Into<String>) -> Self {
        Self {
            ejecutado: false,
            publicado: false,
            gestos: 0,
            motivo: Some(motivo.into()),
            detalle: Some(detalle.into()),
            volcado: None,
        }
    }

    /// El aparato ACEPTO el gesto (bloque 19d). `gestos` dice cuantos se
    /// entregaron: `esperar` no entrega ninguno.
    ///
    /// Aceptado no es ocurrido: eso lo dice la mirada siguiente, y por eso
    /// `publicado` sigue siendo `false` y no hay ningun camino de aqui a `ok:true`
    /// sin la comprobacion pegada.
    pub fn entregado(gestos: u64, detalle: impl Into<String>) -> Self {
        Self {
            ejecutado: true,
            publicado: false,
            gestos,
            motivo: None,
            detalle: Some(detalle.into()),
            volcado: None,
        }
    }

    /// La mano MIRÓ y trae la foto. `ejecutado` es "se corrio la accion", no
    /// "se publico": una lectura no afirma nada sobre la red.
    pub fn con_volcado(volcado: impl Into<String>, detalle: impl Into<String>) -> Self {
        Self {
            ejecutado: true,
            publicado: false,
            gestos: 0,
            motivo: None,
            detalle: Some(detalle.into()),
            volcado: Some(volcado.into()),
        }
    }
}

/// El puerto hacia la mano (A3 detras).
///
/// En el aparato lo implementa la capa Android (arbol de accesibilidad + gestos).
/// En este binario, `ManoAusente`: no hay arbol que mirar en un servidor, y una
/// mano que no mira no puede tocar.
pub trait ManoDeOrdenes {
    fn ejecutar(&mut self, orden: &Orden) -> HechoDeMano;

    /// MIRAR: devuelve la foto de la ventana activa, o el motivo por el que no.
    ///
    /// Es un verbo aparte de `ejecutar` a proposito. `ejecutar` mueve el mundo y
    /// por eso pasa por el veto de la simulacion; mirar no mueve nada y no tiene
    /// por que pedir permiso para leer. Si fuera un `match` dentro de
    /// `ejecutar`, la mano tendria que saber de politica de simulacion, que es
    /// justo lo que este puerto no sabe.
    ///
    /// El defecto contesta `sin_mano`: una mano que no ha implementado esto no
    /// finge un volcado vacio.
    fn observar(&mut self) -> HechoDeMano {
        HechoDeMano::nada(
            MOTIVO_SIN_MANO,
            "esta mano no sabe mirar: no tiene arbol de accesibilidad que leer",
        )
    }

    /// PASO (bloque 19d): entrega UN gesto ya resuelto por el crate.
    ///
    /// Es un verbo aparte de `ejecutar` porque no lleva una orden: el ancla ya se
    /// resolvio sobre una foto y el gesto ya sabe donde va. La mano no busca nada
    /// ni elige nada; obedece.
    ///
    /// El defecto contesta `sin_mano`: una mano que no sabe dar pasos sueltos no
    /// finge que los dio. El interprete usa `observar()` para resolver el ancla
    /// antes y para adjuntar el volcado despues.
    fn ejecutar_gesto(&mut self, gesto: &GestoDePaso) -> HechoDeMano {
        HechoDeMano::nada(
            MOTIVO_SIN_MANO,
            format!(
                "esta mano no sabe ejecutar pasos sueltos ({}): no tiene arbol de accesibilidad ni gestos",
                gesto.como_str()
            ),
        )
    }
}

/// La mano del escritorio: no hay.
///
/// Existe para que el bucle tenga siempre una mano enchufada y para que el
/// resultado lleve el motivo correcto (`sin_mano`) en vez de un `ok:true`
/// optimista. Cuando la capa Android llegue, se cambia esta pieza y nada mas.
#[derive(Debug, Clone, Default)]
pub struct ManoAusente;

impl ManoAusente {
    pub fn nueva() -> Self {
        Self
    }
}

impl ManoDeOrdenes for ManoAusente {
    fn ejecutar(&mut self, _orden: &Orden) -> HechoDeMano {
        HechoDeMano::nada(
            MOTIVO_SIN_MANO,
            "este binario no tiene arbol de accesibilidad ni gestos: la mano vive en la capa Android",
        )
    }
}

// ---------------------------------------------------------------------------
// El resultado (lo que sale)
// ---------------------------------------------------------------------------

/// El resultado que se publica en `bridge/resultado`.
///
/// `ok` y `motivo` van **siempre los dos** en el JSON (motivo `null` cuando
/// `ok:true`): un resultado sin motivo es un resultado que no se puede auditar
/// cuando sale mal, y el par es lo que impide leer un fallo como un exito.
///
/// `simulacion` es el MODO con el que se atendio la orden: `true` = no se pidio
/// ejecucion real. Por eso es `true` tambien cuando la orden ni se entendio: un
/// payload invalido no es una ejecucion real por mucho que la pidiera. En
/// `observar` el campo es un espejo de la orden, porque mirar no se simula: la
/// lectura ocurre igual y lo unico que cambia es que nadie lo pidio "de verdad".
///
/// `volcado` (19c) viaja como **JSON crudo**, no como texto escapado: es el
/// arbol que devolvio el aparato y quien lo lee quiere el arbol, no una cadena
/// con el arbol dentro.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resultado {
    pub id: String,
    pub accion: String,
    pub red: String,
    pub ok: bool,
    pub simulacion: bool,
    pub motivo: Option<String>,
    pub detalle: Option<String>,
    pub gestos: u64,
    /// El JSON crudo de la ventana activa, solo en `observar`.
    pub volcado: Option<String>,
}

impl Resultado {
    /// Un fallo con nombre y detalle. La unica forma de construirlo es esta:
    /// no hay `Resultado::ok()` que se pueda llamar sin prueba.
    pub fn fallo(
        id: impl Into<String>,
        accion: impl Into<String>,
        red: impl Into<String>,
        simulacion: bool,
        motivo: impl Into<String>,
        detalle: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            accion: accion.into(),
            red: red.into(),
            ok: false,
            simulacion,
            motivo: Some(motivo.into()),
            detalle: Some(detalle.into()),
            gestos: 0,
            volcado: None,
        }
    }

    /// JSON del resultado. El orden de las claves es fijo (ver `json::Valor`),
    /// y `volcado` va el ultimo.
    pub fn a_json(&self) -> String {
        let texto = |v: &Option<String>| match v {
            Some(t) => Valor::Texto(t.clone()),
            None => Valor::Nulo,
        };
        let mut json = Valor::objeto(vec![
            ("id", Valor::Texto(self.id.clone())),
            ("accion", Valor::Texto(self.accion.clone())),
            ("red", Valor::Texto(self.red.clone())),
            ("ok", Valor::Bool(self.ok)),
            ("simulacion", Valor::Bool(self.simulacion)),
            ("motivo", texto(&self.motivo)),
            ("detalle", texto(&self.detalle)),
            ("gestos", Valor::Numero(self.gestos as f64)),
        ])
        .a_texto();

        // El volcado es JSON ya escrito por el aparato. Meterlo en un
        // `Valor::Texto` lo escaparia y el resultado llevaria una cadena donde
        // tiene que ir un objeto; se empalma crudo al final del objeto.
        if json.ends_with('}') {
            json.pop();
            json.push_str(",\"volcado\":");
            match &self.volcado {
                Some(volcado) => json.push_str(volcado),
                None => json.push_str("null"),
            }
            json.push('}');
        }
        json
    }
}

impl std::fmt::Display for Resultado {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "orden {} {} ok={} simulacion={} motivo={} gestos={}",
            if self.id.is_empty() { "-" } else { &self.id },
            self.accion,
            self.ok,
            self.simulacion,
            self.motivo.as_deref().unwrap_or("-"),
            self.gestos
        )
    }
}

// ---------------------------------------------------------------------------
// Atender UNA orden
// ---------------------------------------------------------------------------

/// Valida y atiende UNA orden.
///
/// Es la pieza que usan el bucle y el CLI (`--orden ... --simular`), para que
/// probar una orden a mano y recibirla del bus pasen por el MISMO codigo. Dos
/// caminos distintos acabarian en dos validaciones distintas.
///
/// Las tres acciones tienen su camino, y cada uno dice lo suyo: `observar` no se
/// veta (leer no cambia nada), `paso` se veta al reves (sin `simulacion:false`
/// explicita no se toca el movil) y `publicar` conserva el veto del bloque 16.
pub fn atender(payload: &str, mano: &mut dyn ManoDeOrdenes) -> Resultado {
    let orden = match Orden::desde_payload(payload) {
        Ok(orden) => orden,
        Err(fallo) => {
            // Sin orden valida no hay ni accion ni red que citar: se nombran
            // vacias en vez de rellenarlas con lo que nos gustaria.
            return Resultado::fallo("", "", "", true, fallo.codigo(), fallo.descripcion());
        }
    };

    // `observar` es LECTURA PURA y por eso se atiende ANTES del veto de
    // simulacion. El veto existe porque ejecutar de verdad sin que nadie lo haya
    // pedido es irreversible (un post publicado no se despublica); mirar no
    // cambia nada en el aparato, no gasta cuota y no tiene postcondicion que
    // afirmar. Vetar una lectura por `simulacion:true` solo conseguiria que el
    // movil no pudiera enseñar su pantalla salvo que alguien pidiera "ejecutar
    // de verdad" para leer, que es absurdo.
    if orden.accion == ACCION_OBSERVAR {
        return atender_observar(&orden, mano);
    }

    // `paso` (19d) tiene su propio camino y su propio veto, y por eso se atiende
    // ANTES del veto de `publicar`: aqui `simulacion:false` no es "no hay mano",
    // es "toca de verdad". El veto no desaparece, se muda a `atender_paso`, que
    // es el unico sitio que puede mover el aparato.
    if orden.accion == ACCION_PASO {
        return atender_paso(&orden, mano);
    }

    if !orden.simulacion {
        // Veto del bloque 16: este binario no tiene mano real. Se dice con
        // nombre y no se toca nada. Este `if` es el UNICO sitio donde se
        // habilita la ejecucion real: el dia que exista la mano Android, se
        // cambia aqui y en ningun otro lado.
        return Resultado::fallo(
            orden.id.clone(),
            orden.accion.clone(),
            orden.red.clone(),
            false,
            MOTIVO_SIN_MANO_REAL,
            "la orden pide ejecucion real (simulacion:false) y este binario solo tiene la mano simulada",
        );
    }

    let hecho = mano.ejecutar(&orden);

    // Regla 3: en simulacion NUNCA `ok:true`, diga lo que diga la mano. Nada
    // salio del aparato: como mucho se recorrio el flujo.
    let mut detalle = hecho
        .detalle
        .clone()
        .or_else(|| hecho.motivo.clone())
        .unwrap_or_else(|| "flujo recorrido sin pulsar el paso irreversible".to_string());
    if hecho.publicado {
        // Contradiccion que se conserva en vez de taparse: si la mano dice
        // "publicado" durante una simulacion, el resultado lo cuenta y `ok`
        // sigue siendo `false`.
        detalle = format!("{detalle}; la mano informo publicado, pero fue una simulacion");
    }

    Resultado {
        id: orden.id.clone(),
        accion: orden.accion.clone(),
        red: orden.red.clone(),
        ok: false,
        simulacion: true,
        motivo: Some(MOTIVO_SIMULACION.to_string()),
        detalle: Some(detalle),
        gestos: hecho.gestos,
        volcado: None,
    }
}

/// `observar`: pide la foto y la devuelve tal cual, o nombra por que no.
///
/// `ok:true` aqui NO dice "se publico": dice "se miro y la foto esta en el
/// resultado". Es la unica accion donde un `ok:true` es honesto sin
/// postcondicion, porque lo que se pidio (el volcado) se tiene en la mano.
fn atender_observar(orden: &Orden, mano: &mut dyn ManoDeOrdenes) -> Resultado {
    let hecho = mano.observar();

    match (hecho.ejecutado, hecho.volcado) {
        (true, Some(volcado)) if !volcado.trim().is_empty() => Resultado {
            id: orden.id.clone(),
            accion: orden.accion.clone(),
            red: orden.red.clone(),
            ok: true,
            simulacion: orden.simulacion,
            motivo: None,
            detalle: Some(hecho.detalle.unwrap_or_else(|| {
                format!("volcado de la ventana activa: {} bytes", volcado.len())
            })),
            gestos: hecho.gestos,
            volcado: Some(volcado),
        },
        (_, volcado) => {
            let motivo = hecho.motivo.unwrap_or_else(|| MOTIVO_VOLCADO_AUSENTE.to_string());
            let detalle = hecho.detalle.unwrap_or_else(|| match volcado {
                Some(_) => "la mano dijo haber mirado y el volcado llego en blanco".to_string(),
                None => "la mano dijo haber mirado y no trajo volcado".to_string(),
            });
            Resultado::fallo(
                orden.id.clone(),
                orden.accion.clone(),
                orden.red.clone(),
                orden.simulacion,
                motivo,
                detalle,
            )
        }
    }
}

/// `paso` (19d): UN paso suelto, con su comprobacion pegada.
///
/// El orden de las cosas es el contrato de este bloque:
///
///   1. **el veto primero.** Sin `simulacion:false` explicita no se toca nada y se
///      contesta `simulacion` (con el paso dentro). Es la unica accion que cambia
///      el movil, asi que es donde el veto se lee con mas cuidado: ausente = no.
///   2. **mirar antes de tocar.** El ancla se resuelve sobre una foto NUEVA. Un
///      ancla que no se ve es `ancla_no_encontrada` (con el ancla) y no se toca
///      nada; si esta dos veces es `ancla_ambigua` con cuantos, y **no se elige**.
///   3. **un solo paso.** El gesto se entrega UNA vez. El paso siguiente es otra
///      orden, con otra mirada en medio: nunca se encadena.
///   4. **mirar despues** (`observar_despues`, ausente = si). El volcado viaja en el
///      mismo resultado, crudo, igual que en `observar`.
///
/// `ok:true` aqui significa "se entrego el paso que se pidio y se miro despues".
/// NO significa "se publico": ninguno de los cuatro pasos sabe lo que es un post,
/// y la receta que los encadene es otro bloque.
fn atender_paso(orden: &Orden, mano: &mut dyn ManoDeOrdenes) -> Resultado {
    let paso = match orden.paso.as_ref() {
        Some(paso) => paso,
        // No puede pasar (`Orden::desde_payload` lo exige). Se contesta igual, en
        // vez de con un `unwrap`: un panic por un payload es la peor forma de
        // contestar una orden.
        None => {
            return Resultado::fallo(
                orden.id.clone(),
                orden.accion.clone(),
                orden.red.clone(),
                orden.simulacion,
                "campo_ausente",
                "una orden 'paso' sin 'paso' no tiene nada que hacer",
            )
        }
    };

    if orden.simulacion {
        return Resultado::fallo(
            orden.id.clone(),
            orden.accion.clone(),
            orden.red.clone(),
            true,
            MOTIVO_SIMULACION,
            format!(
                "el paso '{}' no se ejecuto: la orden no pidio ejecucion real (simulacion ausente o true)",
                paso.describe()
            ),
        );
    }

    // El gesto lo decide el crate. Solo `tocar` necesita la foto (para resolver el
    // ancla); los otros tres no van a ningun nodo y por eso no miran.
    let mut etiqueta: Option<String> = None;
    let gesto = match paso {
        Paso::Tocar { ancla } => {
            let HechoDeMano { ejecutado, volcado, motivo, detalle, .. } = mano.observar();
            let volcado = match (ejecutado, volcado) {
                (true, Some(foto)) if !foto.trim().is_empty() => foto,
                _ => {
                    let motivo = motivo.unwrap_or_else(|| MOTIVO_VOLCADO_AUSENTE.to_string());
                    let detalle = detalle
                        .unwrap_or_else(|| "la mano dijo haber mirado y no trajo foto".to_string());
                    return Resultado::fallo(
                        orden.id.clone(),
                        orden.accion.clone(),
                        orden.red.clone(),
                        false,
                        motivo,
                        format!("no se pudo mirar para buscar el ancla: {detalle}"),
                    );
                }
            };

            // La foto se lee con el MISMO lector que usa `observar`: un segundo
            // lector tendria un segundo comportamiento.
            let arbol = match arbol_json::desde_json(&volcado) {
                Ok(arbol) => arbol,
                Err(fallo) => {
                    return Resultado::fallo(
                        orden.id.clone(),
                        orden.accion.clone(),
                        orden.red.clone(),
                        false,
                        fallo.codigo(),
                        format!("la mirada no se pudo leer: {}", fallo.descripcion()),
                    )
                }
            };

            match paso::resolver(&arbol, ancla) {
                Ok(hallado) => {
                    etiqueta = hallado.nombre;
                    GestoDePaso::Tocar { objetivo: hallado.objetivo }
                }
                Err(motivo) => {
                    return Resultado::fallo(
                        orden.id.clone(),
                        orden.accion.clone(),
                        orden.red.clone(),
                        false,
                        motivo.codigo(),
                        motivo.descripcion(),
                    )
                }
            }
        }
        Paso::Escribir { texto } => GestoDePaso::Escribir { texto: texto.clone() },
        Paso::Esperar { ms } => GestoDePaso::Esperar { ms: *ms },
        Paso::Atras => GestoDePaso::Atras,
    };

    let hecho = mano.ejecutar_gesto(&gesto);
    if !hecho.ejecutado {
        let motivo = hecho.motivo.clone().unwrap_or_else(|| MOTIVO_SIN_MANO.to_string());
        let detalle = hecho.detalle.clone().unwrap_or_else(|| {
            format!("el aparato no entrego el paso '{}'", paso.describe())
        });
        return Resultado::fallo(
            orden.id.clone(),
            orden.accion.clone(),
            orden.red.clone(),
            false,
            motivo,
            detalle,
        );
    }

    let mut detalle = format!("{} · {}", paso.describe(), gesto.describe());
    if let Some(etiqueta) = etiqueta.filter(|e| !e.trim().is_empty()) {
        detalle = format!("{detalle} (nombre visible '{etiqueta}')");
    }
    if let Some(suyo) = hecho.detalle.as_deref().filter(|d| !d.trim().is_empty()) {
        detalle = format!("{detalle}; {suyo}");
    }

    // 4 · la comprobacion pegada al paso.
    let mut volcado = None;
    if orden.observar_despues {
        let HechoDeMano { ejecutado, volcado: foto, motivo, detalle: nota, .. } = mano.observar();
        match (ejecutado, foto) {
            (true, Some(foto)) if !foto.trim().is_empty() => {
                detalle = format!("{detalle}; despues: volcado de {} bytes", foto.len());
                volcado = Some(foto);
            }
            _ => {
                // El paso YA ocurrio: no se puede deshacer. Se contesta el fallo de
                // la comprobacion con el nombre del motivo de la mano, y el `detalle`
                // dice que el toque si se entrego. El `gestos` del resultado conserva
                // que el aparato se movio: un `ok:false` no puede borrar eso.
                let motivo = motivo.unwrap_or_else(|| MOTIVO_VOLCADO_AUSENTE.to_string());
                let nota = nota.unwrap_or_default();
                let mut fallo = Resultado::fallo(
                    orden.id.clone(),
                    orden.accion.clone(),
                    orden.red.clone(),
                    false,
                    MOTIVO_OBSERVAR_DESPUES,
                    format!("{detalle}; la mirada de despues fallo ({motivo}): {nota}"),
                );
                fallo.gestos = hecho.gestos;
                return fallo;
            }
        }
    }

    Resultado {
        id: orden.id.clone(),
        accion: orden.accion.clone(),
        red: orden.red.clone(),
        ok: true,
        simulacion: false,
        motivo: None,
        detalle: Some(detalle),
        gestos: hecho.gestos,
        volcado,
    }
}

// ---------------------------------------------------------------------------
// El bus (el puerto hacia el canal)
// ---------------------------------------------------------------------------

/// Lo que el bucle necesita del canal: tres verbos y nada mas.
///
/// Existe para poder probar el bucle entero sin red (un bus en memoria) y para
/// que el dia que el transporte cambie (otro broker, otro framing) el bucle no
/// se entere.
pub trait Bus {
    fn suscribir(&mut self, filtro: &str) -> Result<(), FalloDeCanal>;
    fn publicar(&mut self, topic: &str, payload: &[u8]) -> Result<(), FalloDeCanal>;
    fn recibir(&mut self) -> Result<Opcion, FalloDeCanal>;
}

/// Lo que puede pasar al esperar: un paquete, nada (plazo agotado) o el cierre.
///
/// "Nada" no es "el bus se cerro": en un aparato que vive dias, un plazo sin
/// trafico es lo normal. Confundir los dos haria que el bucle terminase cada vez
/// que el bus esta tranquilo.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Opcion {
    Paquete(PublicacionRecibida),
    Nada,
    Cerrado,
}

impl Bus for Canal {
    fn suscribir(&mut self, filtro: &str) -> Result<(), FalloDeCanal> {
        Canal::suscribir(self, filtro, 0)
    }

    fn publicar(&mut self, topic: &str, payload: &[u8]) -> Result<(), FalloDeCanal> {
        Canal::publicar(self, topic, payload)
    }

    fn recibir(&mut self) -> Result<Opcion, FalloDeCanal> {
        match self.leer_paquete(crate::canal::mqtt::PLAZO_LECTURA) {
            Ok(Some(paquete)) => match crate::canal::mqtt::leer_publish(&paquete) {
                Some(publicacion) => Ok(Opcion::Paquete(publicacion)),
                // Un paquete que no es un PUBLISH QoS 0 (un PINGRESP, un SUBACK)
                // no es trafico de ordenes: se descarta en silencio.
                None => Ok(Opcion::Nada),
            },
            Ok(None) => {
                // El canal distingue "plazo agotado" de "cerrado" con su bandera.
                if self.cerrado() {
                    Ok(Opcion::Cerrado)
                } else {
                    Ok(Opcion::Nada)
                }
            }
            Err(FalloDeCanal::Cerrado) => Ok(Opcion::Cerrado),
            Err(e) => Err(e),
        }
    }
}

/// Cuenta de lo que hizo el bucle. Sin esto, un bucle que ignora todo lo que
/// llega parece un bucle sano.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Resumen {
    pub atendidas: u64,
    pub contestadas: u64,
    pub fallos: u64,
    pub ignoradas: u64,
}

/// El bucle: se suscribe y atiende ordenes hasta que el bus se cierre.
///
/// `limite` corta despues de N ordenes (`None` = hasta que se cierre). Existe
/// para el CLI y para los tests: en el aparato no se pone.
pub fn servir<B, M>(bus: &mut B, mano: &mut M, limite: Option<u64>) -> Result<Resumen, FalloDeCanal>
where
    B: Bus + ?Sized,
    M: ManoDeOrdenes,
{
    bus.suscribir(TOPIC_ORDENES)?;

    let mut resumen = Resumen::default();

    loop {
        match bus.recibir()? {
            Opcion::Nada => continue,
            Opcion::Cerrado => break,
            Opcion::Paquete(publicacion) => {
                if !publicacion.topic.starts_with(PREFIJO_ORDENES) {
                    // El `#` del broker puede traer primos: no se ejecutan.
                    resumen.ignoradas += 1;
                    continue;
                }

                let resultado = match std::str::from_utf8(&publicacion.payload) {
                    Ok(texto) => atender(texto, mano),
                    Err(e) => Resultado::fallo(
                        "",
                        "",
                        "",
                        true,
                        "payload_no_utf8",
                        format!("el payload de la orden no es utf-8: {e}"),
                    ),
                };

                if resultado.ok {
                    resumen.atendidas += 1;
                } else {
                    resumen.fallos += 1;
                }

                match bus.publicar(TOPIC_RESULTADO, resultado.a_json().as_bytes()) {
                    Ok(()) => resumen.contestadas += 1,
                    Err(e) => {
                        // Un resultado que no sale se nombra y se devuelve: un
                        // bucle que sigue sin poder contestar solo acumula
                        // ordenes atendidas que nadie conoce.
                        eprintln!(
                            "canal: no se pudo publicar el resultado en {TOPIC_RESULTADO}: {e}"
                        );
                        return Err(e);
                    }
                }

                if let Some(tope) = limite {
                    if resumen.fallos + resumen.atendidas >= tope {
                        break;
                    }
                }
            }
        }
    }

    Ok(resumen)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    /// Una mano que cuenta si la llamaron y devuelve lo que se le diga.
    #[derive(Default)]
    struct ManoContada {
        llamadas: u32,
        hecho: Option<HechoDeMano>,
    }

    impl ManoDeOrdenes for ManoContada {
        fn ejecutar(&mut self, _orden: &Orden) -> HechoDeMano {
            self.llamadas += 1;
            self.hecho.clone().unwrap_or_else(|| {
                HechoDeMano::nada("sin_receta", "no hay receta declarada en este binario")
            })
        }
    }

    const ORDEN: &str = r#"{"id":"o-1","accion":"publicar","red":"instagram","texto":"hola","simulacion":true}"#;

    #[test]
    fn una_orden_sin_accion_no_se_ejecuta_y_se_contesta() {
        let mut mano = ManoContada::default();
        let resultado = atender(
            r#"{"accion":"borrar_todo","red":"instagram","texto":"x","simulacion":true}"#,
            &mut mano,
        );
        assert_eq!(resultado.motivo.as_deref(), Some("accion_fuera_del_catalogo"));
        assert!(!resultado.ok);
        assert_eq!(mano.llamadas, 0, "no se llama a la mano con una orden invalida");

        let roto = atender("{no es json", &mut mano);
        assert_eq!(roto.motivo.as_deref(), Some("json_invalido"));
        assert_eq!(mano.llamadas, 0);
    }

    #[test]
    fn simulacion_recorre_el_flujo_pero_nunca_da_el_envio_por_hecho() {
        let mut mano = ManoContada::default();
        let resultado = atender(ORDEN, &mut mano);
        assert_eq!(mano.llamadas, 1, "en simulacion se pasa por la mano");
        assert!(!resultado.ok, "una simulacion no publica nada");
        assert_eq!(resultado.motivo.as_deref(), Some(MOTIVO_SIMULACION));
        assert!(resultado.simulacion);
        assert_eq!(resultado.id, "o-1");
    }

    #[test]
    fn sin_simulacion_no_se_toca_nada() {
        let mut mano = ManoContada::default();
        let resultado = atender(
            r#"{"accion":"publicar","red":"instagram","texto":"hola","simulacion":false}"#,
            &mut mano,
        );
        assert_eq!(mano.llamadas, 0, "con simulacion:false este binario no ejecuta");
        assert_eq!(resultado.motivo.as_deref(), Some(MOTIVO_SIN_MANO_REAL));
        assert!(!resultado.ok);
    }

    #[test]
    fn un_simulacion_que_es_texto_no_se_lee_como_permiso() {
        let mut mano = ManoContada::default();
        let resultado = atender(
            r#"{"accion":"publicar","red":"instagram","texto":"hola","simulacion":"false"}"#,
            &mut mano,
        );
        assert_eq!(resultado.motivo.as_deref(), Some("campo_de_tipo_equivocado"));
        assert_eq!(mano.llamadas, 0);
    }
}
