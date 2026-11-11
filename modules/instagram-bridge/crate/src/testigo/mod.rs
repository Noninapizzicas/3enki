//! `testigo` — lo que impide decir "hecho" sin prueba.
//!
//! La mano toca, la percepcion mira, y entre las dos hay un hueco por el que se
//! cuela el unico fallo que de verdad importa: decir que se hizo algo que no se
//! hizo. Este modulo es el que tapa ese hueco.
//!
//! # Los ficheros
//!
//!   - `verificador.rs` — **O1 · VerificadorDeConsecuencia** (reflejo). Dada la
//!     consecuencia que un paso tenia que dejar y una mirada NUEVA, decide:
//!     `Ocurrio`, `NoOcurrio` o `NoSeSabe` (con `que_haria_falta`).
//!   - `veredicto.rs` — **O2 · VeredictoDeEjecucion** (reflejo). Junta los
//!     resultados por paso en UN veredicto: ocurrio entero, no ocurrio, o no se
//!     sabe. Nunca "parcialmente".
//!
//! # Las reglas que este modulo hace ejecutables
//!
//! ```text
//! espera agotada            -> NoSeSabe (nunca Ocurrio)
//! NoSeSabe en un paso       -> el veredicto es NoSeSabe (no Ocurrio)
//! NoSeSabe                  -> SIEMPRE con que_haria_falta
//! Ocurrio                   -> exige prueba visible (nodo, momento, cuenta)
//! ```
//!
//! # Reflejos puros
//!
//! Ni O1 ni O2 leen el reloj, tocan el disco ni hablan por red: el momento entra
//! dentro del `HechoVisible` y dentro de la `ConsecuenciaEsperada`. El mismo par
//! (esperado, mirada) produce siempre el mismo resultado, que es lo que permite
//! probarlo sin movil, sin bus y sin esperar.
//!
//! O3 (`EvidenciaConservada`, en `modules/instagram-bridge/puente/evidencia.js`)
//! es el custodio que guarda esto: vive en JS porque su oficio es escribir en la
//! bitacora real del cerebro, no decidir.

pub mod verificador;
pub mod veredicto;

pub use verificador::{
    ConsecuenciaEsperada, Prueba, PruebaDeAusencia, QueHariaFalta, ResultadoDeConsecuencia,
    VerificadorDeConsecuencia,
};
pub use veredicto::{juzgar, ResultadoDePaso, Veredicto, VeredictoDeEjecucion};
