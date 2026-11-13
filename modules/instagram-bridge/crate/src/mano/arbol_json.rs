//! `arbol_json` — de la foto que manda el movil al `Arbol` del crate.
//!
//! # Por que esto esta fuera de `cfg(android)`
//!
//! Porque es el punto donde un fallo cuesta caro y donde nadie lo veria. El
//! aparato manda el arbol como JSON (`Accesibilidad.json()`); si una clave se
//! escribe distinto en Kotlin, el crate no revienta: se queda con un arbol sin
//! nodos y el resultado es `arbol_vacio`, que es un motivo con el que se puede
//! vivir durante semanas. Con este modulo FUERA del `cfg(android)`, ese contrato
//! se prueba en escritorio con `cargo test`, sin movil.
//!
//! # El contrato (lo que manda `Accesibilidad.json`, 19a)
//!
//! ```text
//! {"lectura":"observada","pantalla":"crear","plataforma":"instagram",
//!  "cuenta_visible":"@alguien" | null,"mirada":"completa"|"parcial",
//!  "motivo_sin_mirada":"..." | null,"momento":1712345678901,
//!  "nodos":[{"id":"...","padre":"raiz"|null,"profundidad":1,"ancla":"...",
//!            "texto":"..."|null,"tipo":"boton","caja":{"x":0,"y":0,
//!            "ancho":0,"alto":0},"tocable":true}, ...]}
//!
//! {"lectura":"desconocida","motivo":"servicio_no_activo"}
//! {"ok":false,"motivo":"..."}          (respuesta de error del bucle Kotlin)
//! ```
//!
//! # El contrato del volcado (lo que manda `Volcado.leer`, 19c)
//!
//! ```text
//! {"paquete":"com.instagram.android","actividad":"..."|null,"momento":...,"truncado":false,
//!  "nodos":[{"id":0,"padre":null,"profundidad":1,"clase":"Button",
//!            "view_id":"com.instagram.android:id/publicar"|null,
//!            "texto":"..."|null,"desc":"..."|null,"hint":"..."|null,
//!            "tocable":true,"editable":false,"visible":true,"habilitado":true,
//!            "x1":0,"y1":0,"x2":10,"y2":10,"seleccionado":false,"marcado":false}, ...]}
//! ```
//!
//! Los 18 campos del nodo son `CAMPOS_DEL_NODO`. Aqui `id` es el INDICE en la
//! lista y `padre` el indice del padre (`null` = hijo de la ventana); la
//! identidad de verdad es `view_id`. No hay `lectura`: un volcado es una foto, y
//! cuando no se pudo mirar el aparato contesta `{ok:false,motivo}`. Las dos
//! formas entran por la MISMA funcion y acaban en el MISMO `Arbol`.
//!
//! **La lista llega PLANA** (preorden, con `padre` y `profundidad`), y aqui se
//! vuelve a montar el arbol: `observador` y `ejecutor` recorren `hijos`, y un
//! arbol plano convertiria cada nodo en hijo de la raiz, con lo que `padre` y la
//! profundidad del hecho visible serian mentira.
//!
//! # La regla de montaje
//!
//! Un nodo solo se cuelga de un padre que YA este colgado. Asi un `padre` que no
//! existe (o un ciclo de dos nodos que se declaran padres el uno del otro) no
//! puede producir un arbol circular: el nodo huerfano cuelga de la raiz, que es
//! lo que de verdad se sabe de el (que se vio en esa pantalla).
//!
//! # Lo que NO hace
//!
//! No rellena: un `lectura` que no reconoce no se lee como `observada`, y un
//! arbol sin nodos no se lee como "pantalla en blanco" (es `sin_nodos`, que A1
//! convierte en `ArbolVacio`).

use std::fmt;

use super::super::canal::json::{self, Valor};
use super::super::percepcion::simulador::{Arbol, Caja, Nodo, Pantalla, Tipo, LIMITE_DE_NODOS};
use super::super::percepcion::{Mirada, SinMirada};

/// El valor de `lectura` cuando el aparato SI pudo mirar.
pub const LECTURA_OBSERVADA: &str = "observada";

/// El valor de `lectura` cuando el aparato no pudo mirar y dice por que.
pub const LECTURA_DESCONOCIDA: &str = "desconocida";

/// Profundidad maxima que se reconstruye.
///
/// El arbol de Android es ancho, no profundo (una docena de niveles con suerte).
/// El tope existe para que un JSON con un ciclo de 4000 padres no reviente la
/// pila al materializar: mas alla de esto el arbol se declara PARCIAL con su
/// motivo, que es lo que se hace con cualquier mirada incompleta.
pub const LIMITE_DE_PROFUNDIDAD: usize = 64;

