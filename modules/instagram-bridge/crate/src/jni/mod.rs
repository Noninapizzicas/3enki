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
//! # Los siete simbolos (los nombres los dicta la JVM, no nosotros)
//!
//! ```text
//! Java_online_enki_instagram_PuenteNativo_iniciar (JString, JString) -> jboolean
//! Java_online_enki_instagram_PuenteNativo_detener (JObject)
//! Java_online_enki_instagram_PuenteNativo_estado  () -> JString
//!
//! Java_online_enki_instagram_PuenteNativo_siguientePeticion () -> JString
//! Java_online_enki_instagram_PuenteNativo_entregarRespuesta (jlong, JString) -> jboolean
//! Java_online_enki_instagram_PuenteNativo_arbolVisible     () -> JString
//!
//! Java_online_enki_instagram_PuenteNativo_publicarObservacion (JString) -> jboolean
//! ```
//!
//! Los tres primeros son el canal (bloque 18); los tres siguientes son la MANO
//! (bloque 19a); el ultimo es el VOLCADO (bloque 19b): Kotlin mira la pantalla,
//! la serializa y el borde la manda al bus. Los de la mano no hablan con Kotlin:
//! solo miran la cola de `mano::cola`. Kotlin la sondea cada 150 ms y contesta;
//! si no contesta, la peticion caduca por plazo. **Aqui no hay ni un callback
//! JNI** y esa es la decision de arquitectura, explicada en `mano::cola`.
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
//!   - **No decide el camino.** El bucle tiene enganchada la mano del aparato
//!     (`mano::android::ManoAndroid`), que sabe MIRAR (`FuenteDeArbol`) y
//!     ENTREGAR UN PASO (`Superficie`) por la cola. Lo que no hace es ejecutar
//!     una orden entera: eso es una RECETA, y el encadenado con
//!     `mano::publicar` es el bloque siguiente. Por eso `ManoAndroid` contesta
//!     `sin_receta` a una orden: escribir una receta fija en el borde seria
//!     publicar un camino que nadie diseno.
//!   - **No llama a Kotlin.** Ni `AttachCurrentThread` ni `GlobalRef` ni
//!     callbacks. Kotlin sondea (`siguientePeticion`) y contesta
//!     (`entregarRespuesta`); el hilo del canal espera con plazo. Un callback
//!     que se cruza con una espera es un interbloqueo, y un `GlobalRef` a un
//!     servicio que Android reciclo es un proceso muerto dentro de un
//!     `extern "system"`.
//!   - **No reconecta por su cuenta, pero SI vuelve** (bloque 19e). El hilo del
//!     canal es un bucle: si el canal se cae, consulta la politica de
//!     `canal::reconexion` (espera creciente 1, 2, 4, 8, 16, 30, 60, 60... sin
//!     tope), espera de forma cortable y vuelve a entrar por `bucle::servir`, que
//!     reabre el canal y **se vuelve a suscribir** a `orden/#` en su primera
//!     linea. Nunca hay dos canales a la vez (el anterior se cierra antes de
//!     esperar), asi que el broker no ve dos sesiones con el mismo client id.
//!     La unica cosa que NO hace es reintentar una parada deliberada: la bandera
//!     `parada` la pone `parar()` y solo entonces, no se deduce del estado.
//!   - **No abre un segundo canal.** Si ya hay uno vivo, `iniciar` contesta
//!     `JNI_FALSE` con motivo `ya_hay_canal`: se para primero (`detener`) y
//!     despues se abre, que es lo que ya hace `ServicioEnki`.
//!   - **No parsea el volcado.** `publicarObservacion` recibe el JSON de
//!     `Volcado.kt` y lo deja en el buzon de `canal::observacion` sin tocarlo:
//!     envolver y publicar es todo. Un volcado "arreglado" por el borde seria
//!     una pantalla que el aparato no vio.

use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, TryRecvError};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use jni::objects::{JObject, JString};
use jni::sys::{jboolean, jlong, JNI_FALSE, JNI_TRUE};
use jni::JNIEnv;

use crate::canal::bucle::{self, Bus, Opcion};
use crate::canal::json::Valor;
use crate::canal::mqtt::{self, url_con_llave, Canal, FalloDeCanal};
use crate::canal::observacion::{self, FalloDeObservacion};
use crate::canal::reconexion::{self, Reconexion};
use crate::mano::android::{cola, ManoAndroid};
use crate::mano::cola::TipoDePeticion;
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

