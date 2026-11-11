#![cfg(target_os = "android")]
//! `jni` — el borde: la UNICA puerta entre Kotlin y el crate (bloque 18).
//!
//! Todo lo que hay aqui esta bajo `cfg(target_os = "android")`, por dos motivos:
//!
//!   1. **El crate sigue compilando y testeandose en escritorio sin NDK.** El
//!      modulo ni se parsea en un `cargo test` de servidor, asi que la caja
//!      `jni` de `Cargo.toml` (que es una seccion `target.'cfg(android)'`) no
//!      entra en el grafo de dependencias de escritorio.
//!   2. **No hay dos codigos.** El borde no reimplementa el canal: llama a
//!      `canal::mqtt` para hablar con el bus y a `canal::bucle` para atender
//!      ordenes. Si el borde tuviera su propio dialogo, habria dos clientes MQTT
//!      en el mismo aparato y el que gana es el que este mas cerca del dedo.
//!
//! # Los tres simbolos (los nombres los dicta la JVM, no nosotros)
//!
//! ```text
//! Java_online_enki_instagram_PuenteNativo_iniciar (JString, JString) -> jboolean
//! Java_online_enki_instagram_PuenteNativo_detener (JObject)
//! Java_online_enki_instagram_PuenteNativo_estado  () -> JString
//! ```
//!
//! El segundo argumento es un `JObject` y no un `JClass`: `PuenteNativo` es un
//! `object` de Kotlin, y un `object` tiene metodos de INSTANCIA (la clase lleva
//! su `INSTANCE`), asi que la JVM pasa la instancia. En la ABI los dos son un
//! `jobject`, pero tiparlo de clase seria mentir en el unico sitio donde el tipo
//! documenta el contrato. `tests/jni_paridad.rs` lee `PuenteNativo.kt` y este
//! fichero, y falla si un nombre se cambia en un lado y no en el otro.
//!
//! # Las cuatro reglas del borde
//!
//! 1. **Nada se bloquea.** `iniciar` arranca un hilo y contesta; NO espera al
//!    CONNACK. Quien llama es el servicio en primer plano de Android, y Android
//!    mata (ANR) a quien bloquea el hilo principal 5 s. El progreso se lee con
//!    `estado`, que es lo que la notificacion refresca cada 3 s.
//! 2. **`conectado` solo despues del CONNACK.** El unico sitio que construye
//!    `Estado::Conectado` es `confirmar_conexion`, y solo se llama detras de
//!    `Canal::suscribir` devolviendo Ok: ese SUBACK no puede existir sin un
//!    CONNACK aceptado (esta en `Canal::conectar`). El test de paridad mira el
//!    FUENTE para que esto no se pueda relajar sin que salte.
//! 3. **Un panic no mata la app.** `panic = "unwind"` esta en el perfil de
//!    release justo para esto: cada borde envuelve su cuerpo en `catch_unwind` y
//!    convierte el panic en `error:panic` o en `JNI_FALSE`. Un puente que se cae
//!    al arrancar no se puede ni diagnosticar desde el movil.
//! 4. **La llave no se guarda ni se loguea.** Se lee del `JString`, se compone
//!    en la URL con `url_con_llave` y vive en la memoria del hilo del canal. No
//!    hay `static` con la llave, ni un `eprintln` de la URL (una URL con `k=`
//!    logueada es la llave en un logcat que cualquiera lee con `adb`).
//!
//! # Lo que este borde NO hace (y por que)
//!
//!   - **No ejecuta nada real.** La mano que se enchufa al bucle es
//!     `ManoAusente`, la misma del CLI: toda orden se contesta con su par de
//!     fallo (`sin_mano`, `simulacion`) y nada sale del aparato. La mano de
//!     verdad (arbol de accesibilidad + gestos) es otro bloque, y el dia que
//!     llegue se cambia en `canal::bucle::atender` — un unico sitio.
//!   - **No reconecta.** Un canal caido se queda caido y el estado lo dice. Dos
//!     canales con la misma llave y el mismo client id hacen que el broker cierre
//!     el primero, y el sintoma es "conecta y se cae" sin motivo.
//!   - **No abre un segundo canal.** Si ya hay uno vivo, `iniciar` contesta
//!     `JNI_FALSE` con motivo `ya_hay_canal`: se para primero (`detener`) y
//!     despues se abre, que es lo que ya hace `ServicioEnki`.

use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, TryRecvError};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::thread::JoinHandle;
use std::time::Duration;

