//! instagram-bridge · bloque 8 · EL PULSO (D1 D3 D4 D5)
//!
//! Esta suite fija las cuatro cosas que permiten operar sin supervision y que,
//! si se aflojan, hacen que el puente muera a medias:
//!
//!   - **`no se` no es `muerto`**: sin mira nueva no se declara caida la sesion
//!     (ni se le pide la contrasena a nadie). El latido caducado tampoco es
//!     muerte: es una duda, y la duda se mira.
//!   - **un esencial ausente es fuera**: sin accesibilidad, sin pantalla, sin
//!     desbloqueo, sin version valida o sin sitio para la evidencia, no se opera.
//!     Un esencial que no contesta deja fuera igual, pero NO es averia.
//!   - **no se aborta a mitad de un paso con consecuencia incierta**: o se
//!     termina (y se comprueba), o se para limpio. Un paso que pudo cambiar el
//!     mundo no se abandona nunca.
//!   - **un aviso no previsto exige persona**, y todo aviso dice QUE HACE FALTA,
//!     nunca "error".
//!
//! Todo con el momento inyectado: estos tests no duermen ni leen el reloj.

use enki_instagram_bridge::mano::arbitro::{
    Aborto, ArbitroDelAparato, Cesion, MotivoDeDenegacion, Quien,
};
use enki_instagram_bridge::mano::ejecutor::EfectoEnElMundo;
use enki_instagram_bridge::percepcion::avisos::{
    leer, Aviso, ClaseDeAviso, LectorDeAvisosPlataforma, Veredicto,
};
use enki_instagram_bridge::percepcion::pulso::{
    DecisionDeSesion, EstadoDeSesion, MuerteDeSesion, PulsoDeSesion, SenalDeVida, SinPulso,
};
use enki_instagram_bridge::percepcion::salud::{
    Indicador, MotivoDeFuera, Salud, SaludDelAparato, Valor,
};

const M1: u64 = 1_800_000_000_000;
const M2: u64 = 1_800_000_030_000;
const M3: u64 = 1_800_000_060_000;

/// Un aparato sano: todos los esenciales en `si`, la bateria y la red tambien.
fn aparato_sano() -> SaludDelAparato {
    let mut salud = SaludDelAparato::nuevo();
    for indicador in Indicador::TODOS {
        salud.leer(indicador, Valor::Si);
    }
    salud
}

// ---------------------------------------------------------------------------
// 1 · D1 · 'no se' NO es 'muerto' antes de operar
// ---------------------------------------------------------------------------