/// Lo que el canal puede decir de si mismo. Cinco valores y ninguno mas.
///
/// `Error` lleva **codigo** (el `codigo()` de `FalloDeCanal`, sin tildes) y
/// **detalle** (la frase para una persona): el codigo es lo que viaja como
/// `error:<codigo>` y lo que se puede comparar; el detalle es lo que el dueno lee
/// en la notificacion.
///
/// `Reconectando` (bloque 19e) es el estado que antes no existia y que es la
/// diferencia entre un canal caido y un canal que esta volviendo: lleva el
/// intento, lo que falta para el siguiente y el fallo que lo provoco. NO es
/// `conectado` (no hay enlace) ni `desconectado` (hay un hilo trabajando).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Estado {
    /// No hay hilo de canal, o el dueno lo paro. Es el estado de arranque.
    Desconectado,
    /// Hay hilo y todavia no hay CONNACK (primer intento o reintento).
    Conectando,
    /// CONNACK aceptado y suscripcion concedida.
    Conectado,
    /// Se cayo y se esta esperando para volver: intento N, proximo en X s.
    Reconectando(Reconexion),
    /// El canal no esta y no va a volver solo, con su motivo.
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
            // El texto no se escribe aqui: vive en `canal::reconexion` junto a los
            // campos `intento`/`proximo_en_s`, para que el contrato con la
            // notificacion de Android se escriba una sola vez.
            Estado::Reconectando(progreso) => progreso.texto().to_string(),
            Estado::Error { codigo, .. } => format!("error:{codigo}"),
        }
    }

    /// La frase para una persona, si la hay. `None` cuando no hay nada que contar.
    pub fn motivo(&self) -> Option<&str> {
        match self {
            Estado::Error { detalle, .. } => Some(detalle.as_str()),
            // Mientras se reconecta, el motivo es el fallo que lo provoco: sin el,
            // la notificacion diria "reconectando" y nadie sabria por que.
            Estado::Reconectando(progreso) => Some(progreso.motivo.as_str()),
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

/// Cuanto se duerme de una tirada mientras se espera para reconectar.
///
/// La espera se parte en rebanadas para que una parada no tenga que aguantar los
/// 60 s del ultimo escalon: `detener` espera como mucho `PLAZO_PARADA` (3 s), y
/// un hilo dormido 60 s no llega ni a la primera vuelta.
const REBANADA_DE_ESPERA: Duration = Duration::from_millis(250);

/// Espera `total`, dejando de esperar en cuanto se pida la parada.
///
/// `false` = se pidio parar (o se pidio mientras se dormia). Un `true` significa
/// que la espera se consumio entera y toca intentarlo otra vez.
fn esperar_con_parada(parada: &AtomicBool, total: Duration) -> bool {
    let limite = Instant::now() + total;
    loop {
        if parada.load(Ordering::SeqCst) {
            return false;
        }
        let restante = limite.saturating_duration_since(Instant::now());
        if restante.is_zero() {
            return true;
        }
        std::thread::sleep(restante.min(REBANADA_DE_ESPERA));
    }
}

/// El canal de verdad: conectar, servir ordenes, y **volver solo** si se cae
/// (bloque 19e).
///
/// El bucle es el mismo para el primer intento y para los reintentos, y eso es
/// a proposito: un reintento que abriera el canal por otro camino no se
/// suscribiria igual. `bucle::servir` se suscribe EL MISMO a `TOPIC_ORDENES` en su
/// primera linea, asi que cada vuelta de este `loop` deja un canal nuevo con su
/// suscripcion nueva: reconectar el socket no basta (el broker no recuerda la
/// suscripcion de una sesion limpia), y por eso se vuelve a entrar por `servir`.
///
/// La parada se mira en TRES sitios y todos son necesarios: antes de intentar
/// (no abrir un canal que ya nadie quiere), justo despues de que `servir` salga
/// (una caida y una parada se parecen mucho desde fuera: `servir` devuelve `Ok`
/// cuando la bandera dice `Cerrado`) y durante la espera. La diferencia la marca
/// la bandera `parada`, que solo pone `parar()`: es un hecho, no una deduccion.
fn servir_canal(url: &str, llave: &str, parada: &Arc<AtomicBool>) {
    let destino = url_con_llave(url, llave);
    let mut intento: u64 = 0;

    loop {
        // 1 · una parada pedida antes de conectar no abre nada.
        if parada.load(Ordering::SeqCst) {
            marcar(Estado::Desconectado);
            return;
        }

        marcar(Estado::Conectando);
        let arranque = Instant::now();

        let desenlace = match Canal::conectar(&destino, &cliente_id()) {
            Ok(canal) => {
                // `servir` valida contra el catalogo cerrado, contesta SIEMPRE con
                // el par `{ok, motivo}` y se suscribe el mismo. No se reimplementa
                // aqui: la validacion es la misma que la del CLI de escritorio.
                let mut bus = BusConParada::nuevo(canal, parada.clone());
                // La mano del aparato (bloque 19a). Mira y toca por la cola; si
                // Kotlin no contesta, cada peticion caduca con `mano_sin_respuesta`.
                let mut mano = ManoAndroid::nueva();
                let resultado = bucle::servir(&mut bus, &mut mano, None);
                bus.desconectar();
                resultado
            }
            Err(e) => Err(e),
        };

        // 2 · parada deliberada: ni un reintento mas. El estado final es
        // `desconectado` (no un error): un cierre pedido no es un fallo que el
        // dueno tenga que ver.
        if parada.load(Ordering::SeqCst) {
            marcar(Estado::Desconectado);
            return;
        }

        // Un `Ok` sin parada significa que el bus se cerro por su cuenta (el
        // `Opcion::Cerrado` del bucle): es una caida, y se nombra como tal.
        let fallo = desenlace.err().unwrap_or(FalloDeCanal::Cerrado);
        let conectado_s = arranque.elapsed().as_secs();

        match reconexion::decidir(reconexion::Desenlace::Caida, intento, conectado_s, true) {
            // `Parar` solo puede pasar sin credenciales, y aqui siempre las hay
            // (se comprobaron en `arrancar`). Se atiende igual: un camino que no
            // existe no se escribe como si existiera, pero tampoco se deja sin
            // salida.
            reconexion::Decision::Parar(motivo) => {
                marcar(Estado::Error {
                    codigo: motivo.to_string(),
                    detalle: fallo.descripcion(),
                });
                return;
            }
            reconexion::Decision::Reintentar(reintento) => {
                intento = reintento.intento;
                // El estado dice la VERDAD de lo que esta pasando: hay un hilo
                // vivo, no hay enlace, se esta esperando, y se sabe cuanto.
                marcar(Estado::Reconectando(Reconexion::nueva(
                    reintento.intento,
                    reintento.espera_s,
                    fallo.descripcion(),
                )));
                // 3 · la espera, cortable: el dueno puede cambiar de idea.
                if !esperar_con_parada(parada, Duration::from_secs(reintento.espera_s)) {
                    marcar(Estado::Desconectado);
                    return;
                }
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

    /// Vacia el buzon del volcado: lo que Kotlin dejo esperando se publica aqui,
    /// en el UNICO hilo que puede tocar el canal.
    ///
    /// Se llama antes de cada espera, asi que un volcado sale en la siguiente
    /// vuelta del bucle (2 s como mucho, el plazo de lectura). Si el PUBLISH
    /// falla, el recado se devuelve al frente del buzon y el error sube: un
    /// canal roto que se traga el volcado en silencio dejaria al dueno pulsando
    /// el boton sin saber por que no llega nada.
    fn drenar_volcados(&mut self) -> Result<(), FalloDeCanal> {
        let buzon = observacion::buzon();
        while let Some(recado) = buzon.sacar() {
            if let Err(e) = self.canal.publicar(&recado.topic, recado.payload.as_bytes()) {
                buzon.devolver(recado);
                return Err(e);
            }
        }
        Ok(())
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
        // Antes de esperar: lo que la UI dejo en el buzon sale ahora.
        self.drenar_volcados()?;
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

    // La cola se vacia con el canal: un canal nuevo no puede empezar con
    // recados del anterior (una mirada vieja serviria para decidir ahora).
    cola().vaciar();
    // Y el buzon del volcado, por lo mismo: un volcado de un canal muerto no se
    // publica por el siguiente (llegaria al servidor como foto de ahora).
    observacion::buzon().vaciar();
    if let Ok(mut ultimo) = ultimo_arbol().lock() {
        *ultimo = None;
    }

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
/// `{"canal":"...","motivo":...,"version":"...","mano":"...","cola":{...},"volcado":{...}}`.
///
/// La clave `canal` lleva **exactamente** uno de los cinco valores del contrato
/// (`desconectado`, `conectando`, `conectado`, `reconectando`, `error:<codigo>`).
/// Se devuelve como JSON y no como texto pelado porque los dos consumidores de
/// Kotlin (`PuenteNativo.leerMotivo` y `ServicioEnki.leerCampo`) leen claves: un
/// texto pelado perderia el motivo del fallo justo cuando hace falta.
///
/// `intento` y `proximo_en_s` (bloque 19e) solo aparecen en `reconectando`, y son
/// numeros porque la notificacion los cuenta ("intento 3, proximo en 4 s"), no los
/// busca dentro de una frase.
///
/// `mano` dice QUE mano esta enganchada al bucle (`android` en el movil) y
/// `cola` cuenta lo que la cola tiene entre manos: si `pendientes` crece y no
/// baja, el sondeo de Kotlin (`BucleDeMano`) no esta corriendo, y eso se ve en
/// una notificacion sin abrir un logcat.
///
/// `volcado` es lo que paso con el ultimo volcado de pantalla (bloque 19b):
/// `enviado` o `rechazado`, con el motivo cuando lo hay. Existe porque
/// `publicarObservacion` solo puede contestar un booleano: sin esta clave, un
/// "no" del borde no tendria explicacion en ningun sitio que el dueno pueda leer.
fn leer_estado() -> String {
    let (canal, motivo, progreso) = {
        let guard = cerrojo();
        let canal = guard.estado.como_texto();
        let motivo = match guard.estado.motivo() {
            Some(detalle) => Valor::texto(detalle),
            None => Valor::Nulo,
        };
        // `intento` y `proximo_en_s` solo existen mientras se reconecta: un canal
        // conectado no tiene "intento 3" que enseñar, e inventarlo seria un dato
        // que no significa nada.
        let progreso = match &guard.estado {
            Estado::Reconectando(en_curso) => Some(en_curso.campos()),
            _ => None,
        };
        (canal, motivo, progreso)
    };

    let (pendientes, en_vuelo, huerfanas) = {
        let la_cola = cola();
        (la_cola.pendientes(), la_cola.en_vuelo(), la_cola.huerfanas())
    };

    let mut campos = vec![
        ("canal", Valor::texto(canal)),
        ("motivo", motivo),
        ("version", Valor::texto(VERSION)),
        ("mano", Valor::texto("android")),
        (
            "cola",
            Valor::objeto(vec![
                ("pendientes", Valor::Numero(pendientes as f64)),
                ("en_vuelo", Valor::Numero(en_vuelo as f64)),
                ("huerfanas", Valor::Numero(huerfanas as f64)),
            ]),
        ),
        ("volcado", nota_de_volcado()),
    ];
    if let Some(progreso) = progreso {
        campos.extend(progreso);
    }

    Valor::objeto(campos).a_texto()
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
    // null: Kotlin lo trata como `sin_estado` y la app sigue.
    match env.new_string(texto) {
        Ok(cadena) => cadena,
        Err(_) => JObject::null().into(),
    }
}

// ---------------------------------------------------------------------------
// La mano: la cola que cruza a Kotlin (bloque 19a)
// ---------------------------------------------------------------------------
//
// Tres simbolos y ninguno de ellos bloquea. El borde de la mano es TONTO a
// proposito: mira la cola, deja lo que llega y contesta. Quien decide es
// `mano::android`, quien ejecuta es `BucleDeMano.kt`.
//
// El limite de los 50 ms del hilo de la UI:
//
//   - `siguientePeticion` coge un cerrojo, saca una peticion de una `VecDeque`
//     y compone una cadena corta. Nada de red, nada de disco, nada de esperar.
//   - `entregarRespuesta` coge el mismo cerrojo, guarda una cadena y avisa a una
//     `Condvar`. El aviso despierta al hilo del canal (que esta esperando), no
//     al de la UI.
//   - `arbolVisible` lee un `Option<String>` de un cerrojo.
//
// Ninguno de los tres puede quedarse esperando a otro hilo: el cerrojo de la
// cola se toma para operaciones de memoria. Eso es lo que hace que se puedan
// llamar desde el hilo principal de Android sin ANR.

/// El ultimo arbol que el aparato entrego, tal cual. Lo lee `arbolVisible`.
///
/// Se guarda el JSON CRUDO y no un `Arbol` parseado: el que necesita el arbol
/// proyectado es A1 (`ManoAndroid::observar`, que lo pide por la cola), y este
/// cache solo existe para que Kotlin pueda enseñar lo que el crate recibio sin
/// volver a mirar la pantalla. Parsearlo aqui seria hacer el trabajo dos veces
/// por mirada.
static ULTIMO_ARBOL: OnceLock<Mutex<Option<String>>> = OnceLock::new();

fn ultimo_arbol() -> &'static Mutex<Option<String>> {
    ULTIMO_ARBOL.get_or_init(|| Mutex::new(None))
}

/// `siguientePeticion(): String?`
///
/// La peticion mas antigua, como JSON, o `null` si no hay nada. Kotlin la llama
/// cada 150 ms: `null` es la respuesta normal de un aparato quieto, no un error.
///
/// Entregar la peticion la SACA de la cola (regla 1 de `mano::cola`): si Kotlin
/// se muere despues de recibirla, esa peticion caduca y no se repite.
#[no_mangle]
pub extern "system" fn Java_online_enki_instagram_PuenteNativo_siguientePeticion<'local>(
    env: JNIEnv<'local>,
    _esto: JObject<'local>,
) -> JString<'local> {
    let peticion = catch_unwind(AssertUnwindSafe(|| cola().siguiente())).ok().flatten();

    let texto = match peticion {
        Some(peticion) => peticion.a_json(),
        // Un panic leyendo la cola no puede tumbar la app: se contesta `null`,
        // que es lo mismo que "no hay nada que hacer ahora".
        None => return JObject::null().into(),
    };

    match env.new_string(texto) {
        Ok(cadena) => cadena,
        Err(_) => JObject::null().into(),
    }
}

/// `entregarRespuesta(id: Long, json: String): Boolean`
///
/// `true` si la respuesta era de una peticion en vuelo; `false` si llego tarde
/// (su peticion ya caduco) o si el id no es de nadie. Las dos cosas son
/// normales: una respuesta huerfana se cuenta y se descarta, no se propaga.
///
/// El id va como `jlong` y no como texto porque el viaje de vuelta no necesita
/// interpretar nada: es el numero que la cola dio.
#[no_mangle]
pub extern "system" fn Java_online_enki_instagram_PuenteNativo_entregarRespuesta<'local>(
    mut env: JNIEnv<'local>,
    _esto: JObject<'local>,
    id: jlong,
    json: JString<'local>,
) -> jboolean {
    let intento = catch_unwind(AssertUnwindSafe(|| -> Result<TipoDePeticion, ()> {
        let texto: String = env.get_string(&json).map_err(|_| ())?.into();
        // Un id negativo no existe en la cola (empiezan en 1): el `as u64` lo
        // convierte en un numero enorme que no empareja con nada, y la respuesta
        // se cuenta como huerfana. No hay que rechazarla a mano.
        let contestada = cola().entregar(id as u64, texto.clone());
        match contestada {
            Ok(tipo) => {
                if tipo == TipoDePeticion::Observar {
                    // Lo unico que se cachea: la ultima observacion. Un paso
                    // ejecutado no es un arbol y no pisa el que se enseña.
                    if let Ok(mut ultimo) = ultimo_arbol().lock() {
                        *ultimo = Some(texto);
                    }
                }
                Ok(tipo)
            }
            Err(_huerfana) => Err(()),
        }
    }));

    match intento {
        Ok(Ok(_)) => JNI_TRUE,
        // JSON que no es utf-8, o respuesta huerfana: `false` y la app sigue.
        Ok(Err(())) | Err(_) => JNI_FALSE,
    }
}

/// `arbolVisible(): String?`
///
/// El JSON de la ULTIMA observacion que el aparato entrego (el arbol, o el
/// motivo por el que no pudo mirar), o `null` si todavia no hubo ninguna. Es
/// diagnostico: quien decide mira por la cola, no por aqui.
#[no_mangle]
pub extern "system" fn Java_online_enki_instagram_PuenteNativo_arbolVisible<'local>(
    env: JNIEnv<'local>,
    _esto: JObject<'local>,
) -> JString<'local> {
    let texto = match ultimo_arbol().lock() {
        Ok(guard) => guard.clone(),
        Err(envenenado) => envenenado.into_inner().clone(),
    };

    match texto {
        Some(texto) => match env.new_string(texto) {
            Ok(cadena) => cadena,
            Err(_) => JObject::null().into(),
        },
        None => JObject::null().into(),
    }
}

// ---------------------------------------------------------------------------
// El volcado de pantalla: el puente tonto (bloque 19b)
// ---------------------------------------------------------------------------
//
// Un simbolo y un buzon. Kotlin mira (`Volcado.kt`), serializa el arbol y llama
// aqui con el JSON. El borde NO lo parsea: `canal::observacion` comprueba la
// forma (dos bytes), lo mete en el sobre del bus y lo deja en el buzon para que
// lo publique el hilo del canal.
//
// `JNI_TRUE` significa **encolado**, no "el broker lo tiene": en QoS 0 nadie
// puede afirmar eso, y afirmarlo seria la clase de mentira que el resto del
// crate no se permite. Lo que si se puede afirmar es el motivo del `JNI_FALSE`,
// y por eso se deja escrito en el estado (`volcado`): un booleano no cabe un
// motivo, y "no se pudo" sin motivo no se puede arreglar desde el movil.

/// Lo que el borde sabe de la ultima publicacion de un volcado.
#[derive(Debug, Clone, Default)]
struct NotaDeVolcado {
    /// `enviado` o `rechazado`; `None` mientras nadie haya pulsado el boton.
    resultado: Option<&'static str>,
    motivo: Option<String>,
    momento: u64,
}

static ULTIMO_VOLCADO: OnceLock<Mutex<NotaDeVolcado>> = OnceLock::new();

fn ultimo_volcado() -> &'static Mutex<NotaDeVolcado> {
    ULTIMO_VOLCADO.get_or_init(|| Mutex::new(NotaDeVolcado::default()))
}