use jni::objects::{JObject, JString};
use jni::sys::{jboolean, JNI_FALSE, JNI_TRUE};
use jni::JNIEnv;

use crate::canal::bucle::{self, Bus, ManoAusente, Opcion};
use crate::canal::json::Valor;
use crate::canal::mqtt::{self, url_con_llave, Canal, FalloDeCanal};
use crate::VERSION;

/// Cuanto se espera a que el hilo del canal termine al parar.
///
/// La lectura del canal tiene un plazo de 2 s (`mqtt::PLAZO_LECTURA`), asi que un
/// hilo sano termina en menos de eso. El plazo existe porque `detener` corre en
/// el hilo del servicio: esperar sin tope a una lectura TLS es un ANR.
pub const PLAZO_PARADA: Duration = Duration::from_secs(3);

/// El nombre con el que el canal se presenta al broker.
///
/// Lleva la version para que dos builds distintos no se pisen en el broker, y
/// `android` para distinguirlo del CLI de escritorio en los logs del bus.
fn cliente_id() -> String {
    format!("enki-puente-{VERSION}-android")
}

// ---------------------------------------------------------------------------
// El estado (lo que Kotlin lee)
// ---------------------------------------------------------------------------

/// Lo que el canal puede decir de si mismo. Cuatro valores y ninguno mas.
///
/// `Error` lleva **codigo** (el `codigo()` de `FalloDeCanal`, sin tildes) y
/// **detalle** (la frase para una persona): el codigo es lo que viaja como
/// `error:<codigo>` y lo que se puede comparar; el detalle es lo que el dueno lee
/// en la notificacion.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Estado {
    /// No hay hilo de canal. Es el estado de arranque y el que queda al parar.
    Desconectado,
    /// Hay hilo y todavia no hay CONNACK.
    Conectando,
    /// CONNACK aceptado y suscripcion concedida.
    Conectado,
    /// El canal no esta, con su motivo.
    Error { codigo: String, detalle: String },
}

impl Estado {
    /// El valor que viaja a Kotlin: `desconectado | conectando | conectado |
    /// error:<codigo>`.
    pub fn como_texto(&self) -> String {
        match self {
            Estado::Desconectado => "desconectado".to_string(),
            Estado::Conectando => "conectando".to_string(),
            Estado::Conectado => "conectado".to_string(),
            Estado::Error { codigo, .. } => format!("error:{codigo}"),
        }
    }

    /// La frase para una persona, si la hay. `None` cuando no hay nada que contar.
    pub fn motivo(&self) -> Option<&str> {
        match self {
            Estado::Error { detalle, .. } => Some(detalle.as_str()),
            _ => None,
        }
    }
}

/// El estado del puente y lo que hace falta para poder pararlo.
///
/// El `Receiver` (`fin`) existe porque `JoinHandle::join` **no tiene plazo**:
/// `detener` espera la senal de fin con `recv_timeout` y solo entonces hace
/// `join`, que ya no bloquea. Es la unica forma de parar con tope usando `std`.
#[derive(Debug, Default)]
struct EstadoPuente {
    estado: Estado,
    parada: Option<Arc<AtomicBool>>,
    hilo: Option<JoinHandle<()>>,
    fin: Option<Receiver<()>>,
}

impl Default for Estado {
    fn default() -> Self {
        Estado::Desconectado
    }
}

impl EstadoPuente {
    /// ¿Hay un canal en marcha?
    ///
    /// Un hilo que ya termino (dejo su senal o cerro el canal) **no** es un canal
    /// en marcha: se recoge y se dice que no. Si esto contestara solo mirando el
    /// `JoinHandle`, un canal muerto por un fallo de red bloquearia el siguiente
    /// `iniciar` con `ya_hay_canal` para siempre.
    fn vivo(&mut self) -> bool {
        let terminado = match self.fin.as_ref() {
            Some(fin) => !matches!(fin.try_recv(), Err(TryRecvError::Empty)),
            None => true,
        };
        if terminado {
            self.recoger();
            return false;
        }
        true
    }

    /// Recoge un hilo que ya termino. El `join` es inmediato porque la senal ya
    /// llego; el estado se deja como lo dejo el hilo (es el motivo del fallo).
    fn recoger(&mut self) {
        if let Some(hilo) = self.hilo.take() {
            let _ = hilo.join();
        }
        self.fin = None;
        self.parada = None;
    }
}

