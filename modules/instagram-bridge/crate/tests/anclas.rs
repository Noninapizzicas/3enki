//! F1b · AnclasCandidatas — el test que fija la regla.
//!
//! **Las anclas candidatas salen de lo observado y no se inventan.**
//!
//! Cada candidata se comprueba contra el `HechoVisible`: su nombre tiene que estar
//! en un nodo NOMBRADO del hecho, su `nodo_id` tambien. Si esa comprobacion pasa
//! para todas y no aparece ninguna etiqueta que no se vio (la que se perdio, la que
//! otro paso ya usa, la de un nodo sin nombre), entonces la pieza ha cumplido.
//!
//! Ademas: una mirada parcial no propone nada (se pide otra mirada), un hecho sin
//! nodos tampoco, y el orden es determinista para que dos ejecuciones den lo mismo.
//!
//! Ejecutar: cd modules/instagram-bridge/crate && cargo test --offline

use enki_instagram_bridge::almacen::anclas::{
    candidatas, es_del_hecho, AnclaCandidata, MotivoVacio, SolicitudDeAncla,
};
use enki_instagram_bridge::percepcion::observador::{Ancla, Observador, SelloDeCuenta, Vista};
use enki_instagram_bridge::percepcion::simulador::{Cambio, Nodo, Simulador, Tipo};

const M1: u64 = 1_800_000_000_000;

fn ambito() -> SelloDeCuenta {
    SelloDeCuenta::nuevo("proy-a", "taller_a")
}

/// La pantalla de ahora: la plataforma renombro "Compartir" a "Publicar ahora".
/// "Crear" sigue (lo usa el paso 1), hay un boton sin nombre y un texto no tocable.
fn pantalla_actual() -> Simulador {
    Simulador::con_cuenta("taller_a")
        .con_hijo(Nodo::boton("n-crear", "Crear").con_caja_en(300, 1600, 120, 80))
        .con_hijo(Nodo::boton("n-publicar", "Publicar ahora").con_caja_en(300, 1700, 120, 80))
        .con_hijo(Nodo::nuevo("n-sin-nombre", Tipo::Boton).con_caja_en(0, 0, 100, 50))
        .con_hijo(Nodo::nuevo("n-texto", Tipo::Texto).con_texto("Publicado").con_caja_en(10, 10, 200, 40))
        .con_hijo(Nodo::boton("n-volver", "Volver").con_caja_en(10, 100, 80, 40))
}

/// El hecho que produce A1 mirando esa pantalla (sin construir nodos a mano: lo que
/// se prueba es el camino real observador -> hecho -> candidatas).
fn hecho_actual() -> enki_instagram_bridge::percepcion::observador::HechoVisible {
    let mut obs = Observador::nuevo();
    let vista = obs.mirar(&pantalla_actual(), &ambito(), M1);
    match vista {
        Vista::Observado(h) => h,
        otro => panic!("se esperaba un hecho observado, llego {:?}", otro),
    }
}

fn nombres(lista: &[AnclaCandidata]) -> Vec<String> {
    lista.iter().map(|c| c.nombre().to_string()).collect()
}

// ---------------------------------------------------------------------------
// Test obligatorio · las candidatas salen de lo observado y no se inventan
// ---------------------------------------------------------------------------

