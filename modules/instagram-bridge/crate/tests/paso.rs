//! instagram-bridge · bloque 19d: EL INTERPRETE DE PASOS
//!
//! Esta suite fija lo que el pilotaje paso a paso no puede relajar:
//!
//!   - **un paso se traduce a UN gesto** y viaja a la mano con el nodo y el punto
//!     ya resueltos (el ancla se busca aqui, no en el aparato);
//!   - **un angla que no esta se nombra** (`ancla_no_encontrada`, con el ancla
//!     dentro) y no se toca nada;
//!   - **dos nodos con el mismo ancla no se eligen al azar** (`ancla_ambigua` con
//!     cuantos): Instagram repite `image_button` diez veces;
//!   - **en simulacion no se toca el movil**: ausente = simulacion, y entonces ni
//!     una mirada;
//!   - **la comprobacion viaja pegada**: `observar_despues` (por defecto si)
//!     adjunta el volcado de DESPUES del paso, no el que sirvio para resolver el
//!     ancla.
//!
//! Todo en escritorio, con una mano falsa que apunta lo que le piden: el movil no
//! hace falta para probar el contrato.

use enki_instagram_bridge::canal::bucle::{
    atender, HechoDeMano, ManoDeOrdenes, Orden, ACCIONES, ACCION_PASO, MOTIVO_SIMULACION,
};
use enki_instagram_bridge::canal::json::{self, Valor};
use enki_instagram_bridge::canal::paso::{AnclaDePaso, GestoDePaso, Paso};

// ---------------------------------------------------------------------------
// La mano falsa: apunta lo que le piden y devuelve la foto que se le diga
// ---------------------------------------------------------------------------

/// Una mano que NO toca: apunta cada gesto y cada mirada.
///
/// `volcados` es una cola: la primera mirada sirve para resolver el ancla y la
/// segunda es la de despues del paso. Asi se puede comprobar que el volcado que
/// viaja en el resultado es el de despues y no el de antes.
#[derive(Default)]
struct ManoQueApunta {
    volcados: Vec<String>,
    gestos: Vec<GestoDePaso>,
    miradas: usize,
}

impl ManoQueApunta {
    fn con_volcados(volcados: Vec<String>) -> Self {
        Self { volcados, gestos: Vec::new(), miradas: 0 }
    }

    /// La foto que devuelve la mirada numero `miradas` (y la ultima, si se acaban).
    fn foto(&self) -> String {
        match self.volcados.len() {
            0 => String::new(),
            n => self.volcados[self.miradas.saturating_sub(1).min(n - 1)].clone(),
        }
    }
}

impl ManoDeOrdenes for ManoQueApunta {
    fn ejecutar(&mut self, _orden: &Orden) -> HechoDeMano {
        HechoDeMano::nada("sin_receta", "esta mano de prueba no ejecuta ordenes enteras")
    }

    fn observar(&mut self) -> HechoDeMano {
        self.miradas += 1;
        HechoDeMano::con_volcado(self.foto(), "volcado de prueba")
    }

    fn ejecutar_gesto(&mut self, gesto: &GestoDePaso) -> HechoDeMano {
        self.gestos.push(gesto.clone());
        let gestos = if matches!(gesto, GestoDePaso::Esperar { .. }) { 0 } else { 1 };
        HechoDeMano::entregado(gestos, "la mano de prueba apunto el gesto")
    }
}

// ---------------------------------------------------------------------------
// Un volcado del contrato de verdad (los 18 campos, como `Volcado.leer`)
// ---------------------------------------------------------------------------

/// Un nodo del volcado, con lo justo para que el ancla se pueda resolver.
struct Nodo {
    indice: usize,
    view_id: Option<&'static str>,
    texto: Option<&'static str>,
    desc: Option<&'static str>,
    clase: &'static str,
    tocable: bool,
    /// Las CUATRO ESQUINAS del volcado: `x1, y1, x2, y2` (`getBoundsInScreen`), no
    /// `x, y, ancho, alto`.
    caja: (i32, i32, i32, i32),
}