#[test]
fn no_se_se_trata_como_muerto_antes_de_operar() {
    // Arranque en frio: no se ha mirado nada. Ni vivo ni muerto: no se.
    let mut pulso = PulsoDeSesion::nuevo(60_000);
    assert_eq!(
        pulso.estado(M1),
        EstadoDeSesion::NoSe {
            motivo: SinPulso::NoSePregunto
        }
    );
    assert!(!pulso.estado(M1).es_muerta(), "no saber no es estar muerta");
    assert!(!pulso.estado(M1).es_viva());
    assert_eq!(
        pulso.decidir(M1),
        DecisionDeSesion::MirarAntesDeOperar {
            motivo: SinPulso::NoSePregunto
        },
        "sin mirar se mira; no se declara la sesion caida"
    );
    assert!(
        !pulso.decidir(M1).exige_persona(),
        "no saber no manda a nadie a teclear la contrasena"
    );
    assert!(!pulso.puede_operar(M1), "no saber tampoco autoriza a operar");

    // Una lectura que no pudo leer: motivo nombrado, y la decision sigue siendo
    // mirar. El `no se` no se convierte en `pantalla_de_entrada`.
    pulso.anotar(SenalDeVida::NoSe(SinPulso::Ocupado), M1);
    match pulso.decidir(M1) {
        DecisionDeSesion::MirarAntesDeOperar { motivo } => assert_eq!(motivo, SinPulso::Ocupado),
        otro => panic!("con un no-se la decision tenia que ser mirar, salio {otro:?}"),
    }
    assert!(!pulso.estado(M1).es_muerta());

    // Sin red: el aparato esta, la plataforma no contesta. Tampoco es muerte.
    pulso.anotar(SenalDeVida::NoSe(SinPulso::SinRed), M2);
    assert_eq!(
        pulso.estado(M2),
        EstadoDeSesion::NoSe {
            motivo: SinPulso::SinRed
        }
    );

    // Un latido viejo (fuera de vigencia) es una DUDA, no una muerte: el latido
    // caduca, pero nadie ha visto cerrarse la sesion.
    pulso.anotar(SenalDeVida::Latido, M1);
    assert_eq!(
        pulso.estado(M1 + 1_000),
        EstadoDeSesion::Viva { ultimo_latido: M1 }
    );
    assert!(pulso.puede_operar(M1 + 1_000));
    assert_eq!(
        pulso.estado(M1 + 60_001),
        EstadoDeSesion::NoSe {
            motivo: SinPulso::LecturaVieja
        },
        "un latido caducado es no se, nunca muerta"
    );
    assert!(!pulso.puede_operar(M1 + 60_001));
    assert!(!pulso.decidir(M1 + 60_001).exige_persona());
    assert_eq!(
        pulso.ultimo_latido(),
        Some(M1),
        "la historia del latido se conserva (sirve para diagnosticar)"
    );

    // Y una duda posterior manda sobre el latido anterior: si se miro y no se
    // pudo saber, no vale responder con lo de antes.
    pulso.anotar(SenalDeVida::Latido, M2);
    pulso.anotar(SenalDeVida::NoSe(SinPulso::Ocupado), M3);
    assert_eq!(
        pulso.estado(M3),
        EstadoDeSesion::NoSe {
            motivo: SinPulso::Ocupado
        },
        "la ultima lectura es la que contesta"
    );

    // Solo con EVIDENCIA se declara muerta y se pide persona.
    pulso.anotar(SenalDeVida::PantallaDeEntrada, M3);
    assert_eq!(
        pulso.estado(M3),
        EstadoDeSesion::Muerta {
            motivo: MuerteDeSesion::PantallaDeEntrada,
            momento: M3
        }
    );
    match pulso.decidir(M3) {
        DecisionDeSesion::PedirPersona { motivo } => {
            assert_eq!(motivo, MuerteDeSesion::PantallaDeEntrada);
        }
        otro => panic!("con evidencia de muerte se pide persona, salio {otro:?}"),
    }
    assert!(pulso.decidir(M3).que_hace_falta().contains("persona"));

    // La otra evidencia posible: la plataforma exige reautenticar (D5 -> D2).
    pulso.declarar_muerte(MuerteDeSesion::ReautenticacionExigida, M3);
    assert_eq!(
        pulso.estado(M3),
        EstadoDeSesion::Muerta {
            motivo: MuerteDeSesion::ReautenticacionExigida,
            momento: M3
        }
    );
    // Y un no-se posterior NO resucita lo que ya se sabia muerto... pero tampoco
    // lo usa como excusa: la pieza no fabrica muertes ni resurrecciones.
    pulso.anotar(SenalDeVida::NoSe(SinPulso::AparatoAusente), M3);
    assert_eq!(
        pulso.estado(M3),
        EstadoDeSesion::NoSe {
            motivo: SinPulso::AparatoAusente
        }
    );
}

// ---------------------------------------------------------------------------
// 2 · D3 · un indicador ESENCIAL ausente es fuera
// ---------------------------------------------------------------------------

