//! `cola` — el unico camino por el que el crate mueve la mano Android.
//!
//! # El problema que resuelve
//!
//! El arbol de accesibilidad y los gestos viven en Kotlin (`Accesibilidad.kt`,
//! `Gestos.kt`). El bucle que decide cuando mirar y cuando tocar vive en Rust.
//! Hay que cruzar esa frontera dos veces por paso (pedir una mirada, pedir un
//! gesto) sin que el aparato se quede colgado cuando una de las dos partes se
//! muere.
//!
//! # Por que una COLA y no un callback JNI
//!
//! La tentacion es que Rust llame a Kotlin por JNI: buscar la clase, coger un
//! `GlobalRef`, `AttachCurrentThread` para el hilo del bucle, llamar al metodo y
//! `DetachCurrentThread`. Funciona en una demo y se rompe en produccion:
//!
//!   - **El hilo.** El bucle del canal es un hilo de Rust que la JVM no conoce.
//!     Cada llamada necesita attach/detach, y un attach que se olvida deja un
//!     hilo colgado de la JVM para siempre; un detach con trabajo pendiente mata
//!     el proceso.
//!   - **Las referencias.** Un `GlobalRef` de la Activity o del servicio
//!     sobrevive a la Activity: el dia que Android la recicla, la siguiente
//!     llamada revienta dentro de un `extern "system"`, donde no hay `catch` de
//!     Kotlin que lo pare.
//!   - **El repliegue.** Un callback bloquea los dos lados a la vez: si Kotlin
//!     espera algo de Rust mientras Rust espera el callback, no hay dios que lo
//!     deshaga. Con una cola, el peor caso es un plazo agotado.
//!
//! Con una cola, en cambio:
//!
//! ```text
//! Rust (hilo del bucle)                    Kotlin (coroutine cada 150 ms)
//! ----------------------                    -----------------------------
//! encolar(Peticion)  -------------------->  siguiente(): peticion o nada
//! esperar_respuesta(id, plazo)              ejecuta (Accesibilidad / Gestos)
//!                     <-------------------  entregar(id, json)
//! ```
//!
//!   - **Cero JNI callback.** El borde solo expone tres funciones que no
//!     bloquean (`siguientePeticion`, `entregarRespuesta`, `arbolVisible`).
//!   - **Se prueba en escritorio.** Esta pieza es `std` puro: `tests/cola_mano.rs`
//!     la ejercita con hilos de verdad, sin Android y sin movil.
//!   - **Si Kotlin muere, no se cuelga.** La peticion caduca con
//!     `mano_sin_respuesta`, que es un fallo nombrado y no un bloqueo eterno.
//!
//! # Las tres reglas de la cola
//!
//! 1. **Una peticion se entrega UNA vez.** `siguiente()` la SACA de la cola y la
//!    apunta en vuelo. Si se pudiera leer dos veces, un toque se ejecutaria dos
//!    veces, y un toque repetido en Instagram es un post duplicado.
//! 2. **Una respuesta de un id que nadie espera NO rompe nada.** Se cuenta como
//!    huerfana y se descarta: puede ser la respuesta de una peticion que ya
//!    caduco, y tirar el proceso por eso seria cambiar un dato viejo por una app
//!    caida.
//! 3. **Nada crece sin tope.** Lo que se fue en vuelo y nunca se contesto, y las
//!    respuestas que nadie recogio, se podan. Un aparato que vive dias no puede
//!    tener una lista que solo crece.

use std::collections::VecDeque;
use std::fmt;
use std::sync::{Condvar, Mutex, MutexGuard};
use std::time::{Duration, Instant};

/// Cuanto se espera una respuesta antes de darse por perdida.
///
/// Diez segundos son MUCHOS para un toque (Kotlin tarda milisegundos) y pocos
/// para un `esperar` de receta, que suma su propio tiempo (ver `mano::android`).
/// El plazo no es un rendimiento: es lo que impide que un Kotlin muerto deje el
/// bucle del canal clavado para siempre.
pub const PLAZO_DE_RESPUESTA: Duration = Duration::from_secs(10);

/// El motivo con el que se nombra un plazo agotado. Sin tildes: viaja en
/// informes y en logs.
pub const MOTIVO_SIN_RESPUESTA: &str = "mano_sin_respuesta";

/// El motivo con el que se nombra una respuesta que nadie esperaba.
pub const MOTIVO_RESPUESTA_HUERFANA: &str = "respuesta_huerfana";

