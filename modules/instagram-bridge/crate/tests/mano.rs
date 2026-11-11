//! instagram-bridge · A3 (EjecutorDeElemento) y A5 (EscaleraDeRecuperacion)
//!
//! Esta suite fija lo que la mano no puede relajar:
//!
//!   - **no se encadena a ciegas**: dos pasos con la misma foto es una parada,
//!     no un atajo; la operacion `publicar` mira de nuevo delante de cada paso;
//!   - **un paso que ya cambio el mundo no se reintenta nunca**, y si no se
//!     sabe si lo cambio, tampoco (`Indeterminado` cae del lado caro);
//!   - **una accion fuera del catalogo se rechaza**, no se degrada a `tocar`:
//!     no se entrega ni un gesto;
//!   - **sin ancla se para y se nombra el paso**: con su numero, y sin afirmar
//!     ausencias sobre una mirada parcial.
//!
//! Todo con el `Simulador` del arbol y la `SuperficieGrabada` de los gestos:
//! estos tests corren en escritorio, sin movil y sin Android SDK.

use enki_instagram_bridge::contrato::fallo::{FamiliaDeFallo, Remedio};
use enki_instagram_bridge::mano::ejecutor::{
    Accion, AccionDeclarada, EfectoEnElMundo, Ejecutor, Gesto, MotivoDeParada, Paso, Resultado,
    SuperficieGrabada,
};
use enki_instagram_bridge::mano::escalera::{
    Escalera, HechoDeFallo, MotivoDeDecision, TECHO_POR_DEFECTO,
};
use enki_instagram_bridge::mano::publicar::{
    Desenlace, MotivoDePublicacion, Publicacion, Publicador,
};
use enki_instagram_bridge::percepcion::observador::{
    Ancla, Desconocido, HechoVisible, Observador, SelloDeCuenta,
};
use enki_instagram_bridge::percepcion::simulador::{Cambio, Nodo, Simulador};

const M1: u64 = 1_800_000_000_000;
const M2: u64 = 1_800_000_002_000;
const M3: u64 = 1_800_000_004_000;

fn ambito() -> SelloDeCuenta {
    SelloDeCuenta::nuevo("proy-a", "taller_a")
}

/// Un inicio de Instagram con lo minimo para tres pasos: crear, siguiente y el
/// boton de compartir que la receta va a necesitar al final.
fn inicio() -> Simulador {
    Simulador::con_cuenta("taller_a")
        .con_hijo(Nodo::boton("n-crear", "Crear").con_caja_en(300, 1600, 120, 80))
        .con_hijo(Nodo::boton("n-siguiente", "Siguiente").con_caja_en(300, 1700, 120, 80))
        .con_hijo(Nodo::boton("n-compartir", "Compartir").con_caja_en(600, 1700, 120, 80))
}

/// Una mirada fresca, con el observador de verdad (A1) y el momento inyectado.
fn mirar(obs: &mut Observador, sim: &Simulador, momento: u64) -> HechoVisible {
    let vista = obs.mirar(sim, &ambito(), momento);
    vista.hecho().expect("con el arbol delante hay hecho").clone()
}

fn tocar(numero: usize, nombre: &str) -> Paso {
    Paso::nuevo(numero, Ancla::boton(nombre), AccionDeclarada::tocar())
}

// ---------------------------------------------------------------------------
// 1 · NO SE ENCADENA A CIEGAS  (la regla de la foto)
// ---------------------------------------------------------------------------

