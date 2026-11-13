//! instagram-bridge · bloque 19c: MIRAR BAJO DEMANDA desde el bus
//!
//! Esta suite fija las tres cosas que la accion `observar` no puede relajar:
//!
//!   - **se ejecuta en simulacion**: mirar es lectura pura. El veto de
//!     `simulacion` existe para lo irreversible (un post publicado no se
//!     despublica); vetar una lectura dejaria al movil sin poder enseñar su
//!     pantalla salvo que alguien pidiera "ejecutar de verdad" para leer;
//!   - **sin mano, motivo con nombre**: `sin_mano` (no hay arbol que mirar) o
//!     `mano_sin_respuesta` (el otro lado no contesta), nunca un volcado vacio
//!     que alguien lea como "pantalla en blanco";
//!   - **el contrato del arbol son 18 campos**: el volcado de `Volcado.kt`
//!     entra entero (clase, hint, las seis banderas, las cuatro esquinas), y la
//!     jerarquia de la lista plana se reconstruye por indice.
//!
//! Todo en escritorio: la mano Android no hace falta para probar el contrato.

use enki_instagram_bridge::canal::bucle::{
    atender, HechoDeMano, ManoAusente, ManoDeOrdenes, Orden, ACCIONES, ACCION_OBSERVAR,
    MOTIVO_SIN_MANO,
};
use enki_instagram_bridge::canal::json::{self, Valor};
use enki_instagram_bridge::mano::arbol_json::{desde_json, CAMPOS_DEL_NODO};
use enki_instagram_bridge::percepcion::simulador::{Nodo, Pantalla, Tipo};
use enki_instagram_bridge::percepcion::Mirada;

// ---------------------------------------------------------------------------
// Una mano de mentira que mira (y cuenta si le pidieron ejecutar)
// ---------------------------------------------------------------------------

/// Una mano que sabe mirar y NO debe ejecutar nada.
///
/// `ejecutar` cuenta las llamadas: si `observar` acabara pasando por ahi, el
/// test lo veria como un gesto entregado en una lectura.
#[derive(Default)]
struct ManoQueMira {
    volcado: String,
    ejecutadas: u32,
}

impl ManoDeOrdenes for ManoQueMira {
    fn ejecutar(&mut self, _orden: &Orden) -> HechoDeMano {
        self.ejecutadas += 1;
        HechoDeMano::nada("sin_receta", "esta mano de prueba no ejecuta")
    }

    fn observar(&mut self) -> HechoDeMano {
        HechoDeMano::con_volcado(self.volcado.clone(), "volcado de prueba")
    }
}

/// Un volcado minimo pero del contrato de verdad (cabecera de `Volcado.leer()`).
fn volcado_minimo() -> String {
    r#"{"paquete":"com.instagram.android","actividad":null,"momento":1712345678901,
        "truncado":false,
        "nodos":[
          {"id":0,"padre":null,"profundidad":1,"clase":"LinearLayout","view_id":null,
           "texto":null,"desc":null,"hint":null,"tocable":false,"editable":false,
           "visible":true,"habilitado":true,"x1":0,"y1":0,"x2":1080,"y2":2000,
           "seleccionado":false,"marcado":false}]}"#
        .to_string()
}

// ---------------------------------------------------------------------------
// 1 · observar se ejecuta en simulacion (lectura pura, no se veta)
// ---------------------------------------------------------------------------