/// Tope de peticiones en vuelo que se recuerdan.
///
/// Kotlin atiende de una en una (`BucleDeMano` es secuencial), asi que lo normal
/// es 0 o 1. El tope esta para el caso raro (una peticion caducada por cada
/// arranque del servicio) y para que la memoria no dependa del uptime.
pub const MAXIMO_EN_VUELO: usize = 16;

/// Tope de respuestas guardadas sin recoger. Mismo razonamiento.
pub const MAXIMO_DE_RESPUESTAS: usize = 64;

// ---------------------------------------------------------------------------
// El vocabulario de la cola
// ---------------------------------------------------------------------------

/// Que se le pide a la mano. Dos y ninguno mas: mirar la pantalla y tocar.
///
/// No hay un tipo por gesto (`tocar`, `escribir`, `desplazar`, `esperar`) porque
/// el aparato recibe el paso ya serializado y decide alli: un tipo por gesto
/// obligaria a recompilar el crate para anadir un gesto que Kotlin ya sabe
/// hacer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TipoDePeticion {
    /// Leer el arbol de accesibilidad AHORA y devolverlo como JSON.
    Observar,
    /// Entregar UN paso al aparato (tocar / escribir / desplazar / esperar).
    Ejecutar,
}

impl TipoDePeticion {
    /// El nombre que viaja a Kotlin. Estable y sin tildes.
    pub fn como_str(&self) -> &'static str {
        match self {
            TipoDePeticion::Observar => "observar",
            TipoDePeticion::Ejecutar => "ejecutar",
        }
    }

    /// De vuelta desde el nombre. Lo que no se reconoce es `None`: no se
    /// adivina (una peticion de un tipo que no existe no se ejecuta).
    pub fn desde_str(v: &str) -> Option<Self> {
        match v.trim().to_ascii_lowercase().as_str() {
            "observar" => Some(TipoDePeticion::Observar),
            "ejecutar" => Some(TipoDePeticion::Ejecutar),
            _ => None,
        }
    }
}

impl fmt::Display for TipoDePeticion {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.como_str())
    }
}

/// Lo que el crate pide. `id` es lo que empareja la respuesta con la peticion.
///
/// `datos` es el paso YA serializado en JSON (un objeto) cuando la peticion es
/// `Ejecutar`; vacio cuando es `Observar`. Se guarda como texto y no como tipo
/// porque la cola no tiene por que saber que es un gesto: su oficio es llevar
/// recados, no entenderlos.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Peticion {
    pub id: u64,
    pub tipo: TipoDePeticion,
    pub datos: String,
}

impl Peticion {
    pub fn observar(id: u64) -> Self {
        Self { id, tipo: TipoDePeticion::Observar, datos: String::new() }
    }

    pub fn ejecutar(id: u64, paso_json: impl Into<String>) -> Self {
        Self { id, tipo: TipoDePeticion::Ejecutar, datos: paso_json.into() }
    }

    /// El JSON que Kotlin lee: `{"id":7,"tipo":"observar"}` o
    /// `{"id":8,"tipo":"ejecutar","paso":{...}}`.
    ///
    /// Se compone a mano y no con `Valor` porque `datos` ya es JSON: meterlo en
    /// un `Valor::Texto` lo escaparia y el aparato recibiria una cadena en vez
    /// de un objeto.
    pub fn a_json(&self) -> String {
        let datos = self.datos.trim();
        if datos.is_empty() {
            format!("{{\"id\":{},\"tipo\":\"{}\"}}", self.id, self.tipo.como_str())
        } else {
            format!(
                "{{\"id\":{},\"tipo\":\"{}\",\"paso\":{}}}",
                self.id,
                self.tipo.como_str(),
                datos
            )
        }
    }
}

/// Lo que el aparato contesta. `json` es opaco para la cola: lo interpreta quien
/// pidio (el arbol para `Observar`, `{ok, motivo}` para `Ejecutar`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Respuesta {
    pub id: u64,
    pub json: String,
}

/// Se acabo el plazo sin respuesta. Lleva el id y el plazo: un "timeout" a secas
/// no se puede diagnosticar desde el movil.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EsperaAgotada {
    pub id: u64,
    pub plazo: Duration,
}

impl EsperaAgotada {
    /// El nombre estable del fallo: `mano_sin_respuesta`.
    pub fn codigo(&self) -> &'static str {
        MOTIVO_SIN_RESPUESTA
    }

    pub fn descripcion(&self) -> String {
        format!(
            "la mano Android no contesto a la peticion {} en {} ms: el arbol y los gestos viven en Kotlin y ese lado no respondio",
            self.id,
            self.plazo.as_millis()
        )
    }
}