#[test]
fn no_encadena_dos_pasos_a_ciegas() {
    let mut sim = inicio();
    let mut obs = Observador::nuevo();
    let mut ejecutor = Ejecutor::nuevo();
    let mut mano = SuperficieGrabada::nueva();

    // Una sola foto para los dos primeros pasos.
    let foto = mirar(&mut obs, &sim, M1);
    let primero = tocar(1, "Crear");
    let segundo = tocar(2, "Siguiente");

    // Paso 1: se ejecuta y se entrega UN gesto.
    match ejecutor.ejecutar(&foto, &primero, &mut mano) {
        Resultado::Ejecutado(ejecucion) => {
            assert_eq!(ejecucion.paso, 1);
            assert_eq!(ejecucion.accion, Accion::Tocar);
            assert_eq!(ejecucion.punto, Some((360, 1640)), "toca el centro de la caja");
            assert_eq!(ejecucion.efecto, EfectoEnElMundo::EfectoPosible);
        }
        otro => panic!("el paso 1 tenia que ejecutarse, salio {otro:?}"),
    }
    assert_eq!(mano.cuantos(), 1);

    // Paso 2 con LA MISMA foto: prohibido. No se hereda la foto del paso 1.
    match ejecutor.ejecutar(&foto, &segundo, &mut mano) {
        Resultado::Parado(parada) => {
            assert_eq!(parada.paso, 2, "la parada nombra el paso que se nego a correr");
            assert_eq!(
                parada.motivo,
                MotivoDeParada::FotoRepetida { version: foto.version_del_arbol, momento: M1 }
            );
            assert!(parada.no_toco_nada(), "no se toco nada: la parada es anterior al gesto");
        }
        otro => panic!("encadenar con la misma foto tenia que pararse, salio {otro:?}"),
    }
    assert_eq!(mano.cuantos(), 1, "no se entrego un segundo gesto: no hay foto nueva");

    // Con una mirada nueva (mismo arbol, OTRO momento) si se puede: hubo lectura.
    sim.mutar(Cambio::Anadir {
        padre: "raiz".to_string(),
        nodo: Nodo::nuevo("n-listo", enki_instagram_bridge::percepcion::simulador::Tipo::Texto)
            .con_texto("Listo"),
    })
    .expect("se puede anadir");
    let foto2 = mirar(&mut obs, &sim, M2);
    assert!(foto2.version_del_arbol > foto.version_del_arbol, "la pantalla cambio: la version sube");
    assert!(ejecutor.ejecutar(&foto2, &segundo, &mut mano).ejecutado(), "con foto nueva, el paso 2 corre");
    assert_eq!(mano.cuantos(), 2);
    assert_eq!(ejecutor.ultima_foto().map(|f| f.momento), Some(M2));

    // Y la misma regla, en la operacion compuesta: `publicar` no hereda fotos.
    // Tres pasos -> tres miradas (una por paso) y una mas para confirmar.
    let mut publicador = Publicador::nuevo();
    let mut mano2 = SuperficieGrabada::nueva();
    let mut t = M1;
    let mut reloj = move || {
        let ahora = t;
        t += 1_000;
        ahora
    };
    let pasos = [tocar(1, "Crear"), tocar(2, "Siguiente"), tocar(3, "Compartir")];
    let publicacion = Publicacion::nueva("publicar_foto", "taller_a", &pasos);

    let informe = publicador.publicar(&sim, &mut mano2, &ambito(), &mut reloj, &publicacion);

    assert_eq!(mano2.cuantos(), 3, "un gesto por paso, ni uno mas");
    assert_eq!(informe.gestos, 3);
    assert_eq!(informe.pasos_ejecutados, 3);
    assert_eq!(informe.miradas, 4, "una mirada nueva delante de cada paso, y otra para confirmar");
    assert!(
        matches!(informe.motivo, Some(MotivoDePublicacion::SinConQueConfirmar)),
        "sin postcondicion no se puede afirmar: {:?}",
        informe.motivo
    );
    assert_eq!(informe.desenlace, Desenlace::SinConfirmar);
}

// ---------------------------------------------------------------------------
// 2 · LA REGLA SAGRADA: lo que cambio el mundo no se reintenta
// ---------------------------------------------------------------------------