/// Los 18 campos que serializa un nodo `Volcado.kt` (bloque 19c).
///
/// Esta lista ES el contrato entre el movil y el crate, y vive aqui porque
/// `arbol_json` es el unico sitio que lee ese JSON. Si Kotlin anade un campo, se
/// anade aqui y en `Nodo`; el test `contrato_del_arbol_tiene_los_18_campos`
/// recorre esta constante, asi que una lista copiada en dos sitios no se puede
/// desincronizar: el fallo aparece en `cargo test`, no como `arbol_vacio` en el
/// movil tres semanas despues.
///
/// `id`, `padre` y `profundidad` describen la POSICION en la lista plana
/// (indice del nodo, indice del padre, nivel); el resto es el nodo.
pub const CAMPOS_DEL_NODO: [&str; 18] = [
    "id",
    "padre",
    "profundidad",
    "clase",
    "view_id",
    "texto",
    "desc",
    "hint",
    "tocable",
    "editable",
    "visible",
    "habilitado",
    "x1",
    "y1",
    "x2",
    "y2",
    "seleccionado",
    "marcado",
];

// ---------------------------------------------------------------------------
// El fallo
// ---------------------------------------------------------------------------

/// Por que un JSON no se pudo convertir en `Arbol`. Cada variante lleva el dato
/// que la explica: "json invalido" a secas no se puede arreglar desde el movil.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FalloDeArbol {
    /// El texto no es JSON, con el motivo del parser.
    Json(String),
    /// El JSON es valido y no es un objeto.
    NoEsObjeto { tipo: &'static str },
    /// No trae `lectura`: no se sabe si es una foto o un no-pude.
    SinLectura,
    /// El aparato declaro que no pudo mirar, con su motivo.
    NoSePudoMirar { motivo: String },
    /// `lectura` con un valor que este lado no conoce.
    LecturaDesconocida { lectura: String },
    /// No hay lista de nodos, o esta vacia: no se esta leyendo.
    SinNodos,
    /// La lista tiene algo que no es un objeto.
    NodoNoObjeto { indice: usize, tipo: &'static str },
    /// Un nodo sin id (o con el id en blanco): sin id no hay arbol que montar.
    NodoSinId { indice: usize },
    /// Un `padre` numerico que no esta en la lista: el volcado cita un nodo que
    /// no vino. Es un contrato roto, no un arbol raro.
    PadreDesconocido { indice: usize, padre: i64 },
}

impl FalloDeArbol {
    /// Nombre estable y sin tildes, para informes y logs.
    pub fn codigo(&self) -> &'static str {
        match self {
            FalloDeArbol::Json(_) => "json_invalido",
            FalloDeArbol::NoEsObjeto { .. } => "payload_no_objeto",
            FalloDeArbol::SinLectura => "sin_lectura",
            FalloDeArbol::NoSePudoMirar { .. } => "no_se_pudo_mirar",
            FalloDeArbol::LecturaDesconocida { .. } => "lectura_desconocida",
            FalloDeArbol::SinNodos => "sin_nodos",
            FalloDeArbol::NodoNoObjeto { .. } => "nodo_no_objeto",
            FalloDeArbol::NodoSinId { .. } => "nodo_sin_id",
            FalloDeArbol::PadreDesconocido { .. } => "padre_desconocido",
        }
    }

    pub fn descripcion(&self) -> String {
        match self {
            FalloDeArbol::Json(motivo) => format!("el arbol no es json: {motivo}"),
            FalloDeArbol::NoEsObjeto { tipo } => {
                format!("el arbol tiene que ser un objeto y llego un {tipo}")
            }
            FalloDeArbol::SinLectura => {
                "el arbol no dice como fue la lectura ('lectura'): no se puede saber si es una foto o un no-pude"
                    .to_string()
            }
            FalloDeArbol::NoSePudoMirar { motivo } => {
                format!("el aparato declaro que no pudo mirar: {motivo}")
            }
            FalloDeArbol::LecturaDesconocida { lectura } => {
                format!("la lectura '{lectura}' no es de este contrato")
            }
            FalloDeArbol::SinNodos => {
                "el arbol llego sin nodos: no se esta leyendo la pantalla".to_string()
            }
            FalloDeArbol::NodoNoObjeto { indice, tipo } => {
                format!("el nodo {indice} es un {tipo} y tenia que ser un objeto")
            }
            FalloDeArbol::NodoSinId { indice } => {
                format!("el nodo {indice} no trae id: sin id no se puede montar el arbol")
            }
            FalloDeArbol::PadreDesconocido { indice, padre } => format!(
                "el nodo {indice} dice colgar del nodo {padre} y ese nodo no vino en la lista"
            ),
        }
    }

    /// El motivo de no-mirada que este fallo significa para A1, si lo hay.
    ///
    /// Se traduce aqui y no en `mano::android` para que la tabla este en UN
    /// sitio: el dia que aparezca un motivo nuevo en el contrato, se anade en
    /// esta funcion y lo ven todos los que leen arboles.
    pub fn sin_mirada(&self) -> Option<SinMirada> {
        match self {
            FalloDeArbol::NoSePudoMirar { motivo } => Some(sin_mirada_de(motivo)),
            FalloDeArbol::SinNodos => Some(SinMirada::ArbolVacio),
            FalloDeArbol::Json(_)
            | FalloDeArbol::NoEsObjeto { .. }
            | FalloDeArbol::SinLectura
            | FalloDeArbol::LecturaDesconocida { .. }
            | FalloDeArbol::NodoNoObjeto { .. }
            | FalloDeArbol::NodoSinId { .. }
            | FalloDeArbol::PadreDesconocido { .. } => Some(SinMirada::AparatoAusente),
        }
    }
}

