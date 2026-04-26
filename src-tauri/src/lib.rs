// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
use tauri::Manager;
use std::process::Command;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Skip backend startup in development (managed by vite/npm dev server)
            if cfg!(debug_assertions) {
                return Ok(());
            }

            // 📦 get bundled resource path
            let resource_dir = app.path().resource_dir().expect("no resource dir");

            // Tauri v2 bundles resources outside the src-tauri folder under a "_up_" directory
            let mut backend_path = resource_dir.join("_up_").join("backend").join("dist").join("server.js");

            // Fallback for cases where it might be bundled directly
            if !backend_path.exists() {
                backend_path = resource_dir.join("backend").join("dist").join("server.js");
            }

            println!("Starting backend from: {:?}", backend_path);

            Command::new("node")
                .arg(backend_path)
                .spawn()
                .expect("failed to start backend");

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
