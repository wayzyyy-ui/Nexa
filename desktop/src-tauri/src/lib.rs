// Оболочка NEXA для ПК. Окно и его настройки — в tauri.conf.json, права — в capabilities/.
// Этап 1: окно с интерфейсом NEXA и запоминание его размера и положения.
// Этап 2: свои узкие команды для интерфейса (commands.rs): ссылки во внешнем браузере,
// «Сохранить как», «Открыть» в программе Windows, буфер обмена.
// Этап 3 (desktop.rs): трей, одна копия приложения, ссылки nexa://, уведомления Windows,
// автозапуск, сведения о компьютере.
// Этап 4 (updater.rs): обновление с проверкой подписи.
// Этап 5 (clipboard.rs): общий буфер обмена — слежение за буфером Windows.
mod clipboard;
mod commands;
mod desktop;
mod updater;

use tauri::WindowEvent;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_window_state::StateFlags;

// Автозапуск передаёт этот ключ — тогда NEXA стартует свёрнутой в трей
const MINIMIZED_ARG: &str = "--minimized";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    commands::cleanup_open_dir();
    tauri::Builder::default()
        // Первым: второй запуск не открывает ещё одну NEXA, а показывает эту
        // (ссылку nexa:// из второго запуска модуль сам передаёт в deep-link)
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| desktop::show_main(app)))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::Builder::new().arg(MINIMIZED_ARG).build())
        // Обновления: адрес latest.json и открытый ключ — tauri.conf.json → plugins.updater
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Размер, положение и «развёрнуто» окна — между запусками. Видимость не запоминаем:
        // окно, закрытое в трей, при следующем запуске всё равно показываем.
        // Рамку Windows тоже не запоминаем: версия до 0.17.3 сохранила «рамка есть», и после обновления
        // плагин возвращал её поверх своей панели — получалось две полосы с кнопками
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE & !StateFlags::DECORATIONS)
                .build(),
        )
        .manage(desktop::Opens::default())
        .invoke_handler(tauri::generate_handler![
            commands::open_url,
            commands::save_file,
            commands::open_file,
            commands::clipboard_read,
            commands::clipboard_write,
            desktop::take_opens,
            desktop::notify,
            desktop::autostart_get,
            desktop::autostart_set,
            desktop::device_info,
            updater::update_install,
            clipboard::clip_watch,
            desktop::notify_clip,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            desktop::tray(&handle)?;
            // Буфер обмена: поток работает всегда, но интерфейсу пишет, только когда включено
            clipboard::start(handle.clone());
            // Ссылки nexa:// во время работы (второй запуск, браузер) — в очередь интерфейса
            let h = handle.clone();
            app.deep_link().on_open_url(move |e| {
                for u in e.urls() {
                    desktop::push_open(&h, u.as_str());
                }
                desktop::show_main(&h);
            });
            // NEXA запустили ссылкой — она тоже ждёт в очереди
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for u in urls {
                    desktop::push_open(&handle, u.as_str());
                }
            }
            // Окно создаётся скрытым (tauri.conf.json): показываем, если это не автозапуск
            if !std::env::args().any(|a| a == MINIMIZED_ARG) {
                desktop::show_main(&handle);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Крестик — в трей, а не выход (выход — меню значка в трее)
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    desktop::hide_to_tray(window);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("NEXA не запустилась");
}