impl fmt::Display for FalloDeArbol {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.codigo(), self.descripcion())
    }
}

/// Traduce el motivo del aparato al motivo declarado de A1.
///
/// Lo que no esta en la tabla NO se adivina: cae en `AparatoAusente`, que es el
/// lado seguro (no se opera). `sin_sesion` solo lo puede decir el cerebro, pero
/// si el aparato lo manda se respeta.
///
/// Es publica porque `mano::android` la necesita para el caso en que el aparato
/// contesta un fallo que no es sobre el arbol (un gesto que no se entrego).
pub fn sin_mirada_de(motivo: &str) -> SinMirada {
    match motivo.trim().to_ascii_lowercase().as_str() {
        "ocupado" | "pantalla_bloqueada" => SinMirada::Ocupado,
        "sin_sesion" => SinMirada::SinSesion,
        "arbol_vacio" => SinMirada::ArbolVacio,
        _ => SinMirada::AparatoAusente,
    }
}

// ---------------------------------------------------------------------------
// Leer
// ---------------------------------------------------------------------------

/// El arbol de una foto del aparato.
pub fn desde_json(texto: &str) -> Result<Arbol, FalloDeArbol> {
    let valor = json::leer(texto).map_err(|e| FalloDeArbol::Json(e.to_string()))?;
    desde_valor(&valor)
}

