//! Transcripción con Whisper sobre candle — Rust puro, local. audio → texto.
//!
//! Carga LOCAL (sin red): los assets (config.json · tokenizer.json ·
//! model.safetensors · melfilters.bytes) se provisionan con get-models.sh en el
//! dir de modelos. El modelo se carga UNA vez y se reutiliza.
//!
//! HONESTIDAD: solo transcribe lo que se DIJO (la señal); no interpreta la
//! intención. Audio ilegible → Err; nunca inventa palabras.

use anyhow::{anyhow, Result};
use candle_core::{Device, IndexOp, Tensor};
use candle_nn::ops::softmax;
use candle_nn::VarBuilder;
use candle_transformers::models::whisper::{self as m, audio, Config};
use std::io::Cursor;
use std::path::PathBuf;
use tokenizers::Tokenizer;

fn models_dir() -> PathBuf {
    std::env::var("MOTOR_OIDO_MODELS")
        .unwrap_or_else(|_| "/opt/enki-sense/models/oido".to_string())
        .into()
}

fn token_id(tk: &Tokenizer, t: &str) -> Result<u32> {
    tk.token_to_id(t).ok_or_else(|| anyhow!("sin token-id para {t}"))
}

/// El transcriptor cargado. Reutilizable entre peticiones (mut por el kv-cache).
pub struct Transcriber {
    model: m::model::Whisper,
    config: Config,
    tokenizer: Tokenizer,
    mel_filters: Vec<f32>,
    device: Device,
    sot: u32,
    eot: u32,
    transcribe: u32,
    translate: u32,
    no_timestamps: u32,
    suppress: Tensor, // sesgo -inf sobre los tokens a suprimir
}

impl Transcriber {
    /// Carga el modelo whisper del dir local. Sin red.
    pub fn cargar() -> Result<Self> {
        let dir = models_dir();
        let need = ["config.json", "tokenizer.json", "model.safetensors", "melfilters.bytes"];
        for f in need {
            if !dir.join(f).exists() {
                return Err(anyhow!("assets no provisionados: falta {} en {}", f, dir.display()));
            }
        }
        let device = Device::Cpu;
        let config: Config = serde_json::from_str(&std::fs::read_to_string(dir.join("config.json"))?)?;
        let tokenizer = Tokenizer::from_file(dir.join("tokenizer.json")).map_err(|e| anyhow!("tokenizer: {e}"))?;

        // Filtros mel (f32 little-endian).
        let mel_bytes = std::fs::read(dir.join("melfilters.bytes"))?;
        let mut mel_filters = vec![0f32; mel_bytes.len() / 4];
        <byteorder::LittleEndian as byteorder::ByteOrder>::read_f32_into(&mel_bytes, &mut mel_filters);

        let vb = unsafe {
            VarBuilder::from_mmaped_safetensors(&[dir.join("model.safetensors")], m::DTYPE, &device)?
        };
        let model = m::model::Whisper::load(&vb, config.clone())?;

        let sot = token_id(&tokenizer, m::SOT_TOKEN)?;
        let eot = token_id(&tokenizer, m::EOT_TOKEN)?;
        let transcribe = token_id(&tokenizer, m::TRANSCRIBE_TOKEN)?;
        let translate = token_id(&tokenizer, m::TRANSLATE_TOKEN)?;
        let no_timestamps = token_id(&tokenizer, m::NO_TIMESTAMPS_TOKEN)?;

        // Suprime tokens no textuales (config.suppress_tokens) + los de timestamp.
        let suppress: Vec<f32> = (0..config.vocab_size as u32)
            .map(|i| {
                if config.suppress_tokens.contains(&i) || i == no_timestamps {
                    f32::NEG_INFINITY
                } else {
                    0f32
                }
            })
            .collect();
        let suppress = Tensor::new(suppress.as_slice(), &device)?;

        Ok(Self {
            model, config, tokenizer, mel_filters, device,
            sot, eot, transcribe, translate, no_timestamps, suppress,
        })
    }

