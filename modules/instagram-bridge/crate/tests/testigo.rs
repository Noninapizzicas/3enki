//! instagram-bridge · BLOQUE 6 · O1 + O2 · EL TESTIGO (REFLEJOS)
//!
//! Lo que esta suite fija, y que no se puede relajar:
//!
//!   - **la espera agotada es NO SE, nunca SI**: dejar de esperar no es una
//!     prueba. Sin ancla visible, el resultado es `NoSeSabe` con su
//!     `que_haria_falta`, jamas `Ocurrio`.
//!   - **un veredicto unico y nada de parcial**: con un solo paso `NoSeSabe`, la
//!     ejecucion entera es `NoSeSabe`. La mayoria no asciende nada.
//!   - **`NoSeSabe` siempre viaja con lo que haria falta**: un no-saber sin
//!     motivo es una excusa, y aqui no se puede construir.
//!   - **`Ocurrio` exige prueba visible**: que no falle nada no es que ocurriera;
//!     hace falta el nodo, el momento y la cuenta.
//!
//! Todo con hechos construidos a mano: estos tests no necesitan movil, ni bus,
//! ni reloj. El `momento` entra en el hecho.

use enki_instagram_bridge::percepcion::observador::{
    Ancla, HechoVisible, NodoVisible, SelloDeCuenta,
};
use enki_instagram_bridge::percepcion::simulador::{Caja, Pantalla, Tipo};
use enki_instagram_bridge::percepcion::Mirada;
use enki_instagram_bridge::testigo::verificador::{
    ConsecuenciaEsperada, QueHariaFalta, ResultadoDeConsecuencia, VerificadorDeConsecuencia,
};
use enki_instagram_bridge::testigo::veredicto::{Veredicto, VeredictoDeEjecucion};

const T0: u64 = 1_800_000_000_000;
const PLAZO: u64 = 1_000;

// ---------------------------------------------------------------------------
// Utilidades: hechos y consecuencias a mano
// ---------------------------------------------------------------------------

fn sello() -> SelloDeCuenta {
    SelloDeCuenta::nuevo("proy-a", "taller_a")
}

fn nodo(id: &str, etiqueta: &str) -> NodoVisible {
    NodoVisible {
        id: id.to_string(),
        padre: None,
        profundidad: 1,
        ancla: Some(etiqueta.to_string()),
        texto: Some(etiqueta.to_string()),
        tipo: Tipo::Boton,
        caja: Caja::nueva(100, 200, 300, 80),
        tocable: true,
    }
}

/// Una foto de la pantalla de crear, con los nodos que se quieran ver.
fn hecho(mirada: Mirada, momento: u64, nodos: Vec<NodoVisible>) -> HechoVisible {
    HechoVisible {
        sello: sello(),
        momento,
        pantalla: Pantalla::Crear,
        plataforma: "instagram".to_string(),
        mirada,
        motivo_sin_mirada: match mirada {
            Mirada::Parcial => Some("solo se leyo la mitad superior".to_string()),
            Mirada::Completa => None,
        },
        cuenta_visible: Some("taller_a".to_string()),
        version_del_arbol: 1,
        nodos,
    }
}

/// La consecuencia tipica: tras pulsar "Compartir", se espera ver "Publicado".
fn consecuencia(desde: u64) -> ConsecuenciaEsperada {
    ConsecuenciaEsperada::nueva(1, Ancla::boton("Publicado"), &sello(), desde).con_plazo(PLAZO)
}

fn ocurrio(paso: usize, etiqueta: &str, momento: u64) -> ResultadoDeConsecuencia {
    ResultadoDeConsecuencia::ocurrio(paso, &Ancla::boton(etiqueta), "n-vis", momento, "taller_a")
}

fn no_ocurrio(paso: usize, etiqueta: &str, momento: u64) -> ResultadoDeConsecuencia {
    ResultadoDeConsecuencia::no_ocurrio(
        paso,
        &Ancla::boton(etiqueta),
        momento,
        Mirada::Completa,
    )
}

// ---------------------------------------------------------------------------
// 1 · LA ESPERA AGOTADA ES NO SE, NUNCA SI  (test de la espina)
// ---------------------------------------------------------------------------

