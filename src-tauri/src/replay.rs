use chrono::{NaiveDateTime, NaiveTime, Timelike};
use serde::Serialize;
use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct ReplayState(pub Mutex<Option<ReplaySession>>);

pub struct ReplaySession {
    reader: BufReader<File>,
    source_path: PathBuf,
    data_start: u64,
    symbol: String,
    asset: String,
    sequence: u64,
    finished: bool,
    session_start: Option<String>,
    session_end: Option<String>,
    pending_error: Option<String>,
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
        timestamp: fields[1].trim().to_string(),
        source_row,
        sequence,
        price,
        quantity,
    })
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
    if !path.exists() || !path.is_file() {
        return Err("Arquivo de replay não encontrado.".to_string());
    }

    let file = File::open(path).map_err(|error| error.to_string())?;
    let mut reader = BufReader::with_capacity(4 * 1024 * 1024, file);

    let mut header = String::new();
    reader
        .read_line(&mut header)
        .map_err(|error| error.to_string())?;
    validate_header(&header)?;
    let data_start = reader.stream_position().map_err(|error| error.to_string())?;

    let first_line = loop {
        let mut candidate = String::new();
        let read = reader
            .read_line(&mut candidate)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            return Err("O arquivo de replay não possui negócios.".to_string());
        }
        if candidate.trim().is_empty() {
            continue;
        }
        break candidate;
    };

    let first_fields: Vec<&str> = first_line.trim_end_matches(|ch| ch == '\r' || ch == '\n').split(',').collect();
    if first_fields.len() != 5 {
        return Err("Primeira linha de replay inválida.".to_string());
    }

    let symbol = first_fields[0].trim().to_string();
    let asset = parse_asset(&symbol)?.to_string();
    parse_replay_line(&first_line, &asset, 0)?;

    reader
        .seek(SeekFrom::Start(data_start))
        .map_err(|error| error.to_string())?;

    let (session_start, session_end) = read_replay_window(path);

    let info = ReplaySessionInfo {
        source_path: path.to_string_lossy().to_string(),
        symbol: symbol.clone(),
        asset: asset.clone(),
        finished: false,
        session_start: session_start.clone(),
        session_end: session_end.clone(),
    };

    Ok((
        ReplaySession {
            reader,
            source_path: path.to_path_buf(),
            data_start,
            symbol,
            asset,
            sequence: 0,
            finished: false,
            session_start,
            session_end,
            pending_error: None,
        },
        info,
    ))
}


fn parse_replay_timestamp(raw: &str) -> Result<NaiveDateTime, String> {
    for format in [
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S",
    ] {
        if let Ok(value) = NaiveDateTime::parse_from_str(raw.trim(), format) {
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
    candles: &mut Vec<WarmupCandleRecord>,
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
    candles.push(WarmupCandleRecord {
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

    let mut candles: Vec<WarmupCandleRecord> = Vec::new();
    let mut expected_asset: Option<String> = None;
    let mut expected_symbol: Option<String> = None;
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

            let trade = parse_replay_line(&line, &session.asset, 0)?;
            let timestamp = parse_replay_timestamp(&trade.timestamp)?;

            if let Some(previous) = previous_timestamp {
                if timestamp < previous {
                    return Err(
                        "Os arquivos de aquecimento não estão em ordem cronológica. Ordene-os do pregão mais antigo para o mais recente."
                            .to_string(),
                    );
                }
            }
            previous_timestamp = Some(timestamp);

            push_warmup_trade(
                &mut candles,
                timestamp,
                trade.price,
                trade.quantity,
                timeframe_minutes,
            )?;
        }
    }

    if candles.len() > max_bars {
        let keep_from = candles.len() - max_bars;
        candles = candles.split_off(keep_from);
    }

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

    let mut guard = state.0.lock().map_err(|error| error.to_string())?;
    *guard = Some(session);
    Ok(info)
}

fn read_next_replay_batch(
    session: &mut ReplaySession,
    max_events: usize,
) -> Result<Vec<ReplayTradeRecord>, String> {
    if let Some(error) = session.pending_error.take() {
        return Err(error);
    }

    if session.finished {
        return Ok(Vec::new());
    }

    let limit = max_events.clamp(1, 5000);
    let mut result = Vec::with_capacity(limit);

    while result.len() < limit {
        let mut line = String::new();
        let read = session
            .reader
            .read_line(&mut line)
            .map_err(|error| error.to_string())?;

        if read == 0 {
            session.finished = true;
            break;
        }

        if line.trim().is_empty() {
            continue;
        }

        match parse_replay_line(&line, &session.asset, session.sequence) {
            Ok(record) => {
                session.sequence += 1;
                result.push(record);
            }
            Err(error) => {
                if result.is_empty() {
                    return Err(error);
                }

                session.pending_error = Some(error);
                break;
            }
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

    session
        .reader
        .seek(SeekFrom::Start(session.data_start))
        .map_err(|error| error.to_string())?;
    session.sequence = 0;
    session.finished = false;
    session.pending_error = None;

    Ok(ReplaySessionInfo {
        source_path: session.source_path.to_string_lossy().to_string(),
        symbol: session.symbol.clone(),
        asset: session.asset.clone(),
        finished: false,
        session_start: session.session_start.clone(),
        session_end: session.session_end.clone(),
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
}