/// Lo mismo, con el JSON ya parseado.
///
/// Acepta las DOS formas que existen del mismo dato, porque el contrato es uno
/// pero los emisores son dos:
///
///   - `Accesibilidad.json()` (19a): trae `lectura`, `pantalla`,
///     `cuenta_visible`, `mirada` y nodos con `id` de texto, `ancla`, `tipo` y
///     `caja`.
///   - `Volcado.leer()` (19c): el volcado crudo, con `paquete`, `actividad`,
///     `truncado` y los 18 campos del nodo (`view_id`, `clase`, `hint`, `x1..y2`,
///     las seis banderas). No trae `lectura`: un volcado es una foto, y si no se
///     pudo mirar el aparato contesta `{ok:false,motivo}`.
///
/// Las dos formas acaban en el MISMO `Arbol`. Tener dos lectores seria tener dos
/// comportamientos: el de produccion seria el que nadie prueba.
pub fn desde_valor(valor: &Valor) -> Result<Arbol, FalloDeArbol> {
    if !matches!(valor, Valor::Objeto(_)) {
        return Err(FalloDeArbol::NoEsObjeto { tipo: valor.tipo() });
    }

    // El bucle Kotlin puede envolver la foto en `{"ok":true,"arbol":{...}}`.
    // Se aceptan las dos formas y se trabaja siempre sobre el objeto de dentro:
    // dos formas de leer el mismo dato acabarian en dos comportamientos.
    let foto = match valor.obtener("arbol") {
        Some(envuelto @ Valor::Objeto(_)) => envuelto,
        _ => valor,
    };

    if let Some(false) = foto.obtener("ok").and_then(Valor::como_bool) {
        return Err(FalloDeArbol::NoSePudoMirar { motivo: motivo_de(foto) });
    }

    // `lectura`: la manda `Accesibilidad.json()`. El volcado de 19c NO la trae
    // porque una foto cruda no declara como fue la mirada. Un objeto con `nodos`
    // y sin `lectura` es un volcado, y un volcado es una lectura observada; se
    // exige `nodos` para no convertir cualquier objeto suelto en "observada".
    let lectura = match texto_de(foto, "lectura") {
        Some(t) => t.trim().to_ascii_lowercase(),
        // La huella del volcado: `paquete` (que `Volcado.leer()` escribe
        // siempre) o una lista de nodos con algo dentro. Un objeto con `nodos:[]`
        // y sin nada mas NO es un volcado: es un payload al que le falta decir
        // como fue la lectura, y eso se nombra (`sin_lectura`).
        None if es_volcado(foto) => LECTURA_OBSERVADA.to_string(),
        None => return Err(FalloDeArbol::SinLectura),
    };

    match lectura.as_str() {
        LECTURA_OBSERVADA => {}
        LECTURA_DESCONOCIDA => return Err(FalloDeArbol::NoSePudoMirar { motivo: motivo_de(foto) }),
        otra => {
            return Err(FalloDeArbol::LecturaDesconocida { lectura: otra.to_string() });
        }
    }

    let nodos = match foto.obtener("nodos") {
        Some(Valor::Lista(nodos)) if !nodos.is_empty() => nodos,
        _ => return Err(FalloDeArbol::SinNodos),
    };

    // Primero las identidades: `padre` puede venir como INDICE (volcado) y hay
    // que traducirlo al id del nodo padre antes de leer los nodos.
    let mut usadas: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut identidades: Vec<String> = Vec::with_capacity(nodos.len().min(LIMITE_DE_NODOS));
    for (indice, crudo) in nodos.iter().enumerate().take(LIMITE_DE_NODOS) {
        if !matches!(crudo, Valor::Objeto(_)) {
            return Err(FalloDeArbol::NodoNoObjeto { indice, tipo: crudo.tipo() });
        }
        match identidad(indice, crudo, &mut usadas) {
            Some(id) => identidades.push(id),
            None => return Err(FalloDeArbol::NodoSinId { indice }),
        }
    }

    let mut sueltos: Vec<Suelto> = Vec::with_capacity(identidades.len());
    for (indice, crudo) in nodos.iter().enumerate().take(LIMITE_DE_NODOS) {
        sueltos.push(leer_nodo(indice, crudo, &identidades)?);
    }

    let truncado_declarado = booleano_de(foto, &["truncado"], false);
    let mut truncado = sueltos.len() < nodos.len();

    let mut arbol = Arbol::nuevo(Pantalla::desde_str(texto_de(foto, "pantalla").unwrap_or("")));
    arbol.plataforma = plataforma_de(foto);
    arbol.cuenta_visible = texto_de(foto, "cuenta_visible")
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty())
        // El volcado no trae la cuenta: se deduce de lo que el aparato declaro
        // (misma pista que usaba `Accesibilidad.cuentaVisible`).
        .or_else(|| cuenta_visible_en(nodos));
    arbol.mirada = match texto_de(foto, "mirada") {
        Some(m) if m.trim().eq_ignore_ascii_case("parcial") => Mirada::Parcial,
        Some(_) => Mirada::Completa,
        // Sin `mirada`, un volcado recortado por el tope del aparato es parcial.
        None if truncado_declarado => Mirada::Parcial,
        None => Mirada::Completa,
    };
    // Una mirada parcial sin motivo no entra (regla de A1): si el aparato solo
    // dijo `truncado:true`, el motivo es ese y se nombra.
    arbol.motivo_sin_mirada = texto_de(foto, "motivo_sin_mirada")
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty())
        .or_else(|| {
            if arbol.mirada == Mirada::Parcial {
                Some("arbol_truncado".to_string())
            } else {
                None
            }
        });
    // `version` es el sello de la foto. El aparato no lo manda, manda el
    // instante en que miro: es lo unico que distingue una foto de otra, y
    // inventar un contador propio diria "la foto 1, la foto 2" sin poder
    // compararlas con nada de fuera.
    arbol.version = numero_de(foto, "version")
        .or_else(|| numero_de(foto, "momento"))
        .unwrap_or(0);

    arbol.raiz.hijos = montar(&sueltos, &mut truncado);

    // El truncamiento local si tiene motivo, y se declara.
    if truncado && arbol.mirada == Mirada::Completa {
        arbol.mirada = Mirada::Parcial;
        arbol.motivo_sin_mirada = Some("arbol_truncado".to_string());
    }

    Ok(arbol)
}

fn motivo_de(foto: &Valor) -> String {
    texto_de(foto, "motivo")
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| "el aparato no dijo por que".to_string())
}

fn texto_de<'a>(valor: &'a Valor, clave: &str) -> Option<&'a str> {
    match valor.obtener(clave) {
        Some(Valor::Texto(t)) => Some(t.as_str()),
        _ => None,
    }
}

fn numero_de(valor: &Valor, clave: &str) -> Option<u64> {
    match valor.obtener(clave) {
        Some(Valor::Numero(n)) if *n >= 0.0 => Some(*n as u64),
        _ => None,
    }
}

fn booleano_de(valor: &Valor, claves: &[&str], por_defecto: bool) -> bool {
    for clave in claves {
        if let Some(b) = valor.obtener(clave).and_then(Valor::como_bool) {
            return b;
        }
    }
    por_defecto
}

fn entero_de(valor: &Valor, clave: &str) -> Option<i32> {
    match valor.obtener(clave) {
        Some(Valor::Numero(n)) => Some(*n as i32),
        _ => None,
    }
}

/// La plataforma de la foto: la que declara el contrato viejo o, en un volcado,
/// la que dice el `paquete` de la ventana.
///
/// Un paquete que no es Instagram se nombra tal cual: el arbol es de otra app y
/// quien lo lea tiene que poder verlo, en vez de leer "instagram" por defecto.
fn plataforma_de(foto: &Valor) -> String {
    if let Some(plataforma) = texto_de(foto, "plataforma").map(str::trim).filter(|p| !p.is_empty()) {
        return plataforma.to_string();
    }
    match texto_de(foto, "paquete").map(str::trim).filter(|p| !p.is_empty()) {
        Some(paquete) if paquete.to_ascii_lowercase().contains("instagram") => {
            "instagram".to_string()
        }
        Some(paquete) => paquete.to_string(),
        None => "instagram".to_string(),
    }
}