impl fmt::Display for EsperaAgotada {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.codigo(), self.descripcion())
    }
}

// ---------------------------------------------------------------------------
// La cola
// ---------------------------------------------------------------------------

/// Lo que hay dentro del cerrojo.
#[derive(Debug, Default)]
struct Interior {
    /// El id que se le dara a la proxima peticion. Empieza en 1 y no en 0: un
    /// `0` se confunde con "sin id" en cualquier lenguaje.
    siguiente_id: u64,
    /// Peticiones encoladas y todavia no entregadas a Kotlin.
    pendientes: VecDeque<Peticion>,
    /// Entregadas y sin respuesta: `(id, tipo, instante de entrega)`.
    en_vuelo: VecDeque<(u64, TipoDePeticion, Instant)>,
    /// Respuestas que llegaron antes de que su peticion las esperara.
    respuestas: VecDeque<Respuesta>,
    /// Respuestas de ids que nadie esperaba. Se cuentan, no se guardan.
    huerfanas: u64,
}

impl Interior {
    fn podar(&mut self, ahora: Instant) {
        // Una peticion en vuelo cuyo plazo ya paso no se va a contestar nunca
        // (o su respuesta llegara tarde, y entonces sera huerfana).
        self.en_vuelo.retain(|(_, _, entregada)| ahora.duration_since(*entregada) < PLAZO_DE_RESPUESTA);
        while self.en_vuelo.len() > MAXIMO_EN_VUELO {
            self.en_vuelo.pop_front();
        }
        while self.respuestas.len() > MAXIMO_DE_RESPUESTAS {
            self.respuestas.pop_front();
        }
    }

    fn quitar_respuesta(&mut self, id: u64) -> Option<Respuesta> {
        let pos = self.respuestas.iter().position(|r| r.id == id)?;
        self.respuestas.remove(pos)
    }

    fn quitar_en_vuelo(&mut self, id: u64) -> Option<TipoDePeticion> {
        let pos = self.en_vuelo.iter().position(|(i, _, _)| *i == id)?;
        self.en_vuelo.remove(pos).map(|(_, tipo, _)| tipo)
    }
}

/// La cola de peticiones de la mano. `Send + Sync` y sin estado global: la
/// instancia la pone quien la usa (`mano::android` la guarda en un `OnceLock`).
///
/// Todos los metodos toman `&self`: el estado va dentro del cerrojo, asi que una
/// `&ColaDeMano` se puede compartir entre el hilo del bucle, el borde JNI y los
/// tests sin `Arc<Mutex<...>>` por fuera.
#[derive(Debug, Default)]
pub struct ColaDeMano {
    interior: Mutex<Interior>,
    /// Se avisa al entregar una respuesta. Es lo que despierta a
    /// `esperar_respuesta` sin sondear: un `sleep` de 50 ms en el hilo del canal
    /// es latencia regalada en cada paso.
    aviso: Condvar,
}

impl ColaDeMano {
    pub fn nueva() -> Self {
        Self::default()
    }

