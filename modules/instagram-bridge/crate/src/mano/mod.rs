//! `mano` — lo que toca el mundo en el aparato.
//!
//! Cinco piezas, cada una con un oficio distinto y ninguna con dos:
//!
//!   - `exclusividad` (U1): comprueba, ANTES de cada gesto, que la cuenta que
//!     se ve es la que se esperaba. `Indeterminado` se trata como `NoCoincide`.
//!   - `ejecutor` (A3): ejecuta **un** paso. Localiza el ancla, entrega **un**
//!     gesto y se para. No encadena: la foto con la que actuo no se reutiliza,
//!     y quien quiera un segundo paso tiene que volver a mirar.
//!   - `escalera` (A5): ante un fallo, decide reintentar / volver / escalar.
//!     **Un paso que ya cambio el mundo no se reintenta nunca**, y si no se
//!     sabe si lo cambio, tampoco.
//!   - `publicar`: la operacion compuesta. Es el bucle que pone una mirada
//!     nueva delante de cada paso, comprueba la cuenta, vigila las
//!     consecuencias y obedece a A5 cuando algo falla.
//!   - `cola` (19a): la UNICA via por la que el crate mueve la mano Android.
//!     Una peticion con id que se entrega UNA vez y una respuesta que caduca
//!     con nombre (`mano_sin_respuesta`) en vez de colgarse. `std` puro: se
//!     prueba en escritorio.
//!   - `arbol_json` (19a): de la foto que manda el movil (`Accesibilidad`)
//!     al `Arbol` que come A1, incluido el montaje de la lista plana en arbol.
//!     Fuera de `cfg(android)` a proposito: es el contrato donde un nombre mal
//!     escrito se convierte en `arbol_vacio` sin que nadie se entere.
//!   - `android` (19a, solo Android): `ManoAndroid`, la implementacion de
//!     produccion de los puertos `FuenteDeArbol` y `Superficie`. No habla JNI:
//!     encola y espera. Si el otro lado se muere, la peticion caduca.
//!
//! La regla que comparten todas las piezas de `mano`: lo que se toca se decide
//! aqui y se prueba aqui. El cerebro no dictamina sobre el mundo; solo repite lo
//! que el aparato probo.
//!
//! # Por que el bucle NO vive en A3
//!
//! Porque el bucle es la tentacion. Un ejecutor que recorre la receta entera es
//! un ejecutor que, tarde o temprano, recorre la receta entera **con la foto
//! del principio**. Partirlo en "un paso" (A3) y "el bucle" (publicar) hace que
//! la regla de la mirada nueva este en el unico sitio donde se puede comprobar
//! (cada vuelta del bucle) y que A3 pueda negarse a repetir una foto sin saber
//! nada de recetas.

pub mod arbitro;
pub mod arbol_json;
pub mod cola;
pub mod ejecutor;
pub mod escalera;
pub mod exclusividad;
pub mod publicar;

/// La mano de produccion. Solo existe en Android: en escritorio la mano es
/// `ManoAusente` y el arbol, el `Simulador`.
#[cfg(target_os = "android")]
pub mod android;