/// ¿Este objeto es un volcado crudo (`Volcado.leer()`, 19c)?
///
/// Se reconoce por lo que ese emisor escribe siempre: `paquete` o una lista de
/// nodos con algo dentro. No se adivina por la ausencia de `lectura` a secas: un
/// payload sin `lectura` y sin nada mas no es una foto, es un contrato roto.
fn es_volcado(foto: &Valor) -> bool {
    if texto_de(foto, "paquete").map(str::trim).is_some_and(|p| !p.is_empty()) {
        return true;
    }
    matches!(foto.obtener("nodos"), Some(Valor::Lista(nodos)) if !nodos.is_empty())
}

/// El handle sin `@` ni espacios: cosmetico, no comparativo.
fn normalizar_handle(v: &str) -> String {
    v.trim().trim_start_matches('@').trim().to_string()
}

/// La cuenta que se ve, si se ve, mirando los nodos CRUDOS.
///
/// Es la misma pista que usaba `Accesibilidad.cuentaVisible` (`view_id` con
/// `username`, `action_bar_title` o `profile_header`), pero funciona sobre el
/// volcado, que no trae `cuenta_visible` en la cabecera. Si no se encuentra,
/// `None` — y `None` es "no se vio", que U1 trata como indeterminado y por tanto
/// como parada. Nunca se rellena con la cuenta esperada.
fn cuenta_visible_en(nodos: &[Valor]) -> Option<String> {
    const PISTAS: [&str; 3] = ["username", "action_bar_title", "profile_header"];
    for crudo in nodos {
        let id = match texto_de(crudo, "view_id") {
            Some(id) => id.to_ascii_lowercase(),
            None => continue,
        };
        if !PISTAS.iter().any(|pista| id.contains(pista)) {
            continue;
        }
        if !booleano_de(crudo, &["visible", "visible_al_usuario"], true) {
            continue;
        }
        let candidato = texto_de(crudo, "texto").or_else(|| texto_de(crudo, "desc"));
        if let Some(candidato) = candidato {
            let handle = normalizar_handle(candidato);
            if !handle.is_empty() {
                return Some(handle);
            }
        }
    }
    None
}

/// La identidad de un nodo: su id de Android o, si no declara ninguno,
/// `nodo:<indice>`.
///
/// `Accesibilidad.json()` manda `id` como TEXTO (ya es la identidad); el volcado
/// manda `id` como NUMERO (el indice en la lista) y la identidad de verdad en
/// `view_id`. Distinguirlos por el tipo no es un truco: es lo que dice el
/// contrato de cada emisor.
///
/// Se desambigua al repetir. `view_id` NO es unico (hay diez `image_button`
/// iguales) y `montar` cuelga los hijos por id del padre, asi que dos nodos con
/// el mismo id recibirian LOS DOS la misma lista de hijos y el arbol saldria
/// duplicado. El primero se queda con el nombre limpio (es el que una receta
/// escrita a mano cita) y los siguientes llevan `#indice`.
fn identidad(indice: usize, crudo: &Valor, usadas: &mut std::collections::HashSet<String>) -> Option<String> {
    let base = match crudo.obtener("id") {
        // Contrato viejo: `id` ya es el nombre del nodo.
        Some(Valor::Texto(t)) if !t.trim().is_empty() => t.trim().to_string(),
        // Volcado: `id` es el INDICE; el nombre de verdad es el `view_id`.
        Some(Valor::Numero(_)) => match texto_de(crudo, "view_id").map(str::trim).filter(|t| !t.is_empty()) {
            Some(view_id) => view_id.to_string(),
            None => format!("nodo:{indice}"),
        },
        // Sin `id` no hay identidad que inventar: un nodo sin nombre no se
        // puede colgar ni citar en una receta.
        _ => return None,
    };
    if usadas.insert(base.clone()) {
        return Some(base);
    }
    let unico = format!("{base}#{indice}");
    usadas.insert(unico.clone());
    Some(unico)
}

/// Que es el nodo.
///
/// Con `tipo` (contrato viejo) se traduce directo. Con los datos del volcado se
/// aplica la MISMA tabla que `Accesibilidad.tipoDe`: se mira lo que el aparato
/// declara (`editable`, `clase`, `tocable`) y no se adivina por el texto.
fn tipo_de(crudo: &Valor) -> Tipo {
    if let Some(tipo) = texto_de(crudo, "tipo").map(str::trim).filter(|t| !t.is_empty()) {
        return Tipo::desde_str(tipo);
    }
    let clase = texto_de(crudo, "clase").unwrap_or("");
    if booleano_de(crudo, &["editable"], false) || clase.contains("EditText") {
        Tipo::Campo
    } else if clase.contains("Button") {
        Tipo::Boton
    } else if clase.contains("TextView") {
        Tipo::Texto
    } else if clase.contains("ImageView") || clase.contains("ImageButton") {
        Tipo::Imagen
    } else if booleano_de(crudo, &["tocable"], false) {
        Tipo::Boton
    } else {
        Tipo::Desconocido
    }
}

