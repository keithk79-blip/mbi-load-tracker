//! Fetch SigAlert Chicago incidents from the native side (reqwest + rustls).
//! Path in Map.asp rotates — always re-read; never hardcode forever.

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const MAP_URL: &str = "https://www.sigalert.com/Map.asp?region=Chicago";
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 LoadTracker/1.0";
const TIMEOUT_SECS: u64 = 20;

#[derive(Debug, Deserialize)]
struct TrafficDataEntry {
    id: Option<String>,
    region: Option<String>,
    path: String,
    #[serde(rename = "cacheBuster")]
    cache_buster: i64,
    #[serde(rename = "rootPath")]
    root_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SigalertChicagoFeed {
    pub region: String,
    pub path: String,
    #[serde(rename = "cacheBuster")]
    pub cache_buster: i64,
    pub incidents: serde_json::Value,
}

fn snippet(text: &str, max: usize) -> String {
    let flat: String = text
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .take(max)
        .collect();
    flat.trim().to_string()
}

fn extract_balanced_array(src: &str) -> Result<String, String> {
    let bytes = src.as_bytes();
    if bytes.first() != Some(&b'[') {
        return Err("expected '[' for trafficData".into());
    }
    let mut depth = 0i32;
    let mut in_str = false;
    let mut escape = false;
    for (i, &b) in bytes.iter().enumerate() {
        if in_str {
            if escape {
                escape = false;
                continue;
            }
            if b == b'\\' {
                escape = true;
                continue;
            }
            if b == b'"' {
                in_str = false;
            }
            continue;
        }
        match b {
            b'"' => in_str = true,
            b'[' => depth += 1,
            b']' => {
                depth -= 1;
                if depth == 0 {
                    return Ok(src[..=i].to_string());
                }
            }
            _ => {}
        }
    }
    Err("unterminated trafficData array in Map.asp".into())
}

pub fn parse_traffic_data(html: &str) -> Result<TrafficDataEntry, String> {
    let key = "\"trafficData\"";
    let start = html
        .find(key)
        .ok_or_else(|| "Map.asp HTML missing trafficData".to_string())?;
    let after = &html[start + key.len()..];
    let bracket = after
        .find('[')
        .ok_or_else(|| "Map.asp trafficData is not an array".to_string())?;
    let array_json = extract_balanced_array(&after[bracket..])?;
    let entries: Vec<TrafficDataEntry> = serde_json::from_str(&array_json).map_err(|e| {
        format!(
            "Map.asp trafficData JSON: {e} ({})",
            snippet(&array_json, 120)
        )
    })?;
    entries
        .into_iter()
        .find(|e| {
            e.id.as_deref().is_some_and(|id| id.eq_ignore_ascii_case("Chicago"))
                || e.region
                    .as_deref()
                    .is_some_and(|r| r.eq_ignore_ascii_case("Chicago"))
        })
        .ok_or_else(|| "Map.asp trafficData has no Chicago region".into())
}

fn data_urls(entry: &TrafficDataEntry) -> Vec<String> {
    let root = entry
        .root_path
        .as_deref()
        .unwrap_or("/Data")
        .trim_end_matches('/');
    let path = entry.path.trim_matches('/');
    let region = entry
        .region
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or("Chicago");
    let file = format!("{region}Data.json");
    let q = format!("cb={}", entry.cache_buster);
    [
        "https://cdn-dynamic.sigalert.com",
        "https://www.sigalert.com",
        "https://cdn.sigalert.com",
    ]
    .into_iter()
    .map(|host| format!("{host}{root}/{path}/{file}?{q}"))
    .collect()
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .use_rustls_tls()
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        .connect_timeout(Duration::from_secs(10))
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
        .map_err(|e| format!("SigAlert HTTP client: {e}"))
}

async fn get_text(client: &Client, url: &str, accept: &str) -> Result<String, String> {
    let res = client
        .get(url)
        .header("Accept", accept)
        .header("Referer", MAP_URL)
        .send()
        .await
        .map_err(|e| format!("{url}: {e}"))?;
    let status = res.status();
    let body = res
        .text()
        .await
        .map_err(|e| format!("{url} body: {e}"))?;
    if !status.is_success() {
        return Err(format!(
            "HTTP {status} {url} {}",
            snippet(&body, 100)
        ));
    }
    Ok(body)
}

pub async fn fetch_sigalert_chicago_feed() -> Result<SigalertChicagoFeed, String> {
    let client = http_client()?;
    let html = get_text(&client, MAP_URL, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
        .await
        .map_err(|e| format!("SigAlert Map.asp: {e}"))?;
    let entry = parse_traffic_data(&html)?;
    let region = entry
        .region
        .clone()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Chicago".into());
    let urls = data_urls(&entry);
    let mut last_err = "no SigAlert data URLs".to_string();
    for url in &urls {
        match get_text(&client, url, "application/json,text/plain;q=0.9,*/*;q=0.8").await {
            Ok(body) => {
                let value: serde_json::Value = serde_json::from_str(&body).map_err(|e| {
                    format!("SigAlert data JSON {url}: {e} ({})", snippet(&body, 100))
                })?;
                let incidents = value.get("incidents").cloned().ok_or_else(|| {
                    format!("SigAlert {url} missing incidents key")
                })?;
                if !incidents.is_array() {
                    return Err(format!("SigAlert {url} incidents is not an array"));
                }
                return Ok(SigalertChicagoFeed {
                    region,
                    path: entry.path.clone(),
                    cache_buster: entry.cache_buster,
                    incidents,
                });
            }
            Err(e) => last_err = e,
        }
    }
    Err(format!("SigAlert ChicagoData.json: {last_err}"))
}

#[tauri::command]
pub async fn fetch_sigalert_chicago() -> Result<SigalertChicagoFeed, String> {
    fetch_sigalert_chicago_feed().await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_embedded_chicago_traffic_data() {
        let html = r#"{"foo":1},"trafficData": [{"id":"Chicago","region":"Chicago","path":"Chicago/3~j","cacheBuster":31971508,"rootPath":"/Data","maxDataAgeMS":300000}] }"#;
        let e = parse_traffic_data(html).expect("parse");
        assert_eq!(e.path, "Chicago/3~j");
        assert_eq!(e.cache_buster, 31971508);
        assert_eq!(e.root_path.as_deref(), Some("/Data"));
        let urls = data_urls(&e);
        assert!(urls[0].starts_with("https://cdn-dynamic.sigalert.com/Data/Chicago/3~j/ChicagoData.json?cb=31971508"));
    }
}
