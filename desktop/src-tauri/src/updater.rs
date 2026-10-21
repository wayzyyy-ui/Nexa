// Обновление приложения для ПК (этап 4). Что вышло и что нового — интерфейс узнаёт из
// version.json сайта (блок desktop); здесь только установка: модуль tauri-plugin-updater
// берёт public/desktop/latest.json, скачивает установщик, проверяет подпись открытым ключом
// из tauri.conf.json (и что подписана именно эта версия — от «отката» на старую),
// запускает установщик в тихом режиме (окошко с прогрессом) и закрывает NEXA.
// Установщик ставит новую версию поверх и сам запускает её. Данные остаются:
// они в папке WebView2 (%LOCALAPPDATA%\ru.nexalink.desktop), установщик её не трогает.
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::AppHandle;
use tauri_plugin_updater::{Error, UpdaterExt};

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum UpdateEvent {
    // Скачано байт из total (total может быть неизвестен)
    Progress { loaded: u64, total: Option<u64> },
    // Скачано — дальше проверка подписи; прошла — установщик, и NEXA сразу закрывается
    Downloaded,
}

/// Установить обновление `version` (то, что интерфейс показал человеку).
/// Ошибки — короткие коды, тексты для человека — в src/lib/updates.js.
#[tauri::command]
pub async fn update_install(app: AppHandle, version: String, on_event: Channel<UpdateEvent>) -> Result<(), String> {
    if !configured(&app) {
        return Err("not_configured".into());
    }
    let updater = app.updater().map_err(code)?;
    let Some(update) = updater.check().await.map_err(code)? else {
        return Err("no_update".into());
    };
    // На сайте уже другая версия, чем показали человеку, — пусть проверит заново
    if update.version != version {
        return Err("version_mismatch".into());
    }
    let mut loaded: u64 = 0;
    update
        .download_and_install(
            |chunk, total| {
                loaded += chunk as u64;
                let _ = on_event.send(UpdateEvent::Progress { loaded, total });
            },
            || {
                let _ = on_event.send(UpdateEvent::Downloaded);
            },
        )
        .await
        .map_err(code)?;
    // Сюда в Windows не доходим: после запуска установщика NEXA закрывается сама
    Ok(())
}

// Открытый ключ ещё не вписан (ключ подписи не создан) — обновляться нечем
fn configured(app: &AppHandle) -> bool {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|u| u.get("pubkey"))
        .and_then(|k| k.as_str())
        .is_some_and(|k| !k.trim().is_empty())
}

fn code(e: Error) -> String {
    match e {
        Error::Minisign(_) | Error::Base64(_) | Error::SignatureUtf8(_) | Error::SignedVersionMismatch { .. } | Error::MissingSignedVersion => "signature",
        Error::Reqwest(_) | Error::Network(_) | Error::Http(_) => "network",
        Error::ReleaseNotFound | Error::TargetNotFound(_) | Error::TargetsNotFound(_) => "not_found",
        _ => "failed",
    }
    .into()
}