fn nodo(indice: usize, view_id: Option<&'static str>, texto: Option<&'static str>) -> Nodo {
    Nodo {
        indice,
        view_id,
        texto,
        desc: None,
        clase: "Button",
        tocable: true,
        caja: (100 + indice as i32 * 10, 40, 180 + indice as i32 * 10, 80),
    }
}

fn volcado(nodos: Vec<Nodo>) -> String {
    let mut lista = String::new();
    for (posicion, n) in nodos.iter().enumerate() {
        if posicion > 0 {
            lista.push(',');
        }
        let (x1, y1, x2, y2) = n.caja;
        let texto = match n.texto {
            Some(t) => format!("\"{t}\""),
            None => "null".to_string(),
        };
        let view_id = match n.view_id {
            Some(v) => format!("\"com.instagram.android:id/{v}\""),
            None => "null".to_string(),
        };
        let desc = match n.desc {
            Some(d) => format!("\"{d}\""),
            None => "null".to_string(),
        };
        lista.push_str(&format!(
            "{{\"id\":{},\"padre\":null,\"profundidad\":1,\"clase\":\"{}\",\"view_id\":{},\
             \"texto\":{},\"desc\":{},\"hint\":null,\"tocable\":{},\"editable\":false,\
             \"visible\":true,\"habilitado\":true,\"x1\":{},\"y1\":{},\"x2\":{},\"y2\":{},\
             \"seleccionado\":false,\"marcado\":false}}",
            n.indice, n.clase, view_id, texto, desc, n.tocable, x1, y1, x2, y2
        ));
    }
    format!(
        "{{\"paquete\":\"com.instagram.android\",\"actividad\":null,\"momento\":1712345678901,\
         \"truncado\":false,\"nodos\":[{lista}]}}"
    )
}

/// La pantalla de inicio real que se capturo del movil, recortada a lo que hace
/// falta: la barra con "Crear" y las pestañas.
fn pantalla_de_inicio() -> String {
    volcado(vec![
        Nodo {
            indice: 0,
            view_id: Some("action_bar_left_button"),
            texto: Some("Crear"),
            desc: Some("Crear"),
            clase: "ImageButton",
            tocable: true,
            // De (24,96) a (120,192): centro (72,144).
            caja: (24, 96, 120, 192),
        },
        nodo(1, Some("feed_tab"), Some("Inicio")),
        nodo(2, Some("clips_tab"), Some("Reels")),
    ])
}

// ---------------------------------------------------------------------------
// 1 · un paso se traduce a UN gesto, y solo `tocar` mira
// ---------------------------------------------------------------------------

