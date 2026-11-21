//! `observacion` — el volcado de pantalla del aparato, camino del bus (bloque 19b).
//!
//! # Que resuelve
//!
//! Escribir una receta de `publicar` exige conocer los anclas REALES del movil
//! (`view_id`, textos, cajas, que es tocable). Eso no se puede escribir desde el
//! servidor: hay que verlo. Este modulo lleva el volcado que hace
//! `Volcado.kt` hasta el bus, para poder mirarlo desde fuera del aparato.
//!
//! # La regla de este fichero: es TONTO a proposito
//!
//! El JSON que llega de Kotlin **no se parsea y no se toca**: se mete dentro del
//! sobre del bus byte a byte, tal como vino. Por eso aqui no se llama a
//! `canal::json` para nada.
//!
//! Hay dos motivos, y los dos son de dinero:
//!
//!   1. **Un volcado es diagnostico, no contrato.** Si el borde "arreglara" el
//!      JSON (recortando campos que no conoce, normalizando numeros), el volcado
//!      que llega al servidor no seria lo que el aparato vio, y escribiriamos la
//!      receta sobre una pantalla que no existe. Un puente que transforma miente
//!      sobre el dato justo cuando el dato es la unica prueba.
//!   2. **Parsear cuesta y puede fallar.** 4000 nodos con 18 campos son cientos
//!      de KB; un parser que se atraganta con un texto raro devolveria
//!      `json_invalido` y perderia el volcado entero por un detalle. Aqui se
//!      comprueba la FORMA (que no venga vacio y que empiece y acabe en llaves) y
//!      nada mas: una comprobacion de dos bytes, no un parser.
//!
//! # El sobre
//!
//! ```text
//! topic: core/core-a/events/bridge/observacion
//!
//! {"event_id":"obs-<momento>-<n>","event_type":"bridge.observacion",
//!  "timestamp":<ms>,"source":{"core_id":"external","module":"instagram-bridge",
//!  "version":"0.1.0"},"data":<el volcado, TAL CUAL>}
//! ```
//!
//! `source.core_id` es **`external`** y no `core-a` por un motivo concreto: el
//! aparato NO es un core del bus. Si se presentara como `core-a`, el propio bus
//! descartaria el evento como self-loop (un core no se escucha a si mismo) y el
//! volcado no llegaria nunca. `external` dice la verdad: esto viene de fuera del
//! grafo de cores, es un dispositivo.
//!
//! El `data` va como valor JSON del sobre (no como cadena escapada) para que el
//! volcado se pueda leer sin un `JSON.parse` de segundo nivel.
//!
//! # Por que un buzon y no un PUBLISH directo
//!
//! El canal MQTT vive en UN hilo (`jni::servir_canal`) y su `Canal::publicar`
//! pide `&mut Canal`. La llamada que viene de Kotlin corre en el hilo de la UI de
//! Android, que no puede tocar ese canal sin bloquearse ni abrir un segundo
//! cliente (dos conexiones con la misma llave y el mismo client id hacen que el
//! broker cierre la primera).
//!
//! Asi que el borde EMPUJA un recado en este buzon y el hilo del canal lo vacia
//! en su siguiente vuelta. El precio es un retardo de hasta `PLAZO_LECTURA` (2 s)
//! y se dice aqui en voz alta; lo que se compra es que el hilo de la UI nunca
//! espere a la red.
//!
//! El buzon tiene tope (`TOPE_DE_RECADOS`) a proposito: si el canal esta muerto y
//! alguien pulsa el boton cien veces, es mejor contestar `buzon_lleno` que
//! guardar cien volcados de 4000 nodos en memoria. Un recado no se descarta en
//! silencio jamas.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

/// Donde se publica el volcado. Un solo topic, con slashes: el bus enruta por
/// ellos y un topic con puntos no llega a nadie.
pub const TOPIC_OBSERVACION: &str = "core/core-a/events/bridge/observacion";

/// El tipo de evento del sobre (`event_type`), con la forma que usa el bus.
pub const EVENTO: &str = "bridge.observacion";

/// El `core_id` con el que se presenta el aparato: NO es un core del bus.
pub const CORE_ID: &str = "external";

/// El modulo que firma el evento, dentro del `source` del sobre.
pub const MODULO: &str = "instagram-bridge";

/// Cuantos recados se pueden esperar a que el canal los recoja.
///
/// Ocho es de sobra: el boton se pulsa a mano y el hilo del canal vacia el buzon
/// cada vuelta (2 s como mucho). Si hay ocho esperando, el canal no esta
/// funcionando y lo que hace falta es el motivo, no mas cola.
pub const TOPE_DE_RECADOS: usize = 8;

// ---------------------------------------------------------------------------
// El fallo (con nombre, siempre)
// ---------------------------------------------------------------------------

