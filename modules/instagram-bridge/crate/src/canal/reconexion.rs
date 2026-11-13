//! `reconexion` — la politica de reintento del canal (bloque 19e).
//!
//! El canal se cae: se va la red, el broker reinicia, MIUI mata el proceso al
//! abrir Instagram. Antes de este bloque, una caida dejaba el canal muerto hasta
//! que el dueno pulsaba CONECTAR otra vez. Este fichero es la decision de
//! volver, escrita aparte y **sin red**, para poder probarla en escritorio.
//!
//! # Las tres reglas
//!
//! 1. **Espera creciente, con tope.** 1, 2, 4, 8, 16, 30, 60, 60... segundos.
//!    Un reintento inmediato contra un broker caido es un bucle que gasta
//!    bateria y llena el log; una espera de un minuto desde el primer intento
//!    deja el canal muerto un minuto por un corte de tres segundos. La escalera
//!    empieza rapido y se frena.
//! 2. **Se distingue la caida de la parada.** Si el dueno pulsa DESCONECTAR, no
//!    se reintenta **nunca**. Adivinar la diferencia mirando el estado (¿esta
//!    `desconectado` porque fallo o porque lo pare?) es como se acaba con un
//!    servicio que el dueno no puede apagar: la parada viaja como un valor
//!    (`Desenlace::ParadaDeliberada`), no como un estado deducido.
//! 3. **Sin credenciales no hay nada que reintentar.** Un reintento sin url ni
//!    llave solo produce una notificacion que miente.
//!
//! # El contador
//!
//! `intento` es 1-based y cuenta reintentos **desde la ultima vez que el canal
//! estuvo sano**. Un canal que aguanto mas de [`DURACION_QUE_REINICIA_S`] vuelve a
//! empezar por 1: un corte despues de una hora de servicio no es el sexto
//! intento de la misma racha, y castigarlo con 60 s de espera seria castigar al
//! dueno por un fallo de red ajeno. Un canal que se cae a los dos segundos de
//! conectar SI sigue subiendo: eso es un canal que no vale, y martillear el bus
//! cada segundo es lo que hace que el broker cierre la puerta.
//!
//! # Lo que este fichero NO hace
//!
//!   - **No duerme, no abre sockets y no mira el reloj.** Decide *cuanto* habria
//!     que esperar; dormir es del hilo del borde (`jni`), que ademas tiene que
//!     poder cortar la espera cuando llega la parada.
//!   - **No reimplementa el canal.** Volver a conectar es `Canal::conectar` y
//!     volver a suscribirse es `bucle::servir`, que ya se suscribe el mismo en su
//!     primera linea. Aqui solo se decide si se intenta y cuando.
//!   - **No guarda el intento.** El estado (`Estado::Reconectando`) lo lleva el
//!     borde; una copia aqui seria una segunda verdad que se queda atras.

use crate::canal::json::Valor;

/// El valor de `canal` mientras el canal se esta levantando otra vez.
///
/// Distinto de `conectado` (hay enlace), de `conectando` (primer intento, aun
/// sin fallo) y de `desconectado` (no hay hilo). Quien lee la notificacion tiene
/// que poder saber si el puente esta trabajando en volver o si esta apagado.
pub const TEXTO_RECONECTANDO: &str = "reconectando";

/// La escalera de esperas, en segundos, antes de cada intento.
pub const ESPERAS_S: [u64; 7] = [1, 2, 4, 8, 16, 30, 60];

/// El tope de la espera. Se repite indefinidamente: no hay un "demasiados
/// intentos" a proposito — un canal que se rinde es un canal que hay que
/// levantar a mano, que es justo lo que este bloque viene a quitar.
pub const TOPE_ESPERA_S: u64 = 60;

/// Cuanto tiene que haber durado un canal sano para que su caida reinicie la
/// escalera (ver la nota del contador, arriba).
pub const DURACION_QUE_REINICIA_S: u64 = 60;

/// La espera antes del intento `intento` (1-based).
///
/// `intento = 1` -> 1 s, `2` -> 2 s, ... `7` -> 60 s, `8` y siguientes -> 60 s.
/// Un `intento = 0` (no hay intento) tambien devuelve 1 s: el primer reintento
/// se hace rapido, que es lo que hace que un corte de red de tres segundos no se
/// note.
pub fn espera_s(intento: u64) -> u64 {
    if intento <= 1 {
        return ESPERAS_S[0];
    }
    let indice = (intento as usize - 1).min(ESPERAS_S.len() - 1);
    ESPERAS_S[indice].min(TOPE_ESPERA_S)
}

/// La espera antes del intento `intento`, como duracion.
pub fn espera(intento: u64) -> std::time::Duration {
    std::time::Duration::from_secs(espera_s(intento))
}

/// Por que se acabo la conexion. Es un VALOR y no una bandera leida a destiempo:
/// la parada la pidio alguien, la caida la sufrio el canal.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Desenlace {
    /// El canal se cerro solo: red, broker, transporte, publicacion fallida.
    Caida,
    /// El dueno (o el servicio al bajar) pidio parar. No se reintenta.
    ParadaDeliberada,
}