#[test]
fn observar_se_ejecuta_en_simulacion() {
    let mut mano = ManoQueMira { volcado: volcado_minimo(), ejecutadas: 0 };

    // Sin `simulacion` en el payload: el contrato la lee como `true`.
    let resultado = atender(r#"{"id":"o-1","accion":"observar"}"#, &mut mano);

    assert!(
        resultado.ok,
        "mirar no se veta por simulacion: la peticion de una foto no es una ejecucion real"
    );
    assert_eq!(resultado.motivo, None, "un exito sin motivo, no un exito con motivo raro");
    assert_eq!(resultado.accion, ACCION_OBSERVAR);
    assert_eq!(resultado.id, "o-1");
    assert!(resultado.simulacion, "la orden no pidio ejecucion real: el modo se refleja");
    assert_eq!(mano.ejecutadas, 0, "una lectura no entrega ni un gesto");
    assert!(resultado.volcado.is_some(), "el volcado tiene que volver en el resultado");

    // El `simulacion:false` explicito tampoco la veta: leer no tiene modo.
    let mut mano = ManoQueMira { volcado: volcado_minimo(), ejecutadas: 0 };
    let real = atender(
        r#"{"accion":"observar","red":"instagram","simulacion":false}"#,
        &mut mano,
    );
    assert!(real.ok, "observar con simulacion:false se atiende igual");
    assert!(!real.simulacion);
    assert_eq!(mano.ejecutadas, 0);

    // Y con simulacion:true explicita, tambien.
    let mut mano = ManoQueMira { volcado: volcado_minimo(), ejecutadas: 0 };
    assert!(atender(r#"{"accion":"observar","simulacion":true}"#, &mut mano).ok);
    assert_eq!(mano.ejecutadas, 0);

    // `observar` esta en el catalogo cerrado y `publicar` sigue vetado en seco:
    // añadir una accion no puede haber abierto la puerta a las demas.
    assert!(ACCIONES.contains(&ACCION_OBSERVAR));
    let publicar = atender(
        r#"{"accion":"publicar","red":"instagram","texto":"hola","simulacion":true}"#,
        &mut mano,
    );
    assert!(!publicar.ok, "publicar en simulacion sigue sin dar nada por hecho");
}

#[test]
fn el_volcado_viaja_como_json_no_como_cadena() {
    let mut mano = ManoQueMira { volcado: volcado_minimo(), ejecutadas: 0 };
    let resultado = atender(r#"{"accion":"observar"}"#, &mut mano);

    // El resultado del bus se lee con el parser de verdad: si el volcado se
    // hubiera escapado como texto, aqui llegaria un `Valor::Texto`.
    let json = json::leer(&resultado.a_json()).expect("el resultado es json");
    match json.obtener("volcado") {
        Some(Valor::Objeto(_)) => {}
        otro => panic!("el volcado tiene que ser un objeto json, llego {otro:?}"),
    }
    assert!(
        matches!(json.obtener("volcado").and_then(|v| v.obtener("nodos")), Some(Valor::Lista(_))),
        "el volcado del resultado lleva los nodos dentro"
    );
    assert_eq!(json.obtener("motivo"), Some(&Valor::Nulo), "ok:true va con motivo null");
}

// ---------------------------------------------------------------------------
// 2 · sin mano, motivo con nombre
// ---------------------------------------------------------------------------

#[test]
fn observar_sin_mano_da_motivo_nombrado() {
    // a) Este binario no tiene arbol: `sin_mano`.
    let mut ausente = ManoAusente::nueva();
    let resultado = atender(
        r#"{"id":"o-2","accion":"observar","simulacion":true}"#,
        &mut ausente,
    );
    assert!(!resultado.ok, "sin mano no hay volcado que dar por hecho");
    assert_eq!(resultado.motivo.as_deref(), Some(MOTIVO_SIN_MANO));
    assert_eq!(resultado.motivo.as_deref(), Some("sin_mano"));
    assert!(resultado.volcado.is_none(), "un fallo no lleva volcado");
    assert!(resultado.detalle.is_some(), "el fallo se explica, no solo se nombra");

    // b) La mano existe y no contesta (plazo agotado en la cola): el motivo que
    //    sube es el de `mano::cola`, sin traducir.
    struct ManoMuda;
    impl ManoDeOrdenes for ManoMuda {
        fn ejecutar(&mut self, _orden: &Orden) -> HechoDeMano {
            HechoDeMano::nada("sin_receta", "no ejecuta")
        }
        fn observar(&mut self) -> HechoDeMano {
            HechoDeMano::nada(
                "mano_sin_respuesta",
                "la mano Android no contesto a la peticion 7 en 10000 ms",
            )
        }
    }
    let resultado = atender(r#"{"accion":"observar"}"#, &mut ManoMuda);
    assert_eq!(resultado.motivo.as_deref(), Some("mano_sin_respuesta"));
    assert!(!resultado.ok);
}

// ---------------------------------------------------------------------------
// 3 · el contrato del arbol tiene los 18 campos
// ---------------------------------------------------------------------------

/// Un volcado con los 18 campos en los tres nodos, con jerarquia real.
const VOLCADO_COMPLETO: &str = r#"{
  "paquete":"com.instagram.android",
  "actividad":"com.instagram.android.activity.MainTabActivity",
  "momento":1712345678901,
  "truncado":false,
  "nodos":[
    {"id":0,"padre":null,"profundidad":1,"clase":"LinearLayout","view_id":null,
     "texto":null,"desc":null,"hint":null,"tocable":false,"editable":false,
     "visible":true,"habilitado":true,"x1":0,"y1":0,"x2":1080,"y2":2000,
     "seleccionado":false,"marcado":false},
    {"id":1,"padre":0,"profundidad":2,"clase":"Button","view_id":"com.instagram.android:id/publicar",
     "texto":"Publicar","desc":"Publicar publicacion","hint":null,"tocable":true,
     "editable":false,"visible":false,"habilitado":true,"x1":900,"y1":20,
     "x2":1060,"y2":100,"seleccionado":true,"marcado":true},
    {"id":2,"padre":1,"profundidad":3,"clase":"EditText","view_id":"com.instagram.android:id/caption",
     "texto":null,"desc":null,"hint":"Escribe un pie de foto","tocable":true,
     "editable":true,"visible":true,"habilitado":false,"x1":0,"y1":300,
     "x2":1080,"y2":600,"seleccionado":false,"marcado":false}
  ]
}"#;

#[test]
fn contrato_del_arbol_tiene_los_18_campos() {
    // El contrato es la lista: 18 y con estos nombres. Si `Volcado.kt` cambia,
    // se cambia aqui y el test de al lado deja de cubrirlo.
    assert_eq!(CAMPOS_DEL_NODO.len(), 18, "el contrato del nodo son 18 campos");

    // Los 18 estan en el JSON de cada nodo del volcado.
    let crudo = json::leer(VOLCADO_COMPLETO).expect("el volcado es json");
    let nodos = match crudo.obtener("nodos") {
        Some(Valor::Lista(nodos)) => nodos,
        otro => panic!("el volcado tiene que traer nodos, llego {otro:?}"),
    };
    assert_eq!(nodos.len(), 3);
    for (indice, nodo) in nodos.iter().enumerate() {
        for campo in CAMPOS_DEL_NODO {
            assert!(
                nodo.obtener(campo).is_some(),
                "al nodo {indice} le falta el campo '{campo}' del contrato"
            );
        }
    }

    // Y el crate los entiende todos: ninguno se pierde en la frontera.
    let arbol = desde_json(VOLCADO_COMPLETO).expect("el volcado del contrato tiene que entrar");

    // Cabecera: sin `lectura`, un volcado es una foto observada; la plataforma
    // sale del paquete y el sello del momento.
    assert_eq!(arbol.plataforma, "instagram");
    assert_eq!(arbol.pantalla, Pantalla::Desconocida, "la pantalla la declara el cerebro, no se adivina");
    assert_eq!(arbol.mirada, Mirada::Completa);
    assert_eq!(arbol.version, 1712345678901);

    // id + padre + profundidad: la lista plana vuelve a ser un arbol, y la
    // profundidad que se deduce del montaje es la que declaro el aparato.
    assert_eq!(arbol.raiz.hijos.len(), 1, "solo el nodo 0 cuelga de la ventana");
    let contenedor = &arbol.raiz.hijos[0];
    assert_eq!(contenedor.hijos.len(), 1, "el nodo 1 cuelga del 0, no de la raiz");
    let boton = &contenedor.hijos[0];
    assert_eq!(boton.hijos.len(), 1, "el nodo 2 cuelga del 1");
    let campo = &boton.hijos[0];
    assert_eq!(profundidad_de(&arbol.raiz, &contenedor.id), Some(1));
    assert_eq!(profundidad_de(&arbol.raiz, &boton.id), Some(2));
    assert_eq!(profundidad_de(&arbol.raiz, &campo.id), Some(3));

    // view_id: la identidad del nodo es el id de Android (el `id` numerico es
    // solo el indice en la lista). Un nodo sin view_id no inventa uno de app.
    assert_eq!(boton.id, "com.instagram.android:id/publicar");
    assert_eq!(campo.id, "com.instagram.android:id/caption");
    assert!(contenedor.id.starts_with("nodo:"), "sin view_id, identidad sintetica");

    // clase + tipo derivado de lo que el aparato declara.
    assert_eq!(contenedor.clase.as_deref(), Some("LinearLayout"));
    assert_eq!(contenedor.tipo, Tipo::Desconocido);
    assert_eq!(boton.clase.as_deref(), Some("Button"));
    assert_eq!(boton.tipo, Tipo::Boton);
    assert_eq!(campo.clase.as_deref(), Some("EditText"));
    assert_eq!(campo.tipo, Tipo::Campo);

    // texto + desc + hint.
    assert_eq!(boton.texto.as_deref(), Some("Publicar"));
    assert_eq!(boton.descripcion.as_deref(), Some("Publicar publicacion"));
    assert_eq!(boton.ancla(), Some("Publicar"));
    assert_eq!(campo.texto, None);
    assert_eq!(campo.hint.as_deref(), Some("Escribe un pie de foto"));

    // Las seis banderas, cada una en su sitio.
    assert!(boton.tocable);
    assert!(!boton.editable);
    assert!(!boton.visible_al_usuario, "el volcado trae los invisibles: son los que explican la receta");
    assert!(boton.habilitado);
    assert!(boton.seleccionado);
    assert!(boton.marcado);

    // `tocable` del volcado es `isClickable`; un nodo deshabilitado no se puede
    // tocar aunque sea clickable (misma regla que `Accesibilidad.mirar`).
    assert!(campo.editable);
    assert!(!campo.habilitado);
    assert!(!campo.tocable, "deshabilitado no es tocable");

    // x1,y1,x2,y2 -> caja (y su centro, el punto que toca A3).
    assert_eq!(boton.caja.x, 900);
    assert_eq!(boton.caja.y, 20);
    assert_eq!(boton.caja.ancho, 160);
    assert_eq!(boton.caja.alto, 80);
    assert_eq!(boton.caja.centro(), (980, 60));
}

#[test]
fn un_view_id_repetido_no_duplica_el_subarbol() {
    // Instagram repite `view_id` (diez `image_button` iguales). Si dos nodos
    // acabaran con el MISMO id, `montar` les colgaria a los dos la misma lista
    // de hijos y el arbol saldria duplicado.
    let volcado = r#"{"paquete":"com.instagram.android","momento":1,"nodos":[
        {"id":0,"padre":null,"profundidad":1,"clase":"ImageView",
         "view_id":"com.instagram.android:id/icono","texto":null,"desc":"A","hint":null,
         "tocable":true,"editable":false,"visible":true,"habilitado":true,
         "x1":0,"y1":0,"x2":10,"y2":10,"seleccionado":false,"marcado":false},
        {"id":1,"padre":null,"profundidad":1,"clase":"ImageView",
         "view_id":"com.instagram.android:id/icono","texto":null,"desc":"B","hint":null,
         "tocable":true,"editable":false,"visible":true,"habilitado":true,
         "x1":20,"y1":0,"x2":30,"y2":10,"seleccionado":false,"marcado":false}
    ]}"#;

    let arbol = desde_json(volcado).expect("entra");
    assert_eq!(arbol.raiz.hijos.len(), 2);
    assert_eq!(arbol.raiz.hijos[0].id, "com.instagram.android:id/icono");
    assert_eq!(
        arbol.raiz.hijos[1].id, "com.instagram.android:id/icono#1",
        "el segundo repite view_id: se desambigua en vez de duplicar el arbol"
    );
}

// ---------------------------------------------------------------------------
// Ayudas de recorrido
// ---------------------------------------------------------------------------

/// La profundidad de un id dentro del arbol montado (la raiz sintetica = 0).
///
/// El volcado declara `profundidad` (1 = hijo de la ventana). Que el montaje
/// reproduzca esa misma profundidad es la prueba de que `id` y `padre` se
/// usaron de verdad y no se colgaron todos los nodos de la raiz.
fn profundidad_de(raiz: &Nodo, id: &str) -> Option<usize> {
    if raiz.id == id {
        return Some(0);
    }
    raiz.hijos
        .iter()
        .find_map(|hijo| profundidad_de(hijo, id).map(|nivel| nivel + 1))
}