#[test]
fn las_anclas_candidatas_salen_de_lo_observado_y_no_se_inventan() {
    let hecho = hecho_actual();
    let solicitud = SolicitudDeAncla::nueva(3, "Compartir").excluyendo(["Crear"]);
    let r = candidatas(&hecho, &solicitud);

    // 1. Hay candidatas, y no hay motivo de vacio.
    assert!(!r.es_vacia(), "tenia que haber candidatas: {:?}", r.motivo_vacio);
    assert_eq!(r.motivo_vacio, None);

    // 2. LA REGLA: cada candidata esta en el hecho, por nombre y por nodo.
    for c in &r.lista {
        assert!(
            es_del_hecho(&c.ancla, &hecho),
            "la candidata '{}' no esta en lo observado: se la invento",
            c.nombre()
        );
        assert!(
            hecho.nodo(&c.nodo_id).is_some(),
            "el nodo '{}' de la candidata '{}' no existe en el hecho",
            c.nodo_id,
            c.nombre()
        );
        assert!(!c.nombre().trim().is_empty(), "una candidata sin nombre no es un ancla");
    }

    // 3. Lo que NO puede aparecer.
    let propuestos = nombres(&r.lista);
    assert!(
        !propuestos.iter().any(|n| n == "Compartir"),
        "el ancla que se perdio no se propone a si misma: {:?}",
        propuestos
    );
    assert!(
        !propuestos.iter().any(|n| n == "Crear"),
        "un ancla que otro paso ya usa no se propone: {:?}",
        propuestos
    );
    assert!(
        propuestos.iter().any(|n| n == "Publicar ahora"),
        "el ancla nueva que SI estaba en pantalla tenia que estar: {:?}",
        propuestos
    );

    // 4. El nodo sin nombre visible nunca es candidato (aunque sea un boton tocable).
    for c in &r.lista {
        assert_ne!(c.nodo_id, "n-sin-nombre", "un nodo sin nombre no es un ancla");
    }

    // 5. El paso toca: lo no tocable (el texto "Publicado") no vale.
    assert!(
        !propuestos.iter().any(|n| n == "Publicado"),
        "un paso que toca no puede acabar tocando un texto no tocable: {:?}",
        propuestos
    );

    // 6. La primera candidata es del mismo tipo que el ancla perdida (un boton).
    let primera = r.primera().expect("hay primera");
    assert_eq!(primera.ancla.tipo, Tipo::Boton);
    assert!(primera.del_mismo_tipo);
    assert!(primera.confianza >= 2, "mismo tipo no puede tener la confianza minima");

    // 7. Y el tope se respeta.
    assert!(r.lista.len() <= enki_instagram_bridge::almacen::anclas::MAX_POR_DEFECTO);
}

// ---------------------------------------------------------------------------
// 2 · lo que no se puede proponer se dice, en vez de rellenarse
// ---------------------------------------------------------------------------

#[test]
fn sin_nodos_no_hay_candidatas_ni_inventos() {
    // Un simulador sin hijos no produce hecho (A1 lo llama "no se esta leyendo"),
    // asi que se comprueba el caso con un hecho proyectado de una pantalla vacia:
    // el resultado tiene que ser vacio y nombrado.
    let sim = Simulador::con_cuenta("taller_a");
    let mut obs = Observador::nuevo();
    let vista = obs.mirar(&sim, &ambito(), M1);
    assert!(!vista.observado(), "un arbol vacio no es un hecho");

    // Con un hecho real pero sin ningun nodo nombrado, tampoco:
    let hecho = hecho_actual();
    let sin_nombrados = enki_instagram_bridge::percepcion::observador::HechoVisible {
        nodos: hecho.nodos.iter().filter(|n| n.ancla.is_none()).cloned().collect(),
        ..hecho.clone()
    };
    let r = candidatas(&sin_nombrados, &SolicitudDeAncla::nueva(2, "Siguiente"));
    assert!(r.es_vacia());
    assert_eq!(r.motivo_vacio, Some(MotivoVacio::NadaQueProponer));
}

#[test]
fn una_mirada_parcial_no_propone_anclas() {
    let mut sim = pantalla_actual();
    sim.mutar(Cambio::DeclararParcial { motivo: "solo se leyo la mitad de abajo".to_string() })
        .expect("la pantalla se puede declarar parcial");
    let mut obs = Observador::nuevo();
    let hecho = obs.mirar(&sim, &ambito(), M1);
    let hecho = match hecho {
        Vista::Observado(h) => h,
        otro => panic!("una parcial con motivo SI es un hecho: {:?}", otro),
    };
    assert_eq!(hecho.mirada.como_str(), "parcial");

    let r = candidatas(&hecho, &SolicitudDeAncla::nueva(3, "Compartir"));
    assert!(r.es_vacia(), "una mirada parcial no propone anclas");
    assert_eq!(r.motivo_vacio, Some(MotivoVacio::MiradaParcial));
    assert_eq!(MotivoVacio::MiradaParcial.como_str(), "mirada_parcial");
}

