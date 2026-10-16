use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayCatalogEntry {
    pub output_path: String,
    pub metadata_path: String,
    pub symbol: String,
    pub asset: String,
    pub trade_date: String,
    pub session_start: String,
    pub session_end: String,
    pub first_timestamp: Option<String>,
    pub last_timestamp: Option<String>,
    pub file_bytes: u64,
    pub exists: bool,
}

fn asset_from_symbol(symbol: &str) -> Result<String, String> {
    let upper = symbol.trim().to_uppercase();
    if upper.starts_with("WIN") {
        Ok("WINFUT".to_string())
    } else if upper.starts_with("WDO") {
        Ok("WDOFUT".to_string())
    } else {
        Err(format!("Contrato não suportado no catálogo: {symbol}"))
    }
}

fn hhmm(value: &str) -> String {
    value.chars().take(5).collect()
}

fn catalog_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("replay-catalog.json"))
}

fn load_catalog(app: &tauri::AppHandle) -> Result<Vec<ReplayCatalogEntry>, String> {
    let path = catalog_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }

    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

fn save_catalog(
    app: &tauri::AppHandle,
    entries: &[ReplayCatalogEntry],
) -> Result<(), String> {
    let path = catalog_path(app)?;
    let raw = serde_json::to_string_pretty(entries).map_err(|error| error.to_string())?;
    fs::write(path, raw).map_err(|error| error.to_string())
}

fn read_metadata(output_path: &Path) -> Result<(PathBuf, Value), String> {
    let metadata_path = output_path.with_extension("meta.json");
    if !metadata_path.exists() {
        return Err(format!(
            "Metadados não encontrados para o arquivo de replay: {}",
            metadata_path.to_string_lossy()
        ));
    }

    let raw = fs::read_to_string(&metadata_path).map_err(|error| error.to_string())?;
    let value = serde_json::from_str::<Value>(&raw).map_err(|error| error.to_string())?;
    Ok((metadata_path, value))
}

fn string_at<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut cursor = value;
    for key in path {
        cursor = cursor.get(*key)?;
    }
    cursor.as_str()
}

fn build_entry(output_path: &Path) -> Result<ReplayCatalogEntry, String> {
    if !output_path.exists() || !output_path.is_file() {
        return Err("Arquivo de replay não encontrado para catalogação.".to_string());
    }

    let (metadata_path, metadata) = read_metadata(output_path)?;
    let summary = metadata
        .get("summary")
        .ok_or_else(|| "Metadados sem resumo do tratamento.".to_string())?;

    let symbol = summary
        .get("symbol")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let asset = asset_from_symbol(&symbol)?;
    let first_timestamp = summary
        .get("firstTimestamp")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    let last_timestamp = summary
        .get("lastTimestamp")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);

    let trade_date = first_timestamp
        .as_deref()
        .and_then(|value| value.get(0..10))
        .ok_or_else(|| "Não foi possível identificar a data do pregão tratado.".to_string())?
        .to_string();

    let session_start = string_at(&metadata, &["window", "startInclusive"])
        .map(hhmm)
        .ok_or_else(|| "Metadados sem horário inicial.".to_string())?;
    let session_end = string_at(&metadata, &["window", "endExclusive"])
        .map(hhmm)
        .ok_or_else(|| "Metadados sem horário final.".to_string())?;

    let file_bytes = fs::metadata(output_path)
        .map_err(|error| error.to_string())?
        .len();

    Ok(ReplayCatalogEntry {
        output_path: output_path.to_string_lossy().to_string(),
        metadata_path: metadata_path.to_string_lossy().to_string(),
        symbol,
        asset,
        trade_date,
        session_start,
        session_end,
        first_timestamp,
        last_timestamp,
        file_bytes,
        exists: true,
    })
}

#[tauri::command]
pub fn register_replay_file(
    app: tauri::AppHandle,
    output_path: String,
) -> Result<ReplayCatalogEntry, String> {
    let path = PathBuf::from(output_path.trim().trim_matches('"'));
    let entry = build_entry(&path)?;
    let mut entries = load_catalog(&app)?;

    entries.retain(|existing| existing.output_path != entry.output_path);
    entries.push(entry.clone());
    entries.sort_by(|a, b| {
        a.trade_date
            .cmp(&b.trade_date)
            .then(a.session_start.cmp(&b.session_start))
            .then(a.symbol.cmp(&b.symbol))
    });

    save_catalog(&app, &entries)?;
    Ok(entry)
}

#[tauri::command]
pub fn list_replay_catalog(
    app: tauri::AppHandle,
) -> Result<Vec<ReplayCatalogEntry>, String> {
    let mut entries = load_catalog(&app)?;

    for entry in &mut entries {
        entry.exists = Path::new(&entry.output_path).exists()
            && Path::new(&entry.metadata_path).exists();
    }

    save_catalog(&app, &entries)?;
    Ok(entries)
}

#[tauri::command]
pub fn prune_missing_replay_catalog(
    app: tauri::AppHandle,
) -> Result<Vec<ReplayCatalogEntry>, String> {
    let mut entries = load_catalog(&app)?;
    entries.retain(|entry| {
        Path::new(&entry.output_path).exists() && Path::new(&entry.metadata_path).exists()
    });
    save_catalog(&app, &entries)?;
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_supported_symbols_to_asset_family() {
        assert_eq!(asset_from_symbol("WINV26").unwrap(), "WINFUT");
        assert_eq!(asset_from_symbol("WDOZ26").unwrap(), "WDOFUT");
        assert!(asset_from_symbol("PETR4").is_err());
    }

    #[test]
    fn normalizes_window_to_hhmm() {
        assert_eq!(hhmm("09:00:00"), "09:00");
        assert_eq!(hhmm("18:30:00"), "18:30");
    }
}