#[test]
fn un_indicador_esencial_ausente_es_fuera() {
    // El caso bueno: todo en si.
    assert_eq!(aparato_sano().salud(), Salud::Sano);
    assert!(aparato_sano().puede_operar());
    assert_eq!(aparato_sano().salud().remedio(), "operar");

    // Cada esencial en `no` deja fuera, y se nombra CUAL. Se prueban los cinco:
    // el orden de la lista no puede esconder ninguno.
    let esenciales = [
        Indicador::ServicioDeAccesibilidad,
        Indicador::PantallaEncendida,
        Indicador::Desbloqueado,
        Indicador::VersionDeApp,
        Indicador::AlmacenamientoLibre,
    ];
    for esencial in esenciales {
        let salud = aparato_sano().con(esencial, Valor::No);
        match salud.salud() {
            Salud::Fuera { motivo } => {
                assert_eq!(
                    motivo,
                    MotivoDeFuera::EsencialAusente { indicador: esencial },
                    "el motivo nombra el indicador que falta"
                );
                assert!(motivo.es_averia(), "{esencial} ausente es una averia");
                assert_eq!(motivo.remedio(), "reparar");
                assert!(motivo.que_hace_falta().len() > 10);
            }
            otro => panic!("sin {esencial} el aparato tenia que estar fuera, salio {otro:?}"),
        }
        assert!(!salud.puede_operar(), "sin {esencial} no se opera");
    }

    // Un esencial NO DECLARADO es ausente: no se supone que este.
    let sin_accesibilidad = SaludDelAparato::nuevo()
        .con(Indicador::PantallaEncendida, Valor::Si)
        .con(Indicador::Desbloqueado, Valor::Si)
        .con(Indicador::VersionDeApp, Valor::Si)
        .con(Indicador::AlmacenamientoLibre, Valor::Si);
    assert_eq!(
        sin_accesibilidad.salud(),
        Salud::Fuera {
            motivo: MotivoDeFuera::EsencialAusente {
                indicador: Indicador::ServicioDeAccesibilidad
            }
        },
        "un esencial que no se declaro no esta: se nombra y se para"
    );
    assert!(!sin_accesibilidad.puede_operar());
    // Y un aparato SIN NINGUNA lectura no es sano: es fuera por el primero.
    assert!(SaludDelAparato::nuevo().salud().es_averia());
    assert!(!SaludDelAparato::nuevo().puede_operar());

    // Un esencial que NO CONTESTA deja fuera igual, pero NO es averia: se vuelve
    // a mirar. La etiqueta dice la verdad; la decision es la misma (no operar).
    let dudoso = aparato_sano().con(Indicador::Desbloqueado, Valor::NoSe);
    match dudoso.salud() {
        Salud::Fuera { motivo } => {
            assert_eq!(
                motivo,
                MotivoDeFuera::EsencialNoSe {
                    indicador: Indicador::Desbloqueado
                }
            );
            assert!(!motivo.es_averia(), "no saber no es una averia");
            assert_eq!(motivo.remedio(), "mirar_otra_vez");
            assert!(!dudoso.puede_operar());
        }
        otro => panic!("un esencial sin dato deja fuera, salio {otro:?}"),
    }
    // La evidencia manda sobre la duda: si ademas hay un ausente, se nombra ese.
    let peor = aparato_sano()
        .con(Indicador::Desbloqueado, Valor::NoSe)
        .con(Indicador::AlmacenamientoLibre, Valor::No);
    assert_eq!(
        peor.salud(),
        Salud::Fuera {
            motivo: MotivoDeFuera::EsencialAusente {
                indicador: Indicador::AlmacenamientoLibre
            }
        }
    );

    // Lo DESEABLE no echa fuera: degrada. Se sigue operando (H3 limita).
    let con_red_caida = aparato_sano()
        .con(Indicador::Red, Valor::No)
        .con(Indicador::Bateria, Valor::NoSe);
    match con_red_caida.salud() {
        Salud::Degradado { faltan, sin_dato } => {
            assert_eq!(faltan, vec![Indicador::Red]);
            assert_eq!(sin_dato, vec![Indicador::Bateria]);
        }
        otro => panic!("sin red y con bateria dudosa el aparato esta degradado, salio {otro:?}"),
    }
    assert!(con_red_caida.puede_operar(), "degradado sigue operando, con limite");
    assert_eq!(con_red_caida.salud().remedio(), "operar_degradado");
    assert!(!con_red_caida.salud().es_averia());

    // Repetir una lectura sustituye: manda la ultima (lo que se acaba de ver).
    let mut reciente = aparato_sano().con(Indicador::PantallaEncendida, Valor::No);
    assert!(!reciente.puede_operar());
    reciente.leer(Indicador::PantallaEncendida, Valor::Si);
    assert_eq!(reciente.salud(), Salud::Sano);
}

// ---------------------------------------------------------------------------
// 3 · D4 · no se aborta a mitad de un paso con consecuencia INCIERTA
// ---------------------------------------------------------------------------

