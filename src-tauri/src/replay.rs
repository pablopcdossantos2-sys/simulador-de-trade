use chrono::{Duration, NaiveDateTime, NaiveTime, Timelike};
use std::collections::VecDeque;
use serde::Serialize;
use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct ReplayState(pub Mutex<Option<ReplaySession>>);

/// Leitor independente para análise pós-operação; não altera o cursor do replay ativo.
pub struct ReplayAnalysisState(pub Mutex<Option<ReplaySession>>);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ReplayFormat { Ticks, CandlesM2 }

pub struct ReplaySession {
    reader: BufReader<File>,
    source_path: PathBuf,
    data_start: u64,
    symbol: String,
    asset: String,
    format: ReplayFormat,
    sequence: u64,
    pending_synthetic: VecDeque<ReplayTradeRecord>,
    finished: bool,
    session_start: Option<String>,
    session_end: Option<String>,
    pending_error: Option<String>,
    last_timestamp: Option<NaiveDateTime>,
    last_m2_candle_timestamp: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaySessionInfo {
    pub source_path: String,
    pub symbol: String,
    pub asset: String,
    pub finished: bool,
    pub session_start: Option<String>,
    pub session_end: Option<String>,
    pub mode: String,
    pub synthetic: bool,
    pub source_timeframe_minutes: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayTradeRecord {
    pub asset: String,
    pub timestamp: String,
    pub source_row: u64,
    pub sequence: u64,
    pub price: f64,
    pub quantity: f64,
}

#[derive(Debug, Clone)]
struct ReplayCandleRecord {
    timestamp: String,
    source_row: u64,
    open: f64,
    high: f64,
    low: f64,
    close: f64,
    volume: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WarmupCandleRecord {
    pub index: usize,
    pub timestamp: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

fn parse_asset(symbol: &str) -> Result<&'static str, String> {
    let upper = symbol.trim().to_uppercase();
    if upper.starts_with("WIN") {
        Ok("WINFUT")
    } else if upper.starts_with("WDO") {
        Ok("WDOFUT")
    } else {
        Err(format!(
            "Ativo não suportado para replay: {symbol}. São aceitos contratos WIN e WDO."
        ))
    }
}

fn parse_replay_line(line: &str, asset: &str, sequence: u64) -> Result<ReplayTradeRecord, String> {
    let fields: Vec<&str> = line.trim_end_matches(|ch| ch == '\r' || ch == '\n').split(',').collect();
    if fields.len() != 5 {
        return Err(format!(
            "Linha tratada inválida: eram esperadas 5 colunas e foram encontradas {}.",
            fields.len()
        ));
    }

    let symbol = fields[0].trim();
    let expected_asset = parse_asset(symbol)?;
    if expected_asset != asset {
        return Err(format!(
            "O arquivo tratado mistura famílias de ativos ({asset} e {expected_asset})."
        ));
    }

    let timestamp = fields[1].trim();
    parse_replay_timestamp(timestamp)?;

    let source_row = fields[2]
        .trim()
        .parse::<u64>()
        .map_err(|_| "source_row inválido no arquivo tratado.".to_string())?;
    let price = fields[3]
        .trim()
        .parse::<f64>()
        .map_err(|_| "Preço inválido no arquivo tratado.".to_string())?;
    let quantity = fields[4]
        .trim()
        .parse::<f64>()
        .map_err(|_| "Quantidade inválida no arquivo tratado.".to_string())?;

    if !price.is_finite() || price <= 0.0 {
        return Err("Preço inválido no arquivo tratado.".to_string());
    }
    if !quantity.is_finite() || quantity <= 0.0 {
        return Err("Quantidade inválida no arquivo tratado.".to_string());
    }

    Ok(ReplayTradeRecord {
        asset: asset.to_string(),
        timestamp: timestamp.to_string(),
        source_row,
        sequence,
        price,
        quantity,
    })
}

fn parse_replay_candle_line(line: &str, asset: &str) -> Result<ReplayCandleRecord, String> {
    let fields: Vec<&str> = line.trim_end_matches(|ch| ch == '\r' || ch == '\n').split(',').collect();
    if fields.len() != 8 {
        return Err(format!("Linha M2 inválida: esperadas 8 colunas, encontradas {}.", fields.len()));
    }
    let expected_asset = parse_asset(fields[0])?;
    if expected_asset != asset {
        return Err(format!("O arquivo M2 mistura famílias de ativos ({asset} e {expected_asset})."));
    }
    let source_row = fields[2].trim().parse::<u64>()
        .map_err(|_| "source_row inválido no arquivo M2.".to_string())?;
    let number = |index: usize, label: &str| -> Result<f64, String> {
        let value = fields[index].trim().parse::<f64>()
            .map_err(|_| format!("{label} inválido no arquivo M2."))?;
        if !value.is_finite() { return Err(format!("{label} não finito no arquivo M2.")); }
        Ok(value)
    };
    let open = number(3, "Abertura")?;
    let high = number(4, "Máxima")?;
    let low = number(5, "Mínima")?;
    let close = number(6, "Fechamento")?;
    let volume = number(7, "Volume")?;
    if open <= 0.0 || high <= 0.0 || low <= 0.0 || close <= 0.0 || volume < 0.0 {
        return Err("OHLC precisa ser positivo e o volume não pode ser negativo.".to_string());
    }
    if high < low || high < open || high < close || low > open || low > close {
        return Err("Candle M2 inválido: máxima/mínima incompatíveis com OHLC.".to_string());
    }
    let tick = match asset {
        "WINFUT" => 5.0,
        "WDOFUT" => 0.5,
        _ => return Err(format!("Ativo não suportado para replay M2: {asset}.")),
    };
    for (label, price) in [("Abertura", open), ("Máxima", high), ("Mínima", low), ("Fechamento", close)] {
        let ticks = price / tick;
        if (ticks - ticks.round()).abs() > 1e-7 {
            return Err(format!("{label} {price} fora do tick válido de {tick} para {asset}."));
        }
    }
    let timestamp = fields[1].trim().to_string();
    let parsed = parse_replay_timestamp(&timestamp)?;
    if parsed.minute() % 2 != 0 || parsed.second() != 0 || parsed.nanosecond() != 0 {
        return Err(format!("O timestamp {timestamp} não representa a abertura de um candle M2."));
    }
    Ok(ReplayCandleRecord { timestamp, source_row, open, high, low, close, volume })
}


fn validate_header(header: &str) -> Result<(), String> {
    if header.trim_end_matches(|ch| ch == '\r' || ch == '\n')
        != "symbol,timestamp,source_row,price,quantity"
    {
        return Err(
            "O arquivo não corresponde ao formato .replay.csv gerado pelo Simulador de Trade."
                .to_string(),
        );
    }
    Ok(())
}


fn read_replay_window(path: &Path) -> (Option<String>, Option<String>) {
    let metadata_path = path.with_extension("meta.json");
    let Ok(raw) = std::fs::read_to_string(metadata_path) else {
        return (None, None);
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return (None, None);
    };

    let start = value
        .get("window")
        .and_then(|window| window.get("startInclusive"))
        .and_then(|value| value.as_str())
        .map(ToOwned::to_owned);
    let end = value
        .get("window")
        .and_then(|window| window.get("endExclusive"))
        .and_then(|value| value.as_str())
        .map(ToOwned::to_owned);

    (start, end)
}

fn open_session(path: &Path) -> Result<(ReplaySession, ReplaySessionInfo), String> {
    if !path.exists() || !path.is_file() { return Err("Arquivo de replay não encontrado.".to_string()); }
    let file = File::open(path).map_err(|error| error.to_string())?;
    let mut reader = BufReader::with_capacity(4 * 1024 * 1024, file);
    let mut header = String::new();
    reader.read_line(&mut header).map_err(|error| error.to_string())?;
    let normalized_header = header.trim_end_matches(|ch| ch == '\r' || ch == '\n');
    let format = match normalized_header {
        "symbol,timestamp,source_row,price,quantity" => {
            validate_header(&header)?;
            ReplayFormat::Ticks
        }
        "symbol,timestamp,source_row,open,high,low,close,volume" => ReplayFormat::CandlesM2,
        _ => return Err("Formato de replay inválido. São aceitos negócios legados ou OHLCV M2.".to_string()),
    };
    let data_start = reader.stream_position().map_err(|error| error.to_string())?;
    let first_line = loop {
        let mut candidate = String::new();
        let read = reader.read_line(&mut candidate).map_err(|error| error.to_string())?;
        if read == 0 { return Err("O arquivo de replay não possui candles ou negócios.".to_string()); }
        if candidate.trim().is_empty() { continue; }
        break candidate;
    };
    let first_fields: Vec<&str> = first_line.trim_end_matches(|ch| ch == '\r' || ch == '\n').split(',').collect();
    let expected_columns = if format == ReplayFormat::Ticks { 5 } else { 8 };
    if first_fields.len() != expected_columns { return Err("Primeira linha de replay inválida.".to_string()); }
    let symbol = first_fields[0].trim().to_string();
    let asset = parse_asset(&symbol)?.to_string();
    match format {
        ReplayFormat::Ticks => { parse_replay_line(&first_line, &asset, 0)?; }
        ReplayFormat::CandlesM2 => { parse_replay_candle_line(&first_line, &asset)?; }
    }
    reader.seek(SeekFrom::Start(data_start)).map_err(|error| error.to_string())?;
    let (session_start, session_end) = read_replay_window(path);
    let synthetic = format == ReplayFormat::CandlesM2;
    let info = ReplaySessionInfo {
        source_path: path.to_string_lossy().to_string(),
        symbol: symbol.clone(), asset: asset.clone(), finished: false,
        session_start: session_start.clone(), session_end: session_end.clone(),
        mode: if synthetic { "CANDLES_M2_SYNTHETIC" } else { "TICK_LEGACY" }.to_string(),
        synthetic, source_timeframe_minutes: if synthetic { Some(2) } else { None },
    };
    Ok((ReplaySession {
        reader, source_path: path.to_path_buf(), data_start, symbol, asset, format,
        sequence: 0, pending_synthetic: VecDeque::new(), finished: false,
        session_start, session_end, pending_error: None, last_timestamp: None,
        last_m2_candle_timestamp: None,
    }, info))
}

/// Interpreta timestamps como relógio local do mercado: offsets/Z são aceitos
/// para interoperabilidade, mas não deslocam o horário informado no arquivo.
fn parse_replay_timestamp(raw: &str) -> Result<NaiveDateTime, String> {
    let value = raw.trim();

    // RFC 3339 cobre sufixo Z, offsets ±HH:MM e frações de segundo.
    if let Ok(timestamp) = chrono::DateTime::parse_from_rfc3339(value) {
        return Ok(timestamp.naive_local());
    }

    // Também aceita separador com espaço, mantendo a semântica de relógio local.
    for format in [
        "%Y-%m-%d %H:%M:%S%.f%:z",
        "%Y-%m-%d %H:%M:%S%:z",
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S",
    ] {
        if let Ok(value) = NaiveDateTime::parse_from_str(value, format) {
            return Ok(value);
        }
    }

    Err(format!("Timestamp inválido no replay: {raw}"))
}

fn bucket_timestamp(
    timestamp: NaiveDateTime,
    timeframe_minutes: u32,
) -> Result<NaiveDateTime, String> {
    if timeframe_minutes == 0 || timeframe_minutes > 60 {
        return Err("Timeframe de aquecimento inválido.".to_string());
    }

    let minute = timestamp.minute();
    let bucket_minute = minute - (minute % timeframe_minutes);
    let time = NaiveTime::from_hms_opt(timestamp.hour(), bucket_minute, 0)
        .ok_or_else(|| "Falha ao calcular início do candle.".to_string())?;
    Ok(NaiveDateTime::new(timestamp.date(), time))
}

fn push_warmup_trade(
    candles: &mut VecDeque<WarmupCandleRecord>,
    timestamp: NaiveDateTime,
    price: f64,
    quantity: f64,
    timeframe_minutes: u32,
) -> Result<(), String> {
    let bucket = bucket_timestamp(timestamp, timeframe_minutes)?;
    let bucket_text = bucket.format("%Y-%m-%dT%H:%M:%S").to_string();

    if let Some(last) = candles.last_mut() {
        if last.timestamp == bucket_text {
            last.high = last.high.max(price);
            last.low = last.low.min(price);
            last.close = price;
            last.volume += quantity;
            return Ok(());
        }
    }

    let index = candles.len();
    candles.push_back(WarmupCandleRecord {
        index,
        timestamp: bucket_text,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: quantity,
    });
    Ok(())
}

fn process_warmup_candles(
    source_paths: Vec<String>,
    timeframe_minutes: u32,
    max_bars: usize,
) -> Result<Vec<WarmupCandleRecord>, String> {
    if source_paths.is_empty() {
        return Ok(Vec::new());
    }
    if max_bars == 0 {
        return Err("O número máximo de candles de aquecimento precisa ser maior que zero.".to_string());
    }

    // Mantém somente a janela mais recente durante a leitura, evitando que
    // arquivos longos de aquecimento consumam memória proporcional ao histórico.
    let mut candles: VecDeque<WarmupCandleRecord> = VecDeque::with_capacity(max_bars);
    let mut expected_asset: Option<String> = None;
    let mut expected_symbol: Option<String> = None;
    let mut expected_format: Option<ReplayFormat> = None;
    let mut previous_timestamp: Option<NaiveDateTime> = None;

    for raw_path in source_paths {
        let path = PathBuf::from(raw_path.trim().trim_matches('"'));
        let (mut session, info) = open_session(&path)?;

        if let Some(asset) = &expected_asset {
            if asset != &info.asset {
                return Err("Os arquivos de aquecimento pertencem a ativos diferentes.".to_string());
            }
        } else {
            expected_asset = Some(info.asset.clone());
        }

        if let Some(format) = expected_format {
            if format != session.format {
                return Err("Não misture arquivos de aquecimento de negócios tick a tick e candles M2.".to_string());
            }
        } else {
            expected_format = Some(session.format);
        }

        if let Some(symbol) = &expected_symbol {
            if symbol != &info.symbol {
                return Err(format!(
                    "Os arquivos de aquecimento misturam contratos diferentes ({symbol} e {}).",
                    info.symbol
                ));
            }
        } else {
            expected_symbol = Some(info.symbol.clone());
        }

        loop {
            let mut line = String::new();
            let read = session
                .reader
                .read_line(&mut line)
                .map_err(|error| error.to_string())?;
            if read == 0 {
                break;
            }
            if line.trim().is_empty() {
                continue;
            }

            match session.format {
                ReplayFormat::Ticks => {
                    let trade = parse_replay_line(&line, &session.asset, 0)?;
                    let timestamp = parse_replay_timestamp(&trade.timestamp)?;
                    if let Some(previous) = previous_timestamp {
                        if timestamp < previous {
                            return Err("Os arquivos de aquecimento não estão em ordem cronológica. Ordene-os do pregão mais antigo para o mais recente.".to_string());
                        }
                    }
                    previous_timestamp = Some(timestamp);
                    push_warmup_trade(&mut candles, timestamp, trade.price, trade.quantity, timeframe_minutes)?;
                    if candles.len() > max_bars { candles.pop_front(); }
                }
                ReplayFormat::CandlesM2 => {
                    if timeframe_minutes != 2 {
                        return Err("O aquecimento baseado em OHLC precisa usar candles M2.".to_string());
                    }
                    let candle = parse_replay_candle_line(&line, &session.asset)?;
                    let timestamp = parse_replay_timestamp(&candle.timestamp)?;
                    if let Some(previous) = previous_timestamp {
                        if timestamp <= previous {
                            return Err("Os arquivos M2 de aquecimento precisam ter candles únicos e em ordem cronológica.".to_string());
                        }
                    }
                    previous_timestamp = Some(timestamp);
                    candles.push_back(WarmupCandleRecord {
                        index: candles.len(),
                        timestamp: candle.timestamp,
                        open: candle.open,
                        high: candle.high,
                        low: candle.low,
                        close: candle.close,
                        volume: candle.volume,
                    });
                    if candles.len() > max_bars { candles.pop_front(); }
                }
            }
        }
    }

    let mut candles: Vec<WarmupCandleRecord> = candles.into_iter().collect();
    for (index, candle) in candles.iter_mut().enumerate() {
        candle.index = index;
    }

    Ok(candles)
}

#[tauri::command]
pub async fn load_warmup_candles(
    source_paths: Vec<String>,
    timeframe_minutes: u32,
    max_bars: usize,
) -> Result<Vec<WarmupCandleRecord>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        process_warmup_candles(source_paths, timeframe_minutes, max_bars)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn normalize_hhmm(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.len() < 5 {
        return None;
    }
    Some(trimmed.chars().take(5).collect())
}

#[tauri::command]
pub fn open_replay_file(
    state: tauri::State<'_, ReplayState>,
    source_path: String,
    expected_start: Option<String>,
    expected_end: Option<String>,
) -> Result<ReplaySessionInfo, String> {
    let path = PathBuf::from(source_path.trim().trim_matches('"'));
    // Um carregamento novo invalida a sessão anterior mesmo se o arquivo
    // selecionado falhar na abertura ou na validação do plano.
    let mut guard = state.0.lock().map_err(|error| error.to_string())?;
    *guard = None;
    let (session, info) = open_session(&path)?;

    if let (Some(expected_start), Some(expected_end)) = (expected_start, expected_end) {
        let actual_start = info
            .session_start
            .as_deref()
            .and_then(normalize_hhmm)
            .ok_or_else(|| {
                "O arquivo de replay não possui metadados suficientes para validar a janela da simulação."
                    .to_string()
            })?;
        let actual_end = info
            .session_end
            .as_deref()
            .and_then(normalize_hhmm)
            .ok_or_else(|| {
                "O arquivo de replay não possui metadados suficientes para validar a janela da simulação."
                    .to_string()
            })?;

        if actual_start != expected_start || actual_end != expected_end {
            return Err(format!(
                "Janela incompatível: o plano exige {}–{}, mas o arquivo foi tratado para {}–{}.",
                expected_start, expected_end, actual_start, actual_end
            ));
        }
    }

    *guard = Some(session);
    Ok(info)
}

fn rewind_session(session: &mut ReplaySession) -> Result<(), String> {
    session
        .reader
        .seek(SeekFrom::Start(session.data_start))
        .map_err(|error| error.to_string())?;
    session.sequence = 0;
    session.pending_synthetic.clear();
    session.finished = false;
    session.pending_error = None;
    session.last_timestamp = None;
    session.last_m2_candle_timestamp = None;
    Ok(())
}

fn stable_seed(value: &str) -> u64 {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in value.as_bytes() { hash ^= *byte as u64; hash = hash.wrapping_mul(0x100000001b3); }
    if hash == 0 { 0x9e3779b97f4a7c15 } else { hash }
}

fn next_random(state: &mut u64) -> u64 {
    let mut value = *state;
    value ^= value >> 12; value ^= value << 25; value ^= value >> 27;
    *state = value;
    value.wrapping_mul(0x2545f4914f6cdd1d)
}

fn random_unit(state: &mut u64) -> f64 {
    (next_random(state) >> 11) as f64 / ((1_u64 << 53) as f64)
}

fn tick_size(asset: &str) -> Result<f64, String> {
    match asset { "WINFUT" => Ok(5.0), "WDOFUT" => Ok(0.5), _ => Err(format!("Ativo não suportado: {asset}")) }
}

fn fill_random_bridge(
    prices: &mut [i64; 120], start_second: usize, end_second: usize,
    start_tick: i64, end_tick: i64, low_tick: i64, high_tick: i64, random: &mut u64,
) {
    let duration = end_second.saturating_sub(start_second);
    if duration == 0 { prices[start_second] = end_tick; return; }
    let range = (high_tick - low_tick).max(0) as f64;
    let noise_amplitude = (range * 0.055).clamp(0.0, 3.0);
    let mut cumulative_noise = 0.0;
    let mut noise_path = vec![0.0; duration + 1];
    for step in 1..duration {
        cumulative_noise += (random_unit(random) * 2.0 - 1.0) * noise_amplitude;
        noise_path[step] = cumulative_noise;
    }
    let total_noise = cumulative_noise;
    for step in 1..duration {
        let progress = step as f64 / duration as f64;
        let bridge_noise = noise_path[step] - total_noise * progress;
        let baseline = start_tick as f64 + (end_tick - start_tick) as f64 * progress;
        prices[start_second + step] = (baseline + bridge_noise).round().clamp(low_tick as f64, high_tick as f64) as i64;
    }
    prices[end_second] = end_tick;
}

fn expand_m2_candle(candle: &ReplayCandleRecord, asset: &str, sequence_start: u64) -> Result<VecDeque<ReplayTradeRecord>, String> {
    let tick = tick_size(asset)?;
    let to_tick = |price: f64| -> Result<i64, String> {
        let steps = price / tick;
        let rounded = steps.round();
        if (steps - rounded).abs() > 1e-7 {
            return Err(format!("Preço {price} fora do tick válido de {tick} para {asset}."));
        }
        Ok(rounded as i64)
    };
    let open_tick = to_tick(candle.open)?;
    let high_tick = to_tick(candle.high)?;
    let low_tick = to_tick(candle.low)?;
    let close_tick = to_tick(candle.close)?;
    let seed_text = format!(
        "{asset}|{}|{}|{}|{}|{}|{}|simulador-m2-path-v1",
        candle.timestamp, candle.open, candle.high, candle.low, candle.close, candle.volume
    );
    let mut random = stable_seed(&seed_text);
    let first_extreme_second = 18 + (next_random(&mut random) % 31) as usize;
    let second_extreme_second = 70 + (next_random(&mut random) % 31) as usize;
    let high_first = next_random(&mut random) % 2 == 0;
    let first_extreme = if high_first { high_tick } else { low_tick };
    let second_extreme = if high_first { low_tick } else { high_tick };
    let mut prices = [open_tick; 120];
    prices[0] = open_tick;
    let waypoints = [
        (0_usize, open_tick),
        (first_extreme_second, first_extreme),
        (second_extreme_second, second_extreme),
        (119_usize, close_tick),
    ];
    for pair in waypoints.windows(2) {
        fill_random_bridge(&mut prices, pair[0].0, pair[1].0, pair[0].1, pair[1].1, low_tick, high_tick, &mut random);
    }
    let start = parse_replay_timestamp(&candle.timestamp)?;
    let per_second_volume = candle.volume / 120.0;
    let mut events = VecDeque::with_capacity(120);
    for second in 0..120 {
        let timestamp = start + Duration::seconds(second as i64);
        events.push_back(ReplayTradeRecord {
            asset: asset.to_string(),
            timestamp: timestamp.format("%Y-%m-%dT%H:%M:%S").to_string(),
            source_row: candle.source_row,
            sequence: sequence_start + second as u64,
            price: prices[second] as f64 * tick,
            quantity: per_second_volume,
        });
    }
    Ok(events)
}

fn read_next_replay_batch(session: &mut ReplaySession, max_events: usize) -> Result<Vec<ReplayTradeRecord>, String> {
    if let Some(error) = session.pending_error.take() { return Err(error); }
    if session.finished && session.pending_synthetic.is_empty() { return Ok(Vec::new()); }
    let limit = max_events.clamp(1, 5000);
    let mut result = Vec::with_capacity(limit);
    while result.len() < limit {
        if let Some(event) = session.pending_synthetic.pop_front() {
            let timestamp = parse_replay_timestamp(&event.timestamp)?;
            if session.last_timestamp.is_some_and(|previous| timestamp < previous) {
                let error = format!(
                    "Replay fora de ordem cronológica: {} vem antes do negócio anterior.",
                    event.timestamp
                );
                if result.is_empty() { return Err(error); }
                session.pending_error = Some(error);
                break;
            }
            session.last_timestamp = Some(timestamp);
            result.push(event);
            continue;
        }
        let mut line = String::new();
        let read = session.reader.read_line(&mut line).map_err(|error| error.to_string())?;
        if read == 0 { session.finished = true; break; }
        if line.trim().is_empty() { continue; }
        let parsed: Result<(), String> = match session.format {
            ReplayFormat::Ticks => parse_replay_line(&line, &session.asset, session.sequence).map(|record| {
                session.sequence += 1;
                session.pending_synthetic.push_back(record);
            }),
            ReplayFormat::CandlesM2 => parse_replay_candle_line(&line, &session.asset).and_then(|candle| {
                let timestamp = parse_replay_timestamp(&candle.timestamp)?;
                if session.last_m2_candle_timestamp.is_some_and(|previous| timestamp <= previous) {
                    return Err(format!(
                        "Replay M2 com candles duplicados ou fora de ordem cronológica: {}.",
                        candle.timestamp
                    ));
                }
                let events = expand_m2_candle(&candle, &session.asset, session.sequence)?;
                session.sequence += 120;
                session.last_m2_candle_timestamp = Some(timestamp);
                session.pending_synthetic = events;
                Ok(())
            }),
        };
        if let Err(error) = parsed {
            if result.is_empty() { return Err(error); }
            session.pending_error = Some(error);
            break;
        }
    }
    Ok(result)
}

#[tauri::command]
pub fn next_replay_trades(
    state: tauri::State<'_, ReplayState>,
    max_events: usize,
) -> Result<Vec<ReplayTradeRecord>, String> {
    let mut guard = state.0.lock().map_err(|error| error.to_string())?;
    let session = guard
        .as_mut()
        .ok_or_else(|| "Nenhum arquivo de replay está aberto.".to_string())?;

    read_next_replay_batch(session, max_events)
}

#[tauri::command]
pub fn reset_replay_session(
    state: tauri::State<'_, ReplayState>,
) -> Result<ReplaySessionInfo, String> {
    let mut guard = state.0.lock().map_err(|error| error.to_string())?;
    let session = guard
        .as_mut()
        .ok_or_else(|| "Nenhum arquivo de replay está aberto.".to_string())?;

    rewind_session(session)?;

    Ok(ReplaySessionInfo {
        source_path: session.source_path.to_string_lossy().to_string(),
        symbol: session.symbol.clone(),
        asset: session.asset.clone(),
        finished: false,
        session_start: session.session_start.clone(),
        session_end: session.session_end.clone(),
        mode: if session.format == ReplayFormat::CandlesM2 { "CANDLES_M2_SYNTHETIC" } else { "TICK_LEGACY" }.to_string(),
        synthetic: session.format == ReplayFormat::CandlesM2,
        source_timeframe_minutes: if session.format == ReplayFormat::CandlesM2 { Some(2) } else { None },
    })
}

#[tauri::command]
pub fn close_replay_session(
    state: tauri::State<'_, ReplayState>,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|error| error.to_string())?;
    *guard = None;
    Ok(())
}

/// Abre uma leitura independente do arquivo completo para análise contrafactual.
#[tauri::command]
pub fn open_replay_analysis_file(
    state: tauri::State<'_, ReplayAnalysisState>,
    source_path: String,
) -> Result<ReplaySessionInfo, String> {
    let path = PathBuf::from(source_path.trim().trim_matches('"'));
    let mut guard = state.0.lock().map_err(|error| error.to_string())?;
    *guard = None;
    let (session, info) = open_session(&path)?;
    *guard = Some(session);
    Ok(info)
}

#[tauri::command]
pub fn next_replay_analysis_trades(
    state: tauri::State<'_, ReplayAnalysisState>,
    max_events: usize,
) -> Result<Vec<ReplayTradeRecord>, String> {
    let mut guard = state.0.lock().map_err(|error| error.to_string())?;
    let session = guard
        .as_mut()
        .ok_or_else(|| "Nenhum arquivo de análise pós-operação está aberto.".to_string())?;
    read_next_replay_batch(session, max_events)
}

#[tauri::command]
pub fn close_replay_analysis_file(
    state: tauri::State<'_, ReplayAnalysisState>,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|error| error.to_string())?;
    *guard = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_contracts_to_supported_asset_families() {
        assert_eq!(parse_asset("WINV26").unwrap(), "WINFUT");
        assert_eq!(parse_asset("WDOZ26").unwrap(), "WDOFUT");
        assert!(parse_asset("PETR4").is_err());
    }

    #[test]
    fn parses_canonical_replay_line() {
        let row = parse_replay_line(
            "WINV26,2026-10-07T09:00:00,431,130000,12\n",
            "WINFUT",
            8,
        )
        .unwrap();

        assert_eq!(row.sequence, 8);
        assert_eq!(row.source_row, 431);
        assert_eq!(row.price, 130000.0);
        assert_eq!(row.quantity, 12.0);
    }

    #[test]
    fn parses_fractional_market_timestamps_without_losing_precision() {
        let timestamp = parse_replay_timestamp("2026-10-07T09:00:00.123456789").unwrap();
        assert_eq!(timestamp.nanosecond(), 123_456_789);
    }

    #[test]
    fn accepts_timezone_suffix_without_shifting_market_wall_clock() {
        let utc = parse_replay_timestamp("2026-10-07T09:00:00Z").unwrap();
        let offset = parse_replay_timestamp("2026-10-07T09:00:00.125-03:00").unwrap();
        assert_eq!(utc.format("%Y-%m-%dT%H:%M:%S").to_string(), "2026-10-07T09:00:00");
        assert_eq!(offset.hour(), 9);
        assert_eq!(offset.minute(), 0);
        assert_eq!(offset.nanosecond(), 125_000_000);
    }

    #[test]
    fn rejects_invalid_tick_timestamp_before_replay() {
        let result = parse_replay_line(
            "WINV26,2026-02-30T09:00:00,1,130000,1",
            "WINFUT",
            0,
        );
        assert!(result.unwrap_err().contains("Timestamp inválido"));
    }

    #[test]
    fn validates_exact_replay_header() {
        assert!(validate_header("symbol,timestamp,source_row,price,quantity\n").is_ok());
        assert!(validate_header("timestamp,price\n").is_err());
    }

    #[test]
    fn normalize_hhmm_handles_multibyte_input_without_panicking() {
        assert_eq!(normalize_hhmm("09:00:00"), Some("09:00".to_string()));
        assert_eq!(normalize_hhmm("á9:00"), Some("á9:00".to_string()));
    }

    #[test]
    fn returns_valid_batch_before_reporting_following_invalid_line() {
        use std::io::Write;
        use std::time::{SystemTime, UNIX_EPOCH};

        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "simulador-trade-replay-{unique}.csv"
        ));

        {
            let mut file = File::create(&path).unwrap();
            writeln!(
                file,
                "symbol,timestamp,source_row,price,quantity"
            )
            .unwrap();
            writeln!(
                file,
                "WINV26,2026-10-07T09:00:00,1,130000,1"
            )
            .unwrap();
            writeln!(
                file,
                "WINV26,2026-10-07T09:00:01,2,130005,1"
            )
            .unwrap();
            writeln!(
                file,
                "WINV26,2026-10-07T09:00:02,3,0,1"
            )
            .unwrap();
            writeln!(
                file,
                "WINV26,2026-10-07T09:00:03,4,130010,1"
            )
            .unwrap();
        }

        let (mut session, _) = open_session(&path).unwrap();

        let first = read_next_replay_batch(&mut session, 5000).unwrap();
        assert_eq!(first.len(), 2);
        assert_eq!(first[0].sequence, 0);
        assert_eq!(first[1].sequence, 1);
        assert_eq!(first[1].price, 130005.0);

        let error = read_next_replay_batch(&mut session, 5000).unwrap_err();
        assert!(error.contains("Preço inválido"));

        let next = read_next_replay_batch(&mut session, 5000).unwrap();
        assert_eq!(next.len(), 1);
        assert_eq!(next[0].sequence, 2);
        assert_eq!(next[0].price, 130010.0);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn rejects_out_of_order_replay_events_without_reordering_the_stream() {
        use std::io::Write;
        use std::time::{SystemTime, UNIX_EPOCH};

        let unique = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let path = std::env::temp_dir().join(format!("simulador-trade-replay-order-{unique}.csv"));
        {
            let mut file = File::create(&path).unwrap();
            writeln!(file, "symbol,timestamp,source_row,price,quantity").unwrap();
            writeln!(file, "WINV26,2026-10-07T09:00:02,1,130000,1").unwrap();
            writeln!(file, "WINV26,2026-10-07T09:00:01,2,130005,1").unwrap();
            writeln!(file, "WINV26,2026-10-07T09:00:03,3,130010,1").unwrap();
        }

        let (mut session, _) = open_session(&path).unwrap();
        let first = read_next_replay_batch(&mut session, 5000).unwrap();
        assert_eq!(first.len(), 1);
        assert_eq!(first[0].timestamp, "2026-10-07T09:00:02");

        let error = read_next_replay_batch(&mut session, 5000).unwrap_err();
        assert!(error.contains("fora de ordem cronológica"));

        let remaining = read_next_replay_batch(&mut session, 5000).unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].timestamp, "2026-10-07T09:00:03");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn parses_valid_m2_ohlcv_row() {
        let candle = parse_replay_candle_line(
            "WINV26,2026-10-07T09:00:00,17,130000,130050,129950,130010,1200\n",
            "WINFUT",
        ).unwrap();
        assert_eq!(candle.timestamp, "2026-10-07T09:00:00");
        assert_eq!(candle.source_row, 17);
        assert_eq!(candle.open, 130000.0);
        assert_eq!(candle.high, 130050.0);
        assert_eq!(candle.low, 129950.0);
        assert_eq!(candle.close, 130010.0);
        assert_eq!(candle.volume, 1200.0);
    }

    #[test]
    fn rejects_m2_row_with_timestamp_off_two_minute_grid() {
        let result = parse_replay_candle_line(
            "WINV26,2026-10-07T09:01:00,17,130000,130050,129950,130010,1200\n",
            "WINFUT",
        );
        assert!(result.unwrap_err().contains("abertura de um candle M2"));
    }

    #[test]
    fn rejects_m2_row_with_inconsistent_high_low() {
        let result = parse_replay_candle_line(
            "WINV26,2026-10-07T09:00:00,17,130000,129900,130050,130010,1200\n",
            "WINFUT",
        );
        assert!(result.unwrap_err().contains("máxima/mínima incompatíveis"));
    }

    #[test]
    fn rejects_m2_prices_outside_the_asset_tick_size() {
        let invalid_win = parse_replay_candle_line(
            "WINV26,2026-10-07T09:00:00,17,130000,130052,129950,130010,1200\n",
            "WINFUT",
        );
        assert!(invalid_win.unwrap_err().contains("tick válido de 5"));

        let invalid_wdo = parse_replay_candle_line(
            "WDOV26,2026-10-07T09:00:00,17,5200.25,5202.0,5199.0,5201.5,1200\n",
            "WDOFUT",
        );
        assert!(invalid_wdo.unwrap_err().contains("tick válido de 0.5"));

        let valid_wdo = parse_replay_candle_line(
            "WDOV26,2026-10-07T09:00:00,17,5200.0,5202.0,5199.0,5201.5,1200\n",
            "WDOFUT",
        );
        assert!(valid_wdo.is_ok());
    }

    #[test]
    fn opens_m2_session_and_streams_120_synthetic_seconds() {
        use std::io::Write;
        use std::time::{SystemTime, UNIX_EPOCH};

        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("simulador-trade-m2-{unique}.csv"));
        {
            let mut file = File::create(&path).unwrap();
            writeln!(file, "symbol,timestamp,source_row,open,high,low,close,volume").unwrap();
            writeln!(file, "WINV26,2026-10-07T09:00:00,1,130000,130050,129950,130010,1200").unwrap();
        }

        let (mut session, info) = open_session(&path).unwrap();
        assert!(info.synthetic);
        assert_eq!(info.mode, "CANDLES_M2_SYNTHETIC");
        assert_eq!(info.source_timeframe_minutes, Some(2));

        let events = read_next_replay_batch(&mut session, 500).unwrap();
        assert_eq!(events.len(), 120);
        assert_eq!(events.first().unwrap().timestamp, "2026-10-07T09:00:00");
        assert_eq!(events.last().unwrap().timestamp, "2026-10-07T09:01:59");
        assert_eq!(events.first().unwrap().price, 130000.0);
        assert_eq!(events.last().unwrap().price, 130010.0);
        assert!(events.iter().all(|event| event.price >= 129950.0 && event.price <= 130050.0));
        assert!((events.iter().map(|event| event.quantity).sum::<f64>() - 1200.0).abs() < 1e-8);

        let end = read_next_replay_batch(&mut session, 500).unwrap();
        assert!(end.is_empty());
        assert!(session.finished);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn m2_replay_is_independent_of_batch_size_and_reset_rewinds_deterministically() {
        use std::io::Write;
        use std::time::{SystemTime, UNIX_EPOCH};

        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("simulador-trade-m2-batches-{unique}.csv"));
        {
            let mut file = File::create(&path).unwrap();
            writeln!(file, "symbol,timestamp,source_row,open,high,low,close,volume").unwrap();
            writeln!(file, "WINV26,2026-10-07T09:00:00,1,130000,130050,129950,130010,1200").unwrap();
            writeln!(file, "WINV26,2026-10-07T09:02:00,2,130010,130060,129990,130040,900").unwrap();
        }

        let (mut single_batch, _) = open_session(&path).unwrap();
        let expected = read_next_replay_batch(&mut single_batch, 5000).unwrap();
        assert_eq!(expected.len(), 240);

        let (mut chunked, _) = open_session(&path).unwrap();
        let mut actual = Vec::new();
        for size in [1, 7, 31, 2, 89, 13, 500] {
            let batch = read_next_replay_batch(&mut chunked, size).unwrap();
            if batch.is_empty() { break; }
            actual.extend(batch);
        }
        while !chunked.finished || !chunked.pending_synthetic.is_empty() {
            let batch = read_next_replay_batch(&mut chunked, 17).unwrap();
            if batch.is_empty() { break; }
            actual.extend(batch);
        }

        let project = |events: &[ReplayTradeRecord]| {
            events.iter().map(|event| (
                event.timestamp.clone(),
                event.source_row,
                event.sequence,
                event.price,
                event.quantity,
            )).collect::<Vec<_>>()
        };
        assert_eq!(project(&actual), project(&expected));

        rewind_session(&mut chunked).unwrap();
        let replayed = read_next_replay_batch(&mut chunked, 5000).unwrap();
        assert_eq!(project(&replayed), project(&expected));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn synthetic_m2_path_is_repeatable_and_stays_inside_source_ohlc() {
        let candle = ReplayCandleRecord {
            timestamp: "2026-10-07T09:00:00".to_string(),
            source_row: 7,
            open: 130000.0,
            high: 130050.0,
            low: 129950.0,
            close: 130010.0,
            volume: 1200.0,
        };
        let first = expand_m2_candle(&candle, "WINFUT", 100).unwrap();
        let second = expand_m2_candle(&candle, "WINFUT", 100).unwrap();
        assert_eq!(first.len(), 120);
        assert_eq!(first.front().unwrap().price, candle.open);
        assert_eq!(first.back().unwrap().price, candle.close);
        assert!((first.iter().map(|event| event.quantity).sum::<f64>() - candle.volume).abs() < 1e-8);
        assert_eq!(
            first.iter().map(|event| event.price).collect::<Vec<_>>(),
            second.iter().map(|event| event.price).collect::<Vec<_>>()
        );
        assert_eq!(first.iter().map(|event| event.price).fold(f64::MIN, f64::max), candle.high);
        assert_eq!(first.iter().map(|event| event.price).fold(f64::MAX, f64::min), candle.low);
        assert!(first.iter().enumerate().all(|(index, event)| event.sequence == 100 + index as u64));
    }

    #[test]
    fn synthetic_wdo_path_uses_half_point_ticks() {
        let candle = ReplayCandleRecord {
            timestamp: "2026-10-07T09:00:00".to_string(),
            source_row: 1,
            open: 5200.0,
            high: 5202.0,
            low: 5199.0,
            close: 5201.5,
            volume: 600.0,
        };
        let events = expand_m2_candle(&candle, "WDOFUT", 0).unwrap();
        assert_eq!(events.len(), 120);
        assert!(events.iter().all(|event| ((event.price / 0.5) - (event.price / 0.5).round()).abs() < 1e-8));
    }

    #[test]
    fn aggregates_warmup_trades_into_m2_candles() {
        let mut candles = Vec::new();
        push_warmup_trade(
            &mut candles,
            parse_replay_timestamp("2026-10-13T09:00:01").unwrap(),
            130000.0,
            2.0,
            2,
        )
        .unwrap();
        push_warmup_trade(
            &mut candles,
            parse_replay_timestamp("2026-10-13T09:01:59").unwrap(),
            130010.0,
            3.0,
            2,
        )
        .unwrap();
        push_warmup_trade(
            &mut candles,
            parse_replay_timestamp("2026-10-13T09:02:00").unwrap(),
            130005.0,
            1.0,
            2,
        )
        .unwrap();

        assert_eq!(candles.len(), 2);
        assert_eq!(candles[0].open, 130000.0);
        assert_eq!(candles[0].high, 130010.0);
        assert_eq!(candles[0].close, 130010.0);
        assert_eq!(candles[0].volume, 5.0);
        assert_eq!(candles[1].open, 130005.0);
    }

    #[test]
    fn rejects_duplicate_m2_candles_during_warmup() {
        use std::io::Write;
        use std::time::{SystemTime, UNIX_EPOCH};

        let unique = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let path = std::env::temp_dir().join(format!("simulador-trade-warmup-duplicate-m2-{unique}.csv"));
        {
            let mut file = File::create(&path).unwrap();
            writeln!(file, "symbol,timestamp,source_row,open,high,low,close,volume").unwrap();
            writeln!(file, "WINV26,2026-10-07T09:00:00,1,130000,130050,129950,130010,1200").unwrap();
            writeln!(file, "WINV26,2026-10-07T09:00:00,2,130010,130060,129990,130040,900").unwrap();
        }

        let result = process_warmup_candles(vec![path.to_string_lossy().to_string()], 2, 100);
        assert!(result.unwrap_err().contains("candles únicos"));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn rejects_duplicate_m2_candles_during_replay_without_rejecting_equal_tick_timestamps() {
        use std::io::Write;
        use std::time::{SystemTime, UNIX_EPOCH};

        let unique = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let m2_path = std::env::temp_dir().join(format!("simulador-trade-replay-duplicate-m2-{unique}.csv"));
        {
            let mut file = File::create(&m2_path).unwrap();
            writeln!(file, "symbol,timestamp,source_row,open,high,low,close,volume").unwrap();
            writeln!(file, "WINV26,2026-10-07T09:00:00,1,130000,130050,129950,130010,1200").unwrap();
            writeln!(file, "WINV26,2026-10-07T09:00:00,2,130010,130060,129990,130040,900").unwrap();
            writeln!(file, "WINV26,2026-10-07T09:02:00,3,130040,130070,130000,130050,800").unwrap();
        }

        let (mut m2_session, _) = open_session(&m2_path).unwrap();
        let first = read_next_replay_batch(&mut m2_session, 5000).unwrap();
        assert_eq!(first.len(), 120);
        assert!(read_next_replay_batch(&mut m2_session, 5000)
            .unwrap_err()
            .contains("candles duplicados"));
        let next = read_next_replay_batch(&mut m2_session, 5000).unwrap();
        assert_eq!(next.len(), 120);
        assert_eq!(next.first().unwrap().timestamp, "2026-10-07T09:02:00");

        let tick_path = std::env::temp_dir().join(format!("simulador-trade-replay-equal-ticks-{unique}.csv"));
        {
            let mut file = File::create(&tick_path).unwrap();
            writeln!(file, "symbol,timestamp,source_row,price,quantity").unwrap();
            writeln!(file, "WINV26,2026-10-07T09:00:00,1,130000,1").unwrap();
            writeln!(file, "WINV26,2026-10-07T09:00:00,2,130005,1").unwrap();
        }
        let (mut tick_session, _) = open_session(&tick_path).unwrap();
        let ticks = read_next_replay_batch(&mut tick_session, 5000).unwrap();
        assert_eq!(ticks.len(), 2);
        assert_eq!(ticks[0].timestamp, ticks[1].timestamp);

        let _ = std::fs::remove_file(m2_path);
        let _ = std::fs::remove_file(tick_path);
    }

    #[test]
    fn rejects_out_of_order_m2_candles_without_reordering_the_stream() {
        use std::io::Write;
        use std::time::{SystemTime, UNIX_EPOCH};

        let unique = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let path = std::env::temp_dir().join(format!("simulador-trade-m2-order-{unique}.csv"));
        {
            let mut file = File::create(&path).unwrap();
            writeln!(file, "symbol,timestamp,source_row,open,high,low,close,volume").unwrap();
            writeln!(file, "WINV26,2026-10-07T09:02:00,1,130000,130050,129950,130010,1200").unwrap();
            writeln!(file, "WINV26,2026-10-07T09:00:00,2,130010,130060,129990,130040,900").unwrap();
        }

        let (mut session, info) = open_session(&path).unwrap();
        assert!(info.synthetic);

        // O candle válido é entregue antes de o leitor alcançar a linha fora de ordem.
        let first = read_next_replay_batch(&mut session, 5000).unwrap();
        assert_eq!(first.len(), 120);
        assert_eq!(first.first().unwrap().timestamp, "2026-10-07T09:02:00");
        assert_eq!(first.last().unwrap().timestamp, "2026-10-07T09:03:59");

        let error = read_next_replay_batch(&mut session, 5000).unwrap_err();
        assert!(error.contains("fora de ordem cronológica"));

        // O reset deve limpar o timestamp anterior e o erro pendente.
        rewind_session(&mut session).unwrap();
        let replayed = read_next_replay_batch(&mut session, 5000).unwrap();
        assert_eq!(replayed.len(), 120);
        assert_eq!(replayed.first().unwrap().timestamp, "2026-10-07T09:02:00");
        assert!(read_next_replay_batch(&mut session, 5000)
            .unwrap_err()
            .contains("fora de ordem cronológica"));

        let _ = std::fs::remove_file(path);
    }

}
