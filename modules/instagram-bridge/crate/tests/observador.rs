//! instagram-bridge · A1 · ObservadorDeEstado (PUENTE)
//!
//! El observador mira el arbol de accesibilidad y entrega hechos. Esta suite fija
//! lo que no se puede relajar:
//!
//!   - **sin mirada nueva NO se rellena con la mirada anterior**: si el aparato
//!     deja de mirar, el estado es `Desconocido` y `hay()` deja de contestar
//!     `Presente`, aunque el nodo se viera hace un segundo;
//!   - **una mirada parcial se declara parcial**, nunca completa, y con ella la
//!     ausencia de un ancla es `Desconocido` (no se afirma lo que no se vio);
//!   - una foto parcial sin motivo no es un hecho;
//!   - un arbol vacio es "no se esta leyendo", no "pantalla en blanco";
//!   - lo invisible no viaja en el hecho;
//!   - si no se puede mirar ANTES, no se opera: no hay `despues` de algo que no
//!     paso.
//!
//! Todo con el simulador del arbol: estos tests corren en escritorio, sin movil
//! y sin Android SDK.

use enki_instagram_bridge::percepcion::observador::{
    normalizar_etiqueta, Ancla, Desconocido, Observador, Presencia, SelloDeCuenta, Vista,
};
use enki_instagram_bridge::percepcion::simulador::{Cambio, Caja, Nodo, Pantalla, Simulador, Tipo};
use enki_instagram_bridge::percepcion::{Mirada, SinMirada};

const M1: u64 = 1_800_000_000_000;
const M2: u64 = 1_800_000_002_000;
const M3: u64 = 1_800_000_004_000;

fn ambito() -> SelloDeCuenta {
    SelloDeCuenta::nuevo("proy-a", "taller_a")
}

/// Un inicio de Instagram con lo minimo: el boton de crear y una pestana.
fn inicio() -> Simulador {
    Simulador::con_cuenta("taller_a")
        .con_hijo(Nodo::boton("n-crear", "Crear").con_caja_en(300, 1600, 120, 80))
        .con_hijo(Nodo::nuevo("n-inicio", Tipo::Boton).con_texto("Inicio"))
}

// ---------------------------------------------------------------------------
// 1 · SIN MIRADA NO SE RELLENA CON LA MIRADA ANTERIOR  (test de la espina)
// ---------------------------------------------------------------------------

#[test]
fn sin_mirada_no_rellena_con_la_mirada_anterior() {
    let mut sim = inicio();
    let mut obs = Observador::nuevo();
    let crear = Ancla::boton("Crear");

    // Primera mirada: se ve `Crear`. Se puede afirmar.
    let primera = obs.mirar(&sim, &ambito(), M1);
    assert!(primera.observado(), "con el arbol delante se mira");
    let hecho = primera.hecho().expect("hay hecho");
    assert_eq!(hecho.mirada, Mirada::Completa);
    assert_eq!(hecho.pantalla, Pantalla::Inicio);
    assert_eq!(hecho.cuenta_visible.as_deref(), Some("taller_a"));
    assert_eq!(hecho.sello, ambito(), "el hecho nace sellado (P1)");
    assert_eq!(hecho.momento, M1, "el hecho nace fechado con el momento inyectado");
    assert_eq!(obs.hay(&crear), Presencia::Presente);

    // El aparato deja de poder mirar (servicio caido, pantalla bloqueada...).
    sim.mutar(Cambio::Cegar(SinMirada::AparatoAusente)).expect("se puede cegar");

    let segunda = obs.mirar(&sim, &ambito(), M2);
    assert!(!segunda.observado(), "sin mirada nueva NO hay hecho");
    assert_eq!(
        segunda,
        Vista::Desconocido(Desconocido::NoSePudoMirar(SinMirada::AparatoAusente)),
        "el desconocido se NOMBRA, no se rellena"
    );

    // Lo que no se puede permitir: que `hay` siga diciendo Presente porque lo
    // vio hace un segundo. El nodo sigue en el arbol, y aun asi no se sabe.
    assert_eq!(
        obs.hay(&crear),
        Presencia::Desconocido(Desconocido::NoSePudoMirar(SinMirada::AparatoAusente)),
        "un Presente de hace dos segundos no contesta por la mirada de ahora"
    );
    assert!(sim.arbol().raiz.buscar("n-crear").is_some(), "el nodo sigue en el arbol: lo que falta es la mirada");

    // Tampoco se puede sacar la lista de elementos de la mirada vieja.
    assert_eq!(
        obs.elementos_visibles(),
        Err(Desconocido::NoSePudoMirar(SinMirada::AparatoAusente))
    );
    assert_eq!(obs.ultima_vista().como_str(), "desconocido");
    assert_eq!(obs.miradas(), 2, "se intento mirar dos veces: eso si se puede contar");

    // Y cuando el servicio vuelve, el hecho es nuevo: otro momento, otra version.
    sim.mutar(Cambio::DevolverLaVista).expect("se puede devolver");
    let tercera = obs.mirar(&sim, &ambito(), M3);
    let hecho3 = tercera.hecho().expect("vuelve a haber hecho");
    assert_eq!(hecho3.momento, M3, "el hecho es del momento en que se miro");
    assert_eq!(obs.hay(&crear), Presencia::Presente);
}

