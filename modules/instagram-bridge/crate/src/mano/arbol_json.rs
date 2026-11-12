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
//! # El contrato (lo que manda `Accesibilidad.json`)
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
            | FalloDeArbol::NodoSinId { .. } => Some(SinMirada::AparatoAusente),
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

    let lectura = foto
        .obtener("lectura")
        .and_then(Valor::como_texto)
        .map(|t| t.trim().to_ascii_lowercase())
        .ok_or(FalloDeArbol::SinLectura)?;

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

    let mut sueltos: Vec<Suelto> = Vec::with_capacity(nodos.len().min(LIMITE_DE_NODOS));
    for (indice, crudo) in nodos.iter().enumerate() {
        if indice >= LIMITE_DE_NODOS {
            // El tope del aparato y el del crate son el mismo numero: si llega
            // mas, el JSON no es de este contrato. Se corta y la foto sera
            // parcial, que es lo que se hace con una lectura incompleta.
            break;
        }
        sueltos.push(leer_nodo(indice, crudo)?);
    }

    let mut arbol = Arbol::nuevo(Pantalla::desde_str(texto_de(foto, "pantalla").unwrap_or("")));
    arbol.plataforma = texto_de(foto, "plataforma").unwrap_or("instagram").trim().to_string();
    if arbol.plataforma.is_empty() {
        arbol.plataforma = "instagram".to_string();
    }
    arbol.cuenta_visible = texto_de(foto, "cuenta_visible").map(|c| c.trim().to_string());
    arbol.mirada = match texto_de(foto, "mirada") {
        Some(m) if m.trim().eq_ignore_ascii_case("parcial") => Mirada::Parcial,
        _ => Mirada::Completa,
    };
    arbol.motivo_sin_mirada = texto_de(foto, "motivo_sin_mirada")
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty());
    // `version` es el sello de la foto. El aparato no lo manda, manda el
    // instante en que miro: es lo unico que distingue una foto de otra, y
    // inventar un contador propio diria "la foto 1, la foto 2" sin poder
    // compararlas con nada de fuera.
    arbol.version = numero_de(foto, "version")
        .or_else(|| numero_de(foto, "momento"))
        .unwrap_or(0);

    let mut truncado = sueltos.len() < nodos.len();
    arbol.raiz.hijos = montar(&sueltos, &mut truncado);

    // Una mirada parcial sin motivo no entra (regla de A1). El truncamiento
    // local si tiene motivo, y se declara.
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

fn caja_de(valor: &Valor) -> Caja {
    let caja = match valor.obtener("caja") {
        Some(c @ Valor::Objeto(_)) => c,
        _ => return Caja::default(),
    };
    let entero = |clave: &str| -> i32 {
        match caja.obtener(clave) {
            Some(Valor::Numero(n)) => *n as i32,
            _ => 0,
        }
    };
    Caja::nueva(entero("x"), entero("y"), entero("ancho"), entero("alto"))
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

fn leer_nodo(indice: usize, crudo: &Valor) -> Result<Suelto, FalloDeArbol> {
    if !matches!(crudo, Valor::Objeto(_)) {
        return Err(FalloDeArbol::NodoNoObjeto { indice, tipo: crudo.tipo() });
    }

    let id = texto_de(crudo, "id").map(|t| t.trim().to_string()).unwrap_or_default();
    if id.is_empty() {
        return Err(FalloDeArbol::NodoSinId { indice });
    }

    let texto = texto_de(crudo, "texto").map(|t| t.to_string()).filter(|t| !t.trim().is_empty());
    let descripcion = texto_de(crudo, "descripcion")
        .map(|t| t.to_string())
        .filter(|t| !t.trim().is_empty())
        // El aparato manda `ancla` (texto o descripcion, ya resuelto). Si no
        // hay `texto`, el ancla ES la descripcion: guardarla ahi es lo que hace
        // que `Nodo::ancla()` encuentre el nombre visible.
        .or_else(|| {
            if texto.is_some() {
                None
            } else {
                texto_de(crudo, "ancla").map(|t| t.to_string()).filter(|t| !t.trim().is_empty())
            }
        });

    let nodo = Nodo {
        id: id.clone(),
        texto,
        descripcion,
        tipo: Tipo::desde_str(texto_de(crudo, "tipo").unwrap_or("")),
        caja: caja_de(crudo),
        tocable: booleano_de(crudo, &["tocable"], false),
        // `Accesibilidad.kt` ya no entrega lo invisible. Se acepta la clave por
        // si algun dia la manda, y ausente vale `true` (si viajo, se vio).
        visible_al_usuario: booleano_de(crudo, &["visible_al_usuario", "visible"], true),
        hijos: Vec::new(),
    };

    let padre = texto_de(crudo, "padre")
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty() && t != "raiz");

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