#[test]
fn no_se_aborta_a_mitad_de_un_paso_con_consecuencia_incierta() {
    // El humano tiene el aparato y el puente se lo pide: no se le quita.
    let mut arbitro = ArbitroDelAparato::nuevo();
    assert_eq!(
        arbitro.tomar(Quien::Humano, M1),
        Cesion::Concedido {
            quien: Quien::Humano,
            momento: M1
        }
    );
    match arbitro.tomar(Quien::Puente, M2) {
        Cesion::Denegado { motivo } => assert_eq!(
            motivo,
            MotivoDeDenegacion::LoTieneOtraParte {
                quien: Quien::Humano,
                desde: M1
            }
        ),
        otro => panic!("con el aparato en la mano de una persona no se toma, salio {otro:?}"),
    }

    // El humano lo suelta; el puente lo toma y abre el paso 3.
    assert!(arbitro.soltar(Quien::Humano, M2).concedida());
    assert!(arbitro.tomar(Quien::Puente, M2).concedida());
    let paso = arbitro
        .abrir_paso(Quien::Puente, 3, M2)
        .expect("el dueno abre su paso");
    assert_eq!(paso.efecto, EfectoEnElMundo::SinEfecto);

    // Un paso abierto ya impide soltar y relevar: no se entrega a medias.
    match arbitro.soltar(Quien::Puente, M2) {
        Cesion::Denegado { motivo } => assert_eq!(
            motivo,
            MotivoDeDenegacion::HayPasoEnCurso {
                quien: Quien::Puente,
                numero: 3
            }
        ),
        otro => panic!("no se suelta con un paso abierto, salio {otro:?}"),
    }
    assert!(!arbitro.relevar(Quien::Humano, M3).concedida());

    // El paso entrega el gesto y no se sabe si llego: consecuencia INCIERTA.
    arbitro
        .anotar_efecto(Quien::Puente, 3, EfectoEnElMundo::Indeterminado)
        .expect("el dueno anota el efecto de su paso");

    // LA REGLA DURA: abortar aqui NO se permite. Se termina primero.
    let aborto = arbitro.abortar(Quien::Puente, 3);
    match aborto {
        Aborto::TerminarPrimero { paso } => {
            assert_eq!(paso.numero, 3);
            assert_eq!(paso.efecto, EfectoEnElMundo::Indeterminado);
            assert_eq!(paso.pudo_cambiar_el_mundo(), None, "no se sabe");
        }
        otro => panic!("con consecuencia incierta no se aborta, salio {otro:?}"),
    }
    assert!(!aborto.se_puede_soltar(), "terminar primero no es soltar");
    assert!(
        aborto.que_hace_falta().contains("comprobar"),
        "la salida dice que hay que comprobar la consecuencia"
    );
    // El paso SIGUE abierto y el aparato sigue en las mismas manos.
    assert_eq!(arbitro.paso_en_curso().map(|p| p.numero), Some(3));
    assert_eq!(arbitro.dueno(), Some(Quien::Puente));

    // Tampoco se cuela por la puerta de atras: relevar sigue negado.
    assert!(!arbitro.relevar(Quien::Humano, M3).concedida());
    assert_eq!(arbitro.dueno(), Some(Quien::Puente));

    // Un gesto entregado (efecto POSIBLE) tampoco se abandona.
    arbitro
        .anotar_efecto(Quien::Puente, 3, EfectoEnElMundo::EfectoPosible)
        .expect("se puede anotar el efecto");
    match arbitro.abortar(Quien::Puente, 3) {
        Aborto::TerminarPrimero { paso } => {
            assert_eq!(paso.efecto, EfectoEnElMundo::EfectoPosible);
        }
        otro => panic!("un paso que pudo cambiar el mundo se termina, salio {otro:?}"),
    }

    // Se termina el paso y se comprueba: ahora si se cierra y se suelta.
    let cerrado = arbitro
        .cerrar_paso(Quien::Puente, 3, EfectoEnElMundo::Indeterminado)
        .expect("cerrar el paso que estaba abierto");
    assert_eq!(cerrado.numero, 3);
    assert_eq!(arbitro.paso_en_curso(), None);
    assert_eq!(
        arbitro.abortar(Quien::Puente, 3),
        Aborto::NoHayPaso { aparato_libre: false }
    );
    assert!(arbitro.soltar(Quien::Puente, M3).concedida());
    assert!(arbitro.esta_libre());
    assert_eq!(
        arbitro.relevar(Quien::Humano, M3),
        Cesion::Concedido {
            quien: Quien::Humano,
            momento: M3
        }
    );

    // Y el otro lado de la regla: un paso que NO toco nada SI se para limpio.
    let mut arbitro2 = ArbitroDelAparato::nuevo();
    arbitro2.tomar(Quien::Puente, M1);
    arbitro2.abrir_paso(Quien::Puente, 1, M1).expect("paso 1");
    match arbitro2.abortar(Quien::Puente, 1) {
        Aborto::PararLimpio { paso } => {
            assert_eq!(paso.numero, 1);
            assert_eq!(paso.efecto, EfectoEnElMundo::SinEfecto);
        }
        otro => panic!("sin gesto entregado se para limpio, salio {otro:?}"),
    }
    assert_eq!(arbitro2.paso_en_curso(), None, "parar limpio cierra el paso");
    assert!(arbitro2.soltar(Quien::Puente, M2).concedida());

    // Abrir un paso exige ser el dueno y no tener otro abierto.
    let mut arbitro3 = ArbitroDelAparato::nuevo();
    assert_eq!(
        arbitro3.abrir_paso(Quien::Puente, 1, M1),
        Err(MotivoDeDenegacion::NoEsTuyo {
            quien: Quien::Puente
        })
    );
    arbitro3.tomar(Quien::Puente, M1);
    arbitro3.abrir_paso(Quien::Puente, 1, M1).expect("paso 1");
    assert_eq!(
        arbitro3.abrir_paso(Quien::Puente, 2, M1),
        Err(MotivoDeDenegacion::HayPasoEnCurso {
            quien: Quien::Puente,
            numero: 1
        })
    );
    // Cerrar otro paso se nombra con los dos numeros: no se cierra a ciegas.
    assert_eq!(
        arbitro3.cerrar_paso(Quien::Puente, 2, EfectoEnElMundo::SinEfecto),
        Err(MotivoDeDenegacion::PasoDistinto {
            abierto: 1,
            pedido: 2
        })
    );
    // Un tercero no aborta el paso de otro.
    match arbitro3.abortar(Quien::Humano, 1) {
        Aborto::Ajeno { paso } => assert_eq!(paso.quien, Quien::Puente),
        otro => panic!("el paso ajeno no se toca, salio {otro:?}"),
    }
    assert_eq!(arbitro3.paso_en_curso().map(|p| p.numero), Some(1));
}