// ---------------------------------------------------------------------------
// 2 · LA MIRADA PARCIAL SE DECLARA PARCIAL, NO COMPLETA
// ---------------------------------------------------------------------------

#[test]
fn mirada_parcial_se_declara_parcial_no_completa() {
    let mut sim = inicio();
    // La pantalla se leyo a medias: hay un dialogo encima que tapa la mitad.
    sim.mutar(Cambio::DeclararParcial { motivo: "dialogo del sistema encima".to_string() })
        .expect("se puede declarar parcial");

    let mut obs = Observador::nuevo();
    let vista = obs.mirar(&sim, &ambito(), M1);

    let hecho = vista.hecho().expect("una mirada parcial SI produce hecho");
    assert_eq!(hecho.mirada, Mirada::Parcial, "parcial se declara parcial");
    assert_ne!(hecho.mirada, Mirada::Completa, "nunca se asciende a completa");
    assert_eq!(hecho.motivo_sin_mirada.as_deref(), Some("dialogo del sistema encima"));
    assert!(!hecho.es_completo());

    // Lo que SE VIO se puede afirmar...
    assert_eq!(obs.hay(&Ancla::boton("Crear")), Presencia::Presente);

    // ...y lo que no aparecio NO se puede dar por ausente: con media pantalla,
    // "no lo vi" no es "no esta".
    assert_eq!(
        obs.hay(&Ancla::boton("Compartir")),
        Presencia::Desconocido(Desconocido::MiradaParcial),
        "una ausencia solo se afirma con la pantalla entera"
    );

    // Una parcial que no dice POR QUE no es un hecho utilizable.
    let mut sin_motivo = inicio();
    sin_motivo.mutar(Cambio::DeclararParcial { motivo: "   ".to_string() }).expect("cambio");
    let mut obs2 = Observador::nuevo();
    assert_eq!(
        obs2.mirar(&sin_motivo, &ambito(), M1),
        Vista::Desconocido(Desconocido::MiradaParcialSinMotivo)
    );
}

// ---------------------------------------------------------------------------
// 3 · la mirada fresca sustituye a la anterior (mutar y volver a mirar)
// ---------------------------------------------------------------------------

