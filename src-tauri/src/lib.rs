mod cloud_fetch;
mod dispatch_board;
mod sigalert;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            sigalert::fetch_sigalert_chicago,
            cloud_fetch::cloud_fetch,
            dispatch_board::fetch_dispatch_board_csv,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Load Tracker");
}