#[test]
fn paso_tocar_traduce_a_la_mano() {
    let mut mano = ManoQueApunta::con_volcados(vec![pantalla_de_inicio()]);

    // El primer paso de verdad: tocar el boton de crear buscandolo por su
    // `view_id` CORTO (asi lo escribe una persona; el id completo es
    // `com.instagram.android:id/action_bar_left_button`).
    let resultado = atender(
        r#"{"id":"p1","accion":"paso",
            "paso":{"tipo":"tocar","ancla":{"view_id":"action_bar_left_button"}},
            "observar_despues":false,"simulacion":false}"#,
        &mut mano,
    );

    assert!(resultado.ok, "el paso se entrego: motivo {:?}", resultado.motivo);
    assert_eq!(resultado.motivo, None, "un exito sin motivo, no un exito con motivo raro");
    assert_eq!(resultado.accion, ACCION_PASO);
    assert_eq!(resultado.id, "p1");
    assert!(!resultado.simulacion, "la orden pidio ejecucion real y se hizo");
    assert_eq!(resultado.gestos, 1, "un paso, un gesto");

    // Un solo gesto, y con el nodo y el punto ya resueltos: id del nodo (para
    // `ACTION_CLICK`) y centro de su caja (para el `GestureDescription`).
    assert_eq!(mano.gestos.len(), 1, "un paso NUNCA se encadena");
    match &mano.gestos[0] {
        GestoDePaso::Tocar { objetivo } => {
            assert_eq!(objetivo.id, "com.instagram.android:id/action_bar_left_button");
            assert_eq!(objetivo.punto, (72, 144), "el centro de la caja [24,96 96x96]");
        }
        otro => panic!("se esperaba un toque y llego {otro:?}"),
    }
    assert_eq!(mano.miradas, 1, "tocar mira UNA vez: la foto con la que resuelve el ancla");
    assert!(
        resultado.detalle.as_deref().unwrap_or("").contains("action_bar_left_button"),
        "el detalle dice QUE se toco: {:?}",
        resultado.detalle
    );

    // El MISMO ancla por `texto`, que es como se lee la pantalla: "Crear".
    let mut mano = ManoQueApunta::con_volcados(vec![pantalla_de_inicio()]);
    let por_texto = atender(
        r#"{"accion":"paso","paso":{"tipo":"tocar","ancla":{"texto":"crear"}},
            "observar_despues":false,"simulacion":false}"#,
        &mut mano,
    );
    assert!(por_texto.ok, "el texto se compara normalizado (minusculas): {:?}", por_texto.motivo);
    assert_eq!(mano.gestos.len(), 1);

    // `escribir` NO mira (el texto va al campo enfocado, no a un nodo) y no
    // encadena: un gesto.
    let mut mano = ManoQueApunta::con_volcados(vec![pantalla_de_inicio()]);
    let escribir = atender(
        r#"{"accion":"paso","paso":{"tipo":"escribir","texto":"hola mundo"},
            "observar_despues":false,"simulacion":false}"#,
        &mut mano,
    );
    assert!(escribir.ok, "escribir se entrega: {:?}", escribir.motivo);
    assert_eq!(mano.miradas, 0, "escribir no resuelve ancla: no gasta una mirada");
    assert_eq!(mano.gestos, vec![GestoDePaso::Escribir { texto: "hola mundo".to_string() }]);

    // `esperar` y `atras`: dos pasos mas del catalogo, cada uno un gesto, y
    // `esperar` no cuenta como gesto entregado al aparato.
    let mut mano = ManoQueApunta::default();
    let esperar = atender(
        r#"{"accion":"paso","paso":{"tipo":"esperar","ms":800},
            "observar_despues":false,"simulacion":false}"#,
        &mut mano,
    );
    assert!(esperar.ok, "{:?}", esperar.motivo);
    assert_eq!(esperar.gestos, 0, "esperar no entrega ningun gesto");
    assert_eq!(mano.gestos, vec![GestoDePaso::Esperar { ms: 800 }]);

    let atras = atender(
        r#"{"accion":"paso","paso":{"tipo":"atras"},
            "observar_despues":false,"simulacion":false}"#,
        &mut mano,
    );
    assert!(atras.ok, "{:?}", atras.motivo);
    assert_eq!(atras.gestos, 1);
    assert_eq!(mano.gestos.last(), Some(&GestoDePaso::Atras));

    // Y el catalogo sigue cerrado: `paso` esta, y una accion inventada no entra.
    assert!(ACCIONES.contains(&ACCION_PASO));
    let fuera = atender(
        r#"{"accion":"paso","paso":{"tipo":"arrastrar","ancla":{"texto":"x"}},"simulacion":false}"#,
        &mut mano,
    );
    assert_eq!(fuera.motivo.as_deref(), Some("paso_tipo_fuera_del_catalogo"));
}

// ---------------------------------------------------------------------------
// 2 · un ancla que no esta se nombra y no se toca nada
// ---------------------------------------------------------------------------