#[test]
fn espera_agotada_es_no_se_nunca_si() {
    let verificador = VerificadorDeConsecuencia::nuevo();
    let esperada = consecuencia(T0);

    // Se mira una y otra vez, completo y sin el ancla, hasta muy pasado el plazo.
    // Nada falla: la pantalla esta entera, la cuenta es la correcta. Y aun asi,
    // en ningun momento se puede decir que ocurrio.
    let momentos = [T0, T0 + 500, T0 + 1_000, T0 + 1_001, T0 + 5_000, T0 + 60_000];
    for momento in momentos {
        let foto = hecho(Mirada::Completa, momento, vec![nodo("n-compartir", "Compartir")]);
        let resultado = verificador.verificar(&esperada, &foto);

        assert!(
            !resultado.es_ocurrio(),
            "agotar la espera a las {momento} no puede dar Ocurrio: {}",
            resultado.descripcion()
        );
        assert!(
            resultado.es_no_se_sabe(),
            "sin prueba visible el resultado es NoSeSabe a las {momento}, no {}",
            resultado.como_str()
        );
        assert!(
            resultado.que_haria_falta().is_some(),
            "un NoSeSabe sin que_haria_falta es una excusa ({momento})"
        );
    }

    // Dentro del plazo: todavia se le concede tiempo. Se nombra el plazo.
    let dentro = verificador.verificar(
        &esperada,
        &hecho(Mirada::Completa, T0 + 500, vec![]),
    );
    match dentro.que_haria_falta() {
        Some(QueHariaFalta::EsperarHasta { momento_limite }) => {
            assert_eq!(*momento_limite, T0 + PLAZO);
        }
        otro => panic!("dentro del plazo se dice hasta cuando esperar, no {otro:?}"),
    }

    // Fuera del plazo y sin persistencia: la ausencia no prueba la no-ocurrencia
    // (pudo pasar y deshacerse). Sigue siendo NoSeSabe, y se dice que haria falta.
    let agotada = verificador.verificar(
        &esperada,
        &hecho(Mirada::Completa, T0 + PLAZO + 1, vec![]),
    );
    match agotada.que_haria_falta() {
        Some(QueHariaFalta::PruebaDeNoOcurrio { ancla }) => assert_eq!(ancla, "Publicado"),
        otro => panic!("agotada y no persistente exige prueba de no ocurrio, no {otro:?}"),
    }

    // Solo con una consecuencia PERSISTENTE (un post en la parrilla) la ausencia
    // en una mirada completa posterior al plazo prueba que no ocurrio. Y ni
    // siquiera entonces se dice que ocurrio.
    let persistente = consecuencia(T0).persistente();
    let ausencia = verificador.verificar(
        &persistente,
        &hecho(Mirada::Completa, T0 + PLAZO + 1, vec![]),
    );
    assert!(ausencia.es_no_ocurrio(), "una ausencia persistente si prueba: {ausencia}");
    assert!(!ausencia.es_ocurrio());
    assert!(ausencia.prueba_de_ausencia().is_some());
    assert_eq!(ausencia.que_haria_falta(), None, "NoOcurrio no pide nada mas");
}

// ---------------------------------------------------------------------------
// 2 · UN VEREDICTO UNICO Y NADA DE PARCIAL
// ---------------------------------------------------------------------------

