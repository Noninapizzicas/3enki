//! `puente` — CLI de escritorio del aparato.
//!
//! En el bloque 2 solo sabe hacer una cosa, y es la unica que existe: comprobar
//! la exclusividad de una cuenta. Sirve como banco de pruebas de U1 sin aparato
//! y sin cerebro (`cargo run -- --comprobar @taller_a @Taller_A`).
//!
//! El `--simular` y el `--orden <json>` del plano de obra entran en el bloque 5,
//! cuando exista el bucle de ordenes. Inventarlos ahora seria un CLI que miente
//! sobre lo que el crate sabe hacer.
//!
//! Codigo de salida: 0 = se puede operar, 1 = parada, 2 = uso incorrecto. El
//! binario falla cerrado igual que la libreria: cualquier cosa que no sea una
//! coincidencia comprobada sale con 1.

use std::process::ExitCode;

use enki_instagram_bridge::mano::exclusividad::{comprobar, HechoVisible, Mirada};
use enki_instagram_bridge::VERSION;

const USO: &str = "uso: puente --comprobar <cuenta_esperada> <cuenta_visible>";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();

    match args.as_slice() {
        [] => {
            println!("puente {VERSION} — escritorio (sin capa Android todavia)");
            println!("{USO}");
            ExitCode::SUCCESS
        }
        [flag, esperada, visible] if flag == "--comprobar" => {
            let hecho = if visible.trim().is_empty() {
                HechoVisible::nueva(None, Mirada::Completa)
            } else {
                HechoVisible::completa(visible)
            };
            let c = comprobar(esperada, &hecho);
            println!(
                "veredicto={} motivo={} permite_operar={} esperada={} visible={}",
                c.veredicto.como_str(),
                c.motivo.como_str(),
                c.permite_operar(),
                c.esperada.as_deref().unwrap_or("-"),
                c.visible.as_deref().unwrap_or("-")
            );
            if c.permite_operar() {
                ExitCode::SUCCESS
            } else {
                eprintln!("{}", c.motivo.descripcion());
                ExitCode::FAILURE
            }
        }
        _ => {
            eprintln!("{USO}");
            ExitCode::from(2)
        }
    }
}