#[test]
fn la_mirada_fresca_sustituye_a_la_anterior() {
    let mut sim = inicio();
    let mut obs = Observador::nuevo();
    let crear = Ancla::boton("Crear");

    obs.mirar(&sim, &ambito(), M1);
    assert_eq!(obs.hay(&crear), Presencia::Presente);

    // La pantalla cambio: el boton ya no esta y aparece otro.
    sim.mutar(Cambio::Quitar { id: "n-crear".to_string() }).expect("existe");
    sim.mutar(Cambio::Anadir {
        padre: "raiz".to_string(),
        nodo: Nodo::boton("n-siguiente", "Siguiente").con_caja_en(300, 1600, 120, 80),
    })
    .expect("se puede anadir a la raiz");

    obs.mirar(&sim, &ambito(), M2);
    assert_eq!(obs.hay(&crear), Presencia::Ausente, "mirada completa: no esta, se dice");
    assert_eq!(obs.hay(&Ancla::boton("Siguiente")), Presencia::Presente);

    // Un ancla no se inventa por el texto de otro nodo.
    assert_eq!(obs.hay(&Ancla::boton("Crear publicacion")), Presencia::Ausente);
}

// ---------------------------------------------------------------------------
// 4 · nombres visibles: se normaliza lo cosmetico, no se adivina
// ---------------------------------------------------------------------------

#[test]
fn el_ancla_se_compara_por_el_nombre_visible_normalizado() {
    assert_eq!(normalizar_etiqueta("  PUBLICACIÓN   nueva "), "publicacion nueva");
    assert_eq!(normalizar_etiqueta("Publicacion"), "publicacion");

    let sim = Simulador::con_cuenta("taller_a")
        .con_hijo(Nodo::boton("n1", "Publicación").con_caja_en(0, 0, 10, 10))
        // Un nodo sin texto se identifica por la descripcion de accesibilidad.
        .con_hijo(Nodo::nuevo("n2", Tipo::Boton).con_descripcion("Compartir"));

    let mut obs = Observador::nuevo();
    obs.mirar(&sim, &ambito(), M1);

    assert_eq!(obs.hay(&Ancla::boton("publicacion")), Presencia::Presente);
    assert_eq!(obs.hay(&Ancla::boton("Compartir")), Presencia::Presente);

    // Un nodo sin nombre visible no sirve de ancla: no se adivina por el id.
    let sin_nombre = Simulador::con_cuenta("taller_a").con_hijo(Nodo::nuevo("btn-crear", Tipo::Boton));
    let mut obs2 = Observador::nuevo();
    obs2.mirar(&sin_nombre, &ambito(), M1);
    assert_eq!(obs2.hay(&Ancla::boton("btn-crear")), Presencia::Ausente);

    // Un ancla sin nombre no se puede buscar: se dice, no se contesta `Ausente`.
    let mut obs3 = Observador::nuevo();
    obs3.mirar(&sim, &ambito(), M1);
    assert_eq!(
        obs3.hay(&Ancla::boton("  ")),
        Presencia::Desconocido(Desconocido::AnclaSinNombre)
    );
}

// ---------------------------------------------------------------------------
// 5 · arbol vacio, ambito incompleto y antes de mirar: desconocido nombrado
// ---------------------------------------------------------------------------