/// El estado del proceso, uno solo. `OnceLock` porque el borde es el unico
/// escritor y no hay que inicializar nada a mano desde `JNI_OnLoad`.
static GLOBAL: OnceLock<Mutex<EstadoPuente>> = OnceLock::new();

fn global() -> &'static Mutex<EstadoPuente> {
    GLOBAL.get_or_init(|| Mutex::new(EstadoPuente::default()))
}

/// El cerrojo del estado, sobreviviendo a un envenenamiento.
///
/// Si un hilo entro en panic mientras lo tenia, `lock()` devuelve `Err` para
/// siempre y el borde se quedaria mudo. Aqui se recupera el dato (`into_inner`)
/// a proposito: el estado es un dato plano y perderlo es peor que leerlo.
fn cerrojo() -> MutexGuard<'static, EstadoPuente> {
    global().lock().unwrap_or_else(|envenenado| envenenado.into_inner())
}

fn marcar(nuevo: Estado) {
    cerrojo().estado = nuevo;
}

fn anotar_fallo(codigo: &str, detalle: &str) -> String {
    marcar(Estado::Error { codigo: codigo.to_string(), detalle: detalle.to_string() });
    codigo.to_string()
}

// ---------------------------------------------------------------------------
// El hilo del canal
// ---------------------------------------------------------------------------

/// Arranca el canal en un hilo y le pasa la mano del bucle.
///
/// El cuerpo va dentro de `catch_unwind`: un panic aqui dentro dejaria el estado
/// en `conectando` para siempre, que es peor que un fallo con nombre.
fn hilo_canal(url: String, llave: String, parada: Arc<AtomicBool>) {
    let resultado = catch_unwind(AssertUnwindSafe(|| servir_canal(&url, &llave, &parada)));
    if resultado.is_err() {
        marcar(Estado::Error {
            codigo: "panic".to_string(),
            detalle: "el hilo del canal entro en panic (el crate se recupera, la app sigue viva)"
                .to_string(),
        });
    }
}

/// El canal de verdad: conectar, servir ordenes hasta que se pida parar, cerrar.
fn servir_canal(url: &str, llave: &str, parada: &Arc<AtomicBool>) {
    let destino = url_con_llave(url, llave);

    let canal = match Canal::conectar(&destino, &cliente_id()) {
        Ok(canal) => canal,
        Err(e) => {
            marcar(Estado::Error { codigo: e.codigo().to_string(), detalle: e.descripcion() });
            return;
        }
    };

    // `servir` se suscribe el mismo (a `bucle::TOPIC_ORDENES`), valida contra el
    // catalogo cerrado y contesta SIEMPRE con el par `{ok, motivo}`. No se
    // reimplementa aqui: la validacion y el par de fallo son los mismos que usa
    // el CLI de escritorio, y por eso valen igual en el movil.
    let mut bus = BusConParada::nuevo(canal, parada.clone());
    let mut mano = ManoAusente::nueva();
    let desenlace = bucle::servir(&mut bus, &mut mano, None);
    bus.desconectar();

    match desenlace {
        Ok(_resumen) => marcar(Estado::Desconectado),
        Err(e) => {
            // Si la parada la pedimos nosotros, el estado final es
            // `desconectado`: un error de transporte al cerrar no es un fallo
            // que el dueno tenga que ver.
            if parada.load(Ordering::SeqCst) {
                marcar(Estado::Desconectado);
            } else {
                marcar(Estado::Error { codigo: e.codigo().to_string(), detalle: e.descripcion() });
            }
        }
    }
}

/// El canal con una bandera de parada encima.
///
/// Es la pieza que permite parar el bucle SIN reimplementarlo: `bucle::servir`
/// solo termina cuando el bus dice `Cerrado`, y aqui esa respuesta la da la
/// bandera. El resto de los verbos se delegan tal cual.
struct BusConParada {
    canal: Canal,
    parada: Arc<AtomicBool>,
}

impl BusConParada {
    fn nuevo(canal: Canal, parada: Arc<AtomicBool>) -> Self {
        Self { canal, parada }
    }

    fn desconectar(&mut self) {
        self.canal.desconectar();
    }
}

impl Bus for BusConParada {
    fn suscribir(&mut self, filtro: &str) -> Result<(), FalloDeCanal> {
        self.canal.suscribir(filtro, 0)?;
        confirmar_conexion(&self.parada);
        Ok(())
    }

    fn publicar(&mut self, topic: &str, payload: &[u8]) -> Result<(), FalloDeCanal> {
        self.canal.publicar(topic, payload)
    }

