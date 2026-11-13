//! `contrato` — las formas y los nombres que cruzan los puertos.
//!
//! Lo que el aparato manda al cerebro y lo que el cerebro le contesta tiene que
//! estar nombrado en un solo sitio, o cada borde inventa su vocabulario y el
//! aislamiento (P1/P2/P3) se cae en el primer payload raro.
//!
//! En el plano de obra esta carpeta acaba teniendo las formas de dato
//! (`HechoVisible`, `Receta`, `VeredictoDeEjecucion`...) con su test de paridad.
//! En el bloque 4 solo existe `fallo`: la taxonomia (R1) y su enum espejo, que
//! es lo unico que el aparato necesita nombrar antes de tener pulso o mano.
//!
//! La regla que comparte todo lo de `contrato`: un nombre, un sitio. Si el mismo
//! vocabulario se escribe dos veces, una de las dos copias se queda vieja.

pub mod fallo;
