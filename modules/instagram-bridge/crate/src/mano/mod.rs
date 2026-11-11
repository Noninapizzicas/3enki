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
pub mod ejecutor;
pub mod escalera;
pub mod exclusividad;
pub mod publicar;
