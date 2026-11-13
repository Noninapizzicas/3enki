//! instagram-bridge · BLOQUE 19e · EL CANAL SE LEVANTA SOLO (la politica)
//!
//! Cuatro tests puros y uno de contrato, todos en escritorio y **sin red**:
//!
//!   1. `espera_creciente_tope_60s` — la escalera es 1, 2, 4, 8, 16, 30, 60, 60...
//!      Un reintento inmediato contra un broker caido es un bucle que gasta
//!      bateria; una espera de un minuto desde el primer intento deja el canal
//!      muerto por un corte de tres segundos.
//!   2. `parada_deliberada_no_reintenta` — el boton DESCONECTAR significa algo.
//!      Es el fallo que convierte el movil en un aparato que el dueno no puede
//!      apagar.
//!   3. `caida_si_reintenta` — una caida vuelve, con su numero de intento; y sin
//!      credenciales no se reintenta (un reintento sin llave solo produce una
//!      notificacion que miente).
//!   4. `el_estado_dice_reconectando_con_intento` — el estado que se enseña NO es
//!      `conectado` ni `desconectado`: dice `reconectando`, con el intento y los
//!      segundos que faltan.
//!   5. `cada_conexion_nueva_vuelve_a_suscribirse` — reconectar el socket no
//!      basta: el canal nuevo tiene que suscribirse otra vez a `orden/#`.
//!
//! Lo que estos tests NO pueden probar: que el hilo del borde (`jni`, bajo
//! `cfg(target_os = "android")`) llame a esta politica. Eso se comprueba leyendo
//! su FUENTE en el cuarto test, que es lo unico que se puede hacer en un servidor
//! sin NDK — y es suficiente para que renombrar la politica en un lado y no en el
//! otro salga rojo.

use std::path::{Path, PathBuf};

use enki_instagram_bridge::canal::bucle::{servir, Bus, ManoAusente, Opcion, TOPIC_ORDENES};
use enki_instagram_bridge::canal::json::Valor;
use enki_instagram_bridge::canal::mqtt::FalloDeCanal;
use enki_instagram_bridge::canal::reconexion::{
    decidir, espera_s, Decision, Desenlace, Reconexion, Reintento, ESPERAS_S, MOTIVO_PARADA_DELIBERADA,
    MOTIVO_SIN_CREDENCIALES, TEXTO_RECONECTANDO, TOPE_ESPERA_S,
};

// ---------------------------------------------------------------------------
// 1 · La escalera
// ---------------------------------------------------------------------------

#[test]
fn espera_creciente_tope_60s() {
    // La escalera exacta del bloque: 1, 2, 4, 8, 16, 30, 60, 60...
    let escalera: Vec<u64> = (1..=9).map(espera_s).collect();
    assert_eq!(escalera, vec![1, 2, 4, 8, 16, 30, 60, 60, 60]);

    // Y se repite indefinidamente: no hay un "demasiados intentos" que deje el
    // canal muerto hasta que alguien pulse CONECTAR.
    assert_eq!(espera_s(1_000), TOPE_ESPERA_S);
    assert_eq!(espera_s(u64::MAX), TOPE_ESPERA_S);

    // Nunca pasa del tope ni baja: un reintento que espera menos que el anterior
    // es un bucle que se acelera justo contra el broker que acaba de caerse.
    let mut anterior = 0;
    for intento in 1..200u64 {
        let actual = espera_s(intento);
        assert!(actual <= TOPE_ESPERA_S, "el intento {intento} espera {actual} s");
        assert!(actual >= anterior, "el intento {intento} espera menos que el anterior");
        anterior = actual;
    }

    // Y el primer escalon es el de la tabla, no un cero: `intento = 0` es "no hay
    // intento todavia" y tambien espera 1 s.
    assert_eq!(espera_s(0), ESPERAS_S[0]);
}

// ---------------------------------------------------------------------------
// 2 · La parada se respeta
// ---------------------------------------------------------------------------