#[test]
fn ancla_no_encontrada_da_motivo() {
    let mut mano = ManoQueApunta::con_volcados(vec![pantalla_de_inicio()]);

    let resultado = atender(
        r#"{"id":"p2","accion":"paso",
            "paso":{"tipo":"tocar","ancla":{"view_id":"action_bar_right_button"}},
            "simulacion":false}"#,
        &mut mano,
    );

    assert!(!resultado.ok, "sin ancla no hay paso que dar por hecho");
    assert_eq!(resultado.motivo.as_deref(), Some("ancla_no_encontrada"));
    assert_eq!(resultado.gestos, 0);
    assert!(mano.gestos.is_empty(), "no se toca NADA cuando el ancla no esta");
    assert_eq!(mano.miradas, 1, "se miro para buscarla (y no se encontro)");

    // El motivo lleva el ancla buscada: sin ella no se puede arreglar el payload.
    let detalle = resultado.detalle.unwrap_or_default();
    assert!(
        detalle.contains("action_bar_right_button"),
        "el detalle tiene que nombrar el ancla buscada: {detalle}"
    );

    // Un `texto` que no esta se nombra igual, y no se cae en tocar otro nodo.
    let mut mano = ManoQueApunta::con_volcados(vec![pantalla_de_inicio()]);
    let por_texto = atender(
        r#"{"accion":"paso","paso":{"tipo":"tocar","ancla":{"texto":"Publicar"}},"simulacion":false}"#,
        &mut mano,
    );
    assert_eq!(por_texto.motivo.as_deref(), Some("ancla_no_encontrada"));
    assert!(mano.gestos.is_empty());
}

// ---------------------------------------------------------------------------
// 3 · dos nodos con el mismo ancla NO se eligen al azar
// ---------------------------------------------------------------------------

#[test]
fn ancla_ambigua_no_elige() {
    // Dos nodos con el MISMO texto visible, como los diez `image_button` que
    // repite Instagram.
    let dos_iguales = volcado(vec![
        nodo(0, Some("primero"), Some("Siguiente")),
        nodo(1, Some("segundo"), Some("Siguiente")),
    ]);

    let mut mano = ManoQueApunta::con_volcados(vec![dos_iguales]);
    let resultado = atender(
        r#"{"id":"p3","accion":"paso","paso":{"tipo":"tocar","ancla":{"texto":"Siguiente"}},
            "simulacion":false}"#,
        &mut mano,
    );

    assert!(!resultado.ok);
    assert_eq!(resultado.motivo.as_deref(), Some("ancla_ambigua"));
    assert!(mano.gestos.is_empty(), "con dos candidatos NO se toca ninguno");
    assert_eq!(resultado.gestos, 0);

    let detalle = resultado.detalle.unwrap_or_default();
    assert!(detalle.contains('2'), "el motivo dice CUANTOS: {detalle}");

    // Y lo mismo por `view_id` repetido: el arbol desambigua (`#1`), y el
    // resolvedor tiene que ver los dos, no solo el primero.
    let mismo_view_id = volcado(vec![
        nodo(0, Some("image_button"), Some("A")),
        nodo(1, Some("image_button"), Some("B")),
    ]);
    let mut mano = ManoQueApunta::con_volcados(vec![mismo_view_id]);
    let por_view_id = atender(
        r#"{"accion":"paso","paso":{"tipo":"tocar","ancla":{"view_id":"image_button"}},
            "simulacion":false}"#,
        &mut mano,
    );
    assert_eq!(por_view_id.motivo.as_deref(), Some("ancla_ambigua"));
    assert!(mano.gestos.is_empty());
}

// ---------------------------------------------------------------------------
// 4 · en simulacion no se toca el movil (ni se mira)
// ---------------------------------------------------------------------------

