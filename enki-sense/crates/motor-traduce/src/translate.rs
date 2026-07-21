//! Traducción con MarianMT (Opus-MT) sobre candle — Rust puro, local. El motor
//! es determinista (greedy): mismo texto+par → misma salida.
//!
//! Un PAR de idiomas = { Config (arquitectura Opus-MT), repo de pesos, tokenizer
//! origen, tokenizer destino }. Cada par se carga perezoso y se cachea. El par
//! VERIFICADO de fábrica es fr→en (candle + lmz/candle-marian traen todo). Añadir
//! otro par = registrar sus assets (modelo + tokenizers convertidos) aquí.
//!
//! HONESTIDAD: par no registrado → Err("par_no_soportado"); el motor no inventa.

use anyhow::{anyhow, Result};
use candle_core::{Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::generation::LogitsProcessor;
use candle_transformers::models::marian;
use std::path::PathBuf;
use tokenizers::Tokenizer;

/// Dir raíz de modelos (los assets NO van en el binario — se provisionan aparte,
/// como ocr4rs get-models). Cada par vive en `<dir>/<de>-<a>/` con:
///   tokenizer-src.json · tokenizer-tgt.json · model.safetensors (o pytorch_model.bin)
/// Provisionar con curl (que confía en el CA del proxy), NO desde el binario.
fn models_dir() -> PathBuf {
    std::env::var("MOTOR_TRADUCE_MODELS")
        .unwrap_or_else(|_| "/opt/enki-sense/models/traduce".to_string())
        .into()
}

/// La arquitectura Opus-MT del par "de-a", o None si el par no está registrado.
/// (Los Opus-MT base comparten dims; cambia vocab/ids por par.)
fn config_de_par(de: &str, a: &str) -> Option<fn() -> marian::Config> {
    match (de, a) {
        ("fr", "en") => Some(marian::Config::opus_mt_fr_en),
        // es→en, ca→en, … : misma familia; registrar su Config cuando se añadan
        // sus assets al dir de modelos. Hasta entonces: par_no_soportado.
        _ => None,
    }
}

/// Un traductor cargado para UN par. Reutilizable entre peticiones (mut por el kv-cache).
pub struct Translator {
    model: marian::MTModel,
    config: marian::Config,
    tok_src: Tokenizer,
    tok_tgt: Tokenizer,
    device: Device,
}

impl Translator {
    /// Carga (perezosa) el par "de-a" desde el dir LOCAL de modelos. Sin red: si el
    /// par no está registrado o sus assets no están provisionados → par_no_soportado.
    pub fn cargar(de: &str, a: &str) -> Result<Self> {
        let config_fn = config_de_par(de, a).ok_or_else(|| anyhow!("par_no_soportado"))?;
        let dir = models_dir().join(format!("{de}-{a}"));
        let src = dir.join("tokenizer-src.json");
        let tgt = dir.join("tokenizer-tgt.json");
        let safet = dir.join("model.safetensors");
        let pth = dir.join("pytorch_model.bin");
        if !src.exists() || !tgt.exists() || (!safet.exists() && !pth.exists()) {
            // El par está registrado pero sus ficheros no están (get-models pendiente).
            return Err(anyhow!("par_no_soportado (assets no provisionados en {})", dir.display()));
        }

        let tok_src = Tokenizer::from_file(&src).map_err(|e| anyhow!("tokenizer origen: {e}"))?;
        let tok_tgt = Tokenizer::from_file(&tgt).map_err(|e| anyhow!("tokenizer destino: {e}"))?;

        let device = Device::Cpu;
        let config = config_fn();
        let vb = if safet.exists() {
            // candle-marian espera `model.shared.weight` (embedding compartido). Los
            // Opus-MT exportados por transformers nuevo lo llaman `embed_tokens`
            // (embeddings atados): cargamos todos los tensores y aliasamos, así
            // sirve cualquier Opus-MT sin conversión externa.
            let mut ts = candle_core::safetensors::load(&safet, &device)?;
            if !ts.contains_key("model.shared.weight") {
                let embed = ts
                    .get("model.encoder.embed_tokens.weight")
                    .or_else(|| ts.get("model.decoder.embed_tokens.weight"))
                    .cloned();
                if let Some(t) = embed {
                    ts.insert("model.shared.weight".to_string(), t);
                }
            }
            VarBuilder::from_tensors(ts, candle_core::DType::F32, &device)
        } else {
            VarBuilder::from_pth(pth, candle_core::DType::F32, &device)?
        };
        let model = marian::MTModel::new(&config, vb)?;
        Ok(Self { model, config, tok_src, tok_tgt, device })
    }

    /// Traduce un texto (greedy, determinista). El kv-cache se resetea al terminar.
    pub fn traducir(&mut self, texto: &str) -> Result<String> {
        let ids = self
            .tok_src
            .encode(texto, true)
            .map_err(|e| anyhow!("encode: {e}"))?
            .get_ids()
            .to_vec();
        let tokens = Tensor::new(ids.as_slice(), &self.device)?.unsqueeze(0)?;
        let encoder_xs = self.model.encoder().forward(&tokens, 0)?;

        let mut lp = LogitsProcessor::new(1337, None, None); // greedy (temp None)
        // Decodificación INCREMENTAL (kv-cache) — rápida. Empieza con el token de
        // arranque; genera hasta EOS. Freno anti-atasco: si el modelo no cierra
        // limpio (desajuste tokenizer/pesos) y repite un token, cortamos ahí — así
        // la traducción buena sale y no degenera en un bucle.
        let mut out_ids: Vec<u32> = vec![self.config.decoder_start_token_id];
        let mut seen_bigrams: std::collections::HashSet<(u32, u32)> = std::collections::HashSet::new();
        for index in 0..256usize {
            let context = if index >= 1 { 1 } else { out_ids.len() };
            let start = out_ids.len().saturating_sub(context);
            let input = Tensor::new(&out_ids[start..], &self.device)?.unsqueeze(0)?;
            let logits = self.model.decode(&input, &encoder_xs, start)?;
            let logits = logits.squeeze(0)?;
            let logits = logits.get(logits.dim(0)? - 1)?;
            let next = lp.sample(&logits)?;
            if next == self.config.eos_token_id {
                break;
            }
            // Freno anti-bucle: si un bigrama (par consecutivo) se repite, el modelo
            // entró en loop (no cerró con EOS por desajuste de assets) → corta ahí.
            // La traducción buena ya salió; esto evita que degenere.
            let prev = *out_ids.last().unwrap();
            if prev != self.config.decoder_start_token_id {
                if next == prev {
                    break; // repetición inmediata (world world) → corta ya
                }
                if !seen_bigrams.insert((prev, next)) {
                    break; // bigrama repetido (bucle de frase) → corta
                }
            }
            out_ids.push(next);
        }
        self.model.reset_kv_cache();
        // Quita el token de arranque (decoder_start) del frente antes de decodificar.
        let gen = if out_ids.len() > 1 { &out_ids[1..] } else { &out_ids[..] };
        self.tok_tgt
            .decode(gen, true)
            .map_err(|e| anyhow!("decode: {e}"))
            .map(|s| s.trim().to_string())
    }
}