/// Por que un volcado no salio hacia el bus.
///
/// Cada variante lleva el dato que la explica: `sin_canal` sin decir en que
/// estado esta el canal no se puede arreglar desde el movil.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FalloDeObservacion {
    /// No hay canal abierto: se dice en que estado esta.
    SinCanal { estado: String },
    /// El volcado llego vacio: no hay nada que publicar.
    JsonVacio,
    /// El volcado no tiene forma de objeto JSON (no empieza en `{` o no acaba
    /// en `}`). NO se ha parseado: es una comprobacion de dos bytes.
    NoPareceObjeto { empieza: String },
    /// El texto no es UTF-8 valido (la JVM habla Modified UTF-8).
    NoUtf8(String),
    /// El canal no recoge los recados y el buzon esta lleno.
    BuzonLleno { tope: usize },
}

impl FalloDeObservacion {
    /// Nombre estable y sin tildes, para informes y logs.
    pub fn codigo(&self) -> &'static str {
        match self {
            FalloDeObservacion::SinCanal { .. } => "sin_canal",
            FalloDeObservacion::JsonVacio => "json_vacio",
            FalloDeObservacion::NoPareceObjeto { .. } => "json_no_objeto",
            FalloDeObservacion::NoUtf8(_) => "observacion_no_utf8",
            FalloDeObservacion::BuzonLleno { .. } => "buzon_lleno",
        }
    }

    pub fn descripcion(&self) -> String {
        match self {
            FalloDeObservacion::SinCanal { estado } => format!(
                "el canal esta en '{estado}' y sin canal conectado no hay por donde publicar el volcado"
            ),
            FalloDeObservacion::JsonVacio => {
                "el volcado llego en blanco: no hay pantalla que publicar".to_string()
            }
            FalloDeObservacion::NoPareceObjeto { empieza } => format!(
                "el volcado no es un objeto JSON (empieza por '{empieza}'): no se publica lo que no se puede leer"
            ),
            FalloDeObservacion::NoUtf8(detalle) => {
                format!("el volcado no es utf-8 valido: {detalle}")
            }
            FalloDeObservacion::BuzonLleno { tope } => format!(
                "el buzon de volcados esta lleno ({tope}): el hilo del canal no los esta recogiendo"
            ),
        }
    }
}

impl std::fmt::Display for FalloDeObservacion {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({})", self.codigo(), self.descripcion())
    }
}

// ---------------------------------------------------------------------------
// El sobre
// ---------------------------------------------------------------------------

/// Comillas con el escapado minimo de JSON para los textos que pone ESTE lado
/// (el id, el tipo de evento, el core id, el modulo y la version).
///
/// El `data` no pasa por aqui: viaja tal cual, que es la regla del fichero.
fn comillas(texto: &str) -> String {
    let mut salida = String::with_capacity(texto.len() + 2);
    salida.push('"');
    for c in texto.chars() {
        match c {
            '"' => salida.push_str("\\\""),
            '\\' => salida.push_str("\\\\"),
            '\n' => salida.push_str("\\n"),
            '\r' => salida.push_str("\\r"),
            '\t' => salida.push_str("\\t"),
            c if (c as u32) < 0x20 => salida.push_str(&format!("\\u{:04x}", c as u32)),
            c => salida.push(c),
        }
    }
    salida.push('"');
    salida
}

/// El sobre del bus con el volcado DENTRO, tal cual vino.
///
/// No parsea, no valida y no normaliza `json`: lo concatena como valor de
/// `data`. Es la unica funcion de este modulo que fabrica el mensaje, y es pura
/// (todo entra por argumento) para poder probarla en escritorio.
pub fn envolver(event_id: &str, momento: u64, json: &str) -> String {
    let mut sobre = String::with_capacity(json.len() + 256);
    sobre.push('{');
    sobre.push_str("\"event_id\":");
    sobre.push_str(&comillas(event_id));
    sobre.push_str(",\"event_type\":");
    sobre.push_str(&comillas(EVENTO));
    sobre.push_str(",\"timestamp\":");
    sobre.push_str(&momento.to_string());
    sobre.push_str(",\"source\":{\"core_id\":");
    sobre.push_str(&comillas(CORE_ID));
    sobre.push_str(",\"module\":");
    sobre.push_str(&comillas(MODULO));
    sobre.push_str(",\"version\":");
    sobre.push_str(&comillas(crate::VERSION));
    sobre.push_str("},\"data\":");
    sobre.push_str(json.trim());
    sobre.push('}');
    sobre
}

/// ¿Hay canal para publicar? Solo `conectado` lo es.
///
/// `conectando` NO vale: el CONNACK todavia no ha llegado y un PUBLISH antes del
/// CONNACK lo cierra el broker. El estado se cita en el motivo porque "sin canal"
/// a secas no distingue un cable desenchufado de un canal que esta arrancando.
pub fn comprobar_canal(estado: &str) -> Result<(), FalloDeObservacion> {
    match estado {
        "conectado" => Ok(()),
        otro => Err(FalloDeObservacion::SinCanal { estado: otro.to_string() }),
    }
}