#[test]
fn lo_que_no_se_puede_mirar_se_nombra_no_se_inventa() {
    // Antes de mirar nada, no se sabe nada.
    let obs = Observador::nuevo();
    assert_eq!(obs.ultima_vista(), &Vista::Desconocido(Desconocido::NuncaSeMiro));
    assert_eq!(
        obs.hay(&Ancla::boton("Crear")),
        Presencia::Desconocido(Desconocido::NuncaSeMiro)
    );
    assert_eq!(obs.elementos_visibles(), Err(Desconocido::NuncaSeMiro));

    // Un arbol sin nodos NO es una pantalla en blanco: es que no se esta leyendo.
    let vacio = Simulador::con_cuenta("taller_a");
    let mut obs2 = Observador::nuevo();
    assert_eq!(
        obs2.mirar(&vacio, &ambito(), M1),
        Vista::Desconocido(Desconocido::NoSePudoMirar(SinMirada::ArbolVacio))
    );

    // Sin saber de quien es la pantalla, no hay hecho: un hecho huerfano no
    // entra en ningun almacen (P1).
    let mut obs3 = Observador::nuevo();
    assert_eq!(
        obs3.mirar(&inicio(), &SelloDeCuenta::nuevo("", "taller_a"), M1),
        Vista::Desconocido(Desconocido::AmbitoIncompleto)
    );

    // Y no se opera a ciegas: si la mirada de antes falla, la operacion NO corre.
    let mut sim = inicio();
    sim.mutar(Cambio::Cegar(SinMirada::Ocupado)).expect("cegar");
    let mut obs4 = Observador::nuevo();
    let mut se_ejecuto = false;
    let par = obs4.mirar_antes_y_despues(&sim, &ambito(), M1, M2, || {
        se_ejecuto = true;
    });
    assert!(!se_ejecuto, "sin mirada de antes no se toca el mundo");
    assert!(!par.se_opero);
    assert!(par.despues.is_none(), "no hay despues de algo que no paso");
    assert_eq!(par.antes, Vista::Desconocido(Desconocido::NoSePudoMirar(SinMirada::Ocupado)));

    // Con la vista buena, el par se toma alrededor de la operacion.
    let mut obs5 = Observador::nuevo();
    let mut se_ejecuto2 = false;
    let par2 = obs5.mirar_antes_y_despues(&inicio(), &ambito(), M1, M2, || {
        se_ejecuto2 = true;
    });
    assert!(se_ejecuto2);
    assert!(par2.se_opero);
    assert_eq!(par2.antes.hecho().expect("antes").momento, M1);
    assert_eq!(par2.despues.expect("despues").hecho().expect("hecho").momento, M2);
}

// ---------------------------------------------------------------------------
// 6 · lo invisible no es un hecho, y el mismo arbol da el mismo hecho
// ---------------------------------------------------------------------------

#[test]
fn lo_invisible_no_es_un_hecho_y_la_mirada_es_determinista() {
    let sim = Simulador::con_cuenta("taller_a")
        .con_hijo(Nodo::boton("n-crear", "Crear").con_caja_en(0, 0, 100, 50))
        // Un contenedor oculto con un boton dentro: ni el ni su hijo se ven.
        .con_hijo(Nodo::nuevo("n-oculto", Tipo::Desconocido).oculto().con_hijo(Nodo::boton("n-borrar", "Borrar")));

    let mut obs = Observador::nuevo();
    let vista = obs.mirar(&sim, &ambito(), M1);
    let hecho = vista.hecho().expect("hay hecho");

    assert_eq!(hecho.nodos.len(), 1, "solo el nodo visible viaja en el hecho");
    assert!(hecho.nodo("n-borrar").is_none(), "lo invisible no es un hecho");
    assert_eq!(obs.hay(&Ancla::boton("Borrar")), Presencia::Ausente);
    assert_eq!(hecho.nodo("n-crear").expect("esta").punto_de_toque(), Some((50, 25)));

    // El mismo arbol y el mismo momento dan el mismo hecho, byte a byte logico.
    let mut otro = Observador::nuevo();
    let repetido = otro.mirar(&sim, &ambito(), M1);
    assert_eq!(vista, repetido, "mirar dos veces lo mismo no cambia nada");

    // La foto lleva la version del arbol: una foto vieja se reconoce como vieja.
    let mut sim2 = inicio();
    let mut obs2 = Observador::nuevo();
    let v0 = obs2.mirar(&sim2, &ambito(), M1).hecho().expect("hecho").version_del_arbol;
    sim2.mutar(Cambio::Quitar { id: "n-crear".to_string() }).expect("existe");
    let v1 = obs2.mirar(&sim2, &ambito(), M2).hecho().expect("hecho").version_del_arbol;
    assert!(v1 > v0, "una mutacion deja version, y el hecho la lleva");

    // La caja del nodo se conserva y se puede usar para tocar.
    let caja = Caja::nueva(10, 20, 30, 40);
    assert_eq!(caja.centro(), (25, 40));
}