/// La caja del nodo: `{x,y,ancho,alto}` (contrato viejo) o las cuatro esquinas
/// `x1,y1,x2,y2` del volcado (`getBoundsInScreen`).
///
/// Se guarda tal cual, sin normalizar: una caja de tamano cero conserva su
/// posicion y `esta_vacia()` la reconoce.
fn caja_de(crudo: &Valor) -> Caja {
    if let Some(caja) = crudo.obtener("caja") {
        if matches!(caja, Valor::Objeto(_)) {
            let entero = |clave: &str| -> i32 { entero_de(caja, clave).unwrap_or(0) };
            return Caja::nueva(entero("x"), entero("y"), entero("ancho"), entero("alto"));
        }
    }
    match (
        entero_de(crudo, "x1"),
        entero_de(crudo, "y1"),
        entero_de(crudo, "x2"),
        entero_de(crudo, "y2"),
    ) {
        (Some(x1), Some(y1), Some(x2), Some(y2)) => {
            Caja::nueva(x1, y1, (x2 - x1).max(0), (y2 - y1).max(0))
        }
        _ => Caja::default(),
    }
}

// ---------------------------------------------------------------------------
// Montar el arbol (la lista plana vuelve a ser un arbol)
// ---------------------------------------------------------------------------

/// Un nodo de la lista, con lo que hace falta para colgarlo.
struct Suelto {
    id: String,
    padre: Option<String>,
    nodo: Nodo,
}

fn leer_nodo(indice: usize, crudo: &Valor, identidades: &[String]) -> Result<Suelto, FalloDeArbol> {
    if !matches!(crudo, Valor::Objeto(_)) {
        return Err(FalloDeArbol::NodoNoObjeto { indice, tipo: crudo.tipo() });
    }

    // La identidad ya se calculo (y se desambiguo) en una pasada previa: aqui
    // solo se recoge, para que `padre` por indice apunte al MISMO nombre.
    let id = match identidades.get(indice) {
        Some(id) if !id.is_empty() => id.clone(),
        _ => return Err(FalloDeArbol::NodoSinId { indice }),
    };

    let texto = texto_de(crudo, "texto").map(|t| t.to_string()).filter(|t| !t.trim().is_empty());
    let descripcion = texto_de(crudo, "descripcion")
        .or_else(|| texto_de(crudo, "desc"))
        .map(|t| t.to_string())
        .filter(|t| !t.trim().is_empty())
        // El contrato viejo manda `ancla` (texto o descripcion, ya resuelto). Si
        // no hay `texto`, el ancla ES la descripcion: guardarla ahi es lo que
        // hace que `Nodo::ancla()` encuentre el nombre visible.
        .or_else(|| {
            if texto.is_some() {
                None
            } else {
                texto_de(crudo, "ancla").map(|t| t.to_string()).filter(|t| !t.trim().is_empty())
            }
        });

    let habilitado = booleano_de(crudo, &["habilitado"], true);
    let tocable = booleano_de(crudo, &["tocable"], false) && habilitado;

    let nodo = Nodo {
        id: id.clone(),
        texto,
        descripcion,
        tipo: tipo_de(crudo),
        caja: caja_de(crudo),
        tocable,
        // Ausente vale `true` (si viajo, se vio). El volcado manda `visible`
        // tambien para los nodos ocultos, con `false`: para escribir una receta
        // hacen falta (explican por que el boton de al lado no responde).
        visible_al_usuario: booleano_de(crudo, &["visible_al_usuario", "visible"], true),
        clase: texto_de(crudo, "clase").map(|c| c.trim().to_string()).filter(|c| !c.is_empty()),
        hint: texto_de(crudo, "hint").map(|h| h.trim().to_string()).filter(|h| !h.is_empty()),
        editable: booleano_de(crudo, &["editable"], false),
        habilitado,
        seleccionado: booleano_de(crudo, &["seleccionado"], false),
        marcado: booleano_de(crudo, &["marcado"], false),
        hijos: Vec::new(),
    };

    let padre = match crudo.obtener("padre") {
        // Contrato viejo: el id del padre como texto ("raiz" = la ventana).
        Some(Valor::Texto(t)) => {
            let t = t.trim();
            if t.is_empty() || t == "raiz" {
                None
            } else {
                Some(t.to_string())
            }
        }
        // Volcado: el INDICE del padre en la lista plana (`null` = la ventana).
        Some(Valor::Numero(n)) => {
            let padre = *n as i64;
            if padre < 0 || padre as usize >= identidades.len() {
                return Err(FalloDeArbol::PadreDesconocido { indice, padre });
            }
            Some(identidades[padre as usize].clone())
        }
        _ => None,
    };

    Ok(Suelto { id, padre, nodo })
}