#[test]
fn paso_que_cambio_el_mundo_no_se_reintenta() {
    // Techo generoso a proposito: aunque sobren intentos, el mundo ya cambio.
    let escalera = Escalera::con_techo(10);

    let hecho = HechoDeFallo::nuevo(3, FamiliaDeFallo::Plataforma, EfectoEnElMundo::EfectoPosible)
        .con_intentos(0)
        .con_vuelta(true);

    let decision = escalera.decidir(&hecho);
    assert!(!decision.permite_reintentar(), "un paso que cambio el mundo NO se reintenta");
    assert!(decision.escala());
    assert_eq!(decision.paso(), 3);
    assert_eq!(decision.motivo(), MotivoDeDecision::CambioElMundo);
    // La familia `plataforma` declara `reintentar` en R1; una escalada que
    // pidiera reintentar se contradiria a si misma, asi que viaja `escalar`.
    assert_eq!(
        decision.remedio(),
        Some(Remedio::Escalar),
        "la escalada no puede pedir el reintento que la regla prohibe"
    );

    // Ni con el techo a cero, ni con intentos negativos por configuracion rara:
    // el efecto manda sobre cualquier numero.
    for intentos in [0, 1, 99] {
        let d = escalera.decidir(&hecho.clone().con_intentos(intentos));
        assert!(!d.permite_reintentar(), "con {intentos} intentos tampoco");
    }

    // El contraste que hace util la regla: sin efecto SI se reintenta.
    let sin_efecto =
        HechoDeFallo::nuevo(3, FamiliaDeFallo::Plataforma, EfectoEnElMundo::SinEfecto);
    let d = escalera.decidir(&sin_efecto);
    assert!(d.permite_reintentar(), "si no se movio nada, un segundo intento es seguro");
    assert_eq!(d.motivo(), MotivoDeDecision::NoCambioElMundo);

    // Y con el techo agotado, ni eso: se escala. La escalera por defecto solo
    // deja un reintento ("repetir UNA vez", R1), asi que el segundo se niega.
    let por_defecto = Escalera::nueva();
    let agotado = sin_efecto.clone().con_intentos(TECHO_POR_DEFECTO);
    assert!(!por_defecto.decidir(&agotado).permite_reintentar());
    assert_eq!(por_defecto.decidir(&agotado).motivo(), MotivoDeDecision::SeAgotoElTecho);
    // Techo a cero: no hay reintento ni la primera vez.
    let cerrada = Escalera::con_techo(0);
    assert!(!cerrada.decidir(&sin_efecto).permite_reintentar());

    // Una familia que no es reintentable no se reintenta aunque no haya tocado
    // nada: R1 solo deja repetir `plataforma`.
    let interfaz =
        HechoDeFallo::nuevo(2, FamiliaDeFallo::Interfaz, EfectoEnElMundo::SinEfecto).con_vuelta(true);
    let d = escalera.decidir(&interfaz);
    assert!(d.permite_volver(), "con vuelta declarada, la interfaz retrocede");
    assert_eq!(d.motivo(), MotivoDeDecision::LaPantallaYaNoEsLaQueLaRecetaSupone);
    // Sin vuelta, la misma interfaz escala con su remedio: declarar la rotura.
    let sin_vuelta = interfaz.clone().con_vuelta(false);
    let d = escalera.decidir(&sin_vuelta);
    assert!(d.escala());
    assert_eq!(d.remedio(), Some(Remedio::DeclararRotura));
    assert_eq!(d.motivo(), MotivoDeDecision::SinCaminoDeVuelta);
}

// ---------------------------------------------------------------------------
// 3 · UNA ACCION FUERA DEL CATALOGO NO SE DEGRADA A TOCAR
// ---------------------------------------------------------------------------