    /// El cerrojo, sobreviviendo a un envenenamiento: si un hilo entro en panic
    /// con el cerrojo tomado, perder la cola entera es peor que leerla.
    fn cerrojo(&self) -> MutexGuard<'_, Interior> {
        self.interior.lock().unwrap_or_else(|envenenado| envenenado.into_inner())
    }

    /// ENCOLAR: deja una peticion para Kotlin y devuelve su id.
    ///
    /// El id lo pone la cola y no quien llama: dos peticiones con el mismo id
    /// emparejarian la respuesta de una con la espera de la otra, que es
    /// exactamente el fallo silencioso que este tipo existe para impedir.
    pub fn encolar(&self, tipo: TipoDePeticion, datos: impl Into<String>) -> u64 {
        let mut interior = self.cerrojo();
        interior.siguiente_id += 1;
        let id = interior.siguiente_id;
        interior.pendientes.push_back(Peticion { id, tipo, datos: datos.into() });
        id
    }

    pub fn encolar_observar(&self) -> u64 {
        self.encolar(TipoDePeticion::Observar, String::new())
    }

    pub fn encolar_ejecutar(&self, paso_json: impl Into<String>) -> u64 {
        self.encolar(TipoDePeticion::Ejecutar, paso_json)
    }

    /// SIGUIENTE: la peticion mas antigua que Kotlin todavia no ha recogido.
    ///
    /// La SACA de la cola y la apunta en vuelo (regla 1). Devuelve `None` si no
    /// hay nada: eso es lo normal, no un error, y es lo que Kotlin ve 6 veces por
    /// segundo mientras el aparato esta quieto.
    pub fn siguiente(&self) -> Option<Peticion> {
        let mut interior = self.cerrojo();
        interior.podar(Instant::now());
        let peticion = interior.pendientes.pop_front()?;
        interior.en_vuelo.push_back((peticion.id, peticion.tipo, Instant::now()));
        Some(peticion)
    }

    /// ENTREGAR: la respuesta del aparato a una peticion que estaba en vuelo.
    ///
    /// Devuelve el tipo de la peticion contestada para que el borde sepa si el
    /// JSON es un arbol (y lo cachee para `arbolVisible`) o el desenlace de un
    /// paso. `Err(id)` es una respuesta huerfana: se cuenta y se descarta
    /// (regla 2), nunca se propaga como fallo del sistema.
    pub fn entregar(&self, id: u64, json: impl Into<String>) -> Result<TipoDePeticion, u64> {
        let mut interior = self.cerrojo();
        interior.podar(Instant::now());

        let tipo = match interior.quitar_en_vuelo(id) {
            Some(tipo) => tipo,
            None => {
                interior.huerfanas += 1;
                return Err(id);
            }
        };

        interior.respuestas.push_back(Respuesta { id, json: json.into() });
        // Se suelta el cerrojo ANTES de avisar: `notify_all` con el cerrojo
        // tomado despierta a un hilo que se queda esperando el cerrojo.
        drop(interior);
        self.aviso.notify_all();
        Ok(tipo)
    }

    /// ESPERAR: bloquea el hilo que llama hasta que llegue la respuesta o se
    /// acabe el plazo.
    ///
    /// Quien llama es el hilo del bucle del canal, NUNCA el hilo de la UI (el
    /// borde no expone esto a Kotlin; solo lo usa `mano::android`).
    pub fn esperar_respuesta(&self, id: u64, plazo: Duration) -> Result<Respuesta, EsperaAgotada> {
        let limite = Instant::now() + plazo;
        let mut interior = self.cerrojo();

        loop {
            // Se mira ANTES de esperar: la respuesta puede haber llegado entre
            // el `encolar` y esta llamada.
            if let Some(respuesta) = interior.quitar_respuesta(id) {
                return Ok(respuesta);
            }

            let ahora = Instant::now();
            if ahora >= limite {
                // La peticion se queda sin dueno: si su respuesta llega
                // despues, sera huerfana y no se acumulara aqui.
                interior.quitar_en_vuelo(id);
                interior.respuestas.retain(|r| r.id != id);
                return Err(EsperaAgotada { id, plazo });
            }

            let (nuevo, _) = self
                .aviso
                .wait_timeout(interior, limite - ahora)
                .unwrap_or_else(|envenenado| envenenado.into_inner());
            interior = nuevo;
        }
    }

    /// Encola y espera, en un solo paso: lo que hace `mano::android` en cada
    /// gesto.
    pub fn pedir(&self, tipo: TipoDePeticion, datos: impl Into<String>, plazo: Duration) -> Result<Respuesta, EsperaAgotada> {
        let id = self.encolar(tipo, datos);
        self.esperar_respuesta(id, plazo)
    }

    /// Cuantas peticiones esperan a que Kotlin las recoja.
    pub fn pendientes(&self) -> usize {
        self.cerrojo().pendientes.len()
    }

    /// Cuantas peticiones estan en manos de Kotlin (entregadas, sin respuesta).
    pub fn en_vuelo(&self) -> usize {
        self.cerrojo().en_vuelo.len()
    }

    /// Cuantas respuestas huerfanas se descartaron desde el arranque. Es un
    /// contador, no un estado: sirve para saber si el otro lado va a su aire.
    pub fn huerfanas(&self) -> u64 {
        self.cerrojo().huerfanas
    }

    /// Vacia pendientes y en vuelo. Lo llama el borde al parar el canal: un
    /// canal nuevo no puede empezar con recados del anterior.
    pub fn vaciar(&self) {
        let mut interior = self.cerrojo();
        interior.pendientes.clear();
        interior.en_vuelo.clear();
        interior.respuestas.clear();
    }
}
