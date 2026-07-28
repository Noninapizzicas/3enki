//! Motor TTS con Supertonic (ONNX directo, sin espeak-ng, sin piper-rs).
//!
//! Pipeline: texto → unicode IDs + lang tag → text_encoder → duration_predictor
//!   → vector_estimator (denoising loop) → vocoder → WAV 44.1kHz.
//!
//! Adaptado del SDK Rust de Supertonic (supertone-inc/supertonic).

use anyhow::{anyhow, bail, Context, Result};
use hound::{SampleFormat, WavSpec, WavWriter};
use ndarray::{Array, Array3};
use ort::{inputs, session::Session, value::Value};
use rand_distr::{Distribution, Normal};
use regex::Regex;
use serde::Deserialize;
use std::collections::HashMap;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use unicode_normalization::UnicodeNormalization;

// ── Config (de tts.json) ──

#[derive(Debug, Clone, Deserialize)]
struct TtsConfig {
    ae: AEConfig,
    ttl: TTLConfig,
}

#[derive(Debug, Clone, Deserialize)]
struct AEConfig {
    sample_rate: i32,
    base_chunk_size: i32,
}

#[derive(Debug, Clone, Deserialize)]
struct TTLConfig {
    chunk_compress_factor: i32,
    latent_dim: i32,
}

// ── Voice style ──

#[derive(Debug, Clone, Deserialize)]
struct VoiceStyleData {
    style_ttl: StyleComponent,
    style_dp: StyleComponent,
}

#[derive(Debug, Clone, Deserialize)]
struct StyleComponent {
    data: Vec<Vec<Vec<f32>>>,
    dims: Vec<usize>,
}

pub struct Style {
    ttl: Array3<f32>,
    dp: Array3<f32>,
}

// ── Unicode processor ──

struct UnicodeProcessor {
    indexer: Vec<i64>,
}

impl UnicodeProcessor {
    fn new(path: &Path) -> Result<Self> {
        let file = std::fs::File::open(path).context("unicode_indexer.json")?;
        let indexer: Vec<i64> = serde_json::from_reader(std::io::BufReader::new(file))?;
        Ok(Self { indexer })
    }

    fn encode(&self, texts: &[String], langs: &[String]) -> Result<(Vec<Vec<i64>>, Array3<f32>)> {
        let processed: Vec<String> = texts
            .iter()
            .zip(langs)
            .map(|(t, l)| preprocess_text(t, l))
            .collect::<Result<_>>()?;

        let lengths: Vec<usize> = processed.iter().map(|t| t.chars().count()).collect();
        let max_len = *lengths.iter().max().unwrap_or(&0);

        let text_ids: Vec<Vec<i64>> = processed
            .iter()
            .map(|text| {
                let mut row = vec![0i64; max_len];
                for (j, c) in text.chars().enumerate() {
                    let val = c as usize;
                    row[j] = if val < self.indexer.len() { self.indexer[val] } else { -1 };
                }
                row
            })
            .collect();

        let mask = length_to_mask(&lengths, max_len);
        Ok((text_ids, mask))
    }
}

// ── Text preprocessing ──

const LANGS: &[&str] = &[
    "en", "ko", "ja", "ar", "bg", "cs", "da", "de", "el", "es", "et", "fi",
    "fr", "hi", "hr", "hu", "id", "it", "lt", "lv", "nl", "pl", "pt", "ro",
    "ru", "sk", "sl", "sv", "tr", "uk", "vi", "na",
];