// ---------------------------------------------------------------------------
// 4 · D5 · un aviso NO PREVISTO se trata como 'exige persona'
// ---------------------------------------------------------------------------

#[test]
fn aviso_no_previsto_se_trata_como_exige_persona() {
    // Un aviso que no esta en la tabla: exige persona, se dice que no se reconocio
    // y no se adivina el remedio.
    let raro = Aviso::nuevo("aviso_nuevo_de_2027", "Algo nuevo que nadie ha visto");
    let v = leer(&raro);
    assert!(!v.reconocido, "no esta en la tabla cerrada");
    assert_eq!(v.clase, ClaseDeAviso::NoPrevisto);
    assert!(v.exige_persona, "lo no previsto exige persona");
    assert_eq!(v.remedio, enki_instagram_bridge::contrato::fallo::Remedio::PedirPersona);
    assert_eq!(v.codigo, None, "no se le inventa un codigo canonico");
    assert!(!v.que_hace_falta.trim().is_empty());

    // Un texto que no encaja tampoco se adivina, aunque "suene" a limite.
    let suena = Aviso::solo_texto("Demasiada actividad. Vuelve a intentarlo en un rato, o no");
    let v2 = leer(&suena);
    assert!(!v2.reconocido);
    assert_eq!(v2.clase, ClaseDeAviso::NoPrevisto);
    assert!(v2.exige_persona);
    assert_eq!(
        v2.remedio,
        enki_instagram_bridge::contrato::fallo::Remedio::PedirPersona,
        "un aviso no reconocido NO se degrada a esperar"
    );

    // Sin codigo y sin texto no hay nada que leer: no previsto, persona.
    let vacio = Aviso {
        codigo: None,
        texto: "",
    };
    assert!(leer(&vacio).exige_persona);
    assert!(!leer(&vacio).reconocido);

    // Un aviso reconocido que pide persona, tambien.
    let login = leer(&Aviso::nuevo("login_required", "Inicia sesion"));
    assert!(login.reconocido);
    assert!(login.exige_persona);
    assert_eq!(login.codigo, Some("login_required"));

    // Y el limite de la plataforma NO es un error ni pide persona: se espera.
    let limite = leer(&Aviso::solo_texto("Try again later"));
    assert!(limite.reconocido, "el alias normalizado se reconoce exacto");
    assert!(!limite.exige_persona);
    assert_eq!(limite.clase, ClaseDeAviso::Esperar);
    assert_eq!(limite.remedio, enki_instagram_bridge::contrato::fallo::Remedio::Esperar);
    assert_eq!(limite.espera_sugerida_ms, Some(3_600_000));

    // Una pantalla con un aviso no previsto: la pantalla ENTERA exige persona,
    // aunque ademas haya un limite reconocido al lado.
    let lector = LectorDeAvisosPlataforma::nuevo();
    let lectura = lector.leer(&[
        Aviso::solo_texto("try_again_later"),
        Aviso::nuevo("muro_desconocido", "No sabemos que es esto"),
    ]);
    assert_eq!(lectura.cuantos(), 2);
    assert!(lectura.hay_no_previsto);
    assert!(
        lectura.exige_persona,
        "un aviso no previsto manda sobre los reconocidos tranquilos"
    );
    assert!(lectura.que_hace_falta.unwrap().contains("persona"));

    // Sin avisos no se exige nada: una pantalla limpia no es un aviso.
    let limpia = lector.leer(&[]);
    assert!(!limpia.hay_avisos());
    assert!(!limpia.exige_persona);
    assert_eq!(limpia.que_hace_falta, None);
}