#[test]
fn parada_deliberada_no_reintenta() {
    // Ni con credenciales, ni en el primer intento, ni con un canal que acaba de
    // nacer: la parada manda sobre todo lo demas.
    for intento in [0u64, 1, 5, 40] {
        for conectado_s in [0u64, 30, 600] {
            assert_eq!(
                decidir(Desenlace::ParadaDeliberada, intento, conectado_s, true),
                Decision::Parar(MOTIVO_PARADA_DELIBERADA),
                "una parada deliberada (intento {intento}, conectado {conectado_s} s) no puede reintentar"
            );
        }
    }

    // Y el motivo viaja con nombre: sin el, la pantalla no puede distinguir "lo
    // pare yo" de "no hay credenciales".
    match decidir(Desenlace::ParadaDeliberada, 0, 0, false) {
        Decision::Parar(motivo) => assert_eq!(motivo, MOTIVO_PARADA_DELIBERADA),
        Decision::Reintentar(r) => panic!("una parada reintento con {r:?}"),
    }
}

// ---------------------------------------------------------------------------
// 3 · La caida vuelve
// ---------------------------------------------------------------------------

#[test]
fn caida_si_reintenta() {
    // Primer corte: intento 1, un segundo. Un corte de red de tres segundos no se
    // nota.
    assert_eq!(
        decidir(Desenlace::Caida, 0, 2, true),
        Decision::Reintentar(Reintento { intento: 1, espera_s: 1 })
    );

    // Racha de caidas cortas: el contador sube y la espera con el.
    let mut intento = 0;
    let mut esperas = Vec::new();
    for _ in 0..8 {
        match decidir(Desenlace::Caida, intento, 0, true) {
            Decision::Reintentar(reintento) => {
                intento = reintento.intento;
                esperas.push(reintento.espera_s);
            }
            Decision::Parar(motivo) => panic!("una caida dejo de reintentar: {motivo}"),
        }
    }
    assert_eq!(esperas, vec![1, 2, 4, 8, 16, 30, 60, 60]);
    assert_eq!(intento, 8);

    // Un canal que aguanto lo suficiente reinicia la racha: el corte de despues de
    // una hora de servicio no es el noveno intento de la misma averia.
    assert_eq!(
        decidir(Desenlace::Caida, 8, 3_600, true),
        Decision::Reintentar(Reintento { intento: 1, espera_s: 1 })
    );

    // Sin credenciales no hay nada que reintentar, y se dice con su nombre.
    assert_eq!(
        decidir(Desenlace::Caida, 0, 0, false),
        Decision::Parar(MOTIVO_SIN_CREDENCIALES)
    );
}

// ---------------------------------------------------------------------------
// 4 · El estado dice la verdad
// ---------------------------------------------------------------------------

fn ruta_de(relativa: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join(relativa)
}