    fn recibir(&mut self) -> Result<Opcion, FalloDeCanal> {
        if self.parada.load(Ordering::SeqCst) {
            return Ok(Opcion::Cerrado);
        }
        self.canal.recibir()
    }
}

/// El UNICO sitio del borde que construye `Estado::Conectado`.
///
/// Se llama desde `BusConParada::suscribir`, en la linea siguiente al `?` de
/// `Canal::suscribir`, asi que el SUBACK ya llego; y el SUBACK no puede llegar
/// sin el CONNACK aceptado, que se comprueba dentro de `Canal::conectar`. Si nos
/// estan parando, no se anuncia un canal que ya se esta cerrando.
fn confirmar_conexion(parada: &AtomicBool) {
    if parada.load(Ordering::SeqCst) {
        return;
    }
    marcar(Estado::Conectado);
}

// ---------------------------------------------------------------------------
// Arrancar y parar (sin tipos JNI, para que el borde sea fino)
// ---------------------------------------------------------------------------

/// Arranca el hilo del canal. `Err(codigo)` significa que NO hay canal.
fn arrancar(url: &str, llave: &str) -> Result<(), String> {
    // Las tres comprobaciones de entrada se hacen ANTES de crear el hilo: si la
    // url no vale, se dice en la llamada y no dentro de un hilo que la UI no ve.
    if url.trim().is_empty() {
        return Err(anotar_fallo(
            "url_vacia",
            "Kotlin paso una url vacia: sin url no hay bus al que conectarse",
        ));
    }
    if llave.trim().is_empty() {
        return Err(anotar_fallo(
            "llave_vacia",
            "Kotlin paso una llave vacia: el bus no abre un canal sin llave",
        ));
    }
    if let Err(e) = mqtt::partir_url(url) {
        return Err(anotar_fallo(e.codigo(), &e.descripcion()));
    }

    // El estado se pone en `conectando` con el cerrojo tomado y ANTES de crear el
    // hilo: si el hilo ganara la carrera, `iniciar` podria devolver `true` con el
    // estado todavia en `desconectado`.
    let mut guard = cerrojo();
    if guard.vivo() {
        // No se toca el estado: el canal vivo es el que manda, y decir `error`
        // aqui borraria el motivo de un canal que funciona.
        return Err("ya_hay_canal".to_string());
    }

    guard.estado = Estado::Conectando;

    let parada = Arc::new(AtomicBool::new(false));
    let (emisor, receptor) = mpsc::channel::<()>();

    let url = url.to_string();
    let llave = llave.to_string();
    let bandera = parada.clone();
    let hilo = std::thread::Builder::new().name("enki-canal".to_string()).spawn(move || {
        hilo_canal(url, llave, bandera);
        // La senal va al final, pase lo que pase dentro del hilo: es lo que
        // convierte un `join` sin plazo en un `join` con plazo.
        let _ = emisor.send(());
    });

    match hilo {
        Ok(hilo) => {
            guard.parada = Some(parada);
            guard.hilo = Some(hilo);
            guard.fin = Some(receptor);
            Ok(())
        }
        Err(e) => {
            // Sin hilo no hay canal: se dice, en vez de dejar `conectando` para
            // siempre (la UI esperaria a un CONNACK que nadie va a pedir).
            guard.estado = Estado::Error {
                codigo: "hilo_no_creado".to_string(),
                detalle: format!("el sistema no dejo crear el hilo del canal: {e}"),
            };
            Err("hilo_no_creado".to_string())
        }
    }
}

/// Para el canal y deja el estado en `desconectado`. Idempotente.
fn parar() {
    let (parada, hilo, fin) = {
        let mut guard = cerrojo();
        guard.estado = Estado::Desconectado;
        (guard.parada.take(), guard.hilo.take(), guard.fin.take())
    };

    if let Some(bandera) = parada {
        bandera.store(true, Ordering::SeqCst);
    }

    if let (Some(hilo), Some(fin)) = (hilo, fin) {
        // `join` no tiene plazo: primero la senal, despues el join (que ya no
        // bloquea). Si la senal no llega en `PLAZO_PARADA`, el hilo se queda
        // terminando solo — el hilo de la UI no puede esperar a una lectura TLS.
        if fin.recv_timeout(PLAZO_PARADA).is_ok() {
            let _ = hilo.join();
        }
    }
    // Sin `fin` no hay forma de esperar con tope: el handle se suelta (el hilo,
    // si existiera, termina solo). Es el caso de un hilo que ya se recogio.
}

