mod catalog;
mod replay;

use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime};
use encoding_rs::WINDOWS_1252;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, BufWriter, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use replay::ReplayState;

struct DbState(Mutex<Connection>);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TradeRecord {
    id: String,
    asset: String,
    side: String,
    signal_id: String,
    entry: f64,
    stop_loss: f64,
    target: f64,
    contracts: i64,
    opened_at: String,
    status: String,
    exit_price: f64,
    exit_reason: String,
    closed_at: String,
    result_points: f64,
    #[serde(rename = "grossResultBRL")]
    gross_result_brl: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrainingSessionRecord {
    id: String,
    asset: String,
    trade_date: String,
    start_time: String,
    end_time: String,
    timeframe_minutes: i64,
    warmup_bars: i64,
    started_at: String,
    ended_at: Option<String>,
    status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrainingEventRecord {
    id: String,
    session_id: String,
    r#type: String,
    timestamp: String,
    market_timestamp: Option<String>,
    signal_id: Option<String>,
    side: Option<String>,
    reason: Option<String>,
    trade_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProfitPreparationProgress {
    percent: f64,
    bytes_processed: u64,
    bytes_total: u64,
    source_rows: u64,
    kept_rows: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProfitPreparationResult {
    source_path: String,
    output_path: String,
    metadata_path: String,
    symbol: String,
    source_order: String,
    source_rows: u64,
    kept_rows: u64,
    discarded_rows: u64,
    source_bytes: u64,
    output_bytes: u64,
    reduction_pct: f64,
    first_timestamp: Option<String>,
    last_timestamp: Option<String>,
    session_start: String,
    session_end: String,
}

#[derive(Debug, Clone)]
struct ProfitLayout {
    has_header: bool,
    symbol_idx: Option<usize>,
    date_idx: Option<usize>,
    time_idx: Option<usize>,
    timestamp_idx: Option<usize>,
    price_idx: usize,
    quantity_idx: usize,
}

fn column_exists(
    connection: &Connection,
    table: &str,
    column: &str,
) -> rusqlite::Result<bool> {
    let mut statement =
        connection.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = statement.query_map([], |row| row.get::<_, String>(1))?;

    for row in rows {
        if row? == column {
            return Ok(true);
        }
    }

    Ok(false)
}

fn initialize_database(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;

            CREATE TABLE IF NOT EXISTS trades (
                id TEXT PRIMARY KEY NOT NULL,
                asset TEXT NOT NULL,
                side TEXT NOT NULL,
                signal_id TEXT NOT NULL,
                entry REAL NOT NULL,
                stop_loss REAL NOT NULL,
                target REAL NOT NULL,
                contracts INTEGER NOT NULL DEFAULT 1,
                opened_at TEXT NOT NULL,
                status TEXT NOT NULL,
                exit_price REAL NOT NULL,
                exit_reason TEXT NOT NULL,
                closed_at TEXT NOT NULL,
                result_points REAL NOT NULL,
                gross_result_brl REAL NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_trades_closed_at
            ON trades(closed_at DESC);

            CREATE TABLE IF NOT EXISTS training_sessions (
                id TEXT PRIMARY KEY NOT NULL,
                asset TEXT NOT NULL,
                trade_date TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                timeframe_minutes INTEGER NOT NULL,
                warmup_bars INTEGER NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                status TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_training_sessions_trade_date
            ON training_sessions(trade_date DESC, started_at DESC);

            CREATE TABLE IF NOT EXISTS training_events (
                id TEXT PRIMARY KEY NOT NULL,
                session_id TEXT NOT NULL,
                type TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                market_timestamp TEXT,
                signal_id TEXT,
                side TEXT,
                reason TEXT,
                trade_id TEXT,
                FOREIGN KEY(session_id) REFERENCES training_sessions(id)
            );

            CREATE INDEX IF NOT EXISTS idx_training_events_session
            ON training_events(session_id, timestamp ASC);
            "#,
        )?;

    if !column_exists(connection, "trades", "contracts")? {
        connection.execute(
            "ALTER TABLE trades ADD COLUMN contracts INTEGER NOT NULL DEFAULT 1",
            [],
        )?;
    }

    if !column_exists(connection, "trades", "gross_result_brl")? {
        connection.execute(
            "ALTER TABLE trades ADD COLUMN gross_result_brl REAL NOT NULL DEFAULT 0",
            [],
        )?;

        connection.execute(
            r#"
            UPDATE trades
            SET gross_result_brl =
                result_points *
                CASE
                    WHEN asset = 'WINFUT' THEN 0.2
                    WHEN asset = 'WDOFUT' THEN 10.0
                    ELSE 0.0
                END *
                contracts
            "#,
            [],
        )?;
    }

    Ok(())
}

#[tauri::command]
fn save_trade(state: tauri::State<'_, DbState>, trade: TradeRecord) -> Result<(), String> {
    let connection = state.0.lock().map_err(|error| error.to_string())?;

    connection
        .execute(
            r#"
            INSERT INTO trades (
                id, asset, side, signal_id, entry, stop_loss, target, contracts,
                opened_at, status, exit_price, exit_reason, closed_at, result_points,
                gross_result_brl
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
            ON CONFLICT(id) DO UPDATE SET
                asset = excluded.asset,
                side = excluded.side,
                signal_id = excluded.signal_id,
                entry = excluded.entry,
                stop_loss = excluded.stop_loss,
                target = excluded.target,
                contracts = excluded.contracts,
                opened_at = excluded.opened_at,
                status = excluded.status,
                exit_price = excluded.exit_price,
                exit_reason = excluded.exit_reason,
                closed_at = excluded.closed_at,
                result_points = excluded.result_points,
                gross_result_brl = excluded.gross_result_brl
            "#,
            params![
                trade.id,
                trade.asset,
                trade.side,
                trade.signal_id,
                trade.entry,
                trade.stop_loss,
                trade.target,
                trade.contracts,
                trade.opened_at,
                trade.status,
                trade.exit_price,
                trade.exit_reason,
                trade.closed_at,
                trade.result_points,
                trade.gross_result_brl,
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn save_training_session(
    state: tauri::State<'_, DbState>,
    session: TrainingSessionRecord,
) -> Result<(), String> {
    let connection = state.0.lock().map_err(|error| error.to_string())?;

    connection
        .execute(
            r#"
            INSERT INTO training_sessions (
                id, asset, trade_date, start_time, end_time,
                timeframe_minutes, warmup_bars, started_at, ended_at, status
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(id) DO UPDATE SET
                asset = excluded.asset,
                trade_date = excluded.trade_date,
                start_time = excluded.start_time,
                end_time = excluded.end_time,
                timeframe_minutes = excluded.timeframe_minutes,
                warmup_bars = excluded.warmup_bars,
                started_at = excluded.started_at,
                ended_at = excluded.ended_at,
                status = excluded.status
            "#,
            params![
                session.id,
                session.asset,
                session.trade_date,
                session.start_time,
                session.end_time,
                session.timeframe_minutes,
                session.warmup_bars,
                session.started_at,
                session.ended_at,
                session.status,
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn save_training_event(
    state: tauri::State<'_, DbState>,
    event: TrainingEventRecord,
) -> Result<(), String> {
    let connection = state.0.lock().map_err(|error| error.to_string())?;

    connection
        .execute(
            r#"
            INSERT INTO training_events (
                id, session_id, type, timestamp, market_timestamp,
                signal_id, side, reason, trade_id
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(id) DO UPDATE SET
                session_id = excluded.session_id,
                type = excluded.type,
                timestamp = excluded.timestamp,
                market_timestamp = excluded.market_timestamp,
                signal_id = excluded.signal_id,
                side = excluded.side,
                reason = excluded.reason,
                trade_id = excluded.trade_id
            "#,
            params![
                event.id,
                event.session_id,
                event.r#type,
                event.timestamp,
                event.market_timestamp,
                event.signal_id,
                event.side,
                event.reason,
                event.trade_id,
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn list_training_sessions(
    state: tauri::State<'_, DbState>,
) -> Result<Vec<TrainingSessionRecord>, String> {
    let connection = state.0.lock().map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT
                id, asset, trade_date, start_time, end_time,
                timeframe_minutes, warmup_bars, started_at, ended_at, status
            FROM training_sessions
            ORDER BY started_at DESC
            LIMIT 500
            "#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok(TrainingSessionRecord {
                id: row.get(0)?,
                asset: row.get(1)?,
                trade_date: row.get(2)?,
                start_time: row.get(3)?,
                end_time: row.get(4)?,
                timeframe_minutes: row.get(5)?,
                warmup_bars: row.get(6)?,
                started_at: row.get(7)?,
                ended_at: row.get(8)?,
                status: row.get(9)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_session_trades(
    state: tauri::State<'_, DbState>,
    session_id: String,
) -> Result<Vec<TradeRecord>, String> {
    let connection = state.0.lock().map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT DISTINCT
                t.id, t.asset, t.side, t.signal_id, t.entry, t.stop_loss, t.target,
                t.contracts, t.opened_at, t.status, t.exit_price, t.exit_reason,
                t.closed_at, t.result_points, t.gross_result_brl
            FROM trades t
            INNER JOIN training_events e
                ON e.trade_id = t.id
            WHERE e.session_id = ?1
              AND e.type = 'TRADE_CLOSED'
            ORDER BY t.closed_at ASC
            "#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([session_id], |row| {
            Ok(TradeRecord {
                id: row.get(0)?,
                asset: row.get(1)?,
                side: row.get(2)?,
                signal_id: row.get(3)?,
                entry: row.get(4)?,
                stop_loss: row.get(5)?,
                target: row.get(6)?,
                contracts: row.get(7)?,
                opened_at: row.get(8)?,
                status: row.get(9)?,
                exit_price: row.get(10)?,
                exit_reason: row.get(11)?,
                closed_at: row.get(12)?,
                result_points: row.get(13)?,
                gross_result_brl: row.get(14)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_training_events(
    state: tauri::State<'_, DbState>,
    session_id: String,
) -> Result<Vec<TrainingEventRecord>, String> {
    let connection = state.0.lock().map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT
                id, session_id, type, timestamp, market_timestamp,
                signal_id, side, reason, trade_id
            FROM training_events
            WHERE session_id = ?1
            ORDER BY timestamp ASC
            "#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([session_id], |row| {
            Ok(TrainingEventRecord {
                id: row.get(0)?,
                session_id: row.get(1)?,
                r#type: row.get(2)?,
                timestamp: row.get(3)?,
                market_timestamp: row.get(4)?,
                signal_id: row.get(5)?,
                side: row.get(6)?,
                reason: row.get(7)?,
                trade_id: row.get(8)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_trades(state: tauri::State<'_, DbState>) -> Result<Vec<TradeRecord>, String> {
    let connection = state.0.lock().map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT
                id, asset, side, signal_id, entry, stop_loss, target,
                contracts, opened_at, status, exit_price, exit_reason, closed_at,
                result_points, gross_result_brl
            FROM trades
            ORDER BY closed_at DESC
            LIMIT 500
            "#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok(TradeRecord {
                id: row.get(0)?,
                asset: row.get(1)?,
                side: row.get(2)?,
                signal_id: row.get(3)?,
                entry: row.get(4)?,
                stop_loss: row.get(5)?,
                target: row.get(6)?,
                contracts: row.get(7)?,
                opened_at: row.get(8)?,
                status: row.get(9)?,
                exit_price: row.get(10)?,
                exit_reason: row.get(11)?,
                closed_at: row.get(12)?,
                result_points: row.get(13)?,
                gross_result_brl: row.get(14)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn decode_line(bytes: &[u8]) -> String {
    let without_lf = bytes.strip_suffix(b"\n").unwrap_or(bytes);
    let trimmed = without_lf.strip_suffix(b"\r").unwrap_or(without_lf);

    if let Ok(text) = std::str::from_utf8(trimmed) {
        return text.trim_start_matches('\u{feff}').to_string();
    }

    let (decoded, _, _) = WINDOWS_1252.decode(trimmed);
    decoded.trim_start_matches('\u{feff}').to_string()
}

fn count_unquoted(line: &str, delimiter: char) -> usize {
    let mut quoted = false;
    let mut count = 0;
    let mut chars = line.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '"' {
            if quoted && chars.peek() == Some(&'"') {
                chars.next();
            } else {
                quoted = !quoted;
            }
        } else if ch == delimiter && !quoted {
            count += 1;
        }
    }

    count
}

fn detect_delimiter(line: &str) -> char {
    [',', ';', '\t']
        .into_iter()
        .max_by_key(|delimiter| count_unquoted(line, *delimiter))
        .unwrap_or(',')
}

fn parse_delimited_line(line: &str, delimiter: char) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    let mut chars = line.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '"' {
            if quoted && chars.peek() == Some(&'"') {
                current.push('"');
                chars.next();
            } else {
                quoted = !quoted;
            }
        } else if ch == delimiter && !quoted {
            fields.push(current.trim().to_string());
            current.clear();
        } else {
            current.push(ch);
        }
    }

    fields.push(current.trim().to_string());
    fields
}

fn normalize_header(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .chars()
        .map(|ch| match ch {
            'á' | 'à' | 'ã' | 'â' => 'a',
            'é' | 'ê' => 'e',
            'í' => 'i',
            'ó' | 'ô' | 'õ' => 'o',
            'ú' => 'u',
            'ç' => 'c',
            'º' | '°' => 'o',
            '_' => ' ',
            other => other,
        })
        .collect()
}

fn find_alias(fields: &[String], aliases: &[&str]) -> Option<usize> {
    let normalized_aliases: Vec<String> = aliases.iter().map(|value| normalize_header(value)).collect();
    fields.iter().position(|field| {
        let normalized = normalize_header(field);
        normalized_aliases.iter().any(|alias| alias == &normalized)
    })
}

fn detect_layout(fields: &[String]) -> Result<ProfitLayout, String> {
    let price_idx = find_alias(fields, &["preco", "preço", "price", "valor", "preco negocio"]);
    let quantity_idx = find_alias(fields, &["quantidade", "qtd", "quantity", "qty"]);
    let date_idx = find_alias(fields, &["data", "date"]);
    let time_idx = find_alias(fields, &["hora", "tempo", "time", "horario", "horário"]);
    let timestamp_idx = find_alias(fields, &["timestamp", "data hora", "datahora", "datetime"]);

    if let (Some(price_idx), Some(quantity_idx)) = (price_idx, quantity_idx) {
        if timestamp_idx.is_some() || (date_idx.is_some() && time_idx.is_some()) {
            return Ok(ProfitLayout {
                has_header: true,
                symbol_idx: find_alias(fields, &["ativo", "ticker", "symbol", "contrato"]),
                date_idx,
                time_idx,
                timestamp_idx,
                price_idx,
                quantity_idx,
            });
        }
    }

    match fields.len() {
        8 => Ok(ProfitLayout {
            has_header: false,
            symbol_idx: Some(0),
            date_idx: Some(1),
            time_idx: Some(2),
            timestamp_idx: None,
            price_idx: 4,
            quantity_idx: 5,
        }),
        9 => Ok(ProfitLayout {
            has_header: false,
            symbol_idx: Some(0),
            date_idx: Some(1),
            time_idx: Some(2),
            timestamp_idx: None,
            price_idx: 5,
            quantity_idx: 6,
        }),
        _ => Err(format!(
            "Layout do Profit não reconhecido. A primeira linha possui {} colunas; são aceitos layouts com cabeçalho ou os layouts conhecidos de 8/9 colunas.",
            fields.len()
        )),
    }
}

fn value_at<'a>(fields: &'a [String], idx: Option<usize>) -> &'a str {
    idx.and_then(|index| fields.get(index))
        .map(String::as_str)
        .unwrap_or("")
        .trim()
}

fn parse_date(raw: &str) -> Result<NaiveDate, String> {
    for format in ["%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d"] {
        if let Ok(value) = NaiveDate::parse_from_str(raw.trim(), format) {
            return Ok(value);
        }
    }
    Err(format!("Data não reconhecida: {raw}"))
}

fn parse_time(raw: &str) -> Result<NaiveTime, String> {
    for format in ["%H:%M:%S%.f", "%H:%M:%S", "%H:%M"] {
        if let Ok(value) = NaiveTime::parse_from_str(raw.trim(), format) {
            return Ok(value);
        }
    }
    Err(format!("Hora não reconhecida: {raw}"))
}

fn parse_combined_timestamp(raw: &str) -> Result<NaiveDateTime, String> {
    let text = raw.trim();

    if let Ok(value) = DateTime::parse_from_rfc3339(text) {
        return Ok(value.naive_local());
    }

    for format in [
        "%d/%m/%Y %H:%M:%S%.f",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%y %H:%M:%S%.f",
        "%d/%m/%y %H:%M:%S",
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%dT%H:%M:%S",
    ] {
        if let Ok(value) = NaiveDateTime::parse_from_str(text, format) {
            return Ok(value);
        }
    }

    Err(format!("Timestamp não reconhecido: {raw}"))
}

fn row_timestamp(fields: &[String], layout: &ProfitLayout) -> Result<NaiveDateTime, String> {
    if let Some(timestamp_idx) = layout.timestamp_idx {
        return parse_combined_timestamp(
            fields
                .get(timestamp_idx)
                .map(String::as_str)
                .unwrap_or_default(),
        );
    }

    let date = parse_date(value_at(fields, layout.date_idx))?;
    let time = parse_time(value_at(fields, layout.time_idx))?;
    Ok(NaiveDateTime::new(date, time))
}

fn is_grouped_thousands(text: &str) -> bool {
    let parts: Vec<&str> = text.split('.').collect();
    parts.len() > 1
        && !parts[0].is_empty()
        && parts[0].len() <= 3
        && parts.iter().skip(1).all(|part| part.len() == 3 && part.chars().all(|ch| ch.is_ascii_digit()))
}

fn normalize_profit_number(raw: &str) -> Result<String, String> {
    let mut text = raw.trim().replace(' ', "");
    if text.is_empty() {
        return Err("Número vazio".to_string());
    }

    if text.contains(',') && text.contains('.') {
        if text.rfind(',') > text.rfind('.') {
            text = text.replace('.', "").replace(',', ".");
        } else {
            text = text.replace(',', "");
        }
    } else if text.contains(',') {
        text = text.replace('.', "").replace(',', ".");
    } else if text.contains('.') && is_grouped_thousands(&text) {
        text = text.replace('.', "");
    }

    text.parse::<f64>()
        .map_err(|_| format!("Número inválido: {raw}"))?;

    Ok(text)
}

fn parse_window_time(raw: &str, label: &str) -> Result<NaiveTime, String> {
    for format in ["%H:%M:%S", "%H:%M"] {
        if let Ok(value) = NaiveTime::parse_from_str(raw.trim(), format) {
            return Ok(value);
        }
    }

    Err(format!("{label} inválido. Use HH:MM, por exemplo 09:00."))
}

fn validate_training_window(
    session_start: &str,
    session_end: &str,
) -> Result<(NaiveTime, NaiveTime), String> {
    let start = parse_window_time(session_start, "Horário inicial")?;
    let end = parse_window_time(session_end, "Horário final")?;

    if end <= start {
        return Err("O horário final precisa ser posterior ao horário inicial.".to_string());
    }

    Ok((start, end))
}

fn in_training_window(time: NaiveTime, start: NaiveTime, end: NaiveTime) -> bool {
    time >= start && time < end
}

fn csv_escape(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') || value.contains('\r') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

const REPLAY_HEADER: &[u8] = b"symbol,timestamp,source_row,price,quantity\n";

fn compact_time_label(time: NaiveTime) -> String {
    time.format("%H%M").to_string()
}

fn derived_paths(
    source: &Path,
    session_start: NaiveTime,
    session_end: NaiveTime,
) -> Result<(PathBuf, PathBuf), String> {
    let parent = source
        .parent()
        .ok_or_else(|| "Não foi possível identificar a pasta do arquivo.".to_string())?;
    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Nome de arquivo inválido.".to_string())?;

    let range = format!(
        "{}-{}",
        compact_time_label(session_start),
        compact_time_label(session_end)
    );

    Ok((
        parent.join(format!("{stem}_{range}.replay.csv")),
        parent.join(format!("{stem}_{range}.replay.meta.json")),
    ))
}

fn canonicalize_replay_file(
    temp_path: &Path,
    output_path: &Path,
    record_offsets: &[u64],
    source_order: &str,
) -> Result<(), String> {
    if output_path.exists() {
        fs::remove_file(output_path).map_err(|error| error.to_string())?;
    }

    match source_order {
        "ASCENDING" => {
            fs::rename(temp_path, output_path).map_err(|error| error.to_string())?;
        }
        "DESCENDING" => {
            let input = File::open(temp_path).map_err(|error| error.to_string())?;
            let mut reader = BufReader::with_capacity(4 * 1024 * 1024, input);
            let output = File::create(output_path).map_err(|error| error.to_string())?;
            let mut writer = BufWriter::with_capacity(4 * 1024 * 1024, output);
            writer
                .write_all(REPLAY_HEADER)
                .map_err(|error| error.to_string())?;

            for offset in record_offsets.iter().rev() {
                reader
                    .seek(SeekFrom::Start(*offset))
                    .map_err(|error| error.to_string())?;
                let mut line = String::new();
                reader
                    .read_line(&mut line)
                    .map_err(|error| error.to_string())?;
                writer
                    .write_all(line.as_bytes())
                    .map_err(|error| error.to_string())?;
            }

            writer.flush().map_err(|error| error.to_string())?;
            fs::remove_file(temp_path).map_err(|error| error.to_string())?;
        }
        _ => {
            let _ = fs::remove_file(temp_path);
            return Err(
                "A ordem temporal do arquivo do Profit é mista. O replay exige uma fonte cronologicamente ascendente ou descendente."
                    .to_string(),
            );
        }
    }

    Ok(())
}

fn emit_progress(
    app: &tauri::AppHandle,
    bytes_processed: u64,
    bytes_total: u64,
    source_rows: u64,
    kept_rows: u64,
) {
    let percent = if bytes_total == 0 {
        100.0
    } else {
        (bytes_processed as f64 / bytes_total as f64 * 100.0).min(100.0)
    };

    let _ = app.emit(
        "profit-preparation-progress",
        ProfitPreparationProgress {
            percent,
            bytes_processed,
            bytes_total,
            source_rows,
            kept_rows,
        },
    );
}

fn process_profit_replay_file(
    app: &tauri::AppHandle,
    source_path: &str,
    session_start: &str,
    session_end: &str,
) -> Result<ProfitPreparationResult, String> {
    let source = PathBuf::from(source_path.trim().trim_matches('"'));
    if !source.exists() || !source.is_file() {
        return Err("Arquivo do Profit não encontrado.".to_string());
    }
    if source.extension().and_then(|value| value.to_str()).map(|value| value.to_lowercase())
        != Some("csv".to_string())
    {
        return Err("O arquivo bruto do Profit precisa possuir extensão .csv.".to_string());
    }

    let (window_start, window_end) =
        validate_training_window(session_start, session_end)?;

    let source_bytes = fs::metadata(&source)
        .map_err(|error| error.to_string())?
        .len();
    let (output_path, metadata_path) =
        derived_paths(&source, window_start, window_end)?;
    let temp_path = output_path.with_extension("replay.tmp");

    let input = File::open(&source).map_err(|error| error.to_string())?;
    let mut reader = BufReader::with_capacity(8 * 1024 * 1024, input);
    let output = File::create(&temp_path).map_err(|error| error.to_string())?;
    let mut writer = BufWriter::with_capacity(4 * 1024 * 1024, output);

    writer
        .write_all(REPLAY_HEADER)
        .map_err(|error| error.to_string())?;
    let mut logical_output_bytes = REPLAY_HEADER.len() as u64;
    let mut record_offsets: Vec<u64> = Vec::new();

    let mut layout: Option<ProfitLayout> = None;
    let mut delimiter = ',';
    let mut physical_line = 0_u64;
    let mut source_rows = 0_u64;
    let mut kept_rows = 0_u64;
    let mut bytes_processed = 0_u64;
    let mut last_emitted_bytes = 0_u64;
    let mut symbol = String::new();

    let mut previous_ts: Option<NaiveDateTime> = None;
    let mut ascending_steps = 0_u64;
    let mut descending_steps = 0_u64;
    let mut first_kept: Option<NaiveDateTime> = None;
    let mut last_kept: Option<NaiveDateTime> = None;

    loop {
        let mut raw = Vec::new();
        let read = reader.read_until(b'\n', &mut raw).map_err(|error| error.to_string())?;
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

        let required_max = [
            current_layout.symbol_idx,
            current_layout.date_idx,
            current_layout.time_idx,
            current_layout.timestamp_idx,
            Some(current_layout.price_idx),
            Some(current_layout.quantity_idx),
        ]
        .into_iter()
        .flatten()
        .max()
        .unwrap_or(0);

        if fields.len() <= required_max {
            return Err(format!(
                "Linha {physical_line}: quantidade de colunas menor que a esperada para o layout detectado."
            ));
        }

        source_rows += 1;
        let timestamp = row_timestamp(&fields, current_layout)
            .map_err(|error| format!("Linha {physical_line}: {error}"))?;

        if let Some(previous) = previous_ts {
            if timestamp > previous {
                ascending_steps += 1;
            } else if timestamp < previous {
                descending_steps += 1;
            }
        }
        previous_ts = Some(timestamp);

        let row_symbol = value_at(&fields, current_layout.symbol_idx).to_uppercase();
        if symbol.is_empty() && !row_symbol.is_empty() {
            symbol = row_symbol.clone();
        } else if !row_symbol.is_empty() && !symbol.is_empty() && row_symbol != symbol {
            return Err(format!(
                "Linha {physical_line}: o arquivo contém mais de um ativo ({symbol} e {row_symbol})."
            ));
        }

        if in_training_window(timestamp.time(), window_start, window_end) {
            let price = normalize_profit_number(&fields[current_layout.price_idx])
                .map_err(|error| format!("Linha {physical_line}: preço {error}"))?;
            let quantity = normalize_profit_number(&fields[current_layout.quantity_idx])
                .map_err(|error| format!("Linha {physical_line}: quantidade {error}"))?;
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
        }

        if bytes_processed.saturating_sub(last_emitted_bytes) >= 8 * 1024 * 1024 {
            emit_progress(app, bytes_processed, source_bytes, source_rows, kept_rows);
            last_emitted_bytes = bytes_processed;
        }
    }

    writer.flush().map_err(|error| error.to_string())?;
    drop(writer);

    if source_rows == 0 {
        let _ = fs::remove_file(&temp_path);
        return Err("Nenhum negócio foi encontrado no arquivo.".to_string());
    }

    if kept_rows == 0 {
        let _ = fs::remove_file(&temp_path);
        return Err(
            format!(
                "Nenhum negócio entre {} e {} foi encontrado no arquivo informado.",
                window_start.format("%H:%M"),
                window_end.format("%H:%M")
            ),
        );
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

    canonicalize_replay_file(&temp_path, &output_path, &record_offsets, &source_order)?;

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
        symbol,
        source_order,
        source_rows,
        kept_rows,
        discarded_rows: source_rows.saturating_sub(kept_rows),
        source_bytes,
        output_bytes,
        reduction_pct,
        first_timestamp: first_kept.map(|value| value.format("%Y-%m-%dT%H:%M:%S%.f").to_string()),
        last_timestamp: last_kept.map(|value| value.format("%Y-%m-%dT%H:%M:%S%.f").to_string()),
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
        "note": "source_row preserva a posição física no CSV bruto; o .replay.csv é sempre gravado em ordem cronológica ascendente.",
        "summary": &result
    });

    fs::write(
        &metadata_path,
        serde_json::to_string_pretty(&metadata).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;

    emit_progress(app, source_bytes, source_bytes, source_rows, kept_rows);
    Ok(result)
}

#[tauri::command]
async fn prepare_profit_replay_file(
    app: tauri::AppHandle,
    source_path: String,
    session_start: String,
    session_end: String,
) -> Result<ProfitPreparationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        process_profit_replay_file(&app, &source_path, &session_start, &session_end)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configurable_training_window_is_start_inclusive_end_exclusive() {
        let (start, end) = validate_training_window("09:00", "12:00").unwrap();

        assert!(in_training_window(
            NaiveTime::from_hms_opt(9, 0, 0).unwrap(),
            start,
            end
        ));
        assert!(in_training_window(
            NaiveTime::from_hms_opt(11, 59, 59).unwrap(),
            start,
            end
        ));
        assert!(!in_training_window(
            NaiveTime::from_hms_opt(8, 59, 59).unwrap(),
            start,
            end
        ));
        assert!(!in_training_window(
            NaiveTime::from_hms_opt(12, 0, 0).unwrap(),
            start,
            end
        ));
    }

    #[test]
    fn rejects_invalid_training_windows() {
        assert!(validate_training_window("12:00", "09:00").is_err());
        assert!(validate_training_window("09:00", "09:00").is_err());
        assert!(validate_training_window("abc", "12:00").is_err());
    }

    #[test]
    fn profit_number_normalization_handles_brazilian_prices() {
        assert_eq!(normalize_profit_number("205.935").unwrap(), "205935");
        assert_eq!(normalize_profit_number("5.321,5").unwrap(), "5321.5");
        assert_eq!(normalize_profit_number("5321.5").unwrap(), "5321.5");
    }

    #[test]
    fn detects_known_headerless_layouts() {
        let eight = vec!["x".to_string(); 8];
        let nine = vec!["x".to_string(); 9];

        let a = detect_layout(&eight).unwrap();
        let b = detect_layout(&nine).unwrap();

        assert_eq!(a.price_idx, 4);
        assert_eq!(a.quantity_idx, 5);
        assert_eq!(b.price_idx, 5);
        assert_eq!(b.quantity_idx, 6);
    }

    #[test]
    fn csv_parser_keeps_quoted_delimiters() {
        let fields = parse_delimited_line(r#"WINV26;07/10/26;"09:00:00";"5.321,5";10"#, ';');
        assert_eq!(fields.len(), 5);
        assert_eq!(fields[3], "5.321,5");
    }

    #[test]
    #[test]
    fn migrates_legacy_trade_table_without_losing_history() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                r#"
                CREATE TABLE trades (
                    id TEXT PRIMARY KEY NOT NULL,
                    asset TEXT NOT NULL,
                    side TEXT NOT NULL,
                    signal_id TEXT NOT NULL,
                    entry REAL NOT NULL,
                    stop_loss REAL NOT NULL,
                    target REAL NOT NULL,
                    opened_at TEXT NOT NULL,
                    status TEXT NOT NULL,
                    exit_price REAL NOT NULL,
                    exit_reason TEXT NOT NULL,
                    closed_at TEXT NOT NULL,
                    result_points REAL NOT NULL
                );

                INSERT INTO trades (
                    id, asset, side, signal_id, entry, stop_loss, target,
                    opened_at, status, exit_price, exit_reason, closed_at, result_points
                )
                VALUES (
                    'legacy-1', 'WINFUT', 'BUY', 'signal-1',
                    130000, 129900, 130150,
                    '2026-10-14T09:00:00', 'CLOSED',
                    130150, 'TARGET', '2026-10-14T09:10:00', 150
                );
                "#,
            )
            .unwrap();

        initialize_database(&connection).unwrap();

        let (contracts, gross): (i64, f64) = connection
            .query_row(
                "SELECT contracts, gross_result_brl FROM trades WHERE id = 'legacy-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();

        assert_eq!(contracts, 1);
        assert!((gross - 30.0).abs() < 1e-9);
    }

    #[test]
    fn database_schema_contains_training_history_tables() {
        let connection = Connection::open_in_memory().unwrap();
        initialize_database(&connection).unwrap();

        for table in ["trades", "training_sessions", "training_events"] {
            let count: i64 = connection
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "missing table {table}");
        }
    }

    fn canonicalizes_descending_replay_without_loading_rows_into_memory() {
        use std::time::{SystemTime, UNIX_EPOCH};

        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("simulador-trade-{unique}"));
        fs::create_dir_all(&root).unwrap();

        let temp = root.join("source.replay.tmp");
        let output = root.join("source.replay.csv");
        let first = b"WINV26,2026-10-07T09:00:02,20,130010,1\n";
        let second = b"WINV26,2026-10-07T09:00:01,21,130005,2\n";

        let mut bytes = Vec::new();
        bytes.extend_from_slice(REPLAY_HEADER);
        let first_offset = bytes.len() as u64;
        bytes.extend_from_slice(first);
        let second_offset = bytes.len() as u64;
        bytes.extend_from_slice(second);
        fs::write(&temp, bytes).unwrap();

        canonicalize_replay_file(
            &temp,
            &output,
            &[first_offset, second_offset],
            "DESCENDING",
        )
        .unwrap();

        let final_text = fs::read_to_string(&output).unwrap();
        let lines: Vec<&str> = final_text.lines().collect();

        assert_eq!(lines[0], "symbol,timestamp,source_row,price,quantity");
        assert!(lines[1].contains("09:00:01"));
        assert!(lines[2].contains("09:00:02"));
        assert!(!temp.exists());

        let _ = fs::remove_dir_all(root);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?;

            std::fs::create_dir_all(&data_dir)?;
            let database_path = data_dir.join("simulador-de-trade.sqlite3");
            let connection = Connection::open(database_path)?;
            initialize_database(&connection)?;
            app.manage(DbState(Mutex::new(connection)));
            app.manage(ReplayState(Mutex::new(None)));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_trade,
            list_trades,
            save_training_session,
            save_training_event,
            list_training_sessions,
            list_training_events,
            list_session_trades,
            prepare_profit_replay_file,
            replay::open_replay_file,
            replay::next_replay_trades,
            replay::reset_replay_session,
            replay::close_replay_session,
            replay::load_warmup_candles,
            catalog::register_replay_file,
            catalog::list_replay_catalog,
            catalog::prune_missing_replay_catalog
        ])
        .run(tauri::generate_context!())
        .expect("error while running Simulador de Trade");
}