// ---------------------------------------------------------------------------
// 5 · D5 · el aviso dice QUE HACE FALTA, no 'error'
// ---------------------------------------------------------------------------

#[test]
fn aviso_dice_que_hace_falta_no_error() {
    // Todos los codigos de la tabla, por su codigo canonico y por un alias.
    let casos: [(&str, &str); 8] = [
        ("login_required", "abrir sesion"),
        ("checkpoint_required", "verificacion de identidad"),
        ("rate_limit", "esperar"),
        ("action_blocked", "revisar la cuenta"),
        ("update_required", "actualizar la app"),
        ("terms_updated", "terminos"),
        ("captcha", "captcha"),
        ("two_factor_required", "codigo de dos factores"),
    ];
    for (codigo, esperado) in casos {
        let v: Veredicto = leer(&Aviso::nuevo(codigo, "aviso de la plataforma"));
        assert!(v.reconocido, "{codigo} tenia que reconocerse");
        assert!(v.dice_que_hace_falta(), "{codigo} tiene que decir que hace falta");
        assert!(
            !v.que_hace_falta.contains("error") && !v.como_linea().contains("error"),
            "{codigo} no puede hablar de 'error': {}",
            v.que_hace_falta
        );
        assert!(
            v.que_hace_falta.contains(esperado),
            "la instruccion de {codigo} tenia que nombrar '{esperado}': {}",
            v.que_hace_falta
        );
        assert_eq!(v.clave, codigo, "la clave normalizada no cambia un codigo simple");
    }

    // El no previsto tambien dice QUE HACE FALTA, y no dice "error".
    let raro = leer(&Aviso::nuevo("aviso_raro", "texto"));
    assert!(!raro.reconocido);
    assert!(raro.dice_que_hace_falta());
    assert!(
        raro.que_hace_falta.contains("persona"),
        "un aviso no previsto pide una persona, no un diagnostico"
    );
    assert!(!raro.como_linea().contains("error"), "{}", raro.como_linea());

    // Todos los reconocidos dicen algo accionable, y ninguno se queda mudo.
    for (codigo, _) in casos {
        let v = leer(&Aviso::nuevo(codigo, "texto"));
        assert!(
            !v.que_hace_falta.trim().is_empty(),
            "{codigo} sin instruccion es un aviso sin leer"
        );
        assert!(
            v.exige_persona || v.espera_sugerida_ms.is_some(),
            "{codigo} exige persona o declara espera: no hay tercera via"
        );
    }

    // Un aviso reconocido conserva su codigo canonico aunque llegue por alias.
    let por_alias = leer(&Aviso::nuevo("sesion_expirada", "Tu sesion ha caducado"));
    assert!(por_alias.reconocido);
    assert_eq!(por_alias.codigo, Some("login_required"));
    assert_eq!(por_alias.clave, "sesion_expirada");

    // Y la lectura de pantalla junta las instrucciones sin inventar una.
    let lectura = LectorDeAvisosPlataforma::nuevo().leer(&[Aviso::nuevo("captcha", "verifica")]);
    assert!(lectura.exige_persona);
    assert!(!lectura.hay_no_previsto);
    let instruccion = lectura.que_hace_falta.expect("la lectura dice que hace falta");
    assert!(instruccion.contains("captcha"));
    assert!(!instruccion.contains("error"));
}