fn preprocess_text(text: &str, lang: &str) -> Result<String> {
    let mut t: String = text.nfkd().collect();

    let emoji_re = Regex::new(r"[\x{1F600}-\x{1F64F}\x{1F300}-\x{1F5FF}\x{1F680}-\x{1F6FF}\x{1F700}-\x{1F77F}\x{1F780}-\x{1F7FF}\x{1F800}-\x{1F8FF}\x{1F900}-\x{1F9FF}\x{1FA00}-\x{1FA6F}\x{1FA70}-\x{1FAFF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}\x{1F1E6}-\x{1F1FF}]+").unwrap();
    t = emoji_re.replace_all(&t, "").to_string();

    for (from, to) in &[
        ("\u{2013}", "-"), ("\u{2011}", "-"), ("\u{2014}", "-"), ("_", " "),
        ("\u{201C}", "\""), ("\u{201D}", "\""), ("\u{2018}", "'"), ("\u{2019}", "'"),
        ("\u{00B4}", "'"), ("`", "'"), ("[", " "), ("]", " "), ("|", " "),
        ("/", " "), ("#", " "), ("\u{2192}", " "), ("\u{2190}", " "),
    ] {
        t = t.replace(from, to);
    }
    for s in &["\u{2665}", "\u{2606}", "\u{2661}", "\u{00A9}", "\\"] {
        t = t.replace(s, "");
    }
    for (from, to) in &[("@", " at "), ("e.g.,", "for example, "), ("i.e.,", "that is, ")] {
        t = t.replace(from, to);
    }

    let ws = Regex::new(r"\s+").unwrap();
    t = ws.replace_all(&t, " ").trim().to_string();

    if !t.is_empty() {
        let end_punct = Regex::new(r#"[.!?;:,'"\u{201C}\u{201D}\u{2018}\u{2019})\]}\u{2026}\u{3002}\u{300D}\u{300F}\u{3011}\u{3009}\u{300B}\u{203A}\u{00BB}]$"#).unwrap();
        if !end_punct.is_match(&t) {
            t.push('.');
        }
    }

    if !LANGS.contains(&lang) {
        bail!("idioma no soportado: {lang}");
    }

    Ok(format!("<{lang}>{t}</{lang}>"))
}

// ── Masks y latent sampling ──

fn length_to_mask(lengths: &[usize], max_len: usize) -> Array3<f32> {
    let bsz = lengths.len();
    let mut mask = Array3::<f32>::zeros((bsz, 1, max_len));
    for (i, &len) in lengths.iter().enumerate() {
        for j in 0..len.min(max_len) {
            mask[[i, 0, j]] = 1.0;
        }
    }
    mask
}

fn sample_noisy_latent(
    duration: &[f32],
    sample_rate: i32,
    base_chunk_size: i32,
    chunk_compress: i32,
    latent_dim: i32,
) -> (Array3<f32>, Array3<f32>) {
    let bsz = duration.len();
    let max_dur = duration.iter().fold(0.0f32, |a, &b| a.max(b));
    let wav_len_max = (max_dur * sample_rate as f32) as usize;
    let wav_lengths: Vec<usize> = duration.iter().map(|&d| (d * sample_rate as f32) as usize).collect();
    let chunk_size = (base_chunk_size * chunk_compress) as usize;
    let latent_len = (wav_len_max + chunk_size - 1) / chunk_size;
    let latent_dim_val = (latent_dim * chunk_compress) as usize;

    let mut noisy = Array3::<f32>::zeros((bsz, latent_dim_val, latent_len));
    let normal = Normal::new(0.0, 1.0).unwrap();
    let mut rng = rand::thread_rng();
    for b in 0..bsz {
        for d in 0..latent_dim_val {
            for t in 0..latent_len {
                noisy[[b, d, t]] = normal.sample(&mut rng);
            }
        }
    }

    let latent_lengths: Vec<usize> = wav_lengths.iter().map(|&l| (l + chunk_size - 1) / chunk_size).collect();
    let latent_mask = length_to_mask(&latent_lengths, latent_len);

    for b in 0..bsz {
        for d in 0..latent_dim_val {
            for t in 0..latent_len {
                noisy[[b, d, t]] *= latent_mask[[b, 0, t]];
            }
        }
    }

    (noisy, latent_mask)
}

// ── Text chunking ──

const MAX_CHUNK: usize = 300;

fn chunk_text(text: &str, max_len: usize) -> Vec<String> {
    let text = text.trim();
    if text.is_empty() {
        return vec![String::new()];
    }
    if text.len() <= max_len {
        return vec![text.to_string()];
    }

    let para_re = Regex::new(r"\n\s*\n").unwrap();
    let mut chunks = Vec::new();

    for para in para_re.split(text) {
        let para = para.trim();
        if para.is_empty() { continue; }
        if para.len() <= max_len {
            chunks.push(para.to_string());
            continue;
        }
        let mut current = String::new();
        let mut current_len = 0;
        let sent_re = Regex::new(r"([.!?])\s+").unwrap();
        let mut last = 0;
        let mut boundaries = Vec::new();
        for m in sent_re.find_iter(para) {
            boundaries.push(m.end());
            last = m.end();
        }
        if last < para.len() { boundaries.push(para.len()); }
        let mut prev = 0;
        for &end in &boundaries {
            let sentence = &para[prev..end];
            prev = end;
            let slen = sentence.len();
            if current_len + slen > max_len && !current.is_empty() {
                chunks.push(current.trim().to_string());
                current.clear();
                current_len = 0;
            }
            current.push_str(sentence);
            current_len += slen;
        }
        if !current.is_empty() { chunks.push(current.trim().to_string()); }
    }

    if chunks.is_empty() { vec![text.to_string()] } else { chunks }
}

// ── WAV encoding ──

fn samples_a_wav(samples: &[f32], sr: u32) -> Result<Vec<u8>> {
    let spec = WavSpec { channels: 1, sample_rate: sr, bits_per_sample: 16, sample_format: SampleFormat::Int };
    let mut cursor = Cursor::new(Vec::<u8>::new());
    {
        let mut w = WavWriter::new(&mut cursor, spec)?;
        for &s in samples {
            w.write_sample((s.clamp(-1.0, 1.0) * 32767.0) as i16)?;
        }
        w.finalize()?;
    }
    Ok(cursor.into_inner())
}

// ── Motor: el engine TTS completo ──

pub struct Motor {
    cfg: TtsConfig,
    proc: UnicodeProcessor,
    dp: Mutex<Session>,
    text_enc: Mutex<Session>,
    vector_est: Mutex<Session>,
    vocoder: Mutex<Session>,
    styles_dir: PathBuf,
    styles: Mutex<HashMap<String, Style>>,
    pub sample_rate: u32,
}

pub const VOZ_DEFECTO: &str = "M1";

impl Motor {
    pub fn cargar(models_dir: &str) -> Result<Self> {
        let base = PathBuf::from(models_dir);
        let onnx = base.join("onnx");
        let styles_dir = base.join("voice_styles");

        let cfg_path = onnx.join("tts.json");
        if !cfg_path.exists() {
            bail!("modelos no provisionados (falta {}) — ejecuta get-models.sh", cfg_path.display());
        }
        let cfg: TtsConfig = serde_json::from_reader(
            std::io::BufReader::new(std::fs::File::open(&cfg_path)?)
        )?;

        let proc = UnicodeProcessor::new(&onnx.join("unicode_indexer.json"))?;

        let dp = Session::builder()?.commit_from_file(onnx.join("duration_predictor.onnx"))?;
        let text_enc = Session::builder()?.commit_from_file(onnx.join("text_encoder.onnx"))?;
        let vector_est = Session::builder()?.commit_from_file(onnx.join("vector_estimator.onnx"))?;
        let vocoder = Session::builder()?.commit_from_file(onnx.join("vocoder.onnx"))?;

        let sr = cfg.ae.sample_rate as u32;
        tracing::info!("motor TTS cargado (Supertonic ONNX, {sr} Hz, 31 idiomas)");

        Ok(Self {
            cfg, proc,
            dp: Mutex::new(dp),
            text_enc: Mutex::new(text_enc),
            vector_est: Mutex::new(vector_est),
            vocoder: Mutex::new(vocoder),
            styles_dir, styles: Mutex::new(HashMap::new()),
            sample_rate: sr,
        })
    }

    fn load_style(&self, voz: &str) -> Result<Style> {
        if voz.contains('/') || voz.contains("..") {
            bail!("voz_no_disponible (nombre inválido)");
        }
        let path = self.styles_dir.join(format!("{voz}.json"));
        if !path.exists() {
            bail!("voz_no_disponible (no provisionada en {})", path.display());
        }
        let file = std::fs::File::open(&path)?;
        let data: VoiceStyleData = serde_json::from_reader(std::io::BufReader::new(file))?;

        let ttl_d = &data.style_ttl.dims;
        let dp_d = &data.style_dp.dims;

        let mut ttl_flat = Vec::with_capacity(ttl_d[1] * ttl_d[2]);
        for batch in &data.style_ttl.data {
            for row in batch { ttl_flat.extend_from_slice(row); }
        }
        let mut dp_flat = Vec::with_capacity(dp_d[1] * dp_d[2]);
        for batch in &data.style_dp.data {
            for row in batch { dp_flat.extend_from_slice(row); }
        }

        Ok(Style {
            ttl: Array3::from_shape_vec((1, ttl_d[1], ttl_d[2]), ttl_flat)?,
            dp: Array3::from_shape_vec((1, dp_d[1], dp_d[2]), dp_flat)?,
        })
    }

    fn get_style(&self, voz: &str) -> Result<Style> {
        {
            let cache = self.styles.lock().unwrap();
            if let Some(s) = cache.get(voz) {
                return Ok(Style { ttl: s.ttl.clone(), dp: s.dp.clone() });
            }
        }
        let style = self.load_style(voz)?;
        let ret = Style { ttl: style.ttl.clone(), dp: style.dp.clone() };
        self.styles.lock().unwrap().insert(voz.to_string(), style);
        Ok(ret)
    }

    fn infer(&self, texts: &[String], langs: &[String], style: &Style, steps: usize, speed: f32) -> Result<(Vec<f32>, Vec<f32>)> {
        let bsz = texts.len();
        let (text_ids, text_mask) = self.proc.encode(texts, langs)?;

        let flat: Vec<i64> = text_ids.iter().flat_map(|r| r.iter().copied()).collect();
        let cols = text_ids[0].len();
        let text_ids_arr = Array::from_shape_vec((bsz, cols), flat)?;

        let text_ids_v = Value::from_array(text_ids_arr)?;
        let text_mask_v = Value::from_array(text_mask.clone())?;
        let style_dp_v = Value::from_array(style.dp.clone())?;

        let mut duration: Vec<f32> = {
            let mut dp = self.dp.lock().unwrap();
            let dp_out = dp.run(inputs! {
                "text_ids" => &text_ids_v,
                "style_dp" => &style_dp_v,
                "text_mask" => &text_mask_v
            })?;
            let (_, dur_data) = dp_out["duration"].try_extract_tensor::<f32>()?;
            dur_data.to_vec()
        };
        for d in duration.iter_mut() { *d /= speed; }

        let style_ttl_v = Value::from_array(style.ttl.clone())?;
        let text_emb: Array3<f32> = {
            let mut enc = self.text_enc.lock().unwrap();
            let enc_out = enc.run(inputs! {
                "text_ids" => &text_ids_v,
                "style_ttl" => &style_ttl_v,
                "text_mask" => &text_mask_v
            })?;
            let (emb_shape, emb_data) = enc_out["text_emb"].try_extract_tensor::<f32>()?;
            Array3::from_shape_vec(
                (emb_shape[0] as usize, emb_shape[1] as usize, emb_shape[2] as usize),
                emb_data.to_vec(),
            )?
        };

        let (mut xt, latent_mask) = sample_noisy_latent(
            &duration,
            self.cfg.ae.sample_rate,
            self.cfg.ae.base_chunk_size,
            self.cfg.ttl.chunk_compress_factor,
            self.cfg.ttl.latent_dim,
        );

        let total_step_arr = Array::from_elem(bsz, steps as f32);

        for step in 0..steps {
            let current_arr = Array::from_elem(bsz, step as f32);
            let xt_v = Value::from_array(xt.clone())?;
            let emb_v = Value::from_array(text_emb.clone())?;
            let lm_v = Value::from_array(latent_mask.clone())?;
            let tm_v = Value::from_array(text_mask.clone())?;
            let cs_v = Value::from_array(current_arr)?;
            let ts_v = Value::from_array(total_step_arr.clone())?;

            xt = {
                let mut vest = self.vector_est.lock().unwrap();
                let ve_out = vest.run(inputs! {
                    "noisy_latent" => &xt_v,
                    "text_emb" => &emb_v,
                    "style_ttl" => &style_ttl_v,
                    "latent_mask" => &lm_v,
                    "text_mask" => &tm_v,
                    "current_step" => &cs_v,
                    "total_step" => &ts_v
                })?;
                let (ds, dd) = ve_out["denoised_latent"].try_extract_tensor::<f32>()?;
                Array3::from_shape_vec(
                    (ds[0] as usize, ds[1] as usize, ds[2] as usize),
                    dd.to_vec(),
                )?
            };
        }

        let final_v = Value::from_array(xt)?;
        let wav_out: Vec<f32> = {
            let mut voc = self.vocoder.lock().unwrap();
            let voc_out = voc.run(inputs! { "latent" => &final_v })?;
            let (_, wav_data) = voc_out["wav_tts"].try_extract_tensor::<f32>()?;
            wav_data.to_vec()
        };

        Ok((wav_out, duration))
    }

    pub fn decir(&self, texto: &str, voz: &str, idioma: &str) -> Result<(Vec<u8>, u32)> {
        let style = self.get_style(voz).map_err(|e| {
            let m = e.to_string();
            if m.contains("voz_no_disponible") { anyhow!("{m}") } else { anyhow!("error cargando voz: {m}") }
        })?;

        let max_len = if idioma == "ko" || idioma == "ja" { 120 } else { MAX_CHUNK };
        let chunks = chunk_text(texto, max_len);
        let sr = self.cfg.ae.sample_rate;
        let steps = 8;
        let speed = 1.05;
        let silence_secs = 0.3;

        let mut wav_cat: Vec<f32> = Vec::new();

        for (i, chunk) in chunks.iter().enumerate() {
            let (wav, duration) = self.infer(
                &[chunk.clone()], &[idioma.to_string()], &style, steps, speed,
            )?;

            let dur = duration[0];
            let wav_len = (sr as f32 * dur) as usize;
            let wav_chunk = &wav[..wav_len.min(wav.len())];

            if i > 0 {
                let silence_len = (silence_secs * sr as f32) as usize;
                wav_cat.extend(std::iter::repeat(0.0f32).take(silence_len));
            }
            wav_cat.extend_from_slice(wav_chunk);
        }

        let wav_bytes = samples_a_wav(&wav_cat, sr as u32)?;
        Ok((wav_bytes, sr as u32))
    }

    pub fn voces_disponibles(&self) -> Vec<String> {
        let Ok(entries) = std::fs::read_dir(&self.styles_dir) else { return vec![] };
        entries
            .filter_map(|e| e.ok())
            .filter_map(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                name.strip_suffix(".json").map(|s| s.to_string())
            })
            .collect()
    }
}
