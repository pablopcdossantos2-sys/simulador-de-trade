use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;

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
    opened_at: String,
    status: String,
    exit_price: f64,
    exit_reason: String,
    closed_at: String,
    result_points: f64,
}

fn initialize_database(connection: &Connection) -> rusqlite::Result<()> {
    connection
        .execute_batch(
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
                opened_at TEXT NOT NULL,
                status TEXT NOT NULL,
                exit_price REAL NOT NULL,
                exit_reason TEXT NOT NULL,
                closed_at TEXT NOT NULL,
                result_points REAL NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_trades_closed_at
            ON trades(closed_at DESC);
            "#,
        )
        .map(|_| ())
}

#[tauri::command]
fn save_trade(state: tauri::State<'_, DbState>, trade: TradeRecord) -> Result<(), String> {
    let connection = state.0.lock().map_err(|error| error.to_string())?;

    connection
        .execute(
            r#"
            INSERT INTO trades (
                id, asset, side, signal_id, entry, stop_loss, target,
                opened_at, status, exit_price, exit_reason, closed_at, result_points
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            ON CONFLICT(id) DO UPDATE SET
                asset = excluded.asset,
                side = excluded.side,
                signal_id = excluded.signal_id,
                entry = excluded.entry,
                stop_loss = excluded.stop_loss,
                target = excluded.target,
                opened_at = excluded.opened_at,
                status = excluded.status,
                exit_price = excluded.exit_price,
                exit_reason = excluded.exit_reason,
                closed_at = excluded.closed_at,
                result_points = excluded.result_points
            "#,
            params![
                trade.id,
                trade.asset,
                trade.side,
                trade.signal_id,
                trade.entry,
                trade.stop_loss,
                trade.target,
                trade.opened_at,
                trade.status,
                trade.exit_price,
                trade.exit_reason,
                trade.closed_at,
                trade.result_points,
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn list_trades(state: tauri::State<'_, DbState>) -> Result<Vec<TradeRecord>, String> {
    let connection = state.0.lock().map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT
                id, asset, side, signal_id, entry, stop_loss, target,
                opened_at, status, exit_price, exit_reason, closed_at, result_points
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
                opened_at: row.get(7)?,
                status: row.get(8)?,
                exit_price: row.get(9)?,
                exit_reason: row.get(10)?,
                closed_at: row.get(11)?,
                result_points: row.get(12)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
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

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![save_trade, list_trades])
        .run(tauri::generate_context!())
        .expect("error while running Simulador de Trade");
}
