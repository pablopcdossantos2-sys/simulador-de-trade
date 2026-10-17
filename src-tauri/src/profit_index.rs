use chrono::{NaiveDate, NaiveDateTime, NaiveTime};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs::{self, File, Metadata};
use std::io::{BufRead, BufReader, BufWriter, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::Emitter;

use super::{
    canonicalize_replay_file, csv_escape, decode_line, derived_paths, detect_delimiter,
    detect_layout, emit_progress, in_training_window, normalize_profit_number,
    parse_delimited_line, row_timestamp, validate_training_window, value_at, ProfitLayout,
    ProfitPreparationResult, TempFileGuard, REPLAY_HEADER,
};

const INDEX_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IndexedProfitLayout {
    has_header: bool,
    symbol_idx: Option<usize>,
    date_idx: Option<usize>,
    time_idx: Option<usize>,
    timestamp_idx: Option<usize>,
    price_idx: usize,
    quantity_idx: usize,
}

impl From<&ProfitLayout> for IndexedProfitLayout {
    fn from(value: &ProfitLayout) -> Self {
        Self {
            has_header: value.has_header,
            symbol_idx: value.symbol_idx,
            date_idx: value.date_idx,
            time_idx: value.time_idx,
            timestamp_idx: value.timestamp_idx,
            price_idx: value.price_idx,
            quantity_idx: value.quantity_idx,
        }
    }
}

impl From<&IndexedProfitLayout> for ProfitLayout {
    fn from(value: &IndexedProfitLayout) -> Self {
        Self {
            has_header: value.has_header,
            symbol_idx: value.symbol_idx,
            date_idx: value.date_idx,
            time_idx: value.time_idx,
            timestamp_idx: value.timestamp_idx,
            price_idx: value.price_idx,
            quantity_idx: value.quantity_idx,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfitMinuteIndexEntry {
    minute: String,
    first_timestamp: String,
    last_timestamp: String,
    first_line: u64,
    last_line: u64,
    start_byte: u64,
    end_byte_exclusive: u64,
    trades: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfitTimeIndex {
    schema_version: u32,
    source_path: String,
    source_bytes: u64,
    source_modified_unix_ms: u64,
    symbol: String,
    trade_date: String,
    source_order: String,
    delimiter: char,
    layout: IndexedProfitLayout,
    source_rows: u64,
    first_timestamp: String,
    last_timestamp: String,
    minutes: Vec<ProfitMinuteIndexEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfitIndexProgress {
    operation_id: String,
    percent: f64,
    bytes_processed: u64,
    bytes_total: u64,
    source_rows: u64,
    minute_buckets: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfitTimeIndexResult {
    source_path: String,
    index_path: String,
    symbol: String,
    trade_date: String,
    source_order: String,
    source_rows: u64,
    minute_buckets: usize,
    source_bytes: u64,
    first_timestamp: String,
    last_timestamp: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfitTimeWindowResult {
    source_path: String,
    index_path: String,
    symbol: String,
    trade_date: String,
    source_order: String,
    start_byte: u64,
    end_byte_exclusive: u64,
    first_line: u64,
    last_line: u64,
    selected_trades: u64,
    selected_minutes: usize,
}

#[derive(Debug, Clone)]
struct IndexedWindow {
    index_path: PathBuf,
    symbol: String,
    trade_date: NaiveDate,
    source_order: String,
    delimiter: char,
    layout: ProfitLayout,
    source_rows: u64,
    start_byte: u64,
    end_byte_exclusive: u64,
    first_line: u64,
    last_line: u64,
    selected_trades: u64,
    selected_minutes: usize,
}

fn index_path_for_source(source: &Path) -> Result<PathBuf, String> {
    if source.file_name().is_none() {
        return Err("Nome do arquivo do Profit inválido.".to_string());
    }
    Ok(source.with_extension("m1-index.json"))
}

fn modified_unix_ms(metadata: &Metadata) -> Result<u64, String> {
    let modified = metadata.modified().map_err(|error| error.to_string())?;
    let duration = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?;
    Ok(duration.as_millis().min(u64::MAX as u128) as u64)
}

fn emit_index_progress(
    app: &tauri::AppHandle,
    operation_id: &str,
    bytes_processed: u64,
    bytes_total: u64,
    source_rows: u64,
    minute_buckets: usize,
) {
    let percent = if bytes_total == 0 {
        100.0
    } else {
        (bytes_processed as f64 / bytes_total as f64 * 100.0).min(100.0)
    };

    let _ = app.emit(
        "profit-index-progress",
        ProfitIndexProgress {
            operation_id: operation_id.to_string(),
            percent,
            bytes_processed,
            bytes_total,
            source_rows,
            minute_buckets,
        },
    );
}

fn validate_source_path(source_path: &str) -> Result<PathBuf, String> {
    let source = PathBuf::from(source_path.trim().trim_matches('"'));
    if !source.exists() || !source.is_file() {
        return Err("Arquivo do Profit não encontrado.".to_string());
    }
    if source
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        != Some("csv".to_string())
    {
        return Err("O arquivo bruto do Profit precisa possuir extensão .csv.".to_string());
    }
    Ok(source)
}

fn required_column_max(layout: &ProfitLayout) -> usize {
    [
        layout.symbol_idx,
        layout.date_idx,
        layout.time_idx,
        layout.timestamp_idx,
        Some(layout.price_idx),
        Some(layout.quantity_idx),
    ]
    .into_iter()
    .flatten()
    .max()
    .unwrap_or(0)
}

fn validate_numeric_fields(
    fields: &[String],
    layout: &ProfitLayout,
    physical_line: u64,
) -> Result<(), String> {
    let price = normalize_profit_number(&fields[layout.price_idx])
        .map_err(|error| format!("Linha {physical_line}: preço {error}"))?;
    let quantity = normalize_profit_number(&fields[layout.quantity_idx])
        .map_err(|error| format!("Linha {physical_line}: quantidade {error}"))?;

    let price_value = price
        .parse::<f64>()
        .map_err(|_| format!("Linha {physical_line}: preço inválido"))?;
    let quantity_value = quantity
        .parse::<f64>()
        .map_err(|_| format!("Linha {physical_line}: quantidade inválida"))?;

    if price_value <= 0.0 {
        return Err(format!(
            "Linha {physical_line}: preço precisa ser maior que zero."
        ));
    }
    if quantity_value <= 0.0 {
        return Err(format!(
            "Linha {physical_line}: quantidade precisa ser maior que zero."
        ));
    }
    Ok(())
}

fn process_profit_time_index(
    app: &tauri::AppHandle,
    operation_id: &str,
    source_path: &str,
) -> Result<ProfitTimeIndexResult, String> {
    let source = validate_source_path(source_path)?;
    let metadata = fs::metadata(&source).map_err(|error| error.to_string())?;
    let source_bytes = metadata.len();
    let source_modified_unix_ms = modified_unix_ms(&metadata)?;

    let input = File::open(&source).map_err(|error| error.to_string())?;
    let mut reader = BufReader::with_capacity(8 * 1024 * 1024, input);

    let mut layout: Option<ProfitLayout> = None;
    let mut delimiter = ',';
    let mut physical_line = 0_u64;
    let mut source_rows = 0_u64;
    let mut bytes_processed = 0_u64;
    let mut last_emitted_bytes = 0_u64;
    let mut symbol = String::new();
    let mut source_trade_date: Option<NaiveDate> = None;
    let mut previous_ts: Option<NaiveDateTime> = None;
    let mut ascending_steps = 0_u64;
    let mut descending_steps = 0_u64;
    let mut first_timestamp: Option<NaiveDateTime> = None;
    let mut last_timestamp: Option<NaiveDateTime> = None;
    let mut minutes: Vec<ProfitMinuteIndexEntry> = Vec::new();

    loop {
        let line_start_byte = bytes_processed;
        let mut raw = Vec::new();
        let read = reader
            .read_until(b'\n', &mut raw)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }

        physical_line += 1;
        bytes_processed += read as u64;
        let line = decode_line(&raw);
        if line.trim().is_empty() {
            continue;
        }

        if layout.is_none() {
            delimiter = detect_delimiter(&line);
            let first_fields = parse_delimited_line(&line, delimiter);
            let detected = detect_layout(&first_fields)?;
            let header = detected.has_header;
            layout = Some(detected);
            if header {
                continue;
            }
        }

        let current_layout = layout.as_ref().expect("layout initialized");
        let fields = parse_delimited_line(&line, delimiter);
        if fields.len() <= required_column_max(current_layout) {
            return Err(format!(
                "Linha {physical_line}: quantidade de colunas menor que a esperada para o layout detectado."
            ));
        }

        source_rows += 1;
        let timestamp = row_timestamp(&fields, current_layout)
            .map_err(|error| format!("Linha {physical_line}: {error}"))?;

        match source_trade_date {
            Some(date) if date != timestamp.date() => {
                return Err(format!(
                    "Linha {physical_line}: o arquivo contém mais de um pregão ({} e {}). Indexe um dia por arquivo.",
                    date,
                    timestamp.date()
                ));
            }
            None => source_trade_date = Some(timestamp.date()),
            _ => {}
        }

        if let Some(previous) = previous_ts {
            if timestamp > previous {
                ascending_steps += 1;
            } else if timestamp < previous {
                descending_steps += 1;
            }
        }
        previous_ts = Some(timestamp);

        let row_symbol = value_at(&fields, current_layout.symbol_idx).to_uppercase();
        if row_symbol.is_empty() {
            return Err(format!("Linha {physical_line}: ativo/símbolo vazio."));
        }
        if symbol.is_empty() {
            symbol = row_symbol.clone();
        } else if row_symbol != symbol {
            return Err(format!(
                "Linha {physical_line}: o arquivo contém mais de um ativo ({symbol} e {row_symbol})."
            ));
        }

        validate_numeric_fields(&fields, current_layout, physical_line)?;

        first_timestamp = Some(match first_timestamp {
            Some(current) => current.min(timestamp),
            None => timestamp,
        });
        last_timestamp = Some(match last_timestamp {
            Some(current) => current.max(timestamp),
            None => timestamp,
        });

        let minute = timestamp.format("%Y-%m-%dT%H:%M").to_string();
        let timestamp_text = timestamp.format("%Y-%m-%dT%H:%M:%S%.f").to_string();

        if let Some(last) = minutes.last_mut() {
            if last.minute == minute {
                if timestamp_text < last.first_timestamp {
                    last.first_timestamp = timestamp_text.clone();
                }
                if timestamp_text > last.last_timestamp {
                    last.last_timestamp = timestamp_text;
                }
                last.last_line = physical_line;
                last.end_byte_exclusive = bytes_processed;
                last.trades += 1;
            } else {
                minutes.push(ProfitMinuteIndexEntry {
                    minute,
                    first_timestamp: timestamp_text.clone(),
                    last_timestamp: timestamp_text,
                    first_line: physical_line,
                    last_line: physical_line,
                    start_byte: line_start_byte,
                    end_byte_exclusive: bytes_processed,
                    trades: 1,
                });
            }
        } else {
            minutes.push(ProfitMinuteIndexEntry {
                minute,
                first_timestamp: timestamp_text.clone(),
                last_timestamp: timestamp_text,
                first_line: physical_line,
                last_line: physical_line,
                start_byte: line_start_byte,
                end_byte_exclusive: bytes_processed,
                trades: 1,
            });
        }

        if bytes_processed.saturating_sub(last_emitted_bytes) >= 8 * 1024 * 1024 {
            emit_index_progress(
                app,
                operation_id,
                bytes_processed,
                source_bytes,
                source_rows,
                minutes.len(),
            );
            last_emitted_bytes = bytes_processed;
        }
    }

    if source_rows == 0 {
        return Err("Nenhum negócio foi encontrado no arquivo.".to_string());
    }

    let source_order = if ascending_steps > 0 && descending_steps == 0 {
        "ASCENDING"
    } else if descending_steps > 0 && ascending_steps == 0 {
        "DESCENDING"
    } else if ascending_steps == 0 && descending_steps == 0 {
        "ASCENDING"
    } else {
        "UNKNOWN"
    }
    .to_string();

    if source_order == "UNKNOWN" {
        return Err(
            "A ordem temporal do arquivo é mista. O índice M1 exige fonte cronologicamente ascendente ou descendente."
                .to_string(),
        );
    }

    let layout = layout.ok_or_else(|| "Não foi possível detectar o layout do Profit.".to_string())?;
    let trade_date = source_trade_date
        .ok_or_else(|| "Não foi possível identificar a data do pregão.".to_string())?;
    let first_timestamp = first_timestamp
        .ok_or_else(|| "Não foi possível identificar o primeiro timestamp.".to_string())?;
    let last_timestamp = last_timestamp
        .ok_or_else(|| "Não foi possível identificar o último timestamp.".to_string())?;

    let index = ProfitTimeIndex {
        schema_version: INDEX_SCHEMA_VERSION,
        source_path: source.to_string_lossy().to_string(),
        source_bytes,
        source_modified_unix_ms,
        symbol: symbol.clone(),
        trade_date: trade_date.format("%Y-%m-%d").to_string(),
        source_order: source_order.clone(),
        delimiter,
        layout: IndexedProfitLayout::from(&layout),
        source_rows,
        first_timestamp: first_timestamp.format("%Y-%m-%dT%H:%M:%S%.f").to_string(),
        last_timestamp: last_timestamp.format("%Y-%m-%dT%H:%M:%S%.f").to_string(),
        minutes,
    };

    let index_path = index_path_for_source(&source)?;
    let temp_path = index_path.with_extension("m1-index.tmp");
    let raw = serde_json::to_string_pretty(&index).map_err(|error| error.to_string())?;
    fs::write(&temp_path, raw).map_err(|error| error.to_string())?;

    if index_path.exists() {
        fs::remove_file(&index_path).map_err(|error| {
            let _ = fs::remove_file(&temp_path);
            error.to_string()
        })?;
    }
    fs::rename(&temp_path, &index_path).map_err(|error| error.to_string())?;

    emit_index_progress(
        app,
        operation_id,
        source_bytes,
        source_bytes,
        source_rows,
        index.minutes.len(),
    );

    Ok(ProfitTimeIndexResult {
        source_path: source.to_string_lossy().to_string(),
        index_path: index_path.to_string_lossy().to_string(),
        symbol,
        trade_date: index.trade_date,
        source_order,
        source_rows,
        minute_buckets: index.minutes.len(),
        source_bytes,
        first_timestamp: index.first_timestamp,
        last_timestamp: index.last_timestamp,
    })
}

fn load_fresh_index(source: &Path) -> Result<Option<(PathBuf, ProfitTimeIndex)>, String> {
    let index_path = index_path_for_source(source)?;
    if !index_path.exists() {
        return Ok(None);
    }

    let metadata = fs::metadata(source).map_err(|error| error.to_string())?;
    let raw = match fs::read_to_string(&index_path) {
        Ok(raw) => raw,
        Err(_) => return Ok(None),
    };
    let index: ProfitTimeIndex = match serde_json::from_str(&raw) {
        Ok(index) => index,
        Err(_) => return Ok(None),
    };

    if index.schema_version != INDEX_SCHEMA_VERSION
        || index.source_bytes != metadata.len()
        || index.source_modified_unix_ms != modified_unix_ms(&metadata)?
        || index.source_path != source.to_string_lossy().as_ref()
    {
        return Ok(None);
    }

    Ok(Some((index_path, index)))
}

fn locate_window_from_index(
    index_path: PathBuf,
    index: &ProfitTimeIndex,
    start: NaiveTime,
    end: NaiveTime,
) -> Result<Option<IndexedWindow>, String> {
    let mut selected: Vec<&ProfitMinuteIndexEntry> = Vec::new();

    for entry in &index.minutes {
        let minute_timestamp = NaiveDateTime::parse_from_str(
            &format!("{}:00", entry.minute),
            "%Y-%m-%dT%H:%M:%S",
        )
        .map_err(|error| format!("Minuto inválido no índice M1: {error}"))?;

        if in_training_window(minute_timestamp.time(), start, end) {
            selected.push(entry);
        }
    }

    if selected.is_empty() {
        return Ok(None);
    }

    let start_byte = selected
        .iter()
        .map(|entry| entry.start_byte)
        .min()
        .unwrap_or(0);
    let end_byte_exclusive = selected
        .iter()
        .map(|entry| entry.end_byte_exclusive)
        .max()
        .unwrap_or(start_byte);
    let first_line = selected
        .iter()
        .map(|entry| entry.first_line)
        .min()
        .unwrap_or(1);
    let last_line = selected
        .iter()
        .map(|entry| entry.last_line)
        .max()
        .unwrap_or(first_line);
    let selected_trades = selected.iter().map(|entry| entry.trades).sum();

    let trade_date = NaiveDate::parse_from_str(&index.trade_date, "%Y-%m-%d")
        .map_err(|error| format!("Data inválida no índice M1: {error}"))?;

    Ok(Some(IndexedWindow {
        index_path,
        symbol: index.symbol.clone(),
        trade_date,
        source_order: index.source_order.clone(),
        delimiter: index.delimiter,
        layout: ProfitLayout::from(&index.layout),
        source_rows: index.source_rows,
        start_byte,
        end_byte_exclusive,
        first_line,
        last_line,
        selected_trades,
        selected_minutes: selected.len(),
    }))
}

fn locate_fresh_window(
    source: &Path,
    start: NaiveTime,
    end: NaiveTime,
) -> Result<Option<IndexedWindow>, String> {
    let Some((index_path, index)) = load_fresh_index(source)? else {
        return Ok(None);
    };
    locate_window_from_index(index_path, &index, start, end)
}

pub(super) fn try_process_indexed_profit_replay_file(
    app: &tauri::AppHandle,
    operation_id: &str,
    source_path: &str,
    session_start: &str,
    session_end: &str,
) -> Result<Option<ProfitPreparationResult>, String> {
    let source = validate_source_path(source_path)?;
    let (window_start, window_end) = validate_training_window(session_start, session_end)?;
    let Some(window) = locate_fresh_window(&source, window_start, window_end)? else {
        return Ok(None);
    };

    let source_bytes = fs::metadata(&source)
        .map_err(|error| error.to_string())?
        .len();
    let (output_path, metadata_path) = derived_paths(&source, window_start, window_end)?;
    let temp_path = output_path.with_extension("replay.tmp");
    let _temp_guard = TempFileGuard(temp_path.clone());

    let input = File::open(&source).map_err(|error| error.to_string())?;
    let mut reader = BufReader::with_capacity(8 * 1024 * 1024, input);
    reader
        .seek(SeekFrom::Start(window.start_byte))
        .map_err(|error| error.to_string())?;

    let output = File::create(&temp_path).map_err(|error| error.to_string())?;
    let mut writer = BufWriter::with_capacity(4 * 1024 * 1024, output);
    writer
        .write_all(REPLAY_HEADER)
        .map_err(|error| error.to_string())?;

    let mut logical_output_bytes = REPLAY_HEADER.len() as u64;
    let mut record_offsets: Vec<u64> = Vec::new();
    let mut physical_line = window.first_line.saturating_sub(1);
    let mut kept_rows = 0_u64;
    let mut scanned_rows = 0_u64;
    let mut bytes_processed = 0_u64;
    let mut last_emitted_bytes = 0_u64;
    let scan_bytes_total = window
        .end_byte_exclusive
        .saturating_sub(window.start_byte);
    let mut first_kept: Option<NaiveDateTime> = None;
    let mut last_kept: Option<NaiveDateTime> = None;

    while bytes_processed < scan_bytes_total {
        let mut raw = Vec::new();
        let read = reader
            .read_until(b'\n', &mut raw)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }

        physical_line += 1;
        bytes_processed = bytes_processed.saturating_add(read as u64);
        let line = decode_line(&raw);
        if line.trim().is_empty() {
            continue;
        }

        scanned_rows += 1;
        let fields = parse_delimited_line(&line, window.delimiter);
        if fields.len() <= required_column_max(&window.layout) {
            return Err(format!(
                "Linha {physical_line}: quantidade de colunas menor que a esperada pelo índice M1."
            ));
        }

        let timestamp = row_timestamp(&fields, &window.layout)
            .map_err(|error| format!("Linha {physical_line}: {error}"))?;
        if timestamp.date() != window.trade_date {
            return Err(format!(
                "Linha {physical_line}: a fonte mudou desde a indexação M1. Recrie o índice."
            ));
        }

        if !in_training_window(timestamp.time(), window_start, window_end) {
            continue;
        }

        let row_symbol = value_at(&fields, window.layout.symbol_idx).to_uppercase();
        if row_symbol != window.symbol {
            return Err(format!(
                "Linha {physical_line}: o ativo difere do índice M1. Recrie o índice."
            ));
        }

        let price = normalize_profit_number(&fields[window.layout.price_idx])
            .map_err(|error| format!("Linha {physical_line}: preço {error}"))?;
        let quantity = normalize_profit_number(&fields[window.layout.quantity_idx])
            .map_err(|error| format!("Linha {physical_line}: quantidade {error}"))?;

        let price_value = price
            .parse::<f64>()
            .map_err(|_| format!("Linha {physical_line}: preço inválido"))?;
        let quantity_value = quantity
            .parse::<f64>()
            .map_err(|_| format!("Linha {physical_line}: quantidade inválida"))?;
        if price_value <= 0.0 || quantity_value <= 0.0 {
            return Err(format!(
                "Linha {physical_line}: preço e quantidade precisam ser maiores que zero."
            ));
        }

        let canonical_timestamp = timestamp.format("%Y-%m-%dT%H:%M:%S%.f").to_string();
        let output_line = format!(
            "{},{},{},{},{}\n",
            csv_escape(&row_symbol),
            canonical_timestamp,
            physical_line,
            price,
            quantity
        );
        record_offsets.push(logical_output_bytes);
        writer
            .write_all(output_line.as_bytes())
            .map_err(|error| error.to_string())?;
        logical_output_bytes += output_line.len() as u64;
        kept_rows += 1;

        first_kept = Some(match first_kept {
            Some(current) => current.min(timestamp),
            None => timestamp,
        });
        last_kept = Some(match last_kept {
            Some(current) => current.max(timestamp),
            None => timestamp,
        });

        if bytes_processed.saturating_sub(last_emitted_bytes) >= 8 * 1024 * 1024 {
            emit_progress(
                app,
                operation_id,
                bytes_processed.min(scan_bytes_total),
                scan_bytes_total,
                scanned_rows,
                kept_rows,
            );
            last_emitted_bytes = bytes_processed;
        }
    }

    writer.flush().map_err(|error| error.to_string())?;
    drop(writer);

    if kept_rows == 0 {
        return Err(format!(
            "Nenhum negócio entre {} e {} foi encontrado no intervalo localizado pelo índice M1.",
            window_start.format("%H:%M"),
            window_end.format("%H:%M")
        ));
    }

    canonicalize_replay_file(
        &temp_path,
        &output_path,
        &record_offsets,
        &window.source_order,
    )?;

    let output_bytes = fs::metadata(&output_path)
        .map_err(|error| error.to_string())?
        .len();
    let reduction_pct = if source_bytes == 0 {
        0.0
    } else {
        ((1.0 - output_bytes as f64 / source_bytes as f64) * 100.0).max(0.0)
    };

    let result = ProfitPreparationResult {
        source_path: source.to_string_lossy().to_string(),
        output_path: output_path.to_string_lossy().to_string(),
        metadata_path: metadata_path.to_string_lossy().to_string(),
        symbol: window.symbol.clone(),
        source_order: window.source_order.clone(),
        source_rows: window.source_rows,
        kept_rows,
        discarded_rows: window.source_rows.saturating_sub(kept_rows),
        source_bytes,
        output_bytes,
        reduction_pct,
        first_timestamp: first_kept
            .map(|value| value.format("%Y-%m-%dT%H:%M:%S%.f").to_string()),
        last_timestamp: last_kept
            .map(|value| value.format("%Y-%m-%dT%H:%M:%S%.f").to_string()),
        session_start: window_start.format("%H:%M:%S").to_string(),
        session_end: window_end.format("%H:%M:%S").to_string(),
    };

    let metadata = json!({
        "schemaVersion": 1,
        "purpose": "Simulador de Trade — replay WINFUT/WDOFUT",
        "timezone": "America/Sao_Paulo",
        "window": {
            "startInclusive": result.session_start.clone(),
            "endExclusive": result.session_end.clone()
        },
        "fields": ["symbol", "timestamp", "source_row", "price", "quantity"],
        "sourceOrder": &result.source_order,
        "canonicalOrder": "ASCENDING",
        "selectionMode": "M1_INDEX_SEEK",
        "indexPath": window.index_path.to_string_lossy().to_string(),
        "indexedMinutes": window.selected_minutes,
        "indexedTrades": window.selected_trades,
        "sourceByteRange": {
            "start": window.start_byte,
            "endExclusive": window.end_byte_exclusive
        },
        "sourceLineRange": {
            "first": window.first_line,
            "last": window.last_line
        },
        "note": "O recorte foi localizado pelo índice temporal M1 e lido por seek direto no CSV bruto. source_row preserva a linha física original.",
        "summary": &result
    });

    fs::write(
        &metadata_path,
        serde_json::to_string_pretty(&metadata).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;

    emit_progress(
        app,
        operation_id,
        scan_bytes_total,
        scan_bytes_total,
        scanned_rows,
        kept_rows,
    );

    Ok(Some(result))
}

#[tauri::command]
pub async fn build_profit_time_index(
    app: tauri::AppHandle,
    operation_id: String,
    source_path: String,
) -> Result<ProfitTimeIndexResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        process_profit_time_index(&app, &operation_id, &source_path)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn locate_profit_time_window(
    source_path: String,
    session_start: String,
    session_end: String,
) -> Result<ProfitTimeWindowResult, String> {
    let source = validate_source_path(&source_path)?;
    let (start, end) = validate_training_window(&session_start, &session_end)?;
    let Some(window) = locate_fresh_window(&source, start, end)? else {
        return Err(
            "Nenhum índice M1 válido foi encontrado para este CSV. Crie ou atualize o índice primeiro."
                .to_string(),
        );
    };

    Ok(ProfitTimeWindowResult {
        source_path: source.to_string_lossy().to_string(),
        index_path: window.index_path.to_string_lossy().to_string(),
        symbol: window.symbol,
        trade_date: window.trade_date.format("%Y-%m-%d").to_string(),
        source_order: window.source_order,
        start_byte: window.start_byte,
        end_byte_exclusive: window.end_byte_exclusive,
        first_line: window.first_line,
        last_line: window.last_line,
        selected_trades: window.selected_trades,
        selected_minutes: window.selected_minutes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_root(label: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "simulador-trade-{label}-{unique}"
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn locates_only_requested_minutes_from_index() {
        let root = unique_root("index-window");
        let source = root.join("WINV26.csv");
        fs::write(&source, "dummy").unwrap();
        let source_metadata = fs::metadata(&source).unwrap();

        let index = ProfitTimeIndex {
            schema_version: INDEX_SCHEMA_VERSION,
            source_path: source.to_string_lossy().to_string(),
            source_bytes: source_metadata.len(),
            source_modified_unix_ms: modified_unix_ms(&source_metadata).unwrap(),
            symbol: "WINV26".to_string(),
            trade_date: "2026-10-14".to_string(),
            source_order: "ASCENDING".to_string(),
            delimiter: ';',
            layout: IndexedProfitLayout {
                has_header: false,
                symbol_idx: Some(0),
                date_idx: Some(1),
                time_idx: Some(2),
                timestamp_idx: None,
                price_idx: 4,
                quantity_idx: 5,
            },
            source_rows: 30,
            first_timestamp: "2026-10-14T08:59:00".to_string(),
            last_timestamp: "2026-10-14T09:02:59".to_string(),
            minutes: vec![
                ProfitMinuteIndexEntry {
                    minute: "2026-10-14T08:59".to_string(),
                    first_timestamp: "2026-10-14T08:59:00".to_string(),
                    last_timestamp: "2026-10-14T08:59:59".to_string(),
                    first_line: 1,
                    last_line: 10,
                    start_byte: 0,
                    end_byte_exclusive: 100,
                    trades: 10,
                },
                ProfitMinuteIndexEntry {
                    minute: "2026-10-14T09:00".to_string(),
                    first_timestamp: "2026-10-14T09:00:00".to_string(),
                    last_timestamp: "2026-10-14T09:00:59".to_string(),
                    first_line: 11,
                    last_line: 20,
                    start_byte: 100,
                    end_byte_exclusive: 200,
                    trades: 10,
                },
                ProfitMinuteIndexEntry {
                    minute: "2026-10-14T09:01".to_string(),
                    first_timestamp: "2026-10-14T09:01:00".to_string(),
                    last_timestamp: "2026-10-14T09:01:59".to_string(),
                    first_line: 21,
                    last_line: 30,
                    start_byte: 200,
                    end_byte_exclusive: 300,
                    trades: 10,
                },
            ],
        };

        let window = locate_window_from_index(
            index_path_for_source(&source).unwrap(),
            &index,
            NaiveTime::from_hms_opt(9, 0, 0).unwrap(),
            NaiveTime::from_hms_opt(9, 2, 0).unwrap(),
        )
        .unwrap()
        .unwrap();

        assert_eq!(window.start_byte, 100);
        assert_eq!(window.end_byte_exclusive, 300);
        assert_eq!(window.first_line, 11);
        assert_eq!(window.last_line, 30);
        assert_eq!(window.selected_trades, 20);
        assert_eq!(window.selected_minutes, 2);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn stale_index_is_rejected_when_source_size_changes() {
        let root = unique_root("stale-index");
        let source = root.join("WINV26.csv");
        fs::write(&source, "a").unwrap();
        let metadata = fs::metadata(&source).unwrap();
        let index_path = index_path_for_source(&source).unwrap();

        let index = ProfitTimeIndex {
            schema_version: INDEX_SCHEMA_VERSION,
            source_path: source.to_string_lossy().to_string(),
            source_bytes: metadata.len(),
            source_modified_unix_ms: modified_unix_ms(&metadata).unwrap(),
            symbol: "WINV26".to_string(),
            trade_date: "2026-10-14".to_string(),
            source_order: "ASCENDING".to_string(),
            delimiter: ';',
            layout: IndexedProfitLayout {
                has_header: false,
                symbol_idx: Some(0),
                date_idx: Some(1),
                time_idx: Some(2),
                timestamp_idx: None,
                price_idx: 4,
                quantity_idx: 5,
            },
            source_rows: 1,
            first_timestamp: "2026-10-14T09:00:00".to_string(),
            last_timestamp: "2026-10-14T09:00:00".to_string(),
            minutes: Vec::new(),
        };
        fs::write(&index_path, serde_json::to_string(&index).unwrap()).unwrap();

        fs::write(&source, "larger").unwrap();
        assert!(load_fresh_index(&source).unwrap().is_none());

        let _ = fs::remove_dir_all(root);
    }
}