#[test]
fn es_del_hecho_rechaza_el_ancla_inventado() {
    let hecho = hecho_actual();
    assert!(es_del_hecho(&Ancla::boton("Publicar ahora"), &hecho));
    assert!(es_del_hecho(&Ancla::boton("publicar AHORA"), &hecho), "la comparacion es por nombre normalizado");
    assert!(!es_del_hecho(&Ancla::boton("Publicar"), &hecho), "una etiqueta que no se vio no esta en el hecho");
    assert!(!es_del_hecho(&Ancla::boton("Siguiente"), &hecho));
    assert!(!es_del_hecho(&Ancla::nueva("   ", Tipo::Boton), &hecho));
}

// ---------------------------------------------------------------------------
// 3 · orden explicable y determinista
// ---------------------------------------------------------------------------

#[test]
fn el_orden_premia_el_parecido_y_el_tipo_y_es_estable() {
    let hecho = hecho_actual();

    // "Publicar fotos" se parece mas a "Publicar" que "Volver".
    let sim = Simulador::con_cuenta("taller_a")
        .con_hijo(Nodo::boton("n-publicar-fotos", "Publicar fotos"))
        .con_hijo(Nodo::boton("n-volver", "Volver"))
        .con_hijo(Nodo::nuevo("n-campo", Tipo::Campo).con_texto("Publicar"));
    let mut obs = Observador::nuevo();
    let hecho2 = match obs.mirar(&sim, &ambito(), M1) {
        Vista::Observado(h) => h,
        otro => panic!("{:?}", otro),
    };

    let r = candidatas(&hecho2, &SolicitudDeAncla::nueva(2, "Publicar"));
    assert!(r.lista.len() >= 2);
    assert_eq!(r.lista[0].nombre(), "Publicar fotos", "el parecido manda: {:?}", nombres(&r.lista));
    assert_eq!(r.lista[0].parecido, 1);

    // La misma consulta dos veces da exactamente lo mismo (no hay azar ni HashMap).
    let a = candidatas(&hecho2, &SolicitudDeAncla::nueva(2, "Publicar"));
    let b = candidatas(&hecho2, &SolicitudDeAncla::nueva(2, "Publicar"));
    assert_eq!(a, b);

    // Y con el tope a 1, solo la primera.
    let una = candidatas(&hecho2, &SolicitudDeAncla::nueva(2, "Publicar").con_max(1));
    assert_eq!(una.lista.len(), 1);
    assert_eq!(una.lista[0].nombre(), "Publicar fotos");

    // Y el hecho original no se toca (la pieza es pura).
    assert_eq!(hecho.nodos.len(), hecho_actual().nodos.len());
}

#[test]
fn una_ancla_repetida_en_dos_nodos_cuenta_una_vez_y_sube_la_confianza() {
    let hecho = hecho_actual();
    let repetido = enki_instagram_bridge::percepcion::observador::HechoVisible {
        nodos: {
            let mut nodos = hecho.nodos.clone();
            nodos.push(
                enki_instagram_bridge::percepcion::observador::NodoVisible {
                    id: "n-publicar-copia".to_string(),
                    ..nodos[1].clone()
                },
            );
            nodos
        },
        ..hecho.clone()
    };

    let r = candidatas(&repetido, &SolicitudDeAncla::nueva(3, "Compartir").excluyendo(["Crear"]));
    let publicar: Vec<&AnclaCandidata> = r.lista.iter().filter(|c| c.nombre() == "Publicar ahora").collect();
    assert_eq!(publicar.len(), 1, "la misma etiqueta dos veces es UNA candidata");
    assert_eq!(publicar[0].veces, 2);
    assert_eq!(publicar[0].confianza, 3, "1 base + 1 mismo tipo + 0 parecido + 1 visto dos veces");
}