/// El reloj del borde: milisegundos desde la epoca. Si el reloj del aparato esta
/// mal, se devuelve lo que diga (no se corrige: el `momento` es el del aparato).
pub fn ahora_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Un identificador de evento unico sin dependencias: momento + contador del
/// proceso. Dos volcados del mismo milisegundo no colisionan.
fn nuevo_id(momento: u64) -> String {
    static CONTADOR: AtomicU64 = AtomicU64::new(0);
    let n = CONTADOR.fetch_add(1, Ordering::SeqCst);
    format!("obs-{momento}-{n}")
}

// ---------------------------------------------------------------------------
// El buzon (lo que la UI deja y el hilo del canal recoge)
// ---------------------------------------------------------------------------

/// Un volcado esperando a que el hilo del canal lo publique.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Recado {
    pub topic: String,
    pub payload: String,
    pub event_id: String,
    pub momento: u64,
}

/// La cola de recados, con tope. Propia de cada instancia: en el aparato hay una
/// global (`buzon()`), y en los tests cada uno usa la suya.
#[derive(Debug, Default)]
pub struct Buzon {
    pendientes: Mutex<VecDeque<Recado>>,
}

impl Buzon {
    pub fn nuevo() -> Self {
        Self::default()
    }

    /// El cerrojo, sobreviviendo a un envenenamiento (mismo criterio que el
    /// borde: perder la cola por un panic ajeno es peor que leerla).
    fn cerrojo(&self) -> MutexGuard<'_, VecDeque<Recado>> {
        self.pendientes.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Deja un recado. `Err(BuzonLleno)` si ya hay `TOPE_DE_RECADOS`.
    pub fn encolar(&self, recado: Recado) -> Result<usize, FalloDeObservacion> {
        let mut cola = self.cerrojo();
        if cola.len() >= TOPE_DE_RECADOS {
            return Err(FalloDeObservacion::BuzonLleno { tope: TOPE_DE_RECADOS });
        }
        cola.push_back(recado);
        Ok(cola.len())
    }

    /// El recado mas antiguo, si lo hay.
    pub fn sacar(&self) -> Option<Recado> {
        self.cerrojo().pop_front()
    }

    /// Devuelve al FRENTE un recado que no se pudo publicar: se reintenta en la
    /// siguiente vuelta en vez de perderse (y sin adelantar a los que ya
    /// esperaban).
    pub fn devolver(&self, recado: Recado) {
        self.cerrojo().push_front(recado);
    }

    pub fn cuantos(&self) -> usize {
        self.cerrojo().len()
    }

    /// Vacia el buzon (se llama al parar el canal: un recado de un canal muerto
    /// no sirve para el siguiente).
    pub fn vaciar(&self) {
        self.cerrojo().clear();
    }
}

/// El buzon del proceso. Uno solo, como el canal.
static BUZON: OnceLock<Buzon> = OnceLock::new();

pub fn buzon() -> &'static Buzon {
    BUZON.get_or_init(Buzon::nuevo)
}

// ---------------------------------------------------------------------------
// Encolar un volcado (la unica puerta que usa el borde)
// ---------------------------------------------------------------------------

/// Comprueba, envuelve y deja el volcado en el buzon indicado.
///
/// Es la funcion que se prueba en escritorio: estado del canal y momento entran
/// por argumento, asi que el resultado es determinista.
pub fn encolar(
    buzon: &Buzon,
    json: &str,
    estado_canal: &str,
    momento: u64,
) -> Result<Recado, FalloDeObservacion> {
    comprobar_canal(estado_canal)?;

    let limpio = json.trim();
    if limpio.is_empty() {
        return Err(FalloDeObservacion::JsonVacio);
    }
    // Comprobacion de FORMA, no de contenido: dos bytes. Un volcado que no
    // empieza en llave no es un objeto y el bus lo tiraria sin decir por que.
    if !limpio.starts_with('{') || !limpio.ends_with('}') {
        let empieza: String = limpio.chars().take(8).collect();
        return Err(FalloDeObservacion::NoPareceObjeto { empieza });
    }

    let event_id = nuevo_id(momento);
    let recado = Recado {
        topic: TOPIC_OBSERVACION.to_string(),
        payload: envolver(&event_id, momento, limpio),
        event_id,
        momento,
    };
    buzon.encolar(recado.clone())?;
    Ok(recado)
}

/// Lo mismo, con el reloj y el buzon del proceso: lo que llama el borde JNI.
pub fn encolar_para_el_bus(json: &str, estado_canal: &str) -> Result<Recado, FalloDeObservacion> {
    let momento = ahora_ms();
    encolar(buzon(), json, estado_canal, momento)
}
