//! instagram-bridge — el crate del aparato (MUNDO A).
//!
//! Un solo crate que se compila de dos maneras:
//!   - `rlib` para la CLI de escritorio y los tests (`cargo test`, `cargo run`).
//!   - `cdylib` para Android (bloque 5), cuando la capa Kotlin lo cargue con
//!     `System.loadLibrary("enki_instagram_bridge")`.
//!
//! Nada de `cfg(target_os = "android")` en este bloque: el crate tiene que
//! compilar y testear en escritorio sin NDK. La capa Android entra en el bloque 5
//! y no antes, para que cada bloque se pruebe donde se puede probar.
//!
//! Modulos:
//!   - `mano`: lo que toca el mundo. Aqui vive U1 (VerificadorDeExclusividad),
//!     que es la unica pieza del bloque 2 que vive en el aparato: la comprobacion
//!     de "la cuenta que se ve es la esperada" tiene que ocurrir ANTES del primer
//!     gesto y en local, porque el padron vive en el cerebro pero la parada
//!     ocurre delante de la pantalla.
//!   - `almacen`: lo que el aparato guarda mientras trabaja. Aqui vive A4.2
//!     (SembradorDeDemostracion): el grabador de pasos humanos que produce una
//!     receta PROPUESTA. Vive en el aparato porque la observacion solo ocurre
//!     delante de la pantalla. Y aqui vive F1b (`almacen::anclas`): las anclas
//!     candidatas que salen de lo observado para reparar una receta rota, sin
//!     inventar ninguna.
//!   - `percepcion`: lo que el aparato VE antes de tocar nada. Aqui viven A1
//!     (ObservadorDeEstado) y el simulador del arbol de accesibilidad, que es lo
//!     que permite probar la mano entera en escritorio sin un movil.
//!   - `contrato`: los nombres que cruzan los puertos. Aqui vive R1
//!     (TaxonomiaDeFallos) como enum espejo de `core/fallos.js`: el aparato
//!     nombra el fallo con el mismo codigo que el cerebro, y el test de paridad
//!     lee este fichero para que no haya dos listas.
//!   - `testigo`: lo que impide decir "hecho" sin prueba. Aqui viven O1
//!     (VerificadorDeConsecuencia) y O2 (VeredictoDeEjecucion): tres salidas que
//!     no se colapsan (`Ocurrio` / `NoOcurrio` / `NoSeSabe`) y un veredicto
//!     unico por ejecucion. La espera agotada es `NoSeSabe`, nunca `Ocurrio`.
//!   - `percepcion::pulso` (D1), `percepcion::salud` (D3) y `percepcion::avisos`
//!     (D5): el pulso de la sesion, la salud del aparato y el lector de avisos de
//!     la plataforma. Las tres respetan la misma regla: `no se` no es `no`, y lo
//!     que no esta en la tabla no se adivina.
//!   - `mano::arbitro` (D4): quien tiene el aparato y cuando se puede soltar. Un
//!     paso con consecuencia incierta NO se aborta: se termina o se para limpio.
//!   - `canal` (bloque 16): lo unico que sale a la red. El cliente MQTT 3.1.1
//!     minimo sobre WebSocket seguro (la llave del bus viaja en la URL y los
//!     clientes de libreria la tiran), el `Framer` que acumula bytes antes de
//!     dar un paquete por completo, y el bucle `bridge/orden` ->
//!     `bridge/resultado` con par de fallo: una simulacion nunca contesta
//!     `ok:true`. Es la unica carpeta con dependencias externas, y estan
//!     justificadas en el `Cargo.toml` y en el README.
//!   - `jni` (bloque 18): el borde con Kotlin. **Solo existe en Android** (todo
//!     el modulo esta bajo `cfg(target_os = "android")`): exporta los tres
//!     simbolos `Java_online_enki_instagram_PuenteNativo_*` que `PuenteNativo.kt`
//!     declara como `external`, arranca y para el canal en un hilo, y publica el
//!     estado. No reimplementa el canal: llama a `canal::mqtt` y `canal::bucle`.
//!     En escritorio el modulo ni se parsea, y `tests/jni_paridad.rs` comprueba
//!     sobre el FUENTE que los nombres de los dos lados no divergen.

pub mod almacen;
pub mod canal;
pub mod contrato;
#[cfg(target_os = "android")]
pub mod jni;
pub mod mano;
pub mod percepcion;
pub mod testigo;

/// Version del crate, la misma que declara `Cargo.toml` y que viaja en
/// `bridge/instagram/estado` (topic D11) como `version_app`.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
