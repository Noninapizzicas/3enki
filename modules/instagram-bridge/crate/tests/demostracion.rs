//! A4.2 · SembradorDeDemostracion — los dos tests que afirman las reglas duras.
//!
//! 1. Una demostracion produce una PROPUESTA, nunca una receta vigente. La
//!    vigencia la dan una persona (Q5) y el catalogo (A4.4); el aparato no puede
//!    concederla.
//! 2. Los pasos observados sin ancla NO se inventan: se anotan como se vieron y al
//!    cerrar son un defecto con su numero de paso. Sin ancla no hay receta.
//!
//! Ejecutar: cd modules/instagram-bridge/crate && cargo test --offline

use enki_instagram_bridge::almacen::demostracion::{
    Ancla, Demostracion, Direccion, EstadoPropuesta, FalloCierre, Gesto, MotivoDefecto, PasoObservado,
    TipoAncla,
};

fn tocar(ancla: &str) -> PasoObservado {
    PasoObservado::nuevo(
        Some(Ancla::nueva(ancla, TipoAncla::Boton)),
        Gesto::Tocar,
    )
    .con_consecuencia("aparece la pantalla siguiente")
    .medido(1200)
}

// ---------------------------------------------------------------------------
// Test obligatorio 1 · la demostracion produce propuesta, no vigente
// ---------------------------------------------------------------------------

#[test]
fn la_demostracion_produce_propuesta_no_vigente() {
    let mut d = Demostracion::abrir("publicar", "@taller_a");
    assert_eq!(d.pasos(), 0);

    d.anotar_paso(tocar("Crear")).expect("el primer paso se anota");
    d.anotar_paso(
        PasoObservado::nuevo(
            Some(Ancla::nueva("Compartir", TipoAncla::Boton)),
            Gesto::Tocar,
        )
        .con_consecuencia("aparece Publicado")
        .medido(2400),
    )
    .expect("el segundo paso se anota");

    let propuesta = d.cerrar().expect("una demostracion completa produce propuesta");

    // 1. La etiqueta dice la verdad: es una propuesta, y no hay nada que diga vigente.
    assert_eq!(propuesta.estado(), EstadoPropuesta::Propuesta);
    assert_eq!(propuesta.estado().como_str(), "propuesta");
    assert_eq!(propuesta.estado().como_str().is_empty(), false);

    // 2. La pregunta que importa: ¿se puede usar ya? No.
    assert!(!propuesta.es_vigente(), "una demostracion JAMAS produce algo vigente");

    // 3. La receta esta completa: dos pasos, con ancla y consecuencia, y un techo
    //    que es exactamente lo medido (sin margen inventado).
    assert_eq!(propuesta.pasos(), 2);
    assert_eq!(propuesta.techo_ms, 3600);
    for paso in &propuesta.pasos {
        assert!(!paso.ancla.nombre_visible.is_empty());
        assert!(!paso.consecuencia.is_empty());
        assert!(paso.espera_maxima_ms > 0);
    }
    assert_eq!(propuesta.pasos[0].numero, 1);
    assert_eq!(propuesta.pasos[1].numero, 2);
    assert_eq!(propuesta.pasos[0].gesto.tipo_como_str(), "tocar");

    // 4. Nace a nombre de la capacidad y la cuenta de la demostracion, no de un
    //    proyecto: el saber hacer es comun (P3).
    assert_eq!(propuesta.capacidad, "publicar");
    assert_eq!(propuesta.cuenta, "@taller_a");
}

// ---------------------------------------------------------------------------
// Test obligatorio 2 · los pasos sin ancla no se inventan
// ---------------------------------------------------------------------------

#[test]
fn pasos_observados_sin_ancla_no_se_inventan() {
    let mut d = Demostracion::abrir("publicar", "@taller_a");
    d.anotar_paso(tocar("Crear")).expect("paso 1 con ancla");
    d.anotar_paso(
        // El humano toco algo que la observacion no supo nombrar.
        PasoObservado::nuevo(None, Gesto::Tocar)
            .con_consecuencia("aparece un dialogo")
            .medido(900),
    )
    .expect("el paso se ANOTA aunque no tenga ancla: se grabo lo que paso");
    d.anotar_paso(
        PasoObservado::nuevo(
            Some(Ancla::nueva("Siguiente", TipoAncla::Boton)),
            Gesto::Tocar,
        )
        .con_consecuencia("avanza")
        .medido(800),
    )
    .expect("paso 3 con ancla");

    // Se anotaron los tres: no se descarta lo que se vio.
    assert_eq!(d.pasos(), 3);
    assert_eq!(d.observados()[1].ancla, None, "el hueco se conserva, no se rellena");

    let fallo = d.cerrar().expect_err("sin ancla no hay receta");
    match fallo {
        FalloCierre::ConDefectos(defectos) => {
            // El defecto nombra EL PASO que falla, no "la demostracion".
            assert!(
                defectos.iter().any(|x| x.paso == 2 && x.motivo == MotivoDefecto::SinAncla),
                "el defecto tiene que ser del paso 2: {defectos:?}"
            );
            assert!(
                !defectos.iter().any(|x| x.paso == 1),
                "el paso 1 estaba completo y no se toca"
            );
            assert!(
                !defectos.iter().any(|x| x.paso == 3),
                "el paso 3 estaba completo y no se toca"
            );
            for defecto in &defectos {
                assert_eq!(defecto.motivo, MotivoDefecto::SinAncla);
                assert!(defecto.motivo.como_str().is_ascii(), "el nombre viaja en payloads");
                assert!(!defecto.motivo.descripcion().is_empty());
            }
        }
        otro => panic!("se esperaba ConDefectos, llego {otro:?}"),
    }

    // Y la prueba de que no se invento: no hay ninguna ancla con nombre vacio ni
    // un "elemento 2" de relleno en ninguna receta, porque NO HAY receta.
    assert!(d.cerrar().is_err());
}

