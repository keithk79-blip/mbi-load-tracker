//! Native GET of the daily Dispatch Board Loads-tab CSV (gviz).
//! WebView fetch hits Google CORS; plugin-http is a fallback only.

use reqwest::Client;
use std::time::Duration;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 LoadTracker/1.0";
const TIMEOUT_SECS: u64 = 20;

fn id_ok(id: &str) -> bool {
    let len = id.len();
    (20..=80).contains(&len)
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn snippet(text: &str, max: usize) -> String {
    let flat: String = text
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .take(max)
        .collect();
    flat.trim().to_string()
}

#[tauri::command]
pub async fn fetch_dispatch_board_csv(id: String) -> Result<String, String> {
    if !id_ok(&id) {
        return Err("Bad Dispatch Board spreadsheet id.".into());
    }
    let url = format!(
        "https://docs.google.com/spreadsheets/d/{id}/gviz/tq?tqx=out:csv&sheet=Loads"
    );
    let client = Client::builder()
        .use_rustls_tls()
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        .connect_timeout(Duration::from_secs(10))
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
        .map_err(|e| format!("Dispatch Board HTTP client: {e}"))?;
    let res = client
        .get(&url)
        .header("Accept", "text/csv,text/plain;q=0.9")
        .send()
        .await
        .map_err(|e| format!("Dispatch Board GET: {e}"))?;
    let status = res.status();
    let body = res
        .text()
        .await
        .map_err(|e| format!("Dispatch Board body: {e}"))?;
    if !status.is_success() {
        return Err(format!(
            "Dispatch Board HTTP {status} {}",
            snippet(&body, 100)
        ));
    }
    let trimmed = body.trim();
    if trimmed.is_empty() || trimmed.starts_with('<') {
        return Err(
            "Dispatch Board is not readable as CSV. Share it Viewer-with-link.".into(),
        );
    }
    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_docs_ids_and_rejects_junk() {
        assert!(id_ok("1VyHTGxii4gYZRUiOwuC_op8eaw9fq92dlOQxR2E6Riw"));
        assert!(!id_ok("short"));
        assert!(!id_ok("https://docs.google.com/spreadsheets/d/abc"));
    }
}