#[test]
fn accion_fuera_del_catalogo_no_se_degrada() {
    let sim = inicio();
    let mut obs = Observador::nuevo();
    let mut ejecutor = Ejecutor::nuevo();
    let mut mano = SuperficieGrabada::nueva();
    let foto = mirar(&mut obs, &sim, M1);

    // El ancla existe, es tocable y esta en su caja: si se tocara, se tocaria
    // bien. El rechazo no es del arbol, es de la accion.
    for tipo in ["arrastrar", "pulsar_largo", "deslizar_dos_dedos", "TOMAR_FOTO"] {
        let paso = Paso::nuevo(2, Ancla::boton("Crear"), AccionDeclarada::nueva(tipo));
        match ejecutor.ejecutar(&foto, &paso, &mut mano) {
            Resultado::Parado(parada) => {
                assert_eq!(parada.paso, 2);
                assert_eq!(
                    parada.motivo,
                    MotivoDeParada::AccionFueraDelCatalogo { tipo: tipo.to_ascii_lowercase() },
                    "'{tipo}' se rechaza nombrandola"
                );
                assert_eq!(parada.efecto, EfectoEnElMundo::SinEfecto);
            }
            otro => panic!("'{tipo}' no esta en el catalogo y no se ejecuta, salio {otro:?}"),
        }
    }
    assert_eq!(mano.cuantos(), 0, "ni un gesto: una accion rara NO se convierte en un toque");

    // Una accion del catalogo a la que le falta su campo tampoco se rellena.
    let sin_texto = Paso::nuevo(2, Ancla::boton("Crear"), AccionDeclarada::nueva("escribir"));
    match ejecutor.ejecutar(&foto, &sin_texto, &mut mano) {
        Resultado::Parado(parada) => {
            assert_eq!(parada.motivo, MotivoDeParada::AccionIncompleta { campo: "texto" })
        }
        otro => panic!("escribir sin texto no se ejecuta, salio {otro:?}"),
    }
    let sin_ventana = Paso::nuevo(2, Ancla::boton("Crear"), AccionDeclarada::nueva("esperar"));
    assert_eq!(
        ejecutor.ejecutar(&foto, &sin_ventana, &mut mano).parada().map(|p| p.motivo.clone()),
        Some(MotivoDeParada::AccionIncompleta { campo: "ventana_ms" })
    );
    // Una direccion que no es ninguna de las cuatro no se sustituye por `abajo`.
    let mala_direccion = Paso::nuevo(
        2,
        Ancla::boton("Crear"),
        AccionDeclarada::desplazar("hacia_arriba_y_luego_abajo", 300),
    );
    assert_eq!(
        ejecutor.ejecutar(&foto, &mala_direccion, &mut mano).parada().map(|p| p.motivo.clone()),
        Some(MotivoDeParada::AccionInvalida {
            campo: "direccion",
            valor: "hacia_arriba_y_luego_abajo".to_string()
        })
    );
    assert_eq!(mano.cuantos(), 0, "siguen sin entregarse gestos: ninguno se degrado a un toque");

    // Nada se consumio: como no se toco nada, la misma foto sigue valiendo para
    // la accion que SI esta en el catalogo.
    let bueno = tocar(2, "Crear");
    assert!(ejecutor.ejecutar(&foto, &bueno, &mut mano).ejecutado());
    assert_eq!(mano.cuantos(), 1);
    assert!(matches!(mano.ultimo(), Some(Gesto::Tocar { .. })));
}

// ---------------------------------------------------------------------------
// 4 · SIN ANCLA SE PARA Y SE NOMBRA EL PASO
// ---------------------------------------------------------------------------