#[test]
fn veredicto_unico_y_no_parcial() {
    // Tres valores, cerrados. Un cuarto se veria aqui.
    assert_eq!(Veredicto::TODOS.len(), 3);
    let codigos: Vec<&str> = Veredicto::TODOS.iter().map(|v| v.como_str()).collect();
    assert_eq!(codigos, vec!["ocurrio", "no_ocurrio", "no_se_sabe"]);
    assert!(
        codigos.iter().all(|c| !c.contains("parcial")),
        "no hay veredicto parcial: {codigos:?}"
    );

    // Todos ocurrieron -> Ocurrio (y solo entonces).
    let todos = vec![ocurrio(1, "Publicado", T0 + 1), ocurrio(2, "Listo", T0 + 2)];
    let j = VeredictoDeEjecucion::juzgar(&todos);
    assert_eq!(j.veredicto, Veredicto::Ocurrio);
    assert!(j.es_ocurrio());
    assert_eq!(j.pasos_ocurridos, vec![1, 2]);
    assert_eq!(j.pruebas().len(), 2, "cada ocurrido lleva su prueba");
    assert!(j.que_haria_falta().is_empty());

    // Un NoOcurrio, con todo lo demas ocurrido -> NoOcurrio.
    let con_fallo = vec![ocurrio(1, "Publicado", T0 + 1), no_ocurrio(2, "Listo", T0 + 2)];
    let j = VeredictoDeEjecucion::juzgar(&con_fallo);
    assert_eq!(j.veredicto, Veredicto::NoOcurrio);
    assert_eq!(j.pasos_no_ocurridos, vec![2]);
    assert_eq!(j.pasos_ocurridos, vec![1], "lo que si ocurrio no se borra");

    // Un NoSeSabe, aunque haya mayoria de ocurridos -> NoSeSabe. La mayoria no
    // asciende un no-saber a hecho.
    let con_duda = vec![
        ocurrio(1, "Publicado", T0 + 1),
        ocurrio(2, "Listo", T0 + 2),
        ResultadoDeConsecuencia::no_se_sabe(3, QueHariaFalta::MiradaCompleta {
            mirada: Mirada::Parcial,
        }),
    ];
    let j = VeredictoDeEjecucion::juzgar(&con_duda);
    assert_eq!(j.veredicto, Veredicto::NoSeSabe);
    assert!(!j.es_ocurrio(), "dos de tres NO es un hecho");
    assert_eq!(j.pasos_no_se, vec![3]);
    assert!(!j.que_haria_falta().is_empty());

    // Sin pasos no hay ejecucion que afirmar.
    let vacio = VeredictoDeEjecucion::juzgar(&[]);
    assert_eq!(vacio.veredicto, Veredicto::NoSeSabe);
    assert_eq!(vacio.pasos(), 0);
    assert!(vacio.que_haria_falta().contains(&QueHariaFalta::SinPasos));

    // El mismo paso dos veces con resultados distintos: contradiccion, no dato.
    let contradictorio = vec![ocurrio(7, "Publicado", T0 + 1), no_ocurrio(7, "Publicado", T0 + 2)];
    let j = VeredictoDeEjecucion::juzgar(&contradictorio);
    assert_eq!(j.veredicto, Veredicto::NoSeSabe);
    assert!(j
        .que_haria_falta()
        .contains(&QueHariaFalta::UnSoloResultadoPorPaso { paso: 7 }));
}

// ---------------------------------------------------------------------------
// 3 · NO SE SE ACOMPANA DE QUE HARIA FALTA
// ---------------------------------------------------------------------------

#[test]
fn no_se_se_acompaña_de_que_haria_falta() {
    let verificador = VerificadorDeConsecuencia::nuevo();
    let esperada = consecuencia(T0);

    let mut sin_saber: Vec<ResultadoDeConsecuencia> = Vec::new();

    // a) sin nombre visible no hay nada que buscar
    let sin_nombre = ConsecuenciaEsperada::nueva(
        1,
        Ancla::boton("   "),
        &sello(),
        T0,
    );
    sin_saber.push(verificador.verificar(&sin_nombre, &hecho(Mirada::Completa, T0 + 1, vec![])));

    // b) la foto es de otra cuenta
    let mut otra_cuenta = hecho(Mirada::Completa, T0 + 1, vec![]);
    otra_cuenta.sello = SelloDeCuenta::nuevo("proy-a", "otra_cuenta");
    sin_saber.push(verificador.verificar(&esperada, &otra_cuenta));

    // c) la foto es vieja: anterior al paso
    sin_saber.push(verificador.verificar(&esperada, &hecho(Mirada::Completa, T0 - 1, vec![])));

    // d) la foto es parcial: no afirma ausencias
    sin_saber.push(verificador.verificar(&esperada, &hecho(Mirada::Parcial, T0 + 1, vec![])));

    // e) dentro de plazo, completo y sin el ancla
    sin_saber.push(verificador.verificar(&esperada, &hecho(Mirada::Completa, T0 + 1, vec![])));

    // f) plazo agotado y consecuencia no persistente
    sin_saber.push(verificador.verificar(
        &esperada,
        &hecho(Mirada::Completa, T0 + PLAZO + 1, vec![]),
    ));

    // g) el ancla ya estaba antes: verla no prueba el paso
    let ya_estaba = consecuencia(T0).estaba_antes();
    sin_saber.push(verificador.verificar(
        &ya_estaba,
        &hecho(Mirada::Completa, T0 + 1, vec![nodo("n-publicado", "Publicado")]),
    ));

    assert_eq!(sin_saber.len(), 7, "siete caminos al no-saber");
    let mut codigos = Vec::new();
    for resultado in &sin_saber {
        assert!(resultado.es_no_se_sabe(), "se esperaba NoSeSabe: {resultado}");
        assert!(!resultado.es_ocurrio(), "un no-saber nunca es un hecho");
        let falta = resultado
            .que_haria_falta()
            .unwrap_or_else(|| panic!("NoSeSabe sin que_haria_falta: {resultado}"));
        assert!(
            !falta.descripcion().trim().is_empty(),
            "que_haria_falta tiene que explicarse: {falta}"
        );
        codigos.push(falta.como_str());
    }

    // Los siete motivos son distintos: cada uno dice QUE falta, no "algo".
    codigos.sort_unstable();
    let mut unicos = codigos.clone();
    unicos.dedup();
    assert_eq!(unicos.len(), 7, "motivos repetidos: {codigos:?}");

    // Y en O2, un veredicto NoSeSabe nunca sale mudo.
    let j = VeredictoDeEjecucion::juzgar(&sin_saber);
    assert_eq!(j.veredicto, Veredicto::NoSeSabe);
    assert!(!j.que_haria_falta().is_empty(), "el veredicto lleva lo que falta");
    for falta in j.que_haria_falta() {
        assert!(!falta.descripcion().trim().is_empty());
    }
}