/// El estado como JSON con la forma que ya lee `ServicioEnki.kt`:
/// `{"canal":"...","motivo":...,"version":"..."}`.
///
/// La clave `canal` lleva **exactamente** uno de los cuatro valores del contrato
/// (`desconectado`, `conectando`, `conectado`, `error:<codigo>`). Se devuelve
/// como JSON y no como texto pelado porque los dos consumidores de Kotlin
/// (`PuenteNativo.leerMotivo` y `ServicioEnki.leerCampo`) leen claves: un texto
/// pelado perderia el motivo del fallo justo cuando hace falta.
fn leer_estado() -> String {
    let guard = cerrojo();
    let canal = guard.estado.como_texto();
    let motivo = match guard.estado.motivo() {
        Some(detalle) => Valor::texto(detalle),
        None => Valor::Nulo,
    };
    Valor::objeto(vec![
        ("canal", Valor::texto(canal)),
        ("motivo", motivo),
        ("version", Valor::texto(VERSION)),
    ])
    .a_texto()
}

// ---------------------------------------------------------------------------
// El borde: los tres simbolos que la JVM busca
// ---------------------------------------------------------------------------

/// `iniciar(url, llave): Boolean`.
///
/// `JNI_TRUE` solo si el hilo se creo y el estado quedo en `conectando` (o mas
/// alla). **No espera al CONNACK**: eso lo dice `estado`.
#[no_mangle]
pub extern "system" fn Java_online_enki_instagram_PuenteNativo_iniciar<'local>(
    mut env: JNIEnv<'local>,
    _esto: JObject<'local>,
    url: JString<'local>,
    llave: JString<'local>,
) -> jboolean {
    let intento = catch_unwind(AssertUnwindSafe(|| -> Result<(), String> {
        // `get_string` falla si el texto no es UTF-8 valido (la JVM habla
        // Modified UTF-8 y un surrogate suelto no se puede representar). No se
        // arregla con `lossy`: una url con basura dentro es una url que no vale.
        let url = env
            .get_string(&url)
            .map_err(|e| anotar_fallo("url_no_utf8", &format!("la url no es utf-8 valido: {e}")))?;
        let url: String = url.into();
        let llave = env.get_string(&llave).map_err(|e| {
            anotar_fallo("llave_no_utf8", &format!("la llave no es utf-8 valido: {e}"))
        })?;
        let llave: String = llave.into();
        arrancar(&url, &llave)
    }));

    match intento {
        Ok(Ok(())) => JNI_TRUE,
        Ok(Err(_codigo)) => JNI_FALSE,
        Err(_) => {
            // Un panic antes de `arrancar` (o dentro de el, si algo no previsto
            // revienta): la app sigue viva y el motivo se puede leer.
            marcar(Estado::Error {
                codigo: "panic".to_string(),
                detalle: "el borde jni entro en panic arrancando el canal".to_string(),
            });
            JNI_FALSE
        }
    }
}

/// `detener()`. Idempotente y sin valor de vuelta: nunca puede tumbar la app.
#[no_mangle]
pub extern "system" fn Java_online_enki_instagram_PuenteNativo_detener<'local>(
    _env: JNIEnv<'local>,
    _esto: JObject<'local>,
) {
    let _ = catch_unwind(AssertUnwindSafe(parar));
}

/// `estado(): String`. Siempre contesta algo legible: si el borde entra en
/// panic, el JSON lo dice en vez de lanzar una excepcion desde el hilo de la UI.
#[no_mangle]
pub extern "system" fn Java_online_enki_instagram_PuenteNativo_estado<'local>(
    env: JNIEnv<'local>,
    _esto: JObject<'local>,
) -> JString<'local> {
    let texto = catch_unwind(AssertUnwindSafe(leer_estado)).unwrap_or_else(|_| {
        Valor::objeto(vec![
            ("canal", Valor::texto("error:panic")),
            (
                "motivo",
                Valor::texto("el borde jni entro en panic leyendo el estado"),
            ),
            ("version", Valor::texto(VERSION)),
        ])
        .a_texto()
    });

    // Si ni el `JString` se puede crear (memoria de la JVM agotada), se devuelve
    // null: Kotlin lo trata como `sin_estado` y la app sigue. Es el unico `null`
    // que este borde produce.
    match env.new_string(texto) {
        Ok(cadena) => cadena,
        Err(_) => JObject::null().into(),
    }
}