#[test]
fn paso_en_simulacion_no_toca() {
    // a) `simulacion:true` explicita.
    let mut mano = ManoQueApunta::con_volcados(vec![pantalla_de_inicio()]);
    let resultado = atender(
        r#"{"id":"p4","accion":"paso",
            "paso":{"tipo":"tocar","ancla":{"view_id":"action_bar_left_button"}},
            "simulacion":true}"#,
        &mut mano,
    );

    assert!(!resultado.ok, "una simulacion no da nada por hecho");
    assert_eq!(resultado.motivo.as_deref(), Some(MOTIVO_SIMULACION));
    assert!(resultado.simulacion);
    assert_eq!(resultado.gestos, 0);
    assert!(mano.gestos.is_empty(), "en simulacion NO se toca el movil");
    assert_eq!(mano.miradas, 0, "ni se mira: no hay nada que resolver");

    // b) Ausente, que el contrato lee como simulacion: el caso que de verdad
    //    importa, porque es el que llega cuando alguien olvida el campo.
    let mut mano = ManoQueApunta::con_volcados(vec![pantalla_de_inicio()]);
    let sin_campo = atender(
        r#"{"id":"p5","accion":"paso","paso":{"tipo":"atras"}}"#,
        &mut mano,
    );
    assert_eq!(sin_campo.motivo.as_deref(), Some(MOTIVO_SIMULACION));
    assert!(mano.gestos.is_empty(), "sin simulacion:false no se pulsa atras");

    // c) Y `simulacion:\"false\"` (texto) no es un permiso: es un payload roto.
    let mut mano = ManoQueApunta::con_volcados(vec![pantalla_de_inicio()]);
    let texto = atender(
        r#"{"accion":"paso","paso":{"tipo":"atras"},"simulacion":"false"}"#,
        &mut mano,
    );
    assert_eq!(texto.motivo.as_deref(), Some("campo_de_tipo_equivocado"));
    assert!(mano.gestos.is_empty());

    // d) El detalle dice QUE paso no se ejecuto.
    assert!(
        resultado.detalle.as_deref().unwrap_or("").contains("action_bar_left_button"),
        "el detalle nombra el paso que no se dio: {:?}",
        resultado.detalle
    );
}

// ---------------------------------------------------------------------------
// 5 · observar_despues adjunta el volcado de DESPUES
// ---------------------------------------------------------------------------

#[test]
fn observar_despues_adjunta_volcado() {
    // La primera foto es la de antes del toque (boton "Crear"); la segunda, la de
    // despues (se abrio el menu de creacion). El resultado tiene que llevar la
    // SEGUNDA: adjuntar la de antes seria decir que el menu ya estaba abierto.
    let antes = pantalla_de_inicio();
    let despues = volcado(vec![
        nodo(0, Some("menu_crear"), Some("Publicacion")),
        nodo(1, Some("menu_crear_reel"), Some("Reel")),
    ]);

    let mut mano = ManoQueApunta::con_volcados(vec![antes.clone(), despues.clone()]);
    let resultado = atender(
        r#"{"id":"p6","accion":"paso",
            "paso":{"tipo":"tocar","ancla":{"view_id":"action_bar_left_button"}},
            "simulacion":false}"#,
        &mut mano,
    );

    assert!(resultado.ok, "paso y comprobacion juntos: motivo {:?}", resultado.motivo);
    assert_eq!(mano.miradas, 2, "una mirada para resolver el ancla y otra despues");
    assert_eq!(mano.gestos.len(), 1);

    let foto_despues = resultado
        .volcado
        .as_deref()
        .expect("el volcado de despues viaja en el resultado");
    let json_volcado = json::leer(foto_despues).expect("el volcado es json");
    assert!(
        json_volcado.obtener("nodos").and_then(|n| match n {
            Valor::Lista(nodos) => nodos.first().and_then(|n| n.obtener("view_id")).and_then(Valor::como_texto),
            _ => None,
        }) == Some("com.instagram.android:id/menu_crear"),
        "tiene que ser el volcado de DESPUES, no el de antes"
    );

    // Y en el resultado del bus el volcado va como OBJETO, no como cadena
    // escapada: quien lo lee quiere el arbol.
    let resultado_json = json::leer(&resultado.a_json()).expect("el resultado es json");
    match resultado_json.obtener("volcado") {
        Some(Valor::Objeto(_)) => {}
        otro => panic!("el volcado tiene que ser un objeto json, llego {otro:?}"),
    }
    assert_eq!(resultado_json.obtener("motivo"), Some(&Valor::Nulo));

    // Con `observar_despues:false` no hay segunda mirada ni volcado, y el paso
    // sigue dado por hecho: el que no lo quiere lo pide.
    let mut mano = ManoQueApunta::con_volcados(vec![antes]);
    let seco = atender(
        r#"{"accion":"paso","paso":{"tipo":"tocar","ancla":{"texto":"Crear"}},
            "observar_despues":false,"simulacion":false}"#,
        &mut mano,
    );
    assert!(seco.ok);
    assert_eq!(mano.miradas, 1);
    assert!(seco.volcado.is_none());
}