/// Monta el arbol: cada nodo se cuelga de su `padre` SI el padre ya esta
/// colgado; si no, de la raiz.
///
/// Sin recursion al montar (solo al materializar, con tope): el bucle de
/// colgado es lo que garantiza que no hay ciclos.
fn montar(sueltos: &[Suelto], truncado: &mut bool) -> Vec<Nodo> {
    // Indices de los hijos por id del padre, en orden de documento.
    let mut hijos_por_padre: std::collections::HashMap<&str, Vec<usize>> =
        std::collections::HashMap::new();
    let mut de_la_raiz: Vec<usize> = Vec::new();

    let mut colgados: Vec<bool> = vec![false; sueltos.len()];
    let mut ids_colgados: std::collections::HashSet<&str> = std::collections::HashSet::new();
    ids_colgados.insert("raiz");

    // Varias pasadas: un nodo puede venir antes que su padre (el orden del
    // preorden no lo garantiza si el JSON se reordeno). Cada pasada cuelga los
    // que ya pueden colgarse; se para cuando una pasada no cuelga ninguno.
    loop {
        let mut alguno = false;
        for (indice, suelto) in sueltos.iter().enumerate() {
            if colgados[indice] {
                continue;
            }
            match suelto.padre.as_deref() {
                Some(padre) if ids_colgados.contains(padre) => {
                    // Dos nodos con el mismo id: el segundo NO se cuelga del
                    // primero (seria mentir sobre quien es hijo de quien). Se
                    // queda para la raiz si no tiene padre propio.
                    hijos_por_padre.entry(padre).or_default().push(indice);
                    ids_colgados.insert(suelto.id.as_str());
                    colgados[indice] = true;
                    alguno = true;
                }
                None => {
                    de_la_raiz.push(indice);
                    ids_colgados.insert(suelto.id.as_str());
                    colgados[indice] = true;
                    alguno = true;
                }
                Some(_) => {}
            }
        }
        if !alguno {
            break;
        }
    }

    // Los que quedaron sin colgar (padre inexistente, o un ciclo): a la raiz.
    // Es lo unico que se sabe de ellos: se vieron en esta pantalla.
    for (indice, colgado) in colgados.iter().enumerate() {
        if !colgado {
            de_la_raiz.push(indice);
            *truncado = true;
        }
    }
    de_la_raiz.sort_unstable();

    let mut visitados = vec![false; sueltos.len()];
    let mut salida = Vec::with_capacity(de_la_raiz.len());
    for indice in de_la_raiz {
        let (nodo, profundo) = materializar(indice, sueltos, &hijos_por_padre, &mut visitados, 0);
        if profundo {
            *truncado = true;
        }
        salida.push(nodo);
    }
    salida
}

fn materializar(
    indice: usize,
    sueltos: &[Suelto],
    hijos_por_padre: &std::collections::HashMap<&str, Vec<usize>>,
    visitados: &mut Vec<bool>,
    profundidad: usize,
) -> (Nodo, bool) {
    let mut nodo = sueltos[indice].nodo.clone();
    if visitados[indice] {
        // Ya se materializo en otra rama: no se duplica (un nodo, un sitio).
        return (nodo, true);
    }
    visitados[indice] = true;

    if profundidad >= LIMITE_DE_PROFUNDIDAD {
        return (nodo, true);
    }

    let mut truncado = false;
    if let Some(hijos) = hijos_por_padre.get(suelto_id(sueltos, indice)) {
        for hijo in hijos {
            if visitados[*hijo] {
                truncado = true;
                continue;
            }
            let (nodo_hijo, profundo) =
                materializar(*hijo, sueltos, hijos_por_padre, visitados, profundidad + 1);
            truncado = truncado || profundo;
            nodo.hijos.push(nodo_hijo);
        }
    }
    (nodo, truncado)
}

fn suelto_id<'a>(sueltos: &'a [Suelto], indice: usize) -> &'a str {
    sueltos[indice].id.as_str()
}