fn anotar_volcado(resultado: &'static str, motivo: Option<String>, momento: u64) {
    let mut guard = ultimo_volcado().lock().unwrap_or_else(|e| e.into_inner());
    *guard = NotaDeVolcado { resultado: Some(resultado), motivo, momento };
}

/// La nota como `Valor`, para el JSON de `estado`.
fn nota_de_volcado() -> Valor {
    let nota = {
        let guard = ultimo_volcado().lock().unwrap_or_else(|e| e.into_inner());
        guard.clone()
    };
    Valor::objeto(vec![
        ("resultado", Valor::texto(nota.resultado.unwrap_or("nada"))),
        (
            "motivo",
            match nota.motivo {
                Some(detalle) => Valor::texto(detalle),
                None => Valor::Nulo,
            },
        ),
        ("momento", Valor::Numero(nota.momento as f64)),
    ])
}

/// `publicarObservacion(json): Boolean`
///
/// `true` = el volcado quedo encolado para el hilo del canal. `false` = no se
/// encolo, y el motivo se lee en `estado().volcado.motivo`.
///
/// No bloquea: lee un `JString`, mira el estado con el cerrojo (memoria) y deja
/// un recado en una `VecDeque`. Nada de red, nada de disco.
#[no_mangle]
pub extern "system" fn Java_online_enki_instagram_PuenteNativo_publicarObservacion<'local>(
    mut env: JNIEnv<'local>,
    _esto: JObject<'local>,
    json: JString<'local>,
) -> jboolean {
    let momento = observacion::ahora_ms();

    let intento = catch_unwind(AssertUnwindSafe(
        || -> Result<observacion::Recado, FalloDeObservacion> {
            let texto: String = env
                .get_string(&json)
                .map_err(|e| FalloDeObservacion::NoUtf8(e.to_string()))?
                .into();
            // El estado del canal se lee aqui y no se guarda: entre esta lectura
            // y el PUBLISH del hilo del canal el canal puede caerse, y entonces
            // el recado muere con el (el buzon se vacia al parar).
            let estado = cerrojo().estado.como_texto();
            observacion::encolar_para_el_bus(&texto, &estado)
        },
    ));

    match intento {
        Ok(Ok(recado)) => {
            anotar_volcado("enviado", None, recado.momento);
            JNI_TRUE
        }
        Ok(Err(fallo)) => {
            anotar_volcado("rechazado", Some(fallo.to_string()), momento);
            JNI_FALSE
        }
        Err(_) => {
            // Un panic aqui no puede tumbar la app (regla 3 del borde): se dice
            // en la nota y se contesta que no.
            anotar_volcado(
                "rechazado",
                Some("panic (el borde no tumbo la app)".to_string()),
                momento,
            );
            JNI_FALSE
        }
    }
}