#[test]
fn sin_ancla_se_para_y_se_nombra_el_paso() {
    let sim = inicio();
    let mut obs = Observador::nuevo();
    let mut ejecutor = Ejecutor::nuevo();
    let mut mano = SuperficieGrabada::nueva();
    let foto = mirar(&mut obs, &sim, M1);

    // El paso 3 pide un ancla que no esta. No se improvisa con "Siguiente".
    let paso3 = tocar(3, "Publicar");
    match ejecutor.ejecutar(&foto, &paso3, &mut mano) {
        Resultado::Parado(parada) => {
            assert_eq!(parada.motivo, MotivoDeParada::AnclaAusente);
            assert_eq!(parada.paso, 3, "la parada NOMBRA el paso");
            assert_eq!(parada.efecto, EfectoEnElMundo::SinEfecto);
            assert!(parada.to_string().contains("paso 3"), "el texto dice cual: {parada}");
            assert_eq!(parada.motivo.familia(), FamiliaDeFallo::Interfaz);
        }
        otro => panic!("sin ancla habia que parar, salio {otro:?}"),
    }
    assert_eq!(mano.cuantos(), 0, "no se toco el boton parecido ni la esquina de la pantalla");

    // Un nodo con la caja vacia no tiene punto que tocar: parar, no tocar (0,0).
    let mut sin_sitio = inicio();
    sin_sitio
        .mutar(Cambio::Mover {
            id: "n-crear".to_string(),
            caja: enki_instagram_bridge::percepcion::simulador::Caja::nueva(0, 0, 0, 0),
        })
        .expect("se puede mover");
    let foto2 = mirar(&mut obs, &sin_sitio, M2);
    assert_eq!(
        ejecutor.ejecutar(&foto2, &tocar(1, "Crear"), &mut mano).parada().map(|p| p.motivo.clone()),
        Some(MotivoDeParada::AnclaSinSitio)
    );

    // Con la pantalla entera: ausente. Con media pantalla: NO SE SABE. Es la
    // misma regla que A1; aqui no hay una segunda mas estricta ni mas laxa.
    let mut parcial = inicio();
    parcial
        .mutar(Cambio::DeclararParcial { motivo: "dialogo del sistema encima".to_string() })
        .expect("se puede declarar parcial");
    let foto3 = mirar(&mut obs, &parcial, M3);
    match ejecutor.ejecutar(&foto3, &paso3, &mut mano) {
        Resultado::Parado(parada) => assert_eq!(
            parada.motivo,
            MotivoDeParada::NoSeSabe(Desconocido::MiradaParcial),
            "una ausencia no se afirma con media pantalla"
        ),
        otro => panic!("con mirada parcial habia que parar, salio {otro:?}"),
    }

    // Y en la operacion compuesta: el informe dice en QUE paso se paro, y A5
    // dicta la vuelta al paso anterior (no hay nada que duplicar).
    let mut publicador = Publicador::nuevo();
    let mut mano2 = SuperficieGrabada::nueva();
    let mut t = M1;
    let mut reloj = move || {
        let ahora = t;
        t += 1_000;
        ahora
    };
    let pasos = [tocar(1, "Crear"), tocar(2, "Siguiente"), tocar(3, "Publicar")];
    let publicacion = Publicacion::nueva("publicar_foto", "taller_a", &pasos);
    let informe = publicador.publicar(&sim, &mut mano2, &ambito(), &mut reloj, &publicacion);

    assert_eq!(informe.desenlace, Desenlace::Parado);
    assert_eq!(informe.paso, Some(3), "el informe nombra el paso");
    assert_eq!(informe.pasos_ejecutados, 2, "los dos primeros si corrieron");
    assert_eq!(informe.gestos, 2);
    assert!(informe.pudo_cambiar_el_mundo(), "parado NO es 'no paso nada'");
    match &informe.motivo {
        Some(MotivoDePublicacion::Paso(parada)) => {
            assert_eq!(parada.paso, 3);
            assert_eq!(parada.motivo, MotivoDeParada::AnclaAusente);
        }
        otro => panic!("el motivo tenia que ser del paso 3, salio {otro:?}"),
    }
    assert_eq!(informe.decisiones.len(), 1, "una decision: la del paso que fallo");
    assert!(informe.decisiones[0].permite_volver(), "hay paso anterior al que volver");
    assert_eq!(mano2.cuantos(), 2, "el paso 3 no entrego gesto");
}

