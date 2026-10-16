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
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaySessionInfo {
    pub source_path: String,
    pub symbol: String,
    pub asset: String,
    pub finished: bool,
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
    let fields: Vec<&str> = line.trim_end_matches(['\r', '\n']).split(',').collect();
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
    if header.trim_end_matches(['\r', '\n'])
        != "symbol,timestamp,source_row,price,quantity"
    {
        return Err(
            "O arquivo não corresponde ao formato .replay.csv gerado pelo Simulador de Trade."
                .to_string(),
        );
    }
    Ok(())
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

    let mut first_line = String::new();
    let read = reader
        .read_line(&mut first_line)
        .map_err(|error| error.to_string())?;
    if read == 0 {
        return Err("O arquivo de replay não possui negócios.".to_string());
    }

    let first_fields: Vec<&str> = first_line.trim_end_matches(['\r', '\n']).split(',').collect();
    if first_fields.len() != 5 {
        return Err("Primeira linha de replay inválida.".to_string());
    }

    let symbol = first_fields[0].trim().to_string();
    let asset = parse_asset(&symbol)?.to_string();
    parse_replay_line(&first_line, &asset, 0)?;

    reader
        .seek(SeekFrom::Start(data_start))
        .map_err(|error| error.to_string())?;

    let info = ReplaySessionInfo {
        source_path: path.to_string_lossy().to_string(),
        symbol: symbol.clone(),
        asset: asset.clone(),
        finished: false,
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
        },
        info,
    ))
}

#[tauri::command]
pub fn open_replay_file(
    state: tauri::State<'_, ReplayState>,
    source_path: String,
) -> Result<ReplaySessionInfo, String> {
    let path = PathBuf::from(source_path.trim().trim_matches('"'));
    let (session, info) = open_session(&path)?;
    let mut guard = state.0.lock().map_err(|error| error.to_string())?;
    *guard = Some(session);
    Ok(info)
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

    if session.finished {
        return Ok(Vec::new());
    }

    let limit = max_events.clamp(1, 5000);
    let mut result = Vec::with_capacity(limit);

    for _ in 0..limit {
        let mut line = String::new();
        let read = session
            .reader
            .read_line(&mut line)
            .map_err(|error| error.to_string())?;

        if read == 0 {
            session.finished = true;
            break;
        }

        let record = parse_replay_line(&line, &session.asset, session.sequence)?;
        session.sequence += 1;
        result.push(record);
    }

    Ok(result)
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

    Ok(ReplaySessionInfo {
        source_path: session.source_path.to_string_lossy().to_string(),
        symbol: session.symbol.clone(),
        asset: session.asset.clone(),
        finished: false,
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
}
