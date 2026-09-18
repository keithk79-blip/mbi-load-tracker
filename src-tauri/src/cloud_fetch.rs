//! Native HTTP for Supabase from the desktop shell.
//! WebView fetch and plugin-http both fail CORS/TLS on Windows; this uses
//! the same reqwest + rustls-native-roots stack as SigAlert.

use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::time::Duration;

const TIMEOUT_SECS: u64 = 20;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudFetchArgs {
    pub url: String,
    pub method: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<Vec<u8>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudFetchResult {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

fn host_allowed(url: &reqwest::Url) -> bool {
    let host = url.host_str().unwrap_or("");
    host.ends_with(".supabase.co") || host.ends_with(".supabase.in") || host == "supabase.co"
}

fn err_chain(err: &dyn Error) -> String {
    let mut out = err.to_string();
    let mut src = err.source();
    while let Some(inner) = src {
        out.push_str(" | ");
        out.push_str(&inner.to_string());
        src = inner.source();
    }
    out
}

#[tauri::command]
pub async fn cloud_fetch(args: CloudFetchArgs) -> Result<CloudFetchResult, String> {
    let url = reqwest::Url::parse(&args.url).map_err(|e| format!("Bad cloud URL: {e}"))?;
    if !host_allowed(&url) {
        return Err(format!("Blocked host: {}", url.host_str().unwrap_or("?")));
    }

    let method = reqwest::Method::from_bytes(args.method.as_bytes())
        .map_err(|e| format!("Bad HTTP method: {e}"))?;

    let mut headers = HeaderMap::new();
    for (key, value) in args.headers {
        let name = HeaderName::from_bytes(key.as_bytes())
            .map_err(|e| format!("Bad header name {key}: {e}"))?;
        let val = HeaderValue::from_str(&value)
            .map_err(|e| format!("Bad header value {key}: {e}"))?;
        headers.append(name, val);
    }

    let client = Client::builder()
        .use_rustls_tls()
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Cloud HTTP client: {e}"))?;

    let mut req = client.request(method, url).headers(headers);
    if let Some(body) = args.body {
        if !body.is_empty() {
            req = req.body(body);
        }
    }

    let res = req.send().await.map_err(|e| err_chain(&e))?;
    let status = res.status().as_u16();
    let out_headers: Vec<(String, String)> = res
        .headers()
        .iter()
        .filter_map(|(k, v)| Some((k.to_string(), v.to_str().ok()?.to_string())))
        .collect();
    let body = res.bytes().await.map_err(|e| err_chain(&e))?.to_vec();
    Ok(CloudFetchResult {
        status,
        headers: out_headers,
        body,
    })
}