/// Lo que hay que hacer despues de un desenlace.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    /// Esperar `espera_s` y volver a intentarlo, contando este `intento`.
    Reintentar(Reintento),
    /// No se vuelve. El motivo viaja como codigo estable, sin tildes.
    Parar(&'static str),
}

/// El siguiente intento: su numero y lo que hay que esperar antes de el.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Reintento {
    pub intento: u64,
    pub espera_s: u64,
}

/// El motivo de una parada deliberada.
pub const MOTIVO_PARADA_DELIBERADA: &str = "parada_deliberada";

/// El motivo de un canal que no tiene con que volver.
pub const MOTIVO_SIN_CREDENCIALES: &str = "sin_credenciales";

/// Decide si se reintenta, cuando, y con que numero de intento.
///
/// `intento_anterior` es cuantos reintentos se llevan en esta racha (0 la
/// primera vez que se cae). `conectado_s` es lo que duro el canal antes de
/// caerse: si duro lo suficiente, la racha se reinicia.
pub fn decidir(
    desenlace: Desenlace,
    intento_anterior: u64,
    conectado_s: u64,
    hay_credenciales: bool,
) -> Decision {
    match desenlace {
        // La parada manda sobre todo lo demas: aunque hubiera credenciales y
        // aunque fuera el primer intento, no se vuelve. Es la unica forma de que
        // el boton DESCONECTAR signifique algo.
        Desenlace::ParadaDeliberada => Decision::Parar(MOTIVO_PARADA_DELIBERADA),
        Desenlace::Caida if !hay_credenciales => Decision::Parar(MOTIVO_SIN_CREDENCIALES),
        Desenlace::Caida => {
            let intento = if conectado_s >= DURACION_QUE_REINICIA_S {
                1
            } else {
                intento_anterior.saturating_add(1)
            };
            Decision::Reintentar(Reintento { intento, espera_s: espera_s(intento) })
        }
    }
}

// ---------------------------------------------------------------------------
// El estado que viaja a Kotlin (la mitad que se puede probar en escritorio)
// ---------------------------------------------------------------------------

/// Un canal que se esta levantando otra vez: el intento, lo que falta y por que.
///
/// El borde (`jni`) mete esto dentro de su `Estado::Reconectando` y lo proyecta
/// al JSON con [`Reconexion::campos`]. Existe como tipo propio y no como tres
/// campos sueltos para que el texto `reconectando` y los nombres `intento` /
/// `proximo_en_s` se escriban UNA vez: son el contrato con la notificacion de
/// Android, y un nombre cambiado en un lado deja la notificacion mintiendo sin
/// error de compilacion en ninguno de los dos.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Reconexion {
    /// El reintento que se esta esperando (1-based).
    pub intento: u64,
    /// Lo que falta para el siguiente intento, en segundos.
    pub espera_s: u64,
    /// El fallo que provoco la reconexion, para que el dueno sepa que paso.
    pub motivo: String,
}

impl Reconexion {
    pub fn nueva(intento: u64, espera_s: u64, motivo: impl Into<String>) -> Self {
        Self { intento, espera_s, motivo: motivo.into() }
    }

    /// El valor de `canal`: siempre [`TEXTO_RECONECTANDO`].
    pub fn texto(&self) -> &'static str {
        TEXTO_RECONECTANDO
    }

    /// Los campos que este estado añade al JSON de estado.
    ///
    /// `intento` y `proximo_en_s` van aparte de `motivo` porque son numeros y
    /// quien los lee (la notificacion) tiene que poder contarlos, no buscarlos
    /// dentro de una frase.
    pub fn campos(&self) -> Vec<(&'static str, Valor)> {
        vec![
            ("intento", Valor::Numero(self.intento as f64)),
            ("proximo_en_s", Valor::Numero(self.espera_s as f64)),
        ]
    }

    /// El estado como JSON suelto, para logs y para el test del contrato.
    pub fn a_json(&self) -> String {
        let mut campos = vec![("canal", Valor::texto(self.texto()))];
        campos.extend(self.campos());
        campos.push(("motivo", Valor::texto(self.motivo.clone())));
        Valor::objeto(campos).a_texto()
    }
}

impl std::fmt::Display for Reconexion {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{} (intento {}, proximo en {} s): {}",
            self.texto(),
            self.intento,
            self.espera_s,
            self.motivo
        )
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn la_escalera_empieza_en_uno_y_no_pasa_de_sesenta() {
        assert_eq!(espera_s(1), 1);
        assert_eq!(espera_s(7), 60);
        assert_eq!(espera_s(400), TOPE_ESPERA_S);
        // Monotona: nunca baja. Un reintento que espera menos que el anterior es
        // un bucle que se acelera contra un broker caido.
        for intento in 2..40u64 {
            assert!(espera_s(intento) >= espera_s(intento - 1));
        }
    }

    #[test]
    fn una_parada_no_se_reintenta_ni_con_credenciales() {
        assert_eq!(
            decidir(Desenlace::ParadaDeliberada, 0, 0, true),
            Decision::Parar(MOTIVO_PARADA_DELIBERADA)
        );
    }
}