// ---------------------------------------------------------------------------
// Pruebas (corren en escritorio: este modulo no es de Android)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod pruebas {
    use super::*;

    const FOTO: &str = r#"{
        "lectura":"observada",
        "pantalla":"crear",
        "plataforma":"instagram",
        "cuenta_visible":"@alguien",
        "mirada":"completa",
        "motivo_sin_mirada":null,
        "momento":1712345678901,
        "nodos":[
          {"id":"com.instagram.android:id/barra","padre":"raiz","profundidad":1,
           "ancla":null,"texto":null,"tipo":"desconocido",
           "caja":{"x":0,"y":0,"ancho":1080,"alto":120},"tocable":false},
          {"id":"com.instagram.android:id/publicar","padre":"com.instagram.android:id/barra",
           "profundidad":2,"ancla":"Publicar","texto":"Publicar","tipo":"boton",
           "caja":{"x":900,"y":20,"ancho":160,"alto":80},"tocable":true}
        ]
    }"#;

    #[test]
    fn una_foto_del_aparato_se_convierte_en_arbol_y_conserva_la_jerarquia() {
        let arbol = desde_json(FOTO).expect("la foto del contrato tiene que entrar");
        assert_eq!(arbol.pantalla, Pantalla::Crear);
        assert_eq!(arbol.cuenta_visible.as_deref(), Some("@alguien"));
        assert_eq!(arbol.mirada, Mirada::Completa);
        assert_eq!(arbol.version, 1712345678901);
        assert_eq!(arbol.raiz.hijos.len(), 1, "la barra cuelga de la raiz");

        let barra = &arbol.raiz.hijos[0];
        assert_eq!(barra.hijos.len(), 1, "el boton cuelga de la barra, no de la raiz");
        let boton = &barra.hijos[0];
        assert_eq!(boton.ancla(), Some("Publicar"));
        assert_eq!(boton.tipo, Tipo::Boton);
        assert!(boton.tocable);
        assert_eq!(boton.caja.centro(), (980, 60));
    }

    #[test]
    fn el_ancla_hace_de_descripcion_cuando_no_hay_texto() {
        let foto = r#"{"lectura":"observada","nodos":[
            {"id":"a","padre":"raiz","ancla":"Siguiente","texto":null,"tipo":"boton",
             "caja":{"x":0,"y":0,"ancho":10,"alto":10},"tocable":true}]}"#;
        let arbol = desde_json(foto).expect("entra");
        assert_eq!(arbol.raiz.hijos[0].ancla(), Some("Siguiente"));
    }

    #[test]
    fn un_no_pude_mirar_llega_como_motivo_y_no_como_arbol_vacio() {
        let fallo = desde_json(r#"{"lectura":"desconocida","motivo":"ocupado"}"#)
            .expect_err("un no-pude no es un arbol");
        assert_eq!(fallo.codigo(), "no_se_pudo_mirar");
        assert_eq!(fallo.sin_mirada(), Some(SinMirada::Ocupado));

        // La forma de error del bucle Kotlin tambien se entiende.
        let fallo = desde_json(r#"{"ok":false,"motivo":"servicio_no_activo"}"#)
            .expect_err("un ok:false no es un arbol");
        assert_eq!(fallo.sin_mirada(), Some(SinMirada::AparatoAusente));
    }

    #[test]
    fn una_foto_sin_nodos_es_sin_nodos_y_no_una_pantalla_en_blanco() {
        let fallo = desde_json(r#"{"lectura":"observada","nodos":[]}"#)
            .expect_err("sin nodos no hay arbol");
        assert_eq!(fallo.codigo(), "sin_nodos");
        assert_eq!(fallo.sin_mirada(), Some(SinMirada::ArbolVacio));
    }

    #[test]
    fn un_padre_que_no_existe_o_un_ciclo_cuelgan_de_la_raiz_y_la_foto_es_parcial() {
        let foto = r#"{"lectura":"observada","nodos":[
            {"id":"a","padre":"b","texto":"A","tipo":"texto","caja":{"x":0,"y":0,"ancho":1,"alto":1}},
            {"id":"b","padre":"a","texto":"B","tipo":"texto","caja":{"x":0,"y":0,"ancho":1,"alto":1}},
            {"id":"c","padre":"fantasma","texto":"C","tipo":"texto","caja":{"x":0,"y":0,"ancho":1,"alto":1}}]}"#;
        let arbol = desde_json(foto).expect("entra");
        // Un ciclo no puede colgar los dos: uno se queda huerfano y cuelga de
        // la raiz. Lo que NUNCA pasa es un arbol circular.
        let total = contar(&arbol.raiz);
        assert_eq!(total, 4, "raiz + tres nodos, cada uno en un solo sitio");
        assert_eq!(arbol.mirada, Mirada::Parcial);
        assert_eq!(arbol.motivo_sin_mirada.as_deref(), Some("arbol_truncado"));
    }

    #[test]
    fn un_nodo_sin_id_se_nombra_en_vez_de_inventarse() {
        let fallo = desde_json(r#"{"lectura":"observada","nodos":[{"texto":"x"}]}"#)
            .expect_err("un nodo sin id no entra");
        assert_eq!(fallo.codigo(), "nodo_sin_id");
    }

    #[test]
    fn lo_que_no_es_json_o_no_es_objeto_se_nombra() {
        assert_eq!(desde_json("{no es json").unwrap_err().codigo(), "json_invalido");
        assert_eq!(desde_json("[1,2]").unwrap_err().codigo(), "payload_no_objeto");
        assert_eq!(desde_json(r#"{"nodos":[]}"#).unwrap_err().codigo(), "sin_lectura");
        assert_eq!(
            desde_json(r#"{"lectura":"casi","nodos":[{"id":"a"}]}"#).unwrap_err().codigo(),
            "lectura_desconocida"
        );
    }

    fn contar(nodo: &Nodo) -> usize {
        1 + nodo.hijos.iter().map(contar).sum::<usize>()
    }
}
