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
//!     delante de la pantalla.

pub mod almacen;
pub mod mano;

/// Version del crate, la misma que declara `Cargo.toml` y que viaja en
/// `bridge/instagram/estado` (topic D11) como `version_app`.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
