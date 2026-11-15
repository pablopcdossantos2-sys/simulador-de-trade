mod catalog;
mod profit_index;
mod replay;

use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime, Timelike, Utc};
use encoding_rs::WINDOWS_1252;
use rusqlite::{params, Connection};
use serde::ser::{SerializeSeq, SerializeStruct};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, BufWriter, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use replay::{ReplayAnalysisState, ReplayState};

struct DbState(Mutex<Connection>);

fn default_intrabar_policy() -> String {
    "STOP_FIRST".to_string()
}

fn default_win_cost() -> f64 { 0.50 }
fn default_wdo_cost() -> f64 { 2.12 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TradeRecord {
    id: String,
    asset: String,
    side: String,
    signal_id: String,
    requested_entry: f64,
    entry: f64,
    stop_loss: f64,
    #[serde(default)]
    initial_stop_loss: f64,
    #[serde(default)]
    session_id: Option<String>,
    target: f64,
    contracts: i64,
    slippage_ticks_per_side: i64,
    #[serde(rename = "costPerContractRoundTripBRL")]
    cost_per_contract_round_trip_brl: f64,
    opened_at: String,
    status: String,
    exit_price: f64,
    exit_reason: String,
    closed_at: String,
    result_points: f64,
    #[serde(rename = "grossResultBRL")]
    gross_result_brl: f64,
    #[serde(rename = "operationalCostsBRL")]
    operational_costs_brl: f64,
    #[serde(rename = "netResultBRL")]
    net_result_brl: f64,
    post_trade_note: String,
    #[serde(default)]
    review: Option<Value>,
    entry_context: Option<Value>,
    #[serde(default = "default_intrabar_policy")]
    intrabar_policy: String,
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
    mode: String,
    started_at: String,
    ended_at: Option<String>,
    status: String,
    #[serde(rename = "startingBalanceBRL", default)]
    starting_balance_brl: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageSessionRecord {
    id: String,
    started_at: String,
    ended_at: Option<String>,
    last_active_at: String,
    active_seconds: f64,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExecutionSettingsRecord {
    #[serde(rename = "costPerContractRoundTripBRL")]
    cost_per_contract_round_trip_brl: f64,
    #[serde(default, rename = "costWinRoundTripBRL")]
    cost_win_round_trip_brl: Option<f64>,
    #[serde(default, rename = "costWdoRoundTripBRL")]
    cost_wdo_round_trip_brl: Option<f64>,
    slippage_ticks_per_side: i64,
    #[serde(default = "default_intrabar_policy")]
    intrabar_policy: String,
    #[serde(default, rename = "disciplinedTrainingStartingBalanceBRL")]
    disciplined_training_starting_balance_brl: Option<f64>,
    #[serde(default, rename = "stopTrainingStartingBalanceBRL")]
    stop_training_starting_balance_brl: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProfitPreparationProgress {
    operation_id: String,
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
    data_mode: String,
    source_timeframe_minutes: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupBundle {
    format: String,
    schema_version: u32,
    app_version: String,
    exported_at: String,
    trades: Vec<TradeRecord>,
    training_sessions: Vec<TrainingSessionRecord>,
    training_events: Vec<TrainingEventRecord>,
    #[serde(default)]
    usage_sessions: Vec<UsageSessionRecord>,
    execution_settings: ExecutionSettingsRecord,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReplayBackupFile {
    output_file_name: String,
    replay_content_base64: String,
    metadata_content_base64: String,
}

#[derive(Debug, Clone)]
struct ReplayBackupSource {
    output_file_name: String,
    replay_path: PathBuf,
    metadata_path: PathBuf,
}

struct ReplayBackupExportFiles<'a>(&'a [ReplayBackupSource]);

impl Serialize for ReplayBackupExportFiles<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        let mut sequence = serializer.serialize_seq(Some(self.0.len()))?;
        for source in self.0 {
            let replay_bytes = fs::read(&source.replay_path).map_err(serde::ser::Error::custom)?;
            let metadata_bytes = fs::read(&source.metadata_path).map_err(serde::ser::Error::custom)?;
            let file = ReplayBackupFile {
                output_file_name: source.output_file_name.clone(),
                replay_content_base64: encode_base64(&replay_bytes),
                metadata_content_base64: encode_base64(&metadata_bytes),
            };
            sequence.serialize_element(&file)?;
        }
        sequence.end()
    }
}

struct BackupExportDocument<'a> {
    bundle: &'a BackupBundle,
    replay_files: ReplayBackupExportFiles<'a>,
}

impl Serialize for BackupExportDocument<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        let mut document = serializer.serialize_struct("BackupExportDocument", 10)?;
        document.serialize_field("format", &self.bundle.format)?;
        document.serialize_field("schemaVersion", &self.bundle.schema_version)?;
        document.serialize_field("appVersion", &self.bundle.app_version)?;
        document.serialize_field("exportedAt", &self.bundle.exported_at)?;
        document.serialize_field("trades", &self.bundle.trades)?;
        document.serialize_field("trainingSessions", &self.bundle.training_sessions)?;
        document.serialize_field("trainingEvents", &self.bundle.training_events)?;
        document.serialize_field("usageSessions", &self.bundle.usage_sessions)?;
        document.serialize_field("executionSettings", &self.bundle.execution_settings)?;
        document.serialize_field("replayFiles", &self.replay_files)?;
        document.end()
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupImportDocument {
    #[serde(flatten)]
    bundle: BackupBundle,
    #[serde(default)]
    replay_files: Vec<ReplayBackupFile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupSummary {
    path: String,
    schema_version: u32,
    trades: usize,
    sessions: usize,
    events: usize,
    usage_sessions: usize,
    replays: usize,
}

fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let a = chunk[0] as u32;
        let b = chunk.get(1).copied().unwrap_or(0) as u32;
        let c = chunk.get(2).copied().unwrap_or(0) as u32;
        let value = (a << 16) | (b << 8) | c;
        output.push(TABLE[((value >> 18) & 63) as usize] as char);
        output.push(TABLE[((value >> 12) & 63) as usize] as char);
        output.push(if chunk.len() > 1 { TABLE[((value >> 6) & 63) as usize] as char } else { '=' });
        output.push(if chunk.len() > 2 { TABLE[(value & 63) as usize] as char } else { '=' });
    }
    output
}

fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    fn value(byte: u8) -> Option<u8> {
        match byte {
            b'A'..=b'Z' => Some(byte - b'A'),
            b'a'..=b'z' => Some(byte - b'a' + 26),
            b'0'..=b'9' => Some(byte - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let bytes = input.as_bytes();
    if bytes.len() % 4 != 0 {
        return Err("Conteúdo de replay inválido no backup.".to_string());
    }
    let mut output = Vec::with_capacity(bytes.len() / 4 * 3);
    for chunk in bytes.chunks_exact(4) {
        let a = value(chunk[0]).ok_or_else(|| "Conteúdo de replay inválido no backup.".to_string())? as u32;
        let b = value(chunk[1]).ok_or_else(|| "Conteúdo de replay inválido no backup.".to_string())? as u32;
        let c = if chunk[2] == b'=' { 0 } else { value(chunk[2]).ok_or_else(|| "Conteúdo de replay inválido no backup.".to_string())? as u32 };
        let d = if chunk[3] == b'=' { 0 } else { value(chunk[3]).ok_or_else(|| "Conteúdo de replay inválido no backup.".to_string())? as u32 };
        if chunk[2] == b'=' && chunk[3] != b'=' {
            return Err("Conteúdo de replay inválido no backup.".to_string());
        }
        let combined = (a << 18) | (b << 12) | (c << 6) | d;
        output.push((combined >> 16) as u8);
        if chunk[2] != b'=' { output.push((combined >> 8) as u8); }
        if chunk[3] != b'=' { output.push(combined as u8); }
    }
    Ok(output)
}

/// Valida a codificação Base64 sem alocar um segundo buffer do tamanho do replay.
fn validate_base64(input: &str) -> Result<(), String> {
    let bytes = input.as_bytes();
    if bytes.is_empty() || bytes.len() % 4 != 0 {
        return Err("Conteúdo de replay inválido no backup.".to_string());
    }
    for (index, chunk) in bytes.chunks_exact(4).enumerate() {
        let final_chunk = index + 1 == bytes.len() / 4;
        if value_base64(chunk[0]).is_none() || value_base64(chunk[1]).is_none() {
            return Err("Conteúdo de replay inválido no backup.".to_string());
        }
        match (chunk[2], chunk[3]) {
            (b'=', b'=') if final_chunk => {}
            (b'=', _) => return Err("Conteúdo de replay inválido no backup.".to_string()),
            (_, b'=') if final_chunk => {
                if value_base64(chunk[2]).is_none() { return Err("Conteúdo de replay inválido no backup.".to_string()); }
            }
            (_, _) => {
                if value_base64(chunk[2]).is_none() || value_base64(chunk[3]).is_none() {
                    return Err("Conteúdo de replay inválido no backup.".to_string());
                }
            }
        }
    }
    Ok(())
}

fn value_base64(byte: u8) -> Option<u8> {
    match byte {
        b'A'..=b'Z' => Some(byte - b'A'),
        b'a'..=b'z' => Some(byte - b'a' + 26),
        b'0'..=b'9' => Some(byte - b'0' + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    }
}

fn collect_replay_backup_sources(app: &tauri::AppHandle) -> Result<Vec<ReplayBackupSource>, String> {
    let entries = catalog::list_replay_catalog(app.clone())?;
    let mut files = Vec::new();
    let mut total_bytes = 0u64;
    for (index, entry) in entries.into_iter().filter(|entry| entry.exists).enumerate() {
        let output_path = PathBuf::from(&entry.output_path);
        let metadata_path = PathBuf::from(&entry.metadata_path);
        if !output_path.is_file() || !metadata_path.is_file() { continue; }
        let replay_size = fs::metadata(&output_path)
            .map_err(|error| format!("Não foi possível verificar o replay {}: {error}", output_path.display()))?.len();
        let metadata_size = fs::metadata(&metadata_path)
            .map_err(|error| format!("Não foi possível verificar os metadados do replay {}: {error}", metadata_path.display()))?.len();
        total_bytes = total_bytes.saturating_add(replay_size).saturating_add(metadata_size);
        if total_bytes > 350 * 1024 * 1024 {
            return Err("Os arquivos de replay disponíveis excedem 350 MB. Faça o backup em um local com espaço suficiente ou reduza o catálogo.".to_string());
        }
        let original_name = output_path.file_name().and_then(|name| name.to_str())
            .ok_or_else(|| "Nome de arquivo de replay inválido.".to_string())?;
        files.push(ReplayBackupSource {
            output_file_name: format!("{index:04}-{original_name}"),
            replay_path: output_path,
            metadata_path,
        });
    }
    Ok(files)
}

fn validate_replay_backup_files(files: &[ReplayBackupFile]) -> Result<(), String> {
    for file in files {
        let name = Path::new(&file.output_file_name).file_name().and_then(|value| value.to_str());
        if name != Some(file.output_file_name.as_str()) || !file.output_file_name.ends_with(".replay.csv") {
            return Err("O backup contém um nome de arquivo de replay inválido.".to_string());
        }
        // Não decodifica o CSV inteiro na etapa de validação: isso duplicava centenas de MB
        // em memória antes mesmo de a restauração começar.
        validate_base64(&file.replay_content_base64)?;
        let metadata_bytes = decode_base64(&file.metadata_content_base64)?;
        let metadata: Value = serde_json::from_slice(&metadata_bytes)
            .map_err(|error| format!("Metadados de replay inválidos no backup: {error}"))?;
        let summary = metadata.get("summary").ok_or_else(|| "Metadados de replay sem resumo.".to_string())?;
        let symbol = summary.get("symbol").and_then(Value::as_str).unwrap_or_default();
        if !(symbol.starts_with("WIN") || symbol.starts_with("WDO"))
            || summary.get("firstTimestamp").and_then(Value::as_str).is_none()
            || metadata.get("window").and_then(|window| window.get("startInclusive")).and_then(Value::as_str).is_none()
            || metadata.get("window").and_then(|window| window.get("endExclusive")).and_then(Value::as_str).is_none()
        {
            return Err("Os metadados do replay não possuem os campos necessários para catalogação.".to_string());
        }
    }
    Ok(())
}

fn rollback_restored_replay_files(app: &tauri::AppHandle, paths: &[PathBuf]) {
    for path in paths { let _ = fs::remove_file(path); }
    let _ = catalog::prune_missing_replay_catalog(app.clone());
}

fn restore_replay_backup_files(app: &tauri::AppHandle, files: &[ReplayBackupFile]) -> Result<Vec<PathBuf>, String> {
    if files.is_empty() { return Ok(Vec::new()); }
    let data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let replay_dir = data_dir.join("replays");
    fs::create_dir_all(&replay_dir).map_err(|error| error.to_string())?;
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default().as_nanos();
    let mut restored_paths = Vec::new();

    let result = (|| -> Result<(), String> {
        for (index, file) in files.iter().enumerate() {
            let output_name = format!("restore-{nonce}-{index:04}-{}", file.output_file_name);
            let output_path = replay_dir.join(output_name);
            let metadata_path = output_path.with_extension("meta.json");
            let replay_temp = output_path.with_file_name(format!(".restore-{nonce}-{index:04}.replay.tmp"));
            let metadata_temp = output_path.with_file_name(format!(".restore-{nonce}-{index:04}.meta.tmp"));
            let replay_bytes = decode_base64(&file.replay_content_base64)?;
            let metadata_bytes = decode_base64(&file.metadata_content_base64)?;

            let write_pair = (|| -> Result<(), String> {
                let mut replay_file = File::create(&replay_temp).map_err(|error| error.to_string())?;
                replay_file.write_all(&replay_bytes).map_err(|error| error.to_string())?;
                replay_file.sync_all().map_err(|error| error.to_string())?;
                let mut metadata_file = File::create(&metadata_temp).map_err(|error| error.to_string())?;
                metadata_file.write_all(&metadata_bytes).map_err(|error| error.to_string())?;
                metadata_file.sync_all().map_err(|error| error.to_string())?;
                replace_file_safely(&replay_temp, &output_path)?;
                replace_file_safely(&metadata_temp, &metadata_path)?;
                Ok(())
            })();
            if write_pair.is_err() {
                let _ = fs::remove_file(&replay_temp);
                let _ = fs::remove_file(&metadata_temp);
                let _ = fs::remove_file(&output_path);
                let _ = fs::remove_file(&metadata_path);
                return write_pair;
            }
            restored_paths.push(output_path.clone());
            restored_paths.push(metadata_path);
        }

        for path in restored_paths.iter().filter(|path| path.extension().is_some_and(|ext| ext == "csv")) {
            catalog::register_replay_file(app.clone(), path.to_string_lossy().to_string())?;
        }
        Ok(())
    })();

    if let Err(error) = result {
        rollback_restored_replay_files(app, &restored_paths);
        return Err(format!("Não foi possível restaurar os arquivos de replay: {error}"));
    }
    Ok(restored_paths)
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

#[derive(Debug, Clone)]
struct ProfitCandleLayout {
    symbol_idx: Option<usize>,
    date_idx: Option<usize>,
    time_idx: Option<usize>,
    timestamp_idx: Option<usize>,
    open_idx: usize,
    high_idx: usize,
    low_idx: usize,
    close_idx: usize,
    volume_idx: usize,
}

#[derive(Debug, Clone)]
struct ProfitCandleRow {
    timestamp: NaiveDateTime,
    source_row: u64,
    open: f64,
    high: f64,
    low: f64,
    close: f64,
    volume: f64,
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

const LEGACY_REVIEW_MARKER: &str = "simulador-de-trade:trade-review:v1:";

fn split_legacy_trade_review(note: &str, review: Option<&Value>) -> (String, Option<String>) {
    if let Some(review) = review {
        return (note.to_string(), serde_json::to_string(review).ok());
    }
    let Some(payload) = note.strip_prefix(LEGACY_REVIEW_MARKER) else {
        return (note.to_string(), None);
    };
    let Ok(value) = serde_json::from_str::<Value>(payload) else {
        return (note.to_string(), None);
    };
    let Some(review) = value.get("review") else {
        return (note.to_string(), None);
    };
    if review.get("tradeId").and_then(Value::as_str).is_none() {
        return (note.to_string(), None);
    }
    let clean_note = value.get("note").and_then(Value::as_str).unwrap_or_default().to_string();
    (clean_note, serde_json::to_string(review).ok())
}

fn migrate_legacy_trade_reviews(connection: &Connection) -> rusqlite::Result<()> {
    let mut statement = connection.prepare(
        "SELECT id, post_trade_note FROM trades WHERE post_trade_note LIKE 'simulador-de-trade:trade-review:v1:%' AND review_json IS NULL"
    )?;
    let rows = statement.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
    let legacy = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    drop(statement);
    for (id, note) in legacy {
        let (clean_note, review_json) = split_legacy_trade_review(&note, None);
        if let Some(review_json) = review_json {
            connection.execute(
                "UPDATE trades SET post_trade_note = ?1, review_json = ?2 WHERE id = ?3",
                rusqlite::params![clean_note, review_json, id],
            )?;
        }
    }
    Ok(())
}

fn initialize_database(connection: &Connection) -> rusqlite::Result<()> {
    let current_schema_version: i64 =
        connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if current_schema_version > 11 {
        return Err(rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_SCHEMA),
            Some(format!(
                "O banco está na versão {current_schema_version}, mais nova que esta versão do aplicativo (11). Atualize o Simulador de Trade."
            )),
        ));
    }

    connection.execute_batch(
            r#"
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;

            CREATE TABLE IF NOT EXISTS trades (
                id TEXT PRIMARY KEY NOT NULL,
                asset TEXT NOT NULL,
                side TEXT NOT NULL,
                signal_id TEXT NOT NULL,
                requested_entry REAL NOT NULL DEFAULT 0,
                entry REAL NOT NULL,
                stop_loss REAL NOT NULL,
                initial_stop_loss REAL NOT NULL DEFAULT 0,
                session_id TEXT,
                target REAL NOT NULL,
                contracts INTEGER NOT NULL DEFAULT 1,
                slippage_ticks_per_side INTEGER NOT NULL DEFAULT 0,
                cost_per_contract_round_trip_brl REAL NOT NULL DEFAULT 0,
                opened_at TEXT NOT NULL,
                status TEXT NOT NULL,
                exit_price REAL NOT NULL,
                exit_reason TEXT NOT NULL,
                closed_at TEXT NOT NULL,
                result_points REAL NOT NULL,
                gross_result_brl REAL NOT NULL DEFAULT 0,
                operational_costs_brl REAL NOT NULL DEFAULT 0,
                net_result_brl REAL NOT NULL DEFAULT 0,
                post_trade_note TEXT NOT NULL DEFAULT '',
                review_json TEXT,
                entry_context_json TEXT,
                intrabar_policy TEXT NOT NULL DEFAULT 'STOP_FIRST'
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
                mode TEXT NOT NULL DEFAULT 'FREE',
                started_at TEXT NOT NULL,
                ended_at TEXT,
                status TEXT NOT NULL,
                starting_balance_brl REAL
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

            CREATE TABLE IF NOT EXISTS usage_sessions (
                id TEXT PRIMARY KEY NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                last_active_at TEXT NOT NULL,
                active_seconds REAL NOT NULL CHECK(active_seconds >= 0)
            );

            CREATE INDEX IF NOT EXISTS idx_usage_sessions_started_at
            ON usage_sessions(started_at DESC);

            CREATE TABLE IF NOT EXISTS execution_settings (
                id INTEGER PRIMARY KEY NOT NULL CHECK(id = 1),
                cost_per_contract_round_trip_brl REAL NOT NULL DEFAULT 0,
                cost_win_round_trip_brl REAL NOT NULL DEFAULT 0.50,
                cost_wdo_round_trip_brl REAL NOT NULL DEFAULT 2.12,
                slippage_ticks_per_side INTEGER NOT NULL DEFAULT 0,
                intrabar_policy TEXT NOT NULL DEFAULT 'STOP_FIRST',
                disciplined_training_starting_balance_brl REAL,
                stop_training_starting_balance_brl REAL
            );

            INSERT OR IGNORE INTO execution_settings (
                id, cost_per_contract_round_trip_brl, slippage_ticks_per_side
            )
            VALUES (1, 0, 0);
            "#,
        )?;

    if !column_exists(connection, "trades", "contracts")? {
        connection.execute(
            "ALTER TABLE trades ADD COLUMN contracts INTEGER NOT NULL DEFAULT 1",
            [],
        )?;
    }

    if !column_exists(connection, "trades", "gross_result_brl")? {
        connection.execute_batch(
            r#"
            SAVEPOINT migrate_gross_result;
            ALTER TABLE trades ADD COLUMN gross_result_brl REAL NOT NULL DEFAULT 0;
            UPDATE trades
            SET gross_result_brl =
                result_points *
                CASE
                    WHEN asset = 'WINFUT' THEN 0.2
                    WHEN asset = 'WDOFUT' THEN 10.0
                    ELSE 0.0
                END *
                contracts;
            RELEASE migrate_gross_result;
            "#,
        )?;
    }

    if !column_exists(connection, "trades", "requested_entry")? {
        connection.execute_batch(
            r#"
            SAVEPOINT migrate_requested_entry;
            ALTER TABLE trades ADD COLUMN requested_entry REAL NOT NULL DEFAULT 0;
            UPDATE trades SET requested_entry = entry;
            RELEASE migrate_requested_entry;
            "#,
        )?;
    }

    if !column_exists(connection, "trades", "slippage_ticks_per_side")? {
        connection.execute(
            "ALTER TABLE trades ADD COLUMN slippage_ticks_per_side INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }

    if !column_exists(connection, "trades", "cost_per_contract_round_trip_brl")? {
        connection.execute(
            "ALTER TABLE trades ADD COLUMN cost_per_contract_round_trip_brl REAL NOT NULL DEFAULT 0",
            [],
        )?;
    }

    if !column_exists(connection, "trades", "operational_costs_brl")? {
        connection.execute(
            "ALTER TABLE trades ADD COLUMN operational_costs_brl REAL NOT NULL DEFAULT 0",
            [],
        )?;
    }

    if !column_exists(connection, "trades", "net_result_brl")? {
        connection.execute_batch(
            r#"
            SAVEPOINT migrate_net_result;
            ALTER TABLE trades ADD COLUMN net_result_brl REAL NOT NULL DEFAULT 0;
            UPDATE trades
            SET net_result_brl = gross_result_brl - operational_costs_brl;
            RELEASE migrate_net_result;
            "#,
        )?;
    }

    if !column_exists(connection, "trades", "post_trade_note")? {
        connection.execute(
            "ALTER TABLE trades ADD COLUMN post_trade_note TEXT NOT NULL DEFAULT ''",
            [],
        )?;
    }

    if !column_exists(connection, "trades", "review_json")? {
        connection.execute("ALTER TABLE trades ADD COLUMN review_json TEXT", [])?;
    }

    if !column_exists(connection, "trades", "entry_context_json")? {
        connection.execute(
            "ALTER TABLE trades ADD COLUMN entry_context_json TEXT",
            [],
        )?;
    }

    if !column_exists(connection, "trades", "intrabar_policy")? {
        connection.execute(
            "ALTER TABLE trades ADD COLUMN intrabar_policy TEXT NOT NULL DEFAULT 'STOP_FIRST'",
            [],
        )?;
    }

    if !column_exists(connection, "execution_settings", "intrabar_policy")? {
        connection.execute(
            "ALTER TABLE execution_settings ADD COLUMN intrabar_policy TEXT NOT NULL DEFAULT 'STOP_FIRST'",
            [],
        )?;
    }

    if !column_exists(connection, "execution_settings", "cost_win_round_trip_brl")? {
        connection.execute(
            "ALTER TABLE execution_settings ADD COLUMN cost_win_round_trip_brl REAL NOT NULL DEFAULT 0.50",
            [],
        )?;
        connection.execute(
            "UPDATE execution_settings SET cost_win_round_trip_brl = CASE WHEN cost_per_contract_round_trip_brl > 0 THEN cost_per_contract_round_trip_brl ELSE 0.50 END",
            [],
        )?;
    }
    if !column_exists(connection, "execution_settings", "cost_wdo_round_trip_brl")? {
        connection.execute(
            "ALTER TABLE execution_settings ADD COLUMN cost_wdo_round_trip_brl REAL NOT NULL DEFAULT 2.12",
            [],
        )?;
        connection.execute(
            "UPDATE execution_settings SET cost_wdo_round_trip_brl = CASE WHEN cost_per_contract_round_trip_brl > 0 THEN cost_per_contract_round_trip_brl ELSE 2.12 END",
            [],
        )?;
    }

    if !column_exists(connection, "execution_settings", "disciplined_training_starting_balance_brl")? {
        connection.execute("ALTER TABLE execution_settings ADD COLUMN disciplined_training_starting_balance_brl REAL", [])?;
    }
    if !column_exists(connection, "execution_settings", "stop_training_starting_balance_brl")? {
        connection.execute("ALTER TABLE execution_settings ADD COLUMN stop_training_starting_balance_brl REAL", [])?;
    }

    if !column_exists(connection, "training_sessions", "mode")? {
        connection.execute(
            "ALTER TABLE training_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'FREE'",
            [],
        )?;
    }

    if !column_exists(connection, "training_sessions", "starting_balance_brl")? {
        connection.execute(
            "ALTER TABLE training_sessions ADD COLUMN starting_balance_brl REAL",
            [],
        )?;
    }

    if !column_exists(connection, "trades", "initial_stop_loss")? {
        connection.execute_batch(
            "ALTER TABLE trades ADD COLUMN initial_stop_loss REAL NOT NULL DEFAULT 0; UPDATE trades SET initial_stop_loss = stop_loss;",
        )?;
    }

    if !column_exists(connection, "trades", "session_id")? {
        connection.execute("ALTER TABLE trades ADD COLUMN session_id TEXT", [])?;
    }

    migrate_legacy_trade_reviews(connection)?;
    connection.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_trades_session ON trades(session_id, closed_at ASC); PRAGMA user_version = 11;",
    )?;
    Ok(())
}

fn persist_trade_record(connection: &Connection, trade: &TradeRecord) -> Result<(), String> {
    let entry_context_json = trade.entry_context.as_ref()
        .map(serde_json::to_string).transpose().map_err(|error| error.to_string())?;
    let (post_trade_note, review_json) = split_legacy_trade_review(&trade.post_trade_note, trade.review.as_ref());
    connection.execute(
        r#"
        INSERT INTO trades (
            id, asset, side, signal_id, requested_entry, entry, stop_loss, target,
            contracts, slippage_ticks_per_side, cost_per_contract_round_trip_brl,
            opened_at, status, exit_price, exit_reason, closed_at, result_points,
            gross_result_brl, operational_costs_brl, net_result_brl,
            post_trade_note, review_json, entry_context_json, intrabar_policy, initial_stop_loss, session_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26)
        ON CONFLICT(id) DO UPDATE SET
            asset = excluded.asset, side = excluded.side, signal_id = excluded.signal_id,
            requested_entry = excluded.requested_entry, entry = excluded.entry,
            stop_loss = excluded.stop_loss, target = excluded.target,
            contracts = excluded.contracts, slippage_ticks_per_side = excluded.slippage_ticks_per_side,
            cost_per_contract_round_trip_brl = excluded.cost_per_contract_round_trip_brl,
            opened_at = excluded.opened_at, status = excluded.status,
            exit_price = excluded.exit_price, exit_reason = excluded.exit_reason,
            closed_at = excluded.closed_at, result_points = excluded.result_points,
            gross_result_brl = excluded.gross_result_brl,
            operational_costs_brl = excluded.operational_costs_brl,
            net_result_brl = excluded.net_result_brl, post_trade_note = excluded.post_trade_note,
            review_json = excluded.review_json, entry_context_json = excluded.entry_context_json,
            intrabar_policy = excluded.intrabar_policy,
            initial_stop_loss = excluded.initial_stop_loss,
            session_id = COALESCE(excluded.session_id, trades.session_id)
        "#,
        params![
            trade.id, trade.asset, trade.side, trade.signal_id, trade.requested_entry,
            trade.entry, trade.stop_loss, trade.target, trade.contracts,
            trade.slippage_ticks_per_side, trade.cost_per_contract_round_trip_brl,
            trade.opened_at, trade.status, trade.exit_price, trade.exit_reason,
            trade.closed_at, trade.result_points, trade.gross_result_brl,
            trade.operational_costs_brl, trade.net_result_brl, post_trade_note,
            review_json, entry_context_json, trade.intrabar_policy,
            if trade.initial_stop_loss > 0.0 { trade.initial_stop_loss } else { trade.stop_loss },
            trade.session_id,
        ],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

fn persist_training_event_record(connection: &Connection, event: &TrainingEventRecord) -> Result<(), String> {
    connection.execute(
        r#"
        INSERT INTO training_events (
            id, session_id, type, timestamp, market_timestamp, signal_id, side, reason, trade_id
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        ON CONFLICT(id) DO UPDATE SET
            session_id = excluded.session_id, type = excluded.type, timestamp = excluded.timestamp,
            market_timestamp = excluded.market_timestamp, signal_id = excluded.signal_id,
            side = excluded.side, reason = excluded.reason, trade_id = excluded.trade_id
        "#,
        params![
            event.id, event.session_id, event.r#type, event.timestamp, event.market_timestamp,
            event.signal_id, event.side, event.reason, event.trade_id,
        ],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_trade(state: tauri::State<'_, DbState>, trade: TradeRecord) -> Result<(), String> {
    let connection = state.0.lock().map_err(|error| error.to_string())?;
    persist_trade_record(&connection, &trade)
}

fn persist_closed_trade_and_event(
    connection: &mut Connection,
    trade: &TradeRecord,
    event: &TrainingEventRecord,
) -> Result<(), String> {
    if trade.status != "CLOSED" || event.r#type != "TRADE_CLOSED"
        || event.trade_id.as_deref() != Some(trade.id.as_str()) {
        return Err("Operação e evento de fechamento incompatíveis.".to_string());
    }
    if trade.session_id.as_deref().is_some_and(|id| id != event.session_id.as_str()) {
        return Err("A operação e o evento pertencem a sessões diferentes.".to_string());
    }
    let transaction = connection.transaction().map_err(|error| error.to_string())?;
    let session_exists: bool = transaction.query_row(
        "SELECT EXISTS(SELECT 1 FROM training_sessions WHERE id = ?1)",
        [&event.session_id], |row| row.get(0),
    ).map_err(|error| error.to_string())?;
    if !session_exists {
        return Err("A sessão de treinamento não existe; a operação não foi registrada.".to_string());
    }
    let mut linked_trade = trade.clone();
    linked_trade.session_id = Some(event.session_id.clone());
    persist_trade_record(&transaction, &linked_trade)?;
    persist_training_event_record(&transaction, event)?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_closed_trade(
    state: tauri::State<'_, DbState>,
    trade: TradeRecord,
    event: TrainingEventRecord,
) -> Result<(), String> {
    let mut connection = state.0.lock().map_err(|error| error.to_string())?;
    persist_closed_trade_and_event(&mut connection, &trade, &event)
}

#[tauri::command]
fn load_execution_settings(
    state: tauri::State<'_, DbState>,
) -> Result<ExecutionSettingsRecord, String> {
    let connection = state.0.lock().map_err(|error| error.to_string())?;

    connection
        .query_row(
            r#"
            SELECT cost_per_contract_round_trip_brl, cost_win_round_trip_brl,
                   cost_wdo_round_trip_brl, slippage_ticks_per_side, intrabar_policy,
                   disciplined_training_starting_balance_brl, stop_training_starting_balance_brl
            FROM execution_settings
            WHERE id = 1
            "#,
            [],
            |row| {
                Ok(ExecutionSettingsRecord {
                    cost_per_contract_round_trip_brl: row.get(0)?,
                    cost_win_round_trip_brl: Some(row.get(1)?),
                    cost_wdo_round_trip_brl: Some(row.get(2)?),
                    slippage_ticks_per_side: row.get(3)?,
                    intrabar_policy: row.get(4)?,
                    disciplined_training_starting_balance_brl: row.get(5)?,
                    stop_training_starting_balance_brl: row.get(6)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_execution_settings(
    state: tauri::State<'_, DbState>,
    settings: ExecutionSettingsRecord,
) -> Result<(), String> {
    if !settings.cost_per_contract_round_trip_brl.is_finite()
        || settings.cost_per_contract_round_trip_brl < 0.0
    {
        return Err("O custo operacional precisa ser maior ou igual a zero.".to_string());
    }
    let win_cost = settings.cost_win_round_trip_brl.unwrap_or_else(|| {
        if settings.cost_per_contract_round_trip_brl > 0.0 {
            settings.cost_per_contract_round_trip_brl
        } else { default_win_cost() }
    });
    let wdo_cost = settings.cost_wdo_round_trip_brl.unwrap_or_else(|| {
        if settings.cost_per_contract_round_trip_brl > 0.0 {
            settings.cost_per_contract_round_trip_brl
        } else { default_wdo_cost() }
    });
    if !win_cost.is_finite() || win_cost < 0.0 || !wdo_cost.is_finite() || wdo_cost < 0.0 {
        return Err("Os custos por ativo precisam ser valores maiores ou iguais a zero.".to_string());
    }
    if settings.slippage_ticks_per_side < 0 {
        return Err("O slippage precisa ser maior ou igual a zero.".to_string());
    }
    if settings.intrabar_policy != "STOP_FIRST" && settings.intrabar_policy != "TARGET_FIRST" {
        return Err("Política intrabar inválida.".to_string());
    }
    if [
        settings.disciplined_training_starting_balance_brl,
        settings.stop_training_starting_balance_brl,
    ].into_iter().flatten().any(|balance| !balance.is_finite() || balance <= 0.0) {
        return Err("O capital dos treinamentos precisa ser maior que zero.".to_string());
    }

    let connection = state.0.lock().map_err(|error| error.to_string())?;
    connection.execute(
        r#"
        INSERT INTO execution_settings (
            id, cost_per_contract_round_trip_brl, cost_win_round_trip_brl,
            cost_wdo_round_trip_brl, slippage_ticks_per_side, intrabar_policy,
            disciplined_training_starting_balance_brl, stop_training_starting_balance_brl
        )
        VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(id) DO UPDATE SET
            cost_per_contract_round_trip_brl = excluded.cost_per_contract_round_trip_brl,
            cost_win_round_trip_brl = excluded.cost_win_round_trip_brl,
            cost_wdo_round_trip_brl = excluded.cost_wdo_round_trip_brl,
            slippage_ticks_per_side = excluded.slippage_ticks_per_side,
            intrabar_policy = excluded.intrabar_policy,
            disciplined_training_starting_balance_brl = excluded.disciplined_training_starting_balance_brl,
            stop_training_starting_balance_brl = excluded.stop_training_starting_balance_brl
        "#,
        params![
            settings.cost_per_contract_round_trip_brl,
            win_cost,
            wdo_cost,
            settings.slippage_ticks_per_side,
            settings.intrabar_policy,
            settings.disciplined_training_starting_balance_brl,
            settings.stop_training_starting_balance_brl,
        ],
    ).map_err(|error| error.to_string())?;

    Ok(())
}
/// Finaliza, de forma transacional, sessões que ficaram ACTIVE após o encerramento
/// inesperado do aplicativo. O evento preserva no histórico o motivo da finalização.
fn recover_abandoned_training_sessions(
    connection: &mut Connection,
) -> rusqlite::Result<usize> {
    let transaction = connection.transaction()?;
    let active_session_ids = {
        let mut statement = transaction.prepare(
            "SELECT id FROM training_sessions WHERE status = 'ACTIVE'",
        )?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };

    if active_session_ids.is_empty() {
        transaction.commit()?;
        return Ok(0);
    }

    let recovered_at = Utc::now().to_rfc3339();
    let reason = "Sessão encerrada automaticamente na inicialização porque o aplicativo foi fechado antes do encerramento formal.";

    let mut recovered = 0;
    for session_id in active_session_ids {
        let changed = transaction.execute(
            "UPDATE training_sessions SET status = 'ENDED', ended_at = ?1 WHERE id = ?2 AND status = 'ACTIVE'",
            params![recovered_at, session_id],
        )?;

        if changed == 0 {
            continue;
        }

        let event_id = format!(
            "session-recovery-{session_id}-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        );
        transaction.execute(
            r#"
            INSERT INTO training_events (
                id, session_id, type, timestamp, market_timestamp,
                signal_id, side, reason, trade_id
            )
            VALUES (?1, ?2, 'SESSION_ENDED', ?3, NULL, NULL, NULL, ?4, NULL)
            "#,
            params![event_id, session_id, recovered_at, reason],
        )?;
        recovered += 1;
    }

    transaction.commit()?;
    Ok(recovered)
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
                timeframe_minutes, warmup_bars, mode, started_at, ended_at, status,
                starting_balance_brl
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ON CONFLICT(id) DO UPDATE SET
                asset = excluded.asset,
                trade_date = excluded.trade_date,
                start_time = excluded.start_time,
                end_time = excluded.end_time,
                timeframe_minutes = excluded.timeframe_minutes,
                warmup_bars = excluded.warmup_bars,
                mode = excluded.mode,
                started_at = excluded.started_at,
                ended_at = excluded.ended_at,
                status = excluded.status,
                starting_balance_brl = excluded.starting_balance_brl
            "#,
            params![
                session.id,
                session.asset,
                session.trade_date,
                session.start_time,
                session.end_time,
                session.timeframe_minutes,
                session.warmup_bars,
                session.mode,
                session.started_at,
                session.ended_at,
                session.status,
                session.starting_balance_brl,
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn save_usage_session(
    state: tauri::State<'_, DbState>,
    session: UsageSessionRecord,
) -> Result<(), String> {
    validate_usage_session(&session)?;
    let connection = state.0.lock().map_err(|error| error.to_string())?;
    connection.execute(
        r#"INSERT INTO usage_sessions (id, started_at, ended_at, last_active_at, active_seconds)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(id) DO UPDATE SET
             started_at = excluded.started_at,
             ended_at = excluded.ended_at,
             last_active_at = excluded.last_active_at,
             active_seconds = excluded.active_seconds"#,
        params![session.id, session.started_at, session.ended_at, session.last_active_at, session.active_seconds],
    ).map_err(|error| error.to_string())?;
    connection.execute(
        "DELETE FROM usage_sessions WHERE datetime(COALESCE(ended_at, last_active_at, started_at)) < datetime('now', '-365 days')",
        [],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_usage_sessions(state: tauri::State<'_, DbState>) -> Result<Vec<UsageSessionRecord>, String> {
    let connection = state.0.lock().map_err(|error| error.to_string())?;
    query_backup_usage_sessions(&connection)
}

#[tauri::command]
fn save_training_event(
    state: tauri::State<'_, DbState>,
    event: TrainingEventRecord,
) -> Result<(), String> {
    let connection = state.0.lock().map_err(|error| error.to_string())?;
    persist_training_event_record(&connection, &event)
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
                timeframe_minutes, warmup_bars, mode, started_at, ended_at, status,
                starting_balance_brl
            FROM training_sessions
            ORDER BY started_at DESC, id ASC, id ASC
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
                mode: row.get(7)?,
                started_at: row.get(8)?,
                ended_at: row.get(9)?,
                status: row.get(10)?,
                starting_balance_brl: row.get(11)?,
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
                t.id, t.asset, t.side, t.signal_id, t.requested_entry, t.entry,
                t.stop_loss, t.target, t.contracts, t.slippage_ticks_per_side,
                t.cost_per_contract_round_trip_brl, t.opened_at, t.status,
                t.exit_price, t.exit_reason, t.closed_at, t.result_points,
                t.gross_result_brl, t.operational_costs_brl, t.net_result_brl,
                t.post_trade_note, t.review_json, t.entry_context_json, t.intrabar_policy,
                t.initial_stop_loss, t.session_id
            FROM trades t
            WHERE t.session_id = ?1
               OR EXISTS (
                    SELECT 1 FROM training_events e
                    WHERE e.trade_id = t.id AND e.session_id = ?1 AND e.type = 'TRADE_CLOSED'
               )
            ORDER BY t.closed_at ASC, t.id ASC
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
                requested_entry: row.get(4)?,
                entry: row.get(5)?,
                stop_loss: row.get(6)?,
                target: row.get(7)?,
                contracts: row.get(8)?,
                slippage_ticks_per_side: row.get(9)?,
                cost_per_contract_round_trip_brl: row.get(10)?,
                opened_at: row.get(11)?,
                status: row.get(12)?,
                exit_price: row.get(13)?,
                exit_reason: row.get(14)?,
                closed_at: row.get(15)?,
                result_points: row.get(16)?,
                gross_result_brl: row.get(17)?,
                operational_costs_brl: row.get(18)?,
                net_result_brl: row.get(19)?,
                post_trade_note: row.get(20)?,
                review: row.get::<_, Option<String>>(21)?.and_then(|value| serde_json::from_str(&value).ok()),
                entry_context: row
                    .get::<_, Option<String>>(22)?
                    .and_then(|value| serde_json::from_str(&value).ok()),
                intrabar_policy: row.get(23)?,
                initial_stop_loss: row.get(24)?,
                session_id: row.get(25)?,
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
            ORDER BY timestamp ASC, id ASC
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
fn list_all_training_events(
    state: tauri::State<'_, DbState>,
) -> Result<Vec<TrainingEventRecord>, String> {
    let connection = state.0.lock().map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT
                id, session_id, type, timestamp, market_timestamp,
                signal_id, side, reason, trade_id
            FROM training_events
            ORDER BY timestamp ASC, id ASC
            "#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
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
fn delete_all_trades(state: tauri::State<'_, DbState>) -> Result<(), String> {
    let mut connection = state.0.lock().map_err(|error| error.to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM trades", [])
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM training_events WHERE type IN ('TRADE_OPENED', 'TRADE_CLOSED')",
            [],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_all_database_data(state: tauri::State<'_, DbState>) -> Result<(), String> {
    let mut connection = state.0.lock().map_err(|error| error.to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    // Remove primeiro os registros dependentes para respeitar as chaves estrangeiras.
    transaction.execute("DELETE FROM training_events", [])
        .map_err(|error| error.to_string())?;
    transaction.execute("DELETE FROM trades", [])
        .map_err(|error| error.to_string())?;
    transaction.execute("DELETE FROM training_sessions", [])
        .map_err(|error| error.to_string())?;
    transaction.execute("DELETE FROM execution_settings", [])
        .map_err(|error| error.to_string())?;
    transaction.execute("DELETE FROM usage_sessions", [])
        .map_err(|error| error.to_string())?;

    // Mantém uma linha válida de configurações, restaurada aos padrões do aplicativo.
    transaction.execute(
        r#"
        INSERT INTO execution_settings (
            id, cost_per_contract_round_trip_brl, cost_win_round_trip_brl,
            cost_wdo_round_trip_brl, slippage_ticks_per_side, intrabar_policy,
            disciplined_training_starting_balance_brl, stop_training_starting_balance_brl
        )
        VALUES (1, 0.50, 0.50, 2.12, 0, 'STOP_FIRST', NULL, NULL)
        "#,
        [],
    ).map_err(|error| error.to_string())?;

    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_trades(state: tauri::State<'_, DbState>) -> Result<Vec<TradeRecord>, String> {
    let connection = state.0.lock().map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT
                id, asset, side, signal_id, requested_entry, entry, stop_loss,
                target, contracts, slippage_ticks_per_side,
                cost_per_contract_round_trip_brl, opened_at, status, exit_price,
                exit_reason, closed_at, result_points, gross_result_brl,
                operational_costs_brl, net_result_brl, post_trade_note,
                review_json, entry_context_json, intrabar_policy, initial_stop_loss, session_id
            FROM trades
            ORDER BY closed_at DESC, id ASC
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
                requested_entry: row.get(4)?,
                entry: row.get(5)?,
                stop_loss: row.get(6)?,
                target: row.get(7)?,
                contracts: row.get(8)?,
                slippage_ticks_per_side: row.get(9)?,
                cost_per_contract_round_trip_brl: row.get(10)?,
                opened_at: row.get(11)?,
                status: row.get(12)?,
                exit_price: row.get(13)?,
                exit_reason: row.get(14)?,
                closed_at: row.get(15)?,
                result_points: row.get(16)?,
                gross_result_brl: row.get(17)?,
                operational_costs_brl: row.get(18)?,
                net_result_brl: row.get(19)?,
                post_trade_note: row.get(20)?,
                review: row.get::<_, Option<String>>(21)?.and_then(|value| serde_json::from_str(&value).ok()),
                entry_context: row
                    .get::<_, Option<String>>(22)?
                    .and_then(|value| serde_json::from_str(&value).ok()),
                intrabar_policy: row.get(23)?,
                initial_stop_loss: row.get(24)?,
                session_id: row.get(25)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_all_trades(
    state: tauri::State<'_, DbState>,
) -> Result<Vec<TradeRecord>, String> {
    let connection = state.0.lock().map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT
                id, asset, side, signal_id, requested_entry, entry, stop_loss,
                target, contracts, slippage_ticks_per_side,
                cost_per_contract_round_trip_brl, opened_at, status, exit_price,
                exit_reason, closed_at, result_points, gross_result_brl,
                operational_costs_brl, net_result_brl, post_trade_note,
                review_json, entry_context_json, intrabar_policy, initial_stop_loss, session_id
            FROM trades
            ORDER BY closed_at ASC, id ASC
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
                requested_entry: row.get(4)?,
                entry: row.get(5)?,
                stop_loss: row.get(6)?,
                target: row.get(7)?,
                contracts: row.get(8)?,
                slippage_ticks_per_side: row.get(9)?,
                cost_per_contract_round_trip_brl: row.get(10)?,
                opened_at: row.get(11)?,
                status: row.get(12)?,
                exit_price: row.get(13)?,
                exit_reason: row.get(14)?,
                closed_at: row.get(15)?,
                result_points: row.get(16)?,
                gross_result_brl: row.get(17)?,
                operational_costs_brl: row.get(18)?,
                net_result_brl: row.get(19)?,
                post_trade_note: row.get(20)?,
                review: row.get::<_, Option<String>>(21)?.and_then(|value| serde_json::from_str(&value).ok()),
                entry_context: row
                    .get::<_, Option<String>>(22)?
                    .and_then(|value| serde_json::from_str(&value).ok()),
                intrabar_policy: row.get(23)?,
                initial_stop_loss: row.get(24)?,
                session_id: row.get(25)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}


fn query_backup_trades(connection: &Connection) -> Result<Vec<TradeRecord>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT
                id, asset, side, signal_id, requested_entry, entry, stop_loss,
                target, contracts, slippage_ticks_per_side,
                cost_per_contract_round_trip_brl, opened_at, status, exit_price,
                exit_reason, closed_at, result_points, gross_result_brl,
                operational_costs_brl, net_result_brl, post_trade_note,
                review_json, entry_context_json, intrabar_policy, initial_stop_loss, session_id
            FROM trades
            ORDER BY closed_at ASC, id ASC
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
                requested_entry: row.get(4)?,
                entry: row.get(5)?,
                stop_loss: row.get(6)?,
                target: row.get(7)?,
                contracts: row.get(8)?,
                slippage_ticks_per_side: row.get(9)?,
                cost_per_contract_round_trip_brl: row.get(10)?,
                opened_at: row.get(11)?,
                status: row.get(12)?,
                exit_price: row.get(13)?,
                exit_reason: row.get(14)?,
                closed_at: row.get(15)?,
                result_points: row.get(16)?,
                gross_result_brl: row.get(17)?,
                operational_costs_brl: row.get(18)?,
                net_result_brl: row.get(19)?,
                post_trade_note: row.get(20)?,
                review: row.get::<_, Option<String>>(21)?.and_then(|value| serde_json::from_str(&value).ok()),
                entry_context: row
                    .get::<_, Option<String>>(22)?
                    .and_then(|value| serde_json::from_str(&value).ok()),
                intrabar_policy: row.get(23)?,
                initial_stop_loss: row.get(24)?,
                session_id: row.get(25)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn query_backup_sessions(
    connection: &Connection,
) -> Result<Vec<TrainingSessionRecord>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT
                id, asset, trade_date, start_time, end_time,
                timeframe_minutes, warmup_bars, mode, started_at, ended_at, status,
                starting_balance_brl
            FROM training_sessions
            ORDER BY started_at ASC, id ASC
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
                mode: row.get(7)?,
                started_at: row.get(8)?,
                ended_at: row.get(9)?,
                status: row.get(10)?,
                starting_balance_brl: row.get(11)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn query_backup_events(
    connection: &Connection,
) -> Result<Vec<TrainingEventRecord>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT
                id, session_id, type, timestamp, market_timestamp,
                signal_id, side, reason, trade_id
            FROM training_events
            ORDER BY timestamp ASC, id ASC
            "#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
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

fn query_backup_usage_sessions(connection: &Connection) -> Result<Vec<UsageSessionRecord>, String> {
    let mut statement = connection.prepare(
        "SELECT id, started_at, ended_at, last_active_at, active_seconds FROM usage_sessions ORDER BY started_at ASC, id ASC"
    ).map_err(|error| error.to_string())?;
    let rows = statement.query_map([], |row| Ok(UsageSessionRecord {
        id: row.get(0)?,
        started_at: row.get(1)?,
        ended_at: row.get(2)?,
        last_active_at: row.get(3)?,
        active_seconds: row.get(4)?,
    })).map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}

fn query_backup_execution_settings(
    connection: &Connection,
) -> Result<ExecutionSettingsRecord, String> {
    connection
        .query_row(
            r#"
            SELECT cost_per_contract_round_trip_brl, cost_win_round_trip_brl,
                   cost_wdo_round_trip_brl, slippage_ticks_per_side, intrabar_policy,
                   disciplined_training_starting_balance_brl, stop_training_starting_balance_brl
            FROM execution_settings
            WHERE id = 1
            "#,
            [],
            |row| {
                Ok(ExecutionSettingsRecord {
                    cost_per_contract_round_trip_brl: row.get(0)?,
                    cost_win_round_trip_brl: Some(row.get(1)?),
                    cost_wdo_round_trip_brl: Some(row.get(2)?),
                    slippage_ticks_per_side: row.get(3)?,
                    intrabar_policy: row.get(4)?,
                    disciplined_training_starting_balance_brl: row.get(5)?,
                    stop_training_starting_balance_brl: row.get(6)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

fn create_pre_restore_backup(connection: &Connection) -> Result<Option<PathBuf>, String> {
    let database_path: String = connection
        .query_row("PRAGMA database_list", [], |row| row.get(2))
        .map_err(|error| error.to_string())?;
    if database_path.trim().is_empty() {
        return Ok(None);
    }

    // Consolida o WAL antes de copiar o arquivo principal.
    connection
        .execute_batch("PRAGMA wal_checkpoint(FULL);")
        .map_err(|error| error.to_string())?;
    let source = PathBuf::from(database_path);
    let parent = source.parent().unwrap_or_else(|| Path::new("."));
    let stem = source.file_stem().and_then(|value| value.to_str()).unwrap_or("database");
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let backup = parent.join(format!("{stem}.pre-restore-{nonce}.sqlite3"));
    fs::copy(&source, &backup).map_err(|error| {
        format!("Não foi possível criar a cópia de segurança antes da restauração: {error}")
    })?;
    Ok(Some(backup))
}

fn validate_usage_session(session: &UsageSessionRecord) -> Result<(), String> {
    if session.id.trim().is_empty()
        || session.started_at.trim().is_empty()
        || session.last_active_at.trim().is_empty()
        || !session.active_seconds.is_finite()
        || session.active_seconds < 0.0
        || session.active_seconds > 31_536_000.0
        || session.ended_at.as_ref().is_some_and(|value| value.trim().is_empty())
    {
        return Err("O backup contém uma sessão de uso inválida.".to_string());
    }
    Ok(())
}

fn validate_backup_bundle(bundle: &BackupBundle) -> Result<(), String> {
    if bundle.format != "simulador-de-trade-backup" {
        return Err(
            "O arquivo selecionado não é um backup do Simulador de Trade."
                .to_string(),
        );
    }

    if bundle.schema_version != 1 {
        return Err(format!(
            "Versão de backup não suportada: {}.",
            bundle.schema_version
        ));
    }

    if bundle.usage_sessions.len() > 20_000 {
        return Err("O backup contém sessões de uso demais (limite: 20.000).".to_string());
    }
    for session in &bundle.usage_sessions {
        validate_usage_session(session)?;
    }

    let settings = &bundle.execution_settings;
    if !settings.cost_per_contract_round_trip_brl.is_finite()
        || settings.cost_per_contract_round_trip_brl < 0.0
        || [settings.cost_win_round_trip_brl, settings.cost_wdo_round_trip_brl]
            .into_iter()
            .flatten()
            .any(|cost| !cost.is_finite() || cost < 0.0)
        || settings.slippage_ticks_per_side < 0
        || [
            settings.disciplined_training_starting_balance_brl,
            settings.stop_training_starting_balance_brl,
        ].into_iter().flatten().any(|balance| !balance.is_finite() || balance <= 0.0)
        || !matches!(
            settings.intrabar_policy.as_str(),
            "STOP_FIRST" | "TARGET_FIRST"
        )
    {
        return Err("O backup contém configurações de execução inválidas.".to_string());
    }

    for trade in &bundle.trades {
        if !matches!(trade.asset.as_str(), "WINFUT" | "WDOFUT")
            || !matches!(trade.side.as_str(), "BUY" | "SELL")
            || trade.contracts <= 0
            || trade.slippage_ticks_per_side < 0
            || !trade.cost_per_contract_round_trip_brl.is_finite()
            || trade.cost_per_contract_round_trip_brl < 0.0
            || !matches!(
                trade.intrabar_policy.as_str(),
                "STOP_FIRST" | "TARGET_FIRST"
            )
            || !matches!(
                trade.exit_reason.as_str(),
                "STOP" | "TARGET" | "SESSION_END"
            )
        {
            return Err(format!(
                "O backup contém um trade inválido: {}.",
                trade.id
            ));
        }
    }

    for session in &bundle.training_sessions {
        if !matches!(session.asset.as_str(), "WINFUT" | "WDOFUT")
            || !matches!(session.mode.as_str(), "FREE" | "EXAM")
            || !matches!(session.status.as_str(), "ACTIVE" | "ENDED")
            || session.timeframe_minutes <= 0
            || session.warmup_bars < 0
            || session.starting_balance_brl.is_some_and(|balance| !balance.is_finite() || balance <= 0.0)
        {
            return Err(format!(
                "O backup contém uma sessão inválida: {}.",
                session.id
            ));
        }
    }

    // Valida as referências antes de iniciar qualquer substituição de dados.
    for event in &bundle.training_events {
        if !matches!(
            event.r#type.as_str(),
            "SESSION_STARTED" | "SESSION_ENDED" | "BLOCKED_ATTEMPT"
                | "SIGNAL_IGNORED" | "TRADE_OPENED" | "TRADE_CLOSED" | "TECHNICAL_ISSUE"
        ) {
            return Err(format!("O backup contém um evento com tipo inválido: {}.", event.id));
        }
        if !bundle.training_sessions.iter().any(|session| session.id == event.session_id) {
            return Err(format!(
                "O evento {} referencia uma sessão inexistente ({}).",
                event.id, event.session_id
            ));
        }
        // TRADE_OPENED pode referenciar uma posição ainda aberta, que não é
        // persistida na tabela trades até o fechamento da operação.
        if event.r#type == "TRADE_CLOSED" {
            if let Some(trade_id) = event.trade_id.as_deref() {
                if !bundle.trades.iter().any(|trade| trade.id == trade_id) {
                    return Err(format!(
                        "O evento {} referencia uma operação encerrada inexistente ({}).",
                        event.id, trade_id
                    ));
                }
            }
        }
        if event.side.as_deref().is_some_and(|side| !matches!(side, "BUY" | "SELL")) {
            return Err(format!("O evento {} contém uma direção inválida.", event.id));
        }
    }

    Ok(())
}

#[tauri::command]
fn export_backup(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbState>,
    destination_path: String,
) -> Result<BackupSummary, String> {
    let path = PathBuf::from(destination_path.trim().trim_matches('"'));
    if path.as_os_str().is_empty() {
        return Err("Caminho de destino inválido.".to_string());
    }
    if path.extension().and_then(|value| value.to_str()).map(|value| value.to_ascii_lowercase())
        != Some("json".to_string())
    {
        return Err("O backup precisa ser salvo como arquivo .json.".to_string());
    }

    let connection = state.0.lock().map_err(|error| error.to_string())?;
    let trades = query_backup_trades(&connection)?;
    let sessions = query_backup_sessions(&connection)?;
    let events = query_backup_events(&connection)?;
    let usage_sessions = query_backup_usage_sessions(&connection)?;
    let settings = query_backup_execution_settings(&connection)?;
    drop(connection);
    let replay_sources = collect_replay_backup_sources(&app)?;

    let bundle = BackupBundle {
        format: "simulador-de-trade-backup".to_string(),
        schema_version: 1,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        exported_at: Utc::now().to_rfc3339(),
        trades,
        training_sessions: sessions,
        training_events: events,
        usage_sessions,
        execution_settings: settings,
    };

    let export_document = BackupExportDocument {
        bundle: &bundle,
        replay_files: ReplayBackupExportFiles(&replay_sources),
    };
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Nome de arquivo de backup inválido.".to_string())?;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temp_path = path.with_file_name(format!(".{file_name}.{}.{}.tmp", std::process::id(), nonce));
    let write_result = (|| -> Result<(), String> {
        let file = File::create(&temp_path).map_err(|error| error.to_string())?;
        let mut writer = BufWriter::new(file);
        serde_json::to_writer_pretty(&mut writer, &export_document)
            .map_err(|error| format!("Não foi possível serializar o backup: {error}"))?;
        writer.flush().map_err(|error| error.to_string())?;
        writer.get_ref().sync_all().map_err(|error| error.to_string())?;
        drop(writer);
        replace_file_safely(&temp_path, &path)?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    write_result?;

    Ok(BackupSummary {
        path: path.to_string_lossy().to_string(),
        schema_version: bundle.schema_version,
        trades: bundle.trades.len(),
        sessions: bundle.training_sessions.len(),
        events: bundle.training_events.len(),
        usage_sessions: bundle.usage_sessions.len(),
        replays: replay_sources.len(),
    })
}

#[tauri::command]
fn import_backup(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbState>,
    source_path: String,
    mode: String,
) -> Result<BackupSummary, String> {
    if !matches!(mode.as_str(), "merge" | "replace_all") {
        return Err("Modo de importação inválido. Escolha mesclar ou substituir tudo.".to_string());
    }
    let path = PathBuf::from(source_path.trim().trim_matches('"'));
    if !path.exists() || !path.is_file() {
        return Err("Arquivo de backup não encontrado.".to_string());
    }
    if path.extension().and_then(|value| value.to_str()).map(|value| value.to_ascii_lowercase())
        != Some("json".to_string())
    {
        return Err("O backup importado precisa possuir extensão .json.".to_string());
    }

    const MAX_BACKUP_BYTES: u64 = 500 * 1024 * 1024;
    let file_size = fs::metadata(&path)
        .map_err(|error| error.to_string())?
        .len();
    if file_size > MAX_BACKUP_BYTES {
        return Err("O backup excede o limite de 500 MB.".to_string());
    }

    // Desserializa diretamente do arquivo: evita manter simultaneamente String + Value
    // clonado + structs, reduzindo bastante o pico de memória em backups grandes.
    let backup_file = File::open(&path).map_err(|error| error.to_string())?;
    let import_document: BackupImportDocument = serde_json::from_reader(BufReader::new(backup_file))
        .map_err(|error| format!("Backup JSON inválido: {error}"))?;
    let bundle = import_document.bundle;
    let replay_files = import_document.replay_files;

    validate_backup_bundle(&bundle)?;
    validate_replay_backup_files(&replay_files)?;

    let mut connection = state.0.lock().map_err(|error| error.to_string())?;
    let _safety_backup = if mode == "replace_all" {
        Some(create_pre_restore_backup(&connection)?)
    } else {
        None
    };
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    if mode == "replace_all" {
        transaction.execute("DELETE FROM training_events", [])
            .map_err(|error| error.to_string())?;
        transaction.execute("DELETE FROM trades", [])
            .map_err(|error| error.to_string())?;
        transaction.execute("DELETE FROM training_sessions", [])
            .map_err(|error| error.to_string())?;
        transaction.execute("DELETE FROM usage_sessions", [])
            .map_err(|error| error.to_string())?;
    }

    for session in &bundle.training_sessions {
        transaction
            .execute(
                r#"
                INSERT INTO training_sessions (
                    id, asset, trade_date, start_time, end_time,
                    timeframe_minutes, warmup_bars, mode, started_at, ended_at, status,
                    starting_balance_brl
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                ON CONFLICT(id) DO NOTHING
                "#,
                params![
                    session.id,
                    session.asset,
                    session.trade_date,
                    session.start_time,
                    session.end_time,
                    session.timeframe_minutes,
                    session.warmup_bars,
                    session.mode,
                    session.started_at,
                    session.ended_at,
                    session.status,
                    session.starting_balance_brl,
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    for trade in &bundle.trades {
        let entry_context_json = trade
            .entry_context
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|error| error.to_string())?;

        transaction
            .execute(
                r#"
                INSERT INTO trades (
                    id, asset, side, signal_id, requested_entry, entry, stop_loss,
                    target, contracts, slippage_ticks_per_side,
                    cost_per_contract_round_trip_brl, opened_at, status, exit_price,
                    exit_reason, closed_at, result_points, gross_result_brl,
                    operational_costs_brl, net_result_brl, post_trade_note,
                    review_json, entry_context_json, intrabar_policy, initial_stop_loss, session_id
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25)
                ON CONFLICT(id) DO NOTHING
                "#,
                params![
                    trade.id,
                    trade.asset,
                    trade.side,
                    trade.signal_id,
                    trade.requested_entry,
                    trade.entry,
                    trade.stop_loss,
                    trade.target,
                    trade.contracts,
                    trade.slippage_ticks_per_side,
                    trade.cost_per_contract_round_trip_brl,
                    trade.opened_at,
                    trade.status,
                    trade.exit_price,
                    trade.exit_reason,
                    trade.closed_at,
                    trade.result_points,
                    trade.gross_result_brl,
                    trade.operational_costs_brl,
                    trade.net_result_brl,
                    trade.post_trade_note,
                    entry_context_json,
                    trade.intrabar_policy,
                    if trade.initial_stop_loss > 0.0 { trade.initial_stop_loss } else { trade.stop_loss },
                    trade.session_id,
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    for usage in &bundle.usage_sessions {
        transaction.execute(
            r#"INSERT INTO usage_sessions (id, started_at, ended_at, last_active_at, active_seconds)
               VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id) DO NOTHING"#,
            params![usage.id, usage.started_at, usage.ended_at, usage.last_active_at, usage.active_seconds],
        ).map_err(|error| error.to_string())?;
    }
    transaction.execute(
        "DELETE FROM usage_sessions WHERE datetime(COALESCE(ended_at, last_active_at, started_at)) < datetime('now', '-365 days')",
        [],
    ).map_err(|error| error.to_string())?;

    for event in &bundle.training_events {
        transaction
            .execute(
                r#"
                INSERT INTO training_events (
                    id, session_id, type, timestamp, market_timestamp,
                    signal_id, side, reason, trade_id
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                ON CONFLICT(id) DO NOTHING
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
    }

    if mode == "replace_all" {
        let legacy_cost = bundle.execution_settings.cost_per_contract_round_trip_brl;
        let win_cost = bundle.execution_settings.cost_win_round_trip_brl.unwrap_or_else(|| {
            if legacy_cost > 0.0 { legacy_cost } else { default_win_cost() }
        });
        let wdo_cost = bundle.execution_settings.cost_wdo_round_trip_brl.unwrap_or_else(|| {
            if legacy_cost > 0.0 { legacy_cost } else { default_wdo_cost() }
        });
        transaction.execute(
            r#"
            INSERT INTO execution_settings (
                id, cost_per_contract_round_trip_brl, cost_win_round_trip_brl,
                cost_wdo_round_trip_brl, slippage_ticks_per_side, intrabar_policy,
                disciplined_training_starting_balance_brl, stop_training_starting_balance_brl
            )
            VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(id) DO UPDATE SET
                cost_per_contract_round_trip_brl = excluded.cost_per_contract_round_trip_brl,
                cost_win_round_trip_brl = excluded.cost_win_round_trip_brl,
                cost_wdo_round_trip_brl = excluded.cost_wdo_round_trip_brl,
                slippage_ticks_per_side = excluded.slippage_ticks_per_side,
                intrabar_policy = excluded.intrabar_policy,
                disciplined_training_starting_balance_brl = excluded.disciplined_training_starting_balance_brl,
                stop_training_starting_balance_brl = excluded.stop_training_starting_balance_brl
            "#,
            params![
                legacy_cost,
                win_cost,
                wdo_cost,
                bundle.execution_settings.slippage_ticks_per_side,
                bundle.execution_settings.intrabar_policy,
                bundle.execution_settings.disciplined_training_starting_balance_brl,
                bundle.execution_settings.stop_training_starting_balance_brl,
            ],
        )
        .map_err(|error| error.to_string())?;
    }

    // Os replays são preparados e catalogados antes do commit do banco. Se qualquer
    // arquivo falhar, a transação SQL é descartada e os arquivos já criados são removidos.
    let restored_replay_paths = restore_replay_backup_files(&app, &replay_files)?;
    if let Err(error) = transaction.commit() {
        rollback_restored_replay_files(&app, &restored_replay_paths);
        return Err(format!("Não foi possível confirmar a restauração do banco de dados: {error}"));
    }

    Ok(BackupSummary {
        path: path.to_string_lossy().to_string(),
        schema_version: bundle.schema_version,
        trades: bundle.trades.len(),
        sessions: bundle.training_sessions.len(),
        events: bundle.training_events.len(),
        usage_sessions: bundle.usage_sessions.len(),
        replays: replay_files.len(),
    })
}

fn report_export_path(
    destination_path: &str,
    extension: &str,
) -> Result<PathBuf, String> {
    let normalized_extension = extension.trim().to_lowercase();
    if normalized_extension != "json" && normalized_extension != "csv" {
        return Err("Formato de exportação não suportado.".to_string());
    }

    let mut path = PathBuf::from(destination_path.trim().trim_matches('"'));
    if path.as_os_str().is_empty() {
        return Err("Caminho de exportação inválido.".to_string());
    }

    match path.extension().and_then(|value| value.to_str()) {
        Some(existing) if existing.eq_ignore_ascii_case(&normalized_extension) => {}
        Some(_) => {
            return Err(format!(
                "A extensão do arquivo precisa ser .{normalized_extension}."
            ));
        }
        None => {
            path.set_extension(&normalized_extension);
        }
    }

    Ok(path)
}

#[tauri::command]
fn write_report_export(
    destination_path: String,
    content: String,
    extension: String,
) -> Result<String, String> {
    const MAX_EXPORT_BYTES: usize = 100 * 1024 * 1024;

    if content.len() > MAX_EXPORT_BYTES {
        return Err(
            "O relatório excede o limite de 100 MB para exportação."
                .to_string(),
        );
    }

    let path = report_export_path(&destination_path, &extension)?;
    fs::write(&path, content.as_bytes()).map_err(|error| error.to_string())?;

    Ok(path.to_string_lossy().to_string())
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

fn detect_candle_layout(fields: &[String]) -> Option<ProfitCandleLayout> {
    let open_idx = find_alias(fields, &["abertura", "open", "preco abertura", "preço abertura"])?;
    let high_idx = find_alias(fields, &["maxima", "máxima", "maximo", "máximo", "high", "preco maximo", "preço máximo"])?;
    let low_idx = find_alias(fields, &["minima", "mínima", "minimo", "mínimo", "low", "preco minimo", "preço mínimo"])?;
    let close_idx = find_alias(fields, &["fechamento", "close", "preco fechamento", "preço fechamento"])?;
    // Para VWAP, prefira sempre volume negociado em quantidade/contratos.
    // Não use "Volume Financeiro" quando a exportação também trouxer "Volume Quantidade".
    let volume_idx = find_alias(
        fields,
        &["volume quantidade", "vol quantidade", "vol. quantidade", "quantidade", "qtd", "quantity", "qty"],
    )
    .or_else(|| find_alias(fields, &["volume", "vol"]))?;
    let mut timestamp_idx = find_alias(
        fields,
        &["timestamp", "data hora", "data/hora", "data e hora", "datahora", "datetime"],
    );
    let mut date_idx = find_alias(fields, &["data", "date"]);
    let time_idx = find_alias(fields, &["hora", "tempo", "time", "horario", "horário"]);

    // Em algumas exportações OHLC intraday do Profit, a coluna "Data" já
    // contém data e horário juntos (por exemplo, 14/10/2026 09:00).
    if timestamp_idx.is_none() && time_idx.is_none() {
        timestamp_idx = date_idx;
        date_idx = None;
    }
    if timestamp_idx.is_none() && (date_idx.is_none() || time_idx.is_none()) {
        return None;
    }
    Some(ProfitCandleLayout {
        symbol_idx: find_alias(fields, &["ativo", "ticker", "symbol", "contrato"]),
        date_idx, time_idx, timestamp_idx,
        open_idx, high_idx, low_idx, close_idx, volume_idx,
    })
}

fn row_candle_timestamp(fields: &[String], layout: &ProfitCandleLayout) -> Result<NaiveDateTime, String> {
    if let Some(timestamp_idx) = layout.timestamp_idx {
        return parse_combined_timestamp(
            fields.get(timestamp_idx).map(String::as_str).unwrap_or_default(),
        );
    }
    let date = parse_date(value_at(fields, layout.date_idx))?;
    let time = parse_time(value_at(fields, layout.time_idx))?;
    Ok(NaiveDateTime::new(date, time))
}

fn parse_candle_price(fields: &[String], index: usize, physical_line: u64, label: &str) -> Result<f64, String> {
    let normalized = normalize_profit_number(&fields[index])
        .map_err(|error| format!("Linha {physical_line}: {label} {error}"))?;
    normalized.parse::<f64>()
        .map_err(|_| format!("Linha {physical_line}: {label} inválido"))
}

fn expected_candle_tick(asset: &str) -> Result<f64, String> {
    match asset {
        "WINFUT" => Ok(5.0),
        "WDOFUT" => Ok(0.5),
        _ => Err(format!("Ativo não suportado: {asset}")),
    }
}

fn detect_candle_csv_header(source: &Path) -> Result<bool, String> {
    let input = File::open(source).map_err(|error| error.to_string())?;
    let mut reader = BufReader::new(input);
    loop {
        let mut raw = Vec::new();
        if reader.read_until(b'\n', &mut raw).map_err(|error| error.to_string())? == 0 {
            return Ok(false);
        }
        let line = decode_line(&raw);
        if line.trim().is_empty() { continue; }
        let delimiter = detect_delimiter(&line);
        let fields = parse_delimited_line(&line, delimiter);
        return Ok(detect_candle_layout(&fields).is_some());
    }
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
    let text = raw.trim();

    if text.contains('/') {
        let year_len = text.rsplit('/').next().map(str::len).unwrap_or(0);
        let format = match year_len {
            2 => Some("%d/%m/%y"),
            4 => Some("%d/%m/%Y"),
            _ => None,
        };

        if let Some(format) = format {
            if let Ok(value) = NaiveDate::parse_from_str(text, format) {
                return Ok(value);
            }
        }
    }

    if let Ok(value) = NaiveDate::parse_from_str(text, "%Y-%m-%d") {
        return Ok(value);
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
        "%d/%m/%y %H:%M:%S%.f",
        "%d/%m/%y %H:%M:%S",
        "%d/%m/%Y %H:%M:%S%.f",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d/%m/%y %H:%M",
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
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

    let value = text
        .parse::<f64>()
        .map_err(|_| format!("Número inválido: {raw}"))?;

    if !value.is_finite() {
        return Err(format!("Número não finito: {raw}"));
    }

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

pub(crate) fn unique_temp_path(output_path: &Path, suffix: &str) -> PathBuf {
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let file_name = output_path.file_name().and_then(|value| value.to_str()).unwrap_or("replay");
    output_path.with_file_name(format!(".{file_name}.{}.{}.{}", std::process::id(), nonce, suffix))
}

struct TempFileGuard(PathBuf);

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

#[cfg(windows)]
fn atomic_replace_file(new_path: &Path, output_path: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source: Vec<u16> = new_path.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = output_path.as_os_str().encode_wide().chain(Some(0)).collect();
    let result = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if result == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    Ok(())
}

#[cfg(not(windows))]
fn atomic_replace_file(new_path: &Path, output_path: &Path) -> Result<(), String> {
    fs::rename(new_path, output_path).map_err(|error| error.to_string())
}

fn replace_file_safely(new_path: &Path, output_path: &Path) -> Result<(), String> {
    // O arquivo temporário fica no mesmo diretório/volume. A substituição é atômica
    // e não cria nem remove nomes auxiliares que possam pertencer ao usuário.
    atomic_replace_file(new_path, output_path)
}

fn canonicalize_replay_file(
    temp_path: &Path,
    output_path: &Path,
    record_offsets: &[u64],
    source_order: &str,
) -> Result<(), String> {
    match source_order {
        "ASCENDING" => replace_file_safely(temp_path, output_path),
        "DESCENDING" => {
            let input = File::open(temp_path).map_err(|error| error.to_string())?;
            // Seeks aleatórios invalidam o buffer; um buffer moderado evita reler
            // megabytes a cada linha em arquivos grandes.
            let mut reader = BufReader::with_capacity(64 * 1024, input);
            let new_path = unique_temp_path(output_path, "replay.new");
            let output = File::create(&new_path).map_err(|error| error.to_string())?;
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
            drop(writer);

            let replace_result = replace_file_safely(&new_path, output_path);
            match replace_result {
                Ok(()) => {
                    fs::remove_file(temp_path).map_err(|error| error.to_string())?;
                    Ok(())
                }
                Err(error) => {
                    let _ = fs::remove_file(&new_path);
                    Err(error)
                }
            }
        }
        _ => Err(
            "A ordem temporal do arquivo do Profit é mista. O replay exige uma fonte cronologicamente ascendente ou descendente."
                .to_string(),
        ),
    }
}

fn emit_progress(
    app: &tauri::AppHandle,
    operation_id: &str,
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
            operation_id: operation_id.to_string(),
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
    operation_id: &str,
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
    let temp_path = unique_temp_path(&output_path, "replay.tmp");
    let _temp_guard = TempFileGuard(temp_path.clone());

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
    let mut source_trade_date: Option<NaiveDate> = None;
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

        match source_trade_date {
            Some(date) if date != timestamp.date() => {
                return Err(format!(
                    "Linha {physical_line}: o arquivo contém mais de um pregão ({} e {}). Trate um dia por arquivo.",
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
            return Err(format!(
                "Linha {physical_line}: ativo/símbolo vazio."
            ));
        }

        if symbol.is_empty() {
            symbol = row_symbol.clone();
        } else if row_symbol != symbol {
            return Err(format!(
                "Linha {physical_line}: o arquivo contém mais de um ativo ({symbol} e {row_symbol})."
            ));
        }

        if in_training_window(timestamp.time(), window_start, window_end) {
            let price = normalize_profit_number(&fields[current_layout.price_idx])
                .map_err(|error| format!("Linha {physical_line}: preço {error}"))?;
            let quantity = normalize_profit_number(&fields[current_layout.quantity_idx])
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
            emit_progress(
                app,
                operation_id,
                bytes_processed,
                source_bytes,
                source_rows,
                kept_rows,
            );
            last_emitted_bytes = bytes_processed;
        }
    }

    writer.flush().map_err(|error| error.to_string())?;
    drop(writer);

    if source_rows == 0 {
        return Err("Nenhum negócio foi encontrado no arquivo.".to_string());
    }

    if kept_rows == 0 {
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
        data_mode: "TICK_LEGACY".to_string(),
        source_timeframe_minutes: None,
    };

    let metadata = json!({
        "schemaVersion": 1,
        "purpose": "Simulador de Trade — replay WINFUT/WDOFUT",
        "dataMode": &result.data_mode,
        "sourceTimeframeMinutes": result.source_timeframe_minutes,
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

    emit_progress(
        app,
        operation_id,
        source_bytes,
        source_bytes,
        source_rows,
        kept_rows,
    );
    Ok(result)
}

fn process_profit_m2_candle_file(
    app: &tauri::AppHandle,
    operation_id: &str,
    source_path: &str,
    session_start: &str,
    session_end: &str,
    expected_asset: Option<&str>,
    target_date: Option<&str>,
) -> Result<ProfitPreparationResult, String> {
    let source = PathBuf::from(source_path.trim().trim_matches('"'));
    if !source.exists() || !source.is_file() {
        return Err("Arquivo de candles do Profit não encontrado.".to_string());
    }
    let (window_start, window_end) = validate_training_window(session_start, session_end)?;
    let requested_date = target_date
        .map(parse_date)
        .transpose()?;
    let source_bytes = fs::metadata(&source).map_err(|error| error.to_string())?.len();

    let input = File::open(&source).map_err(|error| error.to_string())?;
    let mut reader = BufReader::with_capacity(1024 * 1024, input);
    let mut delimiter = ',';
    let mut layout: Option<ProfitCandleLayout> = None;
    let mut physical_line = 0_u64;
    let mut source_rows = 0_u64;
    let mut bytes_processed = 0_u64;
    let mut last_emitted_bytes = 0_u64;
    let mut symbol = String::new();
    let mut previous_timestamp: Option<NaiveDateTime> = None;
    let mut ascending_steps = 0_u64;
    let mut descending_steps = 0_u64;
    let mut rows: Vec<ProfitCandleRow> = Vec::new();

    loop {
        let mut raw = Vec::new();
        let read = reader.read_until(b'\n', &mut raw).map_err(|error| error.to_string())?;
        if read == 0 { break; }
        physical_line += 1;
        bytes_processed += read as u64;
        let line = decode_line(&raw);
        if line.trim().is_empty() { continue; }

        if layout.is_none() {
            delimiter = detect_delimiter(&line);
            let fields = parse_delimited_line(&line, delimiter);
            let detected = detect_candle_layout(&fields).ok_or_else(|| {
                "Cabeçalho OHLCV não reconhecido. Exporte do Profit as colunas Ativo, Data, Hora, Abertura, Máxima, Mínima, Fechamento e Quantidade.".to_string()
            })?;
            layout = Some(detected);
            continue;
        }

        let current = layout.as_ref().expect("candle layout initialized");
        let fields = parse_delimited_line(&line, delimiter);
        let max_index = [
            current.symbol_idx, current.date_idx, current.time_idx, current.timestamp_idx,
            Some(current.open_idx), Some(current.high_idx), Some(current.low_idx),
            Some(current.close_idx), Some(current.volume_idx),
        ].into_iter().flatten().max().unwrap_or(0);
        if fields.len() <= max_index {
            return Err(format!("Linha {physical_line}: faltam colunas para formar o candle OHLCV."));
        }

        source_rows += 1;
        let timestamp = row_candle_timestamp(&fields, current)
            .map_err(|error| format!("Linha {physical_line}: {error}"))?;
        if timestamp.second() != 0 || timestamp.nanosecond() != 0 {
            return Err(format!("Linha {physical_line}: o horário do candle precisa estar alinhado ao minuto."));
        }
        if let Some(previous) = previous_timestamp {
            if timestamp > previous { ascending_steps += 1; }
            else if timestamp < previous { descending_steps += 1; }
            else { return Err(format!("Linha {physical_line}: há dois candles com o mesmo timestamp.")); }
        }
        previous_timestamp = Some(timestamp);

        let row_symbol = value_at(&fields, current.symbol_idx).to_uppercase();
        if row_symbol.is_empty() {
            return Err("O CSV OHLCV precisa conter a coluna Ativo/Contrato para validar WIN/WDO.".to_string());
        }
        let row_asset = if row_symbol.starts_with("WIN") { "WINFUT" }
            else if row_symbol.starts_with("WDO") { "WDOFUT" }
            else { return Err(format!("Ativo não suportado no CSV: {row_symbol}")); };
        if let Some(expected) = expected_asset {
            if !row_asset.eq_ignore_ascii_case(expected) {
                return Err(format!("O CSV contém {row_symbol}, mas o plano selecionou {expected}."));
            }
        }
        if symbol.is_empty() { symbol = row_symbol.clone(); }
        else if row_symbol != symbol {
            return Err(format!("Linha {physical_line}: o arquivo mistura contratos ({symbol} e {row_symbol})."));
        }

        let open = parse_candle_price(&fields, current.open_idx, physical_line, "abertura")?;
        let high = parse_candle_price(&fields, current.high_idx, physical_line, "máxima")?;
        let low = parse_candle_price(&fields, current.low_idx, physical_line, "mínima")?;
        let close = parse_candle_price(&fields, current.close_idx, physical_line, "fechamento")?;
        let volume = parse_candle_price(&fields, current.volume_idx, physical_line, "quantidade")?;
        if open <= 0.0 || high <= 0.0 || low <= 0.0 || close <= 0.0 || volume < 0.0 {
            return Err(format!("Linha {physical_line}: preços devem ser positivos e a quantidade não pode ser negativa."));
        }
        if high < low || high < open || high < close || low > open || low > close {
            return Err(format!("Linha {physical_line}: máxima/mínima incompatíveis com OHLC."));
        }
        let tick = expected_candle_tick(row_asset)?;
        for price in [open, high, low, close] {
            if ((price / tick) - (price / tick).round()).abs() > 1e-7 {
                return Err(format!("Linha {physical_line}: preço {price} fora do tick de {tick} do ativo."));
            }
        }
        rows.push(ProfitCandleRow { timestamp, source_row: physical_line, open, high, low, close, volume });

        if bytes_processed.saturating_sub(last_emitted_bytes) >= 1024 * 1024 {
            emit_progress(app, operation_id, bytes_processed, source_bytes, source_rows, 0);
            last_emitted_bytes = bytes_processed;
        }
    }

    if source_rows == 0 { return Err("Nenhum candle foi encontrado no arquivo.".to_string()); }
    if rows.is_empty() { return Err("Nenhum candle foi encontrado no arquivo.".to_string()); }

    rows.sort_by_key(|row| row.timestamp);
    for pair in rows.windows(2) {
        if pair[0].timestamp == pair[1].timestamp {
            return Err("Há candles duplicados no arquivo.".to_string());
        }
    }

    let source_is_m1 = rows.iter().any(|row| row.timestamp.minute() % 2 != 0)
        || rows.windows(2).any(|pair| {
        pair[0].timestamp.date() == pair[1].timestamp.date()
            && (pair[1].timestamp - pair[0].timestamp).num_seconds() == 60
    });

    let selected_date = requested_date.or_else(|| rows.last().map(|row| row.timestamp.date()))
        .ok_or_else(|| "Não foi possível identificar a data dos candles.".to_string())?;
    let available_dates: std::collections::BTreeSet<NaiveDate> =
        rows.iter().map(|row| row.timestamp.date()).collect();
    let selected_rows: Vec<ProfitCandleRow> = rows.into_iter()
        .filter(|row| row.timestamp.date() == selected_date)
        .collect();
    if selected_rows.is_empty() {
        let dates = available_dates.iter()
            .map(|date| date.format("%d/%m/%Y").to_string())
            .collect::<Vec<_>>()
            .join(", ");
        return Err(format!(
            "O CSV não contém candles para {}. Data(s) identificada(s) dentro do arquivo: {}. Confira se o arquivo selecionado corresponde ao pregão solicitado.",
            selected_date.format("%d/%m/%Y"),
            if dates.is_empty() { "nenhuma".to_string() } else { dates }
        ));
    }

    let mut m2_rows: Vec<ProfitCandleRow> = Vec::new();
    if source_is_m1 {
        for row in selected_rows {
            let minute = row.timestamp.minute() - (row.timestamp.minute() % 2);
            let bucket = row.timestamp
                .with_minute(minute)
                .and_then(|value| value.with_second(0))
                .and_then(|value| value.with_nanosecond(0))
                .ok_or_else(|| "Não foi possível alinhar o candle M1 ao intervalo M2.".to_string())?;
            if let Some(last) = m2_rows.last_mut() {
                if last.timestamp == bucket {
                    last.high = last.high.max(row.high);
                    last.low = last.low.min(row.low);
                    last.close = row.close;
                    last.volume += row.volume;
                    continue;
                }
            }
            m2_rows.push(ProfitCandleRow {
                timestamp: bucket,
                source_row: row.source_row,
                open: row.open,
                high: row.high,
                low: row.low,
                close: row.close,
                volume: row.volume,
            });
        }
    } else {
        for row in selected_rows {
            if row.timestamp.minute() % 2 != 0 {
                return Err(format!("O arquivo mistura intervalos M1/M2. Candle desalinhado em {}.", row.timestamp));
            }
            m2_rows.push(row);
        }
    }

    let rows: Vec<ProfitCandleRow> = m2_rows.into_iter()
        .filter(|row| row.timestamp.time() >= window_start && row.timestamp.time() < window_end)
        .collect();
    if rows.is_empty() {
        return Err(format!(
            "Nenhum candle M2 entre {} e {} foi encontrado em {}.",
            window_start.format("%H:%M"), window_end.format("%H:%M"), selected_date.format("%d/%m/%Y")
        ));
    }
    let mut rows = rows;
    rows.sort_by_key(|row| row.timestamp);

    let source_order = if ascending_steps > 0 && descending_steps == 0 { "ASCENDING" }
        else if descending_steps > 0 && ascending_steps == 0 { "DESCENDING" }
        else if ascending_steps == 0 && descending_steps == 0 { "ASCENDING" }
        else { "UNKNOWN" }.to_string();

    let parent = source.parent().ok_or_else(|| "Não foi possível identificar a pasta do arquivo.".to_string())?;
    let stem = source.file_stem().and_then(|value| value.to_str()).ok_or_else(|| "Nome de arquivo inválido.".to_string())?;
    let range = format!("{}-{}", compact_time_label(window_start), compact_time_label(window_end));
    let date_label = selected_date.format("%Y%m%d").to_string();
    let output_path = parent.join(format!("{stem}_{date_label}_{range}.replay.csv"));
    let metadata_path = parent.join(format!("{stem}_{date_label}_{range}.replay.meta.json"));
    let temp_path = unique_temp_path(&output_path, "replay.tmp");
    let _temp_guard = TempFileGuard(temp_path.clone());

    let output = File::create(&temp_path).map_err(|error| error.to_string())?;
    let mut writer = BufWriter::with_capacity(1024 * 1024, output);
    const CANDLE_HEADER: &str = "symbol,timestamp,source_row,open,high,low,close,volume\n";
    writer.write_all(CANDLE_HEADER.as_bytes()).map_err(|error| error.to_string())?;
    for row in &rows {
        let output_line = format!(
            "{},{},{},{},{},{},{},{}\n",
            csv_escape(&symbol), row.timestamp.format("%Y-%m-%dT%H:%M:%S"),
            row.source_row, row.open, row.high, row.low, row.close, row.volume
        );
        writer.write_all(output_line.as_bytes()).map_err(|error| error.to_string())?;
    }
    writer.flush().map_err(|error| error.to_string())?;
    drop(writer);
    replace_file_safely(&temp_path, &output_path)?;

    let output_bytes = fs::metadata(&output_path).map_err(|error| error.to_string())?.len();
    let reduction_pct = if source_bytes == 0 { 0.0 }
        else { ((1.0 - output_bytes as f64 / source_bytes as f64) * 100.0).max(0.0) };
    let first_timestamp = rows.first().map(|row| row.timestamp.format("%Y-%m-%dT%H:%M:%S").to_string());
    let last_timestamp = rows.last().map(|row| row.timestamp.format("%Y-%m-%dT%H:%M:%S").to_string());
    let kept_rows = rows.len() as u64;
    let result = ProfitPreparationResult {
        source_path: source.to_string_lossy().to_string(),
        output_path: output_path.to_string_lossy().to_string(),
        metadata_path: metadata_path.to_string_lossy().to_string(),
        symbol: symbol.clone(),
        source_order,
        source_rows,
        kept_rows,
        discarded_rows: source_rows.saturating_sub(kept_rows),
        source_bytes,
        output_bytes,
        reduction_pct,
        first_timestamp,
        last_timestamp,
        session_start: window_start.format("%H:%M:%S").to_string(),
        session_end: window_end.format("%H:%M:%S").to_string(),
        data_mode: "CANDLES_M2_SYNTHETIC".to_string(),
        source_timeframe_minutes: Some(if source_is_m1 { 1 } else { 2 }),
    };
    let metadata = json!({
        "schemaVersion": 3,
        "purpose": "Simulador de Trade — replay de candles M2 WINFUT/WDOFUT",
        "dataMode": "CANDLES_M2_SYNTHETIC",
        "sourceTimeframeMinutes": result.source_timeframe_minutes,
        "timezone": "America/Sao_Paulo",
        "sourceTradeDate": selected_date.format("%Y-%m-%d").to_string(),
        "window": { "startInclusive": result.session_start.clone(), "endExclusive": result.session_end.clone() },
        "fields": ["symbol", "timestamp", "source_row", "open", "high", "low", "close", "volume"],
        "sourceOrder": &result.source_order,
        "canonicalOrder": "ASCENDING",
        "aggregation": if source_is_m1 {
            "M2: abertura do primeiro M1, máxima/mínima do par, fechamento do segundo M1 e soma da quantidade"
        } else { "Fonte M2: candles preservados sem agregação" },
        "syntheticMovement": {
            "enabled": true,
            "secondsPerCandle": 120,
            "deterministicPerCandle": true,
            "note": "A trajetória segundo a segundo é sintética e não representa negócios tick a tick históricos."
        },
        "summary": &result
    });
    fs::write(&metadata_path, serde_json::to_string_pretty(&metadata).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;
    emit_progress(app, operation_id, source_bytes, source_bytes, source_rows, kept_rows);
    Ok(result)
}
#[tauri::command]
async fn prepare_profit_replay_file(
    app: tauri::AppHandle,
    operation_id: String,
    source_path: String,
    session_start: String,
    session_end: String,
    expected_asset: Option<String>,
    target_date: Option<String>,
) -> Result<ProfitPreparationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let source = PathBuf::from(source_path.trim().trim_matches('"'));
        // O caminho M2 é a opção principal: não indexa nem percorre negócios tick a tick.
        if detect_candle_csv_header(&source)? {
            return process_profit_m2_candle_file(
                &app,
                &operation_id,
                &source_path,
                &session_start,
                &session_end,
                expected_asset.as_deref(),
                target_date.as_deref(),
            );
        }

        // Compatibilidade com arquivos antigos de negócios individuais.
        if let Some(result) = profit_index::try_process_indexed_profit_replay_file(
            &app, &operation_id, &source_path, &session_start, &session_end,
        )? {
            return Ok(result);
        }

        process_profit_replay_file(
            &app, &operation_id, &source_path, &session_start, &session_end,
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    #[test]
    fn usage_sessions_are_persisted_and_included_in_backup_queries() {
        let connection = Connection::open_in_memory().unwrap();
        initialize_database(&connection).unwrap();
        connection.execute(
            "INSERT INTO usage_sessions (id, started_at, ended_at, last_active_at, active_seconds) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["usage-1", "2026-11-01T10:00:00Z", "2026-11-01T11:00:00Z", "2026-11-01T11:00:00Z", 3600.0],
        ).unwrap();

        let sessions = query_backup_usage_sessions(&connection).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].id, "usage-1");
        assert_eq!(sessions[0].active_seconds, 3600.0);
        assert_eq!(sessions[0].ended_at.as_deref(), Some("2026-11-01T11:00:00Z"));
    }

    #[test]
    fn usage_session_validation_rejects_invalid_duration_and_identity() {
        let valid = UsageSessionRecord {
            id: "usage-1".to_string(),
            started_at: "2026-11-01T10:00:00Z".to_string(),
            ended_at: None,
            last_active_at: "2026-11-01T10:15:00Z".to_string(),
            active_seconds: 900.0,
        };
        assert!(validate_usage_session(&valid).is_ok());

        let mut invalid = valid.clone();
        invalid.active_seconds = f64::NAN;
        assert!(validate_usage_session(&invalid).is_err());

        invalid = valid.clone();
        invalid.id = " ".to_string();
        assert!(validate_usage_session(&invalid).is_err());

        invalid = valid;
        invalid.active_seconds = 31_536_001.0;
        assert!(validate_usage_session(&invalid).is_err());
    }

    #[test]
    fn replay_backup_base64_round_trip_preserves_bytes() {
        for bytes in [b"".as_slice(), b"f".as_slice(), b"fo".as_slice(), b"foo".as_slice(), b"replay csv data".as_slice()] {
            assert_eq!(decode_base64(&encode_base64(bytes)).unwrap(), bytes);
        }
    }


    use super::*;

    #[test]
    fn startup_recovers_abandoned_training_sessions_transactionally() {
        let mut connection = Connection::open_in_memory().unwrap();
        initialize_database(&connection).unwrap();

        connection.execute(
            r#"
            INSERT INTO training_sessions (
                id, asset, trade_date, start_time, end_time,
                timeframe_minutes, warmup_bars, mode, started_at, ended_at, status
            )
            VALUES
                ('active-session', 'WINFUT', '2026-11-14', '09:00', '12:00',
                 2, 260, 'EXAM', '2026-11-14T09:00:00Z', NULL, 'ACTIVE'),
                ('ended-session', 'WDOFUT', '2026-11-13', '09:00', '12:00',
                 2, 260, 'FREE', '2026-11-13T09:00:00Z', '2026-11-13T12:00:00Z', 'ENDED')
            "#,
            [],
        ).unwrap();

        let recovered = recover_abandoned_training_sessions(&mut connection).unwrap();
        assert_eq!(recovered, 1);

        let (status, ended_at): (String, Option<String>) = connection.query_row(
            "SELECT status, ended_at FROM training_sessions WHERE id = 'active-session'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).unwrap();
        assert_eq!(status, "ENDED");
        assert!(ended_at.is_some());

        let (event_type, reason): (String, Option<String>) = connection.query_row(
            "SELECT type, reason FROM training_events WHERE session_id = 'active-session'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).unwrap();
        assert_eq!(event_type, "SESSION_ENDED");
        assert!(reason.unwrap().contains("automaticamente na inicialização"));

        let ended_session_events: i64 = connection.query_row(
            "SELECT COUNT(*) FROM training_events WHERE session_id = 'ended-session'",
            [],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(ended_session_events, 0);

        // Uma segunda inicialização não deve duplicar eventos nem reprocessar sessões.
        assert_eq!(recover_abandoned_training_sessions(&mut connection).unwrap(), 0);
        let recovery_events: i64 = connection.query_row(
            "SELECT COUNT(*) FROM training_events WHERE session_id = 'active-session' AND type = 'SESSION_ENDED'",
            [],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(recovery_events, 1);
    }

    #[test]
    fn base64_validation_rejects_invalid_padding_without_decoding_payload() {
        assert!(validate_base64("YWJj").is_ok());
        assert!(validate_base64("YQ==").is_ok());
        assert!(validate_base64("").is_err());
        assert!(validate_base64("YWI=").is_ok());
        assert!(validate_base64("Y===").is_err());
        assert!(validate_base64("YW=J").is_err());
        assert!(validate_base64("YWJj=").is_err());
    }

    #[test]
    fn replay_backup_export_serializes_file_pair_with_expected_base64() {
        use std::time::{SystemTime, UNIX_EPOCH};

        let unique = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir().join(format!("simulador-backup-stream-{unique}"));
        fs::create_dir_all(&root).unwrap();
        let replay_path = root.join("WINV26.replay.csv");
        let metadata_path = root.join("WINV26.meta.json");
        let replay = b"timestamp;price\\n2026-11-14 09:00:00;130000\\n";
        let metadata = br#"{"summary":{"symbol":"WINFUT"}}"#;
        fs::write(&replay_path, replay).unwrap();
        fs::write(&metadata_path, metadata).unwrap();

        let sources = vec![ReplayBackupSource {
            output_file_name: "0000-WINV26.replay.csv".to_string(),
            replay_path,
            metadata_path,
        }];
        let serialized = serde_json::to_string(&ReplayBackupExportFiles(&sources)).unwrap();
        let parsed: Value = serde_json::from_str(&serialized).unwrap();
        assert_eq!(parsed[0]["outputFileName"], "0000-WINV26.replay.csv");
        assert_eq!(decode_base64(parsed[0]["replayContentBase64"].as_str().unwrap()).unwrap(), replay);
        assert_eq!(decode_base64(parsed[0]["metadataContentBase64"].as_str().unwrap()).unwrap(), metadata);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn backup_import_document_reads_bundle_and_replays_in_one_deserialization() {
        let raw = r#"{
          "format":"simulador-de-trade-backup",
          "schemaVersion":1,
          "appVersion":"0.1.0",
          "exportedAt":"2026-11-14T09:00:00Z",
          "trades":[],
          "trainingSessions":[],
          "trainingEvents":[],
          "executionSettings":{"costPerContractRoundTripBRL":0,"slippageTicksPerSide":0},
          "replayFiles":[{"outputFileName":"0000-WINV26.replay.csv","replayContentBase64":"YWJj","metadataContentBase64":"e30="}]
        }"#;
        let document: BackupImportDocument = serde_json::from_str(raw).unwrap();
        assert_eq!(document.bundle.trades.len(), 0);
        assert_eq!(document.replay_files.len(), 1);
        assert_eq!(document.replay_files[0].output_file_name, "0000-WINV26.replay.csv");
    }

    #[test]
    fn backup_schema_validation_rejects_wrong_format_and_version() {
        let settings = ExecutionSettingsRecord {
                cost_per_contract_round_trip_brl: 0.0,
                cost_win_round_trip_brl: None,
                cost_wdo_round_trip_brl: None,
                slippage_ticks_per_side: 0,
                intrabar_policy: "STOP_FIRST".to_string(),
                disciplined_training_starting_balance_brl: None,
                stop_training_starting_balance_brl: None,
            };

        let mut bundle = BackupBundle {
            format: "simulador-de-trade-backup".to_string(),
            schema_version: 1,
            app_version: "0.1.0".to_string(),
            exported_at: "2026-10-16T18:00:00Z".to_string(),
            trades: Vec::new(),
            training_sessions: Vec::new(),
            training_events: Vec::new(),
            usage_sessions: Vec::new(),
            execution_settings: settings,
        };

        assert!(validate_backup_bundle(&bundle).is_ok());

        bundle.format = "outro-formato".to_string();
        assert!(validate_backup_bundle(&bundle).is_err());

        bundle.format = "simulador-de-trade-backup".to_string();
        bundle.schema_version = 2;
        assert!(validate_backup_bundle(&bundle).is_err());
    }

    #[test]
    fn old_backup_without_intrabar_policy_defaults_to_stop_first() {
        let raw = r#"{
          "format": "simulador-de-trade-backup",
          "schemaVersion": 1,
          "appVersion": "0.1.0",
          "exportedAt": "2026-10-16T18:00:00Z",
          "trades": [],
          "trainingSessions": [],
          "trainingEvents": [],
          "executionSettings": {
            "costPerContractRoundTripBRL": 0,
            "slippageTicksPerSide": 0
          }
        }"#;

        let restored: BackupBundle = serde_json::from_str(raw).unwrap();
        assert_eq!(
            restored.execution_settings.intrabar_policy,
            "STOP_FIRST"
        );
        assert_eq!(restored.execution_settings.disciplined_training_starting_balance_brl, None);
        assert_eq!(restored.execution_settings.stop_training_starting_balance_brl, None);
    }

    #[test]
    fn backup_json_round_trip_preserves_training_capitals() {
        let bundle = BackupBundle {
            format: "simulador-de-trade-backup".to_string(),
            schema_version: 1,
            app_version: "0.1.0".to_string(),
            exported_at: "2026-11-14T09:00:00Z".to_string(),
            trades: Vec::new(),
            training_sessions: Vec::new(),
            training_events: Vec::new(),
            usage_sessions: Vec::new(),
            execution_settings: ExecutionSettingsRecord {
                cost_per_contract_round_trip_brl: 0.0,
                cost_win_round_trip_brl: Some(0.5),
                cost_wdo_round_trip_brl: Some(2.12),
                slippage_ticks_per_side: 0,
                intrabar_policy: "STOP_FIRST".to_string(),
                disciplined_training_starting_balance_brl: Some(2500.0),
                stop_training_starting_balance_brl: Some(1000.0),
            },
        };
        let restored: BackupBundle = serde_json::from_str(&serde_json::to_string(&bundle).unwrap()).unwrap();
        assert_eq!(restored.execution_settings.disciplined_training_starting_balance_brl, Some(2500.0));
        assert_eq!(restored.execution_settings.stop_training_starting_balance_brl, Some(1000.0));
    }

    #[test]
    fn backup_json_round_trip_preserves_entry_context() {
        let trade = TradeRecord {
            id: "backup-trade".to_string(),
            session_id: None,
            asset: "WINFUT".to_string(),
            side: "BUY".to_string(),
            signal_id: "signal-1".to_string(),
            requested_entry: 130000.0,
            entry: 130000.0,
            stop_loss: 129900.0,
            initial_stop_loss: 129900.0,
            target: 130150.0,
            contracts: 1,
            slippage_ticks_per_side: 0,
            cost_per_contract_round_trip_brl: 0.0,
            opened_at: "2026-10-14T09:00:00".to_string(),
            status: "CLOSED".to_string(),
            exit_price: 130150.0,
            exit_reason: "TARGET".to_string(),
            closed_at: "2026-10-14T09:10:00".to_string(),
            result_points: 150.0,
            gross_result_brl: 30.0,
            operational_costs_brl: 0.0,
            net_result_brl: 30.0,
            post_trade_note: "Execução disciplinada".to_string(),
            review: None,
            entry_context: Some(json!({
                "indicatorVersion": "multi-medias-nuvem-v1.0.0",
                "zone": "GREEN"
            })),
            intrabar_policy: "STOP_FIRST".to_string(),
        };

        let bundle = BackupBundle {
            format: "simulador-de-trade-backup".to_string(),
            schema_version: 1,
            app_version: "0.1.0".to_string(),
            exported_at: "2026-10-16T18:00:00Z".to_string(),
            trades: vec![trade],
            training_sessions: Vec::new(),
            training_events: Vec::new(),
            usage_sessions: Vec::new(),
            execution_settings: ExecutionSettingsRecord {
                cost_per_contract_round_trip_brl: 0.0,
                cost_win_round_trip_brl: None,
                cost_wdo_round_trip_brl: None,
                slippage_ticks_per_side: 0,
                intrabar_policy: "STOP_FIRST".to_string(),
                disciplined_training_starting_balance_brl: None,
                stop_training_starting_balance_brl: None,
            },
        };

        let raw = serde_json::to_string(&bundle).unwrap();
        let restored: BackupBundle = serde_json::from_str(&raw).unwrap();

        assert_eq!(restored.trades.len(), 1);
        assert_eq!(
            restored.trades[0].entry_context.as_ref().unwrap()["indicatorVersion"],
            "multi-medias-nuvem-v1.0.0"
        );
        assert_eq!(
            restored.trades[0].post_trade_note,
            "Execução disciplinada"
        );
    }

    #[test]
    fn report_export_path_adds_expected_extension() {
        let path = report_export_path("relatorio-sessao", "json").unwrap();
        assert_eq!(
            path.extension().and_then(|value| value.to_str()),
            Some("json")
        );

        assert!(report_export_path("relatorio.csv", "json").is_err());
        assert!(report_export_path("relatorio.json", "xml").is_err());
    }

    #[test]
    fn writes_report_export_to_disk() {
        use std::time::{SystemTime, UNIX_EPOCH};

        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "simulador-trade-report-{unique}"
        ));
        fs::create_dir_all(&root).unwrap();
        let destination = root.join("sessao");

        let written = write_report_export(
            destination.to_string_lossy().to_string(),
            "{\"ok\":true}".to_string(),
            "json".to_string(),
        )
        .unwrap();

        let written_path = PathBuf::from(written);
        assert!(written_path.exists());
        assert_eq!(
            fs::read_to_string(&written_path).unwrap(),
            "{\"ok\":true}"
        );

        let _ = fs::remove_dir_all(root);
    }

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
    fn parses_two_digit_year_in_combined_profit_timestamp() {
        let parsed = parse_combined_timestamp("07/10/26 09:30:15").unwrap();
        assert_eq!(
            parsed,
            NaiveDate::from_ymd_opt(2026, 10, 7)
                .unwrap()
                .and_hms_opt(9, 30, 15)
                .unwrap()
        );
    }

    #[test]
    fn parses_two_and_four_digit_profit_years_unambiguously() {
        assert_eq!(
            parse_date("07/10/26").unwrap(),
            NaiveDate::from_ymd_opt(2026, 10, 7).unwrap()
        );
        assert_eq!(
            parse_date("07/10/2026").unwrap(),
            NaiveDate::from_ymd_opt(2026, 10, 7).unwrap()
        );
        assert!(parse_date("07/10/026").is_err());
    }

    #[test]
    fn backup_validation_rejects_invalid_execution_values() {
        let mut bundle = BackupBundle {
            format: "simulador-de-trade-backup".to_string(),
            schema_version: 1,
            app_version: "0.1.0".to_string(),
            exported_at: "2026-10-16T18:00:00Z".to_string(),
            trades: Vec::new(),
            training_sessions: Vec::new(),
            training_events: Vec::new(),
            usage_sessions: Vec::new(),
            execution_settings: ExecutionSettingsRecord {
                cost_per_contract_round_trip_brl: -1.0,
                cost_win_round_trip_brl: None,
                cost_wdo_round_trip_brl: None,
                slippage_ticks_per_side: 0,
                intrabar_policy: "STOP_FIRST".to_string(),
                disciplined_training_starting_balance_brl: None,
                stop_training_starting_balance_brl: None,
            },
        };

        assert!(validate_backup_bundle(&bundle).is_err());

        bundle.execution_settings.cost_per_contract_round_trip_brl = 0.0;
        bundle.execution_settings.intrabar_policy = "INVALID".to_string();
        assert!(validate_backup_bundle(&bundle).is_err());
    }

    #[test]
    fn profit_number_normalization_handles_brazilian_prices() {
        assert_eq!(normalize_profit_number("205.935").unwrap(), "205935");
        assert_eq!(normalize_profit_number("5.321,5").unwrap(), "5321.5");
        assert_eq!(normalize_profit_number("5321.5").unwrap(), "5321.5");
    }

    #[test]
    fn parses_profit_m1_export_for_november_12_2026() {
        let header = "Ativo;Data;Hora;Abertura;Máximo;Mínimo;Fechamento;Volume;Quantidade";
        let header_fields = parse_delimited_line(header, detect_delimiter(header));
        let layout = detect_candle_layout(&header_fields)
            .expect("o cabeçalho real do Profit deve ser reconhecido");

        let row = "WINFUT;12/11/2026;18:24:00;172.825;172.850;172.770;172.770;806.932.166,00;23.352";
        let fields = parse_delimited_line(row, ';');
        let timestamp = row_candle_timestamp(&fields, &layout).unwrap();
        let requested_date = parse_date("2026-11-12").unwrap();

        assert_eq!(timestamp.date(), requested_date);
        assert_eq!(timestamp.format("%Y-%m-%dT%H:%M:%S").to_string(), "2026-11-12T18:24:00");
        assert_eq!(parse_candle_price(&fields, layout.volume_idx, 2, "quantidade").unwrap(), 23352.0);
    }

    #[test]
    fn detects_portuguese_m2_ohlcv_header_with_semicolon_delimiter() {
        let line = "Ativo;Data/Hora;Abertura;Máxima;Mínima;Fechamento;Volume";
        let fields = parse_delimited_line(line, detect_delimiter(line));
        let layout = detect_candle_layout(&fields).expect("layout M2 deveria ser reconhecido");

        assert_eq!(layout.symbol_idx, Some(0));
        assert_eq!(layout.timestamp_idx, Some(1));
        assert_eq!(layout.open_idx, 2);
        assert_eq!(layout.high_idx, 3);
        assert_eq!(layout.low_idx, 4);
        assert_eq!(layout.close_idx, 5);
        assert_eq!(layout.volume_idx, 6);
    }

    #[test]
    fn profit_intraday_header_prefers_volume_quantity_over_financial_volume() {
        let header = "Ativo;Data;Abertura;Máxima;Mínima;Fechamento;Volume Financeiro;Volume Quantidade";
        let header_fields = parse_delimited_line(header, detect_delimiter(header));
        let layout = detect_candle_layout(&header_fields).expect("layout OHLCV deveria ser reconhecido");

        assert_eq!(layout.symbol_idx, Some(0));
        assert_eq!(layout.timestamp_idx, Some(1));
        assert_eq!(layout.volume_idx, 7);

        let row = "WINV26;14/10/2026 09:00;130000;130050;129950;130010;168365965;11117500";
        let row_fields = parse_delimited_line(row, ';');
        let timestamp = row_candle_timestamp(&row_fields, &layout).unwrap();
        assert_eq!(timestamp.format("%Y-%m-%dT%H:%M:%S").to_string(), "2026-10-14T09:00:00");
        assert_eq!(parse_candle_price(&row_fields, layout.volume_idx, 2, "volume").unwrap(), 11117500.0);
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
    fn trade_record_uses_expected_tauri_financial_field_name() {
        let record = TradeRecord {
            id: "t1".to_string(),
            session_id: None,
            asset: "WINFUT".to_string(),
            side: "BUY".to_string(),
            signal_id: "s1".to_string(),
            requested_entry: 130000.0,
            entry: 130000.0,
            stop_loss: 129900.0,
            initial_stop_loss: 129900.0,
            target: 130150.0,
            contracts: 2,
            slippage_ticks_per_side: 0,
            cost_per_contract_round_trip_brl: 0.0,
            opened_at: "2026-10-14T09:00:00".to_string(),
            status: "CLOSED".to_string(),
            exit_price: 130150.0,
            exit_reason: "TARGET".to_string(),
            closed_at: "2026-10-14T09:10:00".to_string(),
            result_points: 150.0,
            gross_result_brl: 60.0,
            operational_costs_brl: 0.0,
            net_result_brl: 60.0,
            post_trade_note: "".to_string(),
            review: None,
            entry_context: Some(json!({
                "capturedAt": "2026-10-16T18:00:00Z",
                "marketTimestamp": "2026-10-14T09:00:00-03:00",
                "asset": "WINFUT",
                "candleIndex": 10,
                "currentPrice": 130000,
                "zone": "GREEN",
                "signal": {
                    "id": "s1",
                    "asset": "WINFUT",
                    "side": "BUY",
                    "candleIndex": 10,
                    "timestamp": "2026-10-14T09:00:00-03:00",
                    "price": 130000,
                    "label": "Compra"
                },
                "candles": [],
                "indicatorSeries": [],
                "signals": []
            })),
            intrabar_policy: "STOP_FIRST".to_string(),
        };

        let value = serde_json::to_value(record).unwrap();
        assert_eq!(value["contracts"], 2);
        assert_eq!(value["grossResultBRL"], 60.0);
        assert_eq!(value["netResultBRL"], 60.0);
        assert_eq!(value["costPerContractRoundTripBRL"], 0.0);
        assert_eq!(value["postTradeNote"], "");
        assert_eq!(value["entryContext"]["zone"], "GREEN");
        assert_eq!(value["entryContext"]["signal"]["id"], "s1");
        assert!(value.get("grossResultBrl").is_none());
    }

    fn sample_closed_trade_for_session() -> TradeRecord {
        TradeRecord {
            id: "atomic-trade".to_string(), session_id: None,
            asset: "WINFUT".to_string(), side: "BUY".to_string(),
            signal_id: "signal-atomic".to_string(), requested_entry: 130000.0,
            entry: 130000.0, stop_loss: 129900.0, initial_stop_loss: 129900.0,
            target: 130200.0, contracts: 1, slippage_ticks_per_side: 0,
            cost_per_contract_round_trip_brl: 0.0,
            opened_at: "2026-11-14T09:00:00".to_string(), status: "CLOSED".to_string(),
            exit_price: 130200.0, exit_reason: "TARGET".to_string(),
            closed_at: "2026-11-14T09:10:00".to_string(), result_points: 200.0,
            gross_result_brl: 40.0, operational_costs_brl: 0.0, net_result_brl: 40.0,
            post_trade_note: String::new(), review: None, entry_context: None,
            intrabar_policy: "STOP_FIRST".to_string(),
        }
    }

    fn sample_closed_event_for_session() -> TrainingEventRecord {
        TrainingEventRecord {
            id: "atomic-event".to_string(), session_id: "atomic-session".to_string(),
            r#type: "TRADE_CLOSED".to_string(), timestamp: "2026-11-14T12:10:00Z".to_string(),
            market_timestamp: Some("2026-11-14T09:10:00".to_string()),
            signal_id: Some("signal-atomic".to_string()), side: Some("BUY".to_string()),
            reason: Some("TARGET".to_string()), trade_id: Some("atomic-trade".to_string()),
        }
    }

    fn insert_atomic_test_session(connection: &Connection) {
        connection.execute(
            r#"INSERT INTO training_sessions (
                id, asset, trade_date, start_time, end_time, timeframe_minutes,
                warmup_bars, mode, started_at, ended_at, status, starting_balance_brl
            ) VALUES ('atomic-session', 'WINFUT', '2026-11-14', '09:00', '17:00',
                      2, 50, 'FREE', '2026-11-14T12:00:00Z', NULL, 'ACTIVE', NULL)"#,
            [],
        ).unwrap();
    }

    #[test]
    fn closed_trade_and_session_event_are_saved_atomically() {
        let mut connection = Connection::open_in_memory().unwrap();
        initialize_database(&connection).unwrap();
        insert_atomic_test_session(&connection);
        persist_closed_trade_and_event(
            &mut connection, &sample_closed_trade_for_session(), &sample_closed_event_for_session()
        ).unwrap();

        let (session_id, trade_count, event_count): (Option<String>, i64, i64) = connection.query_row(
            r#"SELECT t.session_id,
                (SELECT COUNT(*) FROM trades WHERE id = 'atomic-trade'),
                (SELECT COUNT(*) FROM training_events WHERE id = 'atomic-event')
                FROM trades t WHERE t.id = 'atomic-trade'"#,
            [], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).unwrap();
        assert_eq!(session_id.as_deref(), Some("atomic-session"));
        assert_eq!(trade_count, 1);
        assert_eq!(event_count, 1);
    }

    #[test]
    fn closed_trade_is_rolled_back_when_session_event_insert_fails() {
        let mut connection = Connection::open_in_memory().unwrap();
        initialize_database(&connection).unwrap();
        insert_atomic_test_session(&connection);
        connection.execute_batch(
            r#"CREATE TRIGGER reject_trade_closed_event
               BEFORE INSERT ON training_events WHEN NEW.type = 'TRADE_CLOSED'
               BEGIN SELECT RAISE(ABORT, 'forced event failure'); END;"#
        ).unwrap();

        let result = persist_closed_trade_and_event(
            &mut connection, &sample_closed_trade_for_session(), &sample_closed_event_for_session()
        );
        assert!(result.is_err());
        let trade_count: i64 = connection.query_row(
            "SELECT COUNT(*) FROM trades WHERE id = 'atomic-trade'", [], |row| row.get(0)
        ).unwrap();
        let event_count: i64 = connection.query_row(
            "SELECT COUNT(*) FROM training_events WHERE id = 'atomic-event'", [], |row| row.get(0)
        ).unwrap();
        assert_eq!(trade_count, 0);
        assert_eq!(event_count, 0);
    }

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

        let (contracts, requested, gross, net, note, context, policy, initial_stop): (i64, f64, f64, f64, String, Option<String>, String, f64) = connection
            .query_row(
                "SELECT contracts, requested_entry, gross_result_brl, net_result_brl, post_trade_note, review_json, entry_context_json, intrabar_policy, initial_stop_loss FROM trades WHERE id = 'legacy-1'",
                [],
                |row| Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                )),
            )
            .unwrap();

        assert_eq!(contracts, 1);
        assert!((requested - 130000.0).abs() < 1e-9);
        assert!((gross - 30.0).abs() < 1e-9);
        assert!((net - 30.0).abs() < 1e-9);
        assert_eq!(note, "");
        assert!(context.is_none());
        assert_eq!(policy, "STOP_FIRST");
        assert!((initial_stop - 129900.0).abs() < 1e-9);
    }

    #[test]
    fn atomic_replace_does_not_touch_user_owned_previous_file() {
        use std::time::{SystemTime, UNIX_EPOCH};
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let directory = std::env::temp_dir().join(format!("simulador-atomic-replace-{nonce}"));
        fs::create_dir_all(&directory).unwrap();
        let output = directory.join("meus.json");
        let temp = directory.join("meus.tmp");
        let user_previous = output.with_extension("replay.previous");
        fs::write(&output, "old").unwrap();
        fs::write(&temp, "new").unwrap();
        fs::write(&user_previous, "arquivo do usuário").unwrap();

        replace_file_safely(&temp, &output).unwrap();

        assert_eq!(fs::read_to_string(&output).unwrap(), "new");
        assert_eq!(fs::read_to_string(&user_previous).unwrap(), "arquivo do usuário");
        assert!(!temp.exists());
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn legacy_training_sessions_default_to_free_mode() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                r#"
                CREATE TABLE training_sessions (
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

                INSERT INTO training_sessions (
                    id, asset, trade_date, start_time, end_time,
                    timeframe_minutes, warmup_bars, started_at, ended_at, status
                )
                VALUES (
                    'legacy-session', 'WINFUT', '2026-10-14', '09:00', '12:00',
                    2, 260, '2026-10-16T10:00:00Z', NULL, 'ACTIVE'
                );
                "#,
            )
            .unwrap();

        initialize_database(&connection).unwrap();

        let mode: String = connection
            .query_row(
                "SELECT mode FROM training_sessions WHERE id = 'legacy-session'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(mode, "FREE");
    }

    #[test]
    fn execution_settings_use_reference_costs_per_asset() {
        let connection = Connection::open_in_memory().unwrap();
        initialize_database(&connection).unwrap();

        let (legacy_cost, win_cost, wdo_cost, slippage, policy): (f64, f64, f64, i64, String) = connection
            .query_row(
                "SELECT cost_per_contract_round_trip_brl, cost_win_round_trip_brl, cost_wdo_round_trip_brl, slippage_ticks_per_side, intrabar_policy FROM execution_settings WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .unwrap();

        assert_eq!(legacy_cost, 0.0);
        assert_eq!(win_cost, 0.50);
        assert_eq!(wdo_cost, 2.12);
        assert_eq!(slippage, 0);
        assert_eq!(policy, "STOP_FIRST");
        let (discipline, stops): (Option<f64>, Option<f64>) = connection.query_row(
            "SELECT disciplined_training_starting_balance_brl, stop_training_starting_balance_brl FROM execution_settings WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).unwrap();
        assert_eq!(discipline, None);
        assert_eq!(stops, None);
    }

    #[test]
    fn database_schema_contains_training_history_tables() {
        let connection = Connection::open_in_memory().unwrap();
        initialize_database(&connection).unwrap();

        for table in [
            "trades",
            "training_sessions",
            "training_events",
            "execution_settings",
        ] {
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

    #[test]
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
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?;

            std::fs::create_dir_all(&data_dir)?;
            let database_path = data_dir.join("simulador-de-trade.sqlite3");
            let mut connection = Connection::open(database_path)?;
            initialize_database(&connection)?;
            // Recupera sessões ACTIVE persistidas por uma execução anterior do app.
            // A atualização e o evento de encerramento são gravados na mesma transação.
            recover_abandoned_training_sessions(&mut connection)?;
            app.manage(DbState(Mutex::new(connection)));
            app.manage(ReplayState(Mutex::new(None)));
            app.manage(ReplayAnalysisState(Mutex::new(None)));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_trade,
            save_closed_trade,
            list_trades,
            list_all_trades,
            delete_all_trades,
            delete_all_database_data,
            export_backup,
            import_backup,
            write_report_export,
            load_execution_settings,
            save_execution_settings,
            save_training_session,
            save_training_event,
            save_usage_session,
            list_usage_sessions,
            list_training_sessions,
            list_training_events,
            list_all_training_events,
            list_session_trades,
            prepare_profit_replay_file,
            profit_index::build_profit_time_index,
            profit_index::locate_profit_time_window,
            replay::open_replay_file,
            replay::next_replay_trades,
            replay::reset_replay_session,
            replay::close_replay_session,
            replay::open_replay_analysis_file,
            replay::next_replay_analysis_trades,
            replay::close_replay_analysis_file,
            replay::load_warmup_candles,
            catalog::register_replay_file,
            catalog::list_replay_catalog,
            catalog::prune_missing_replay_catalog
        ])
        .run(tauri::generate_context!())
        .expect("error while running Simulador de Trade");
}