// ---------------------------------------------------------------------------
// 6 · el contrato del paso, en corto (lo que NO se acepta)
// ---------------------------------------------------------------------------

#[test]
fn un_paso_mal_escrito_se_rechaza_con_su_nombre() {
    let mut mano = ManoQueApunta::con_volcados(vec![pantalla_de_inicio()]);

    // Sin `paso` no hay nada que hacer.
    let sin_paso = atender(r#"{"accion":"paso","simulacion":false}"#, &mut mano);
    assert_eq!(sin_paso.motivo.as_deref(), Some("campo_ausente"));

    // `tocar` sin ancla.
    let sin_ancla = atender(
        r#"{"accion":"paso","paso":{"tipo":"tocar"},"simulacion":false}"#,
        &mut mano,
    );
    assert_eq!(sin_ancla.motivo.as_deref(), Some("paso_sin_ancla"));

    // Dos pistas en el ancla: no se elige cual manda.
    let dos_pistas = atender(
        r#"{"accion":"paso","paso":{"tipo":"tocar","ancla":{"view_id":"a","texto":"b"}},
            "simulacion":false}"#,
        &mut mano,
    );
    assert_eq!(dos_pistas.motivo.as_deref(), Some("paso_ancla_invalida"));

    // Un ancla donde no significa nada.
    let sobrante = atender(
        r#"{"accion":"paso","paso":{"tipo":"esperar","ms":10,"ancla":{"texto":"x"}},
            "simulacion":false}"#,
        &mut mano,
    );
    assert_eq!(sobrante.motivo.as_deref(), Some("paso_ancla_sobrante"));

    // `escribir` sin texto y `esperar` con cero.
    assert_eq!(
        atender(r#"{"accion":"paso","paso":{"tipo":"escribir"},"simulacion":false}"#, &mut mano)
            .motivo
            .as_deref(),
        Some("paso_sin_texto")
    );
    assert_eq!(
        atender(r#"{"accion":"paso","paso":{"tipo":"esperar","ms":0},"simulacion":false}"#, &mut mano)
            .motivo
            .as_deref(),
        Some("paso_espera_invalida")
    );

    // Y ninguno de los payloads rotos llego a la mano.
    assert!(mano.gestos.is_empty(), "un paso que no se entiende no se ejecuta ni a medias");
    assert_eq!(mano.miradas, 0);

    // El catalogo de tipos, tal cual: cuatro y no mas.
    assert_eq!(
        enki_instagram_bridge::canal::paso::TIPOS,
        ["tocar", "escribir", "esperar", "atras"]
    );

    // Un ancla por `desc` tambien vale (Instagram la usa en los `ImageButton`), y
    // el catalogo de tipos del paso es un enum cerrado: `atras` no lleva nada.
    let por_desc = AnclaDePaso::Desc("Crear".to_string());
    assert_eq!(por_desc.pista(), "desc");
    let atras = json::leer(r#"{"tipo":"atras"}"#).expect("json");
    assert_eq!(Paso::desde_valor(&atras).expect("atras vale"), Paso::Atras);
}