// ---------------------------------------------------------------------------
// 5 · INDETERMINADO NO SE REINTENTA
// ---------------------------------------------------------------------------

#[test]
fn indeterminado_no_se_reintenta() {
    // El aparato no pudo entregar el gesto: no se sabe si llego a ocurrir.
    let sim = inicio();
    let mut obs = Observador::nuevo();
    let mut ejecutor = Ejecutor::nuevo();
    let mut mano = SuperficieGrabada::que_falla("gesto_cancelado");
    let foto = mirar(&mut obs, &sim, M1);

    match ejecutor.ejecutar(&foto, &tocar(2, "Siguiente"), &mut mano) {
        Resultado::Parado(parada) => {
            assert_eq!(parada.motivo, MotivoDeParada::GestoFallo { motivo: "gesto_cancelado".into() });
            assert_eq!(parada.efecto, EfectoEnElMundo::Indeterminado);
            assert!(!parada.no_toco_nada(), "no se sabe si toco: no se puede decir que no");
        }
        otro => panic!("un gesto que no se pudo entregar no se da por ejecutado, salio {otro:?}"),
    }

    // La foto quedo consumida: se intento con ella.
    assert_eq!(ejecutor.ultima_foto().map(|f| f.momento), Some(M1));

    // A5: con `Indeterminado` no hay reintento ni con el techo mas generoso.
    let escalera = Escalera::con_techo(99);
    for familia in [
        FamiliaDeFallo::Plataforma,
        FamiliaDeFallo::Aparato,
        FamiliaDeFallo::Interfaz,
        FamiliaDeFallo::Sesion,
        FamiliaDeFallo::DatoQueFalta,
        FamiliaDeFallo::LimiteAlcanzado,
    ] {
        let hecho = HechoDeFallo::nuevo(2, familia, EfectoEnElMundo::Indeterminado).con_vuelta(true);
        let decision = escalera.decidir(&hecho);
        assert!(
            !decision.permite_reintentar(),
            "{familia}: no se sabe si cambio el mundo y aun asi se reintentaba"
        );
        assert_eq!(decision.motivo(), MotivoDeDecision::NoSeSabeSiCambio);
        assert!(decision.escala());
        // El remedio que viaja nunca puede ser `reintentar`.
        assert_ne!(decision.remedio(), Some(Remedio::Reintentar));
    }
    assert_eq!(
        EfectoEnElMundo::Indeterminado.cambio_el_mundo(),
        None,
        "el triple de A5: `None` es 'no se sabe' y cae del lado de no reintentar"
    );

    // Y en la operacion compuesta: un solo intento, ninguna decision de
    // reintento, y el informe dice que no se sabe si se toco algo.
    let mut publicador = Publicador::nuevo();
    let mut mano2 = SuperficieGrabada::que_falla("gesto_cancelado");
    let mut t = M1;
    let mut reloj = move || {
        let ahora = t;
        t += 1_000;
        ahora
    };
    let pasos = [tocar(1, "Crear")];
    let publicacion = Publicacion::nueva("publicar_foto", "taller_a", &pasos);
    let informe = publicador.publicar(&sim, &mut mano2, &ambito(), &mut reloj, &publicacion);

    assert_eq!(informe.desenlace, Desenlace::Parado);
    assert_eq!(informe.pasos_ejecutados, 0);
    assert_eq!(informe.gestos, 0);
    assert_eq!(informe.decisiones.len(), 1, "una sola decision: no hubo segundo intento");
    assert!(!informe.decisiones[0].permite_reintentar());
    match &informe.motivo {
        Some(MotivoDePublicacion::Paso(parada)) => {
            assert_eq!(parada.efecto, EfectoEnElMundo::Indeterminado)
        }
        otro => panic!("el motivo tenia que traer el gesto fallido, salio {otro:?}"),
    }
}