// ---------------------------------------------------------------------------
// Casos que blindan los bordes
// ---------------------------------------------------------------------------

#[test]
fn una_demostracion_vacia_no_produce_receta() {
    let d = Demostracion::abrir("publicar", "@taller_a");
    assert_eq!(d.cerrar(), Err(FalloCierre::Vacia));
}

#[test]
fn sin_espera_medida_no_hay_techo_y_no_hay_receta() {
    let mut d = Demostracion::abrir("publicar", "@taller_a");
    d.anotar_paso(
        PasoObservado::nuevo(Some(Ancla::nueva("Crear", TipoAncla::Boton)), Gesto::Tocar)
            .con_consecuencia("aparece el selector"),
    )
    .expect("se anota");

    match d.cerrar() {
        Err(FalloCierre::ConDefectos(defectos)) => {
            assert_eq!(defectos.len(), 1);
            assert_eq!(defectos[0].paso, 1);
            assert_eq!(defectos[0].motivo, MotivoDefecto::SinEspera);
        }
        otro => panic!("se esperaba un defecto de espera, llego {otro:?}"),
    }
}

#[test]
fn un_gesto_que_resuelve_dos_cosas_se_rechaza_y_se_repite() {
    let mut d = Demostracion::abrir("publicar", "@taller_a");
    let ambiguo = PasoObservado::nuevo(Some(Ancla::nueva("Compartir", TipoAncla::Boton)), Gesto::Tocar)
        .con_consecuencia("aparecen Publicado y Copiar enlace")
        .medido(1000)
        .con_aparecidos(2);

    let defecto = d.anotar_paso(ambiguo).expect_err("dos cosas en un toque no se adivinan");
    assert_eq!(defecto.paso, 1);
    assert_eq!(defecto.motivo, MotivoDefecto::Ambigua);
    assert_eq!(d.pasos(), 0, "el paso ambiguo no entra: se pide repetir");

    // Escribir abre un teclado: muchos nodos nuevos que no son una segunda decision.
    let tecleo = PasoObservado::nuevo(Some(Ancla::nueva("Pie de foto", TipoAncla::Campo)), Gesto::Escribir {
        texto: "hola".to_string(),
    })
    .con_consecuencia("aparece el texto")
    .medido(1500)
    .con_aparecidos(3);
    d.anotar_paso(tecleo).expect("escribir no es ambiguo aunque aparezcan muchas teclas");
    assert_eq!(d.pasos(), 1);
}

#[test]
fn el_desplazamiento_conserva_su_direccion() {
    let mut d = Demostracion::abrir("leer", "@taller_a");
    d.anotar_paso(
        PasoObservado::nuevo(
            Some(Ancla::nueva("Feed", TipoAncla::Texto)),
            Gesto::Desplazar { direccion: Direccion::Abajo, distancia: Some(600) },
        )
        .con_consecuencia("aparecen publicaciones mas antiguas")
        .medido(700),
    )
    .expect("se anota");

    let propuesta = d.cerrar().expect("propuesta");
    assert_eq!(propuesta.pasos[0].gesto.tipo_como_str(), "desplazar");
    match &propuesta.pasos[0].gesto {
        Gesto::Desplazar { direccion, distancia } => {
            assert_eq!(*direccion, Direccion::Abajo);
            assert_eq!(direccion.como_str(), "abajo");
            assert_eq!(*distancia, Some(600));
        }
        otro => panic!("se esperaba un desplazamiento, llego {otro:?}"),
    }
}

#[test]
fn una_demostracion_descartada_no_se_cierra() {
    let mut d = Demostracion::abrir("publicar", "@taller_a");
    d.anotar_paso(tocar("Crear")).expect("se anota");
    d.descartar();
    assert_eq!(d.cerrar(), Err(FalloCierre::NoAbierta));

    // Y no se anota nada mas: la demostracion esta cerrada, no "en pausa".
    let rechazo = d.anotar_paso(tocar("Compartir")).expect_err("descartada no admite pasos");
    assert_eq!(rechazo.motivo, MotivoDefecto::NoAbierta);
    assert_eq!(d.pasos(), 1, "el paso rechazado no entra");
    assert_eq!(d.estado(), enki_instagram_bridge::almacen::demostracion::EstadoDemostracion::Descartada);
}

#[test]
fn el_tipo_de_ancla_desconocido_no_se_adivina() {
    assert_eq!(TipoAncla::desde_nombre("Boton"), TipoAncla::Boton);
    assert_eq!(TipoAncla::desde_nombre("EditText"), TipoAncla::Campo);
    // Lo que no se reconoce no se convierte en "lo mas parecido".
    assert_eq!(TipoAncla::desde_nombre("switch_custom"), TipoAncla::Desconocido);
    assert_eq!(TipoAncla::desde_nombre("").como_str(), "desconocido");
}