    /// Transcribe un WAV (bytes). `idioma` opcional (ISO 639-1); si no, se detecta.
    /// Devuelve (texto, idioma, avg_logprob).
    pub fn transcribir(&mut self, wav: &[u8], idioma: Option<&str>) -> Result<(String, String, f64)> {
        let pcm = wav_a_pcm16k(wav)?;
        let mel = audio::pcm_to_mel(&self.config, &pcm, &self.mel_filters);
        let mel_len = mel.len();
        let n_mel = self.config.num_mel_bins;
        let mel = Tensor::from_vec(mel, (1, n_mel, mel_len / n_mel), &self.device)?;

        let audio_features = self.model.encoder.forward(&mel, true)?;

        // Idioma: forzado, o detectado a partir de los logits del 1er paso.
        let lang_token = match idioma {
            Some(code) => token_id(&self.tokenizer, &format!("<|{}|>", code)).ok(),
            None => self.detectar_idioma(&audio_features)?,
        };
        let idioma_detectado = lang_token
            .and_then(|t| self.tokenizer.id_to_token(t))
            .map(|s| s.trim_start_matches("<|").trim_end_matches("|>").to_string())
            .unwrap_or_else(|| idioma.unwrap_or("").to_string());

        let mut tokens = vec![self.sot];
        if let Some(l) = lang_token {
            tokens.push(l);
        }
        tokens.push(self.transcribe);
        tokens.push(self.no_timestamps);

        let max_pos = self.config.max_target_positions;
        let mut sum_logprob = 0f64;
        let mut n = 0usize;
        for i in 0..max_pos {
            let tokens_t = Tensor::new(tokens.as_slice(), &self.device)?.unsqueeze(0)?;
            let ys = self.model.decoder.forward(&tokens_t, &audio_features, i == 0)?;
            let (_, seq_len, _) = ys.dims3()?;
            let logits = self
                .model
                .decoder
                .final_linear(&ys.i((..1, seq_len - 1..))?)?
                .i(0)?
                .i(0)?;
            let logits = logits.broadcast_add(&self.suppress)?;
            let logits_v: Vec<f32> = logits.to_vec1()?;
            let next = logits_v
                .iter()
                .enumerate()
                .max_by(|(_, u), (_, v)| u.total_cmp(v))
                .map(|(i, _)| i as u32)
                .unwrap();
            if next == self.eot || tokens.len() > max_pos {
                break;
            }
            let prob = softmax(&logits, candle_core::D::Minus1)?
                .i(next as usize)?
                .to_scalar::<f32>()? as f64;
            sum_logprob += prob.ln();
            n += 1;
            tokens.push(next);
        }
        self.model.reset_kv_cache();

        // Quita los tokens especiales del arranque antes de decodificar el texto.
        let text = self
            .tokenizer
            .decode(&tokens, true)
            .map_err(|e| anyhow!("decode: {e}"))?
            .trim()
            .to_string();
        let avg = if n > 0 { sum_logprob / n as f64 } else { 0.0 };
        Ok((text, idioma_detectado, avg))
    }

    /// Detecta el idioma: 1 paso de decoder con [SOT], mira los logits sobre el
    /// rango de tokens de idioma ([sot+1, translate)) y elige el máximo.
    fn detectar_idioma(&mut self, audio_features: &Tensor) -> Result<Option<u32>> {
        let tokens_t = Tensor::new(&[self.sot], &self.device)?.unsqueeze(0)?;
        let ys = self.model.decoder.forward(&tokens_t, audio_features, true)?;
        self.model.reset_kv_cache();
        let logits = self.model.decoder.final_linear(&ys.i((..1, ..1))?)?.i(0)?.i(0)?;
        let logits_v: Vec<f32> = logits.to_vec1()?;
        let lo = (self.sot + 1) as usize;
        let hi = self.translate as usize; // los idiomas viven en [sot+1, translate)
        if hi <= lo || hi > logits_v.len() {
            return Ok(None);
        }
        let best = (lo..hi)
            .max_by(|&a, &b| logits_v[a].total_cmp(&logits_v[b]))
            .map(|i| i as u32);
        Ok(best)
    }
}

/// WAV (bytes) → PCM f32 mono 16 kHz. Estéreo → media de canales; sample-rate
/// distinto → remuestreo lineal. (mp3/ogg = mejora futura vía symphonia.)
fn wav_a_pcm16k(bytes: &[u8]) -> Result<Vec<f32>> {
    let mut reader = hound::WavReader::new(Cursor::new(bytes)).map_err(|e| anyhow!("WAV inválido: {e}"))?;
    let spec = reader.spec();
    let ch = spec.channels as usize;
    // Muestras → f32 [-1,1], colapsando canales a mono.
    let mut mono: Vec<f32> = Vec::new();
    match spec.sample_format {
        hound::SampleFormat::Int => {
            let max = (1i64 << (spec.bits_per_sample - 1)) as f32;
            let s: Vec<i32> = reader.samples::<i32>().collect::<std::result::Result<_, _>>()?;
            for frame in s.chunks(ch) {
                let avg = frame.iter().map(|&x| x as f32 / max).sum::<f32>() / ch as f32;
                mono.push(avg);
            }
        }
        hound::SampleFormat::Float => {
            let s: Vec<f32> = reader.samples::<f32>().collect::<std::result::Result<_, _>>()?;
            for frame in s.chunks(ch) {
                mono.push(frame.iter().sum::<f32>() / ch as f32);
            }
        }
    }
    let sr = spec.sample_rate as usize;
    if sr == m::SAMPLE_RATE {
        return Ok(mono);
    }
    // Remuestreo lineal a 16 kHz.
    let target = m::SAMPLE_RATE;
    let ratio = target as f32 / sr as f32;
    let out_len = (mono.len() as f32 * ratio) as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src = i as f32 / ratio;
        let i0 = src.floor() as usize;
        let i1 = (i0 + 1).min(mono.len() - 1);
        let frac = src - i0 as f32;
        out.push(mono[i0] * (1.0 - frac) + mono[i1] * frac);
    }
    Ok(out)
}