#[test]
fn el_estado_dice_reconectando_con_intento() {
    let en_curso = Reconexion::nueva(3, 4, "el canal se rompio: reset por el par");

    // El valor de `canal` es suyo: ni `conectado` (no hay enlace) ni
    // `desconectado`/`detenido` (hay un hilo trabajando en volver).
    assert_eq!(en_curso.texto(), TEXTO_RECONECTANDO);
    assert_ne!(en_curso.texto(), "conectado");
    assert_ne!(en_curso.texto(), "detenido");
    assert_ne!(en_curso.texto(), "desconectado");
    assert_ne!(en_curso.texto(), "conectando");

    // Los campos, como los recibe Kotlin: `intento` y `proximo_en_s` son numeros
    // porque la notificacion los cuenta.
    let campos = Valor::objeto(en_curso.campos()).a_texto();
    assert!(
        campos.contains("\"intento\":3"),
        "el estado no dice el intento: {campos}"
    );
    assert!(
        campos.contains("\"proximo_en_s\":4"),
        "el estado no dice cuanto falta para el siguiente intento: {campos}"
    );

    // Y el JSON suelto, que es el que se mira en los logs, lleva lo mismo mas el
    // motivo (sin el, la notificacion diria "reconectando" y nadie sabria por que).
    let json = en_curso.a_json();
    for esperado in [
        "\"canal\":\"reconectando\"",
        "\"intento\":3",
        "\"proximo_en_s\":4",
        "\"motivo\":\"el canal se rompio",
    ] {
        assert!(json.contains(esperado), "falta {esperado} en {json}");
    }

    // El texto de una persona no es el del contrato: se lee en una notificacion.
    let frase = en_curso.to_string();
    assert!(frase.contains("reconectando") && frase.contains("intento 3"), "{frase}");

    // ---- el contrato con el borde: se escribe una sola vez ----
    //
    // El borde (`jni`, `cfg(android)`) no se compila aqui, asi que se lee su
    // fuente. Si alguien renombra `TEXTO_RECONECTANDO` en un lado o escribe
    // "reconectando" a mano en el otro, esto salta en vez de dejar la
    // notificacion mintiendo sin error de compilacion en ningun sitio.
    let borde = std::fs::read_to_string(ruta_de("src/jni/mod.rs"))
        .expect("no se pudo leer src/jni/mod.rs");
    assert!(
        borde.contains("Reconectando(Reconexion)"),
        "el borde no tiene el estado `reconectando`: el canal volveria en silencio"
    );
    assert!(
        borde.contains("progreso.texto()"),
        "el borde no toma el texto `reconectando` de `canal::reconexion`: habria dos verdades"
    );
    assert!(
        borde.contains("en_curso.campos()"),
        "el borde no publica `intento`/`proximo_en_s`: la notificacion no podria contarlos"
    );
    assert!(
        borde.contains("reconexion::decidir("),
        "el borde no consulta la politica de reconexion: el canal se quedaria caido"
    );
    // Se mira el CODIGO, no la prosa: los comentarios nombran el estado para
    // explicarlo y nombrarlo no es escribirlo.
    let codigo: String = borde
        .lines()
        .filter(|linea| {
            let t = linea.trim_start();
            !(t.starts_with("//") || t.starts_with("/*") || t.starts_with('*'))
        })
        .collect::<Vec<_>>()
        .join("\n");
    assert!(
        !codigo.contains("\"reconectando\""),
        "el borde escribe el texto `reconectando` a mano: tiene que venir de `canal::reconexion`"
    );
}

// ---------------------------------------------------------------------------
// 5 · Reconectar incluye volver a suscribirse
// ---------------------------------------------------------------------------

/// Un bus que solo cuenta suscripciones y se cierra a la primera.
#[derive(Default)]
struct BusQueSeCierra {
    suscripciones: Vec<String>,
}

impl Bus for BusQueSeCierra {
    fn suscribir(&mut self, filtro: &str) -> Result<(), FalloDeCanal> {
        self.suscripciones.push(filtro.to_string());
        Ok(())
    }

    fn publicar(&mut self, _topic: &str, _payload: &[u8]) -> Result<(), FalloDeCanal> {
        Ok(())
    }

    fn recibir(&mut self) -> Result<Opcion, FalloDeCanal> {
        Ok(Opcion::Cerrado)
    }
}

#[test]
fn cada_conexion_nueva_vuelve_a_suscribirse() {
    // El reintento del borde vuelve a entrar por `servir` justo para esto: una
    // sesion limpia (el CONNECT de este cliente va con `Clean Session`) no
    // conserva la suscripcion, asi que reconectar el socket y no suscribirse deja
    // un canal mudo que parece conectado. Tres vueltas = tres suscripciones.
    let mut bus = BusQueSeCierra::default();
    let mut mano = ManoAusente::nueva();

    for vuelta in 0..3 {
        servir(&mut bus, &mut mano, None)
            .unwrap_or_else(|e| panic!("la vuelta {vuelta} no termino: {e}"));
    }

    assert_eq!(
        bus.suscripciones.len(),
        3,
        "cada conexion tiene que suscribirse: {:?}",
        bus.suscripciones
    );
    assert!(
        bus.suscripciones.iter().all(|filtro| filtro == TOPIC_ORDENES),
        "la suscripcion de un canal nuevo tiene que ser `{TOPIC_ORDENES}`: {:?}",
        bus.suscripciones
    );
}