// ---------------------------------------------------------------------------
// 4 · OCURRIO EXIGE PRUEBA VISIBLE, NO BASTA QUE NO FALLE
// ---------------------------------------------------------------------------

#[test]
fn ocurrio_exige_prueba_visible_no_basta_que_no_falle() {
    let verificador = VerificadorDeConsecuencia::nuevo();
    let esperada = consecuencia(T0);

    // Nada fallo: mirada completa, cuenta correcta, ningun error. Pero no se vio
    // el ancla, asi que NO es "ocurrio". El silencio no es una prueba.
    let sin_prueba = verificador.verificar(
        &esperada,
        &hecho(Mirada::Completa, T0 + PLAZO + 1, vec![nodo("n-compartir", "Compartir")]),
    );
    assert!(
        !sin_prueba.es_ocurrio(),
        "'no fallo nada' no es 'ocurrio': {}",
        sin_prueba.descripcion()
    );
    assert!(sin_prueba.prueba().is_none(), "sin ancla no hay prueba que llevar");

    // Con el ancla visible SI: y la prueba dice donde, cuando y en que cuenta.
    let con_prueba = verificador.verificar(
        &esperada,
        &hecho(
            Mirada::Completa,
            T0 + 120,
            vec![nodo("n-ok", "Publicado")],
        ),
    );
    let prueba = con_prueba.prueba().expect("Ocurrio lleva prueba");
    assert!(con_prueba.es_ocurrio());
    assert_eq!(prueba.paso, 1);
    assert_eq!(prueba.ancla, "Publicado");
    assert_eq!(prueba.nodo_id, "n-ok", "la prueba nombra el nodo que se vio");
    assert_eq!(prueba.momento, T0 + 120, "y el momento de la foto");
    assert_eq!(prueba.cuenta, "taller_a", "y de quien era la pantalla");
    assert!(!prueba.descripcion().trim().is_empty());

    // Una mirada parcial SI afirma lo que ve: si el ancla esta, hay prueba.
    let parcial_con_ancla = verificador.verificar(
        &esperada,
        &hecho(Mirada::Parcial, T0 + 120, vec![nodo("n-ok", "Publicado")]),
    );
    assert!(
        parcial_con_ancla.es_ocurrio(),
        "lo que se vio, se vio: {}",
        parcial_con_ancla.descripcion()
    );

    // Pero si el ancla ya estaba antes de pulsar, verla despues no prueba nada
    // del paso: es un no-saber, no un hecho.
    let ya_estaba = consecuencia(T0).estaba_antes();
    let ambiguo = verificador.verificar(
        &ya_estaba,
        &hecho(Mirada::Completa, T0 + 120, vec![nodo("n-ok", "Publicado")]),
    );
    assert!(!ambiguo.es_ocurrio(), "el estado previo no es prueba del efecto");
    assert!(matches!(
        ambiguo.que_haria_falta(),
        Some(QueHariaFalta::PruebaQueDistinga { .. })
    ));

    // Y si lo unico que hay es un no-saber, O2 tampoco lo convierte en hecho.
    let j = VeredictoDeEjecucion::juzgar(&[ambiguo]);
    assert_eq!(j.veredicto, Veredicto::NoSeSabe);
    assert!(!j.veredicto.autoriza_hecho());
}
