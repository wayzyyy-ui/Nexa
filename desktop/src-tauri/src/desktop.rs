// ПК как устройство NEXA (этап 3): трей, одно окно, ссылки nexa://, уведомления Windows,
// автозапуск и настоящие сведения о компьютере для «Это устройство».
use std::sync::Mutex;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_autostart::ManagerExt as _;

// Что открыть в интерфейсе: ссылки nexa:// (из браузера, ярлыка, уведомления).
// Интерфейс забирает их сам (take_opens) — так ничего не теряется, пока он ещё грузится
#[derive(Default)]
pub struct Opens(Mutex<Vec<String>>);

const MAX_LINK: usize = 512;
const MAX_QUEUE: usize = 20;

// Ссылка NEXA: только своя схема, разумной длины и без служебных знаков.
// Что именно открыть, решает интерфейс (src/lib/deeplink.js) — там своя строгая проверка
pub fn valid_link(url: &str) -> bool {
    url.len() <= MAX_LINK
        && url.to_ascii_lowercase().starts_with("nexa://")
        && !url.chars().any(|c| c.is_control() || c.is_whitespace())
}

// Положить ссылку в очередь и сказать интерфейсу «загляни»
pub fn push_open<R: Runtime>(app: &AppHandle<R>, url: &str) {
    if !valid_link(url) {
        return;
    }
    if let Some(q) = app.try_state::<Opens>() {
        let mut q = q.0.lock().unwrap_or_else(|e| e.into_inner());
        if q.len() < MAX_QUEUE {
            q.push(url.to_string());
        }
    }
    let _ = app.emit("nexa-open", ());
}

/// Интерфейс забирает накопившиеся ссылки (при запуске и по событию nexa-open).
#[tauri::command]
pub fn take_opens(state: tauri::State<'_, Opens>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap_or_else(|e| e.into_inner()))
}

// Показать окно NEXA поверх остальных (из трея, второго запуска, уведомления)
pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

// Значок в трее: нажатие — открыть NEXA, правая кнопка — меню «Открыть» / «Выйти»
pub fn tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Открыть NEXA", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выйти", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("NEXA")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id().as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|t, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                show_main(t.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

// Закрыли окно крестиком: NEXA остаётся в трее (связь, уведомления, «в сети»).
// В первый раз подсказываем уведомлением, где она и как выйти
pub fn hide_to_tray<R: Runtime>(window: &tauri::Window<R>) {
    let _ = window.hide();
    let app = window.app_handle();
    let Ok(dir) = app.path().app_data_dir() else { return };
    let mark = dir.join("tray-hint");
    if mark.exists() {
        return;
    }
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(&mark, b"1");
    toast(app, "NEXA работает в трее", "Связь и уведомления не прерываются. Выйти — правой кнопкой по значку NEXA → «Выйти»", None);
}

/// Уведомление Windows. link — ссылка nexa://, которую откроет нажатие.
#[tauri::command]
pub fn notify(app: AppHandle, title: String, body: String, link: Option<String>) -> Result<(), String> {
    let link = link.filter(|l| valid_link(l));
    if toast(&app, &cut(&title, 120), &cut(&body, 300), link) { Ok(()) } else { Err("notify_failed".into()) }
}

fn cut(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

#[cfg(windows)]
fn toast<R: Runtime>(app: &AppHandle<R>, title: &str, body: &str, link: Option<String>) -> bool {
    use tauri_winrt_notification::Toast;
    // Уведомления Windows привязаны к ярлыку приложения в меню «Пуск» (его создаёт установщик,
    // id = identifier). Запуск без установки (проверка сборки) — показываем от имени PowerShell
    let id = app.config().identifier.clone();
    let app_id = if start_menu_shortcut() { id } else { Toast::POWERSHELL_APP_ID.to_string() };
    let handle = app.clone();
    Toast::new(&app_id)
        .title(title)
        .text1(body)
        .on_activated(move |_| {
            // Нажали — показываем NEXA и передаём, куда перейти (пока NEXA запущена)
            show_main(&handle);
            if let Some(l) = &link {
                push_open(&handle, l);
            }
            Ok(())
        })
        .show()
        .is_ok()
}

/// Общий буфер обмена: уведомление «Скопировано на …» с кнопкой «Скопировать».
/// Кнопка кладёт текст в буфер этого ПК (только по нажатию человека), нажатие на само
/// уведомление открывает NEXA на списке буфера.
#[tauri::command]
pub fn notify_clip(app: AppHandle, title: String, text: String) -> Result<(), String> {
    if text.trim().is_empty() || text.chars().count() > 10_000 {
        return Err("bad_text".into());
    }
    clip_toast(&app, &cut(&title, 120), text)
}

#[cfg(windows)]
fn clip_toast<R: Runtime>(app: &AppHandle<R>, title: &str, text: String) -> Result<(), String> {
    use tauri_winrt_notification::Toast;
    let id = app.config().identifier.clone();
    let app_id = if start_menu_shortcut() { id } else { Toast::POWERSHELL_APP_ID.to_string() };
    let preview = cut(&text.split_whitespace().collect::<Vec<_>>().join(" "), 200);
    let handle = app.clone();
    Toast::new(&app_id)
        .title(title)
        .text1(&preview)
        .add_button("Скопировать", "copy")
        .on_activated(move |action| {
            if action.as_deref() == Some("copy") {
                if let Ok(mut cb) = arboard::Clipboard::new() {
                    if cb.set_text(text.clone()).is_ok() {
                        crate::clipboard::mark_own_write();
                    }
                }
            } else {
                show_main(&handle);
                push_open(&handle, "nexa://clip");
            }
            Ok(())
        })
        .show()
        .map_err(|_| "notify_failed".to_string())
}

#[cfg(not(windows))]
fn clip_toast<R: Runtime>(_: &AppHandle<R>, _: &str, _: String) -> Result<(), String> {
    Err("notify_failed".into())
}

#[cfg(not(windows))]
fn toast<R: Runtime>(_: &AppHandle<R>, _: &str, _: &str, _: Option<String>) -> bool {
    false
}

#[cfg(windows)]
fn start_menu_shortcut() -> bool {
    // Установщик кладёт ярлык прямо в «Программы» или в папку NEXA внутри них
    std::env::var_os("APPDATA")
        .map(|a| {
            let p = std::path::PathBuf::from(a).join(r"Microsoft\Windows\Start Menu\Programs");
            p.join("NEXA.lnk").exists() || p.join(r"NEXA\NEXA.lnk").exists()
        })
        .unwrap_or(false)
}

/// Включён ли автозапуск вместе с Windows.
#[tauri::command]
pub fn autostart_get(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|_| "autostart".into())
}

/// Включить / выключить автозапуск (NEXA стартует свёрнутой в трей).
#[tauri::command]
pub fn autostart_set(app: AppHandle, on: bool) -> Result<bool, String> {
    let a = app.autolaunch();
    let r = if on { a.enable() } else { a.disable() };
    r.map_err(|_| "autostart".to_string())?;
    a.is_enabled().map_err(|_| "autostart".into())
}

// Сведения о компьютере. Нет данных — null, интерфейс пишет «Нет данных»
#[derive(Serialize, Default)]
pub struct DeviceInfo {
    name: Option<String>,
    form: Option<&'static str>, // "laptop" (есть батарея) | "desktop"
    battery: Option<u8>,
    charging: Option<bool>,
    ac: bool, // от сети, батареи нет
    net: Option<&'static str>, // "wifi" | "ethernet" | "cellular" | "none"
    disk_free: Option<u64>,
    disk_total: Option<u64>,
}

/// Имя компьютера, ноутбук или нет, заряд, сеть и место на системном диске.
#[tauri::command]
pub async fn device_info() -> DeviceInfo {
    win::read()
}

#[cfg(not(windows))]
mod win {
    pub fn read() -> super::DeviceInfo {
        super::DeviceInfo::default()
    }
}

#[cfg(windows)]
mod win {
    use super::DeviceInfo;
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::NetworkManagement::IpHelper::{
        GetAdaptersAddresses, GAA_FLAG_INCLUDE_GATEWAYS, GAA_FLAG_SKIP_ANYCAST, GAA_FLAG_SKIP_DNS_SERVER,
        GAA_FLAG_SKIP_MULTICAST, IP_ADAPTER_ADDRESSES_LH,
    };
    use windows::Win32::NetworkManagement::Ndis::IfOperStatusUp;
    use windows::Win32::Networking::WinSock::AF_UNSPEC;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    use windows::Win32::System::SystemInformation::{ComputerNamePhysicalDnsHostname, GetComputerNameExW};

    pub fn read() -> DeviceInfo {
        let mut out = DeviceInfo { name: name(), ..Default::default() };
        power(&mut out);
        out.net = net();
        disk(&mut out);
        out
    }

    fn name() -> Option<String> {
        let mut buf = [0u16; 256];
        let mut len = buf.len() as u32;
        unsafe { GetComputerNameExW(ComputerNamePhysicalDnsHostname, Some(PWSTR(buf.as_mut_ptr())), &mut len) }.ok()?;
        let s = String::from_utf16_lossy(&buf[..len as usize]).trim().to_string();
        (!s.is_empty()).then(|| s.chars().take(60).collect())
    }

    fn power(out: &mut DeviceInfo) {
        let mut st = SYSTEM_POWER_STATUS::default();
        if unsafe { GetSystemPowerStatus(&mut st) }.is_err() {
            return;
        }
        // 128 — батареи нет (настольный компьютер), 255 — неизвестно
        if st.BatteryFlag == 255 {
            return;
        }
        if st.BatteryFlag & 128 != 0 {
            out.form = Some("desktop");
            out.ac = true;
            return;
        }
        out.form = Some("laptop");
        if st.BatteryLifePercent <= 100 {
            out.battery = Some(st.BatteryLifePercent);
        }
        out.charging = match st.ACLineStatus { 1 => Some(true), 0 => Some(false), _ => None };
    }

    fn disk(out: &mut DeviceInfo) {
        let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into()) + "\\";
        let wide: Vec<u16> = drive.encode_utf16().chain(Some(0)).collect();
        let (mut free, mut total) = (0u64, 0u64);
        if unsafe { GetDiskFreeSpaceExW(PCWSTR(wide.as_ptr()), Some(&mut free), Some(&mut total), None) }.is_ok()
            && total > 0
            && free <= total
        {
            out.disk_free = Some(free);
            out.disk_total = Some(total);
        }
    }

    // Сеть: работающий адаптер со шлюзом (через него и идёт интернет). Проводная важнее Wi-Fi
    fn net() -> Option<&'static str> {
        let flags = GAA_FLAG_INCLUDE_GATEWAYS | GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER;
        let mut size: u32 = 16 * 1024;
        let mut buf: Vec<u64> = Vec::new(); // u64 — выравнивание под структуру
        let mut code = 111; // ERROR_BUFFER_OVERFLOW
        for _ in 0..3 {
            buf = vec![0u64; (size as usize).div_ceil(8)];
            let p = buf.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH;
            code = unsafe { GetAdaptersAddresses(AF_UNSPEC.0 as u32, flags, None, Some(p), &mut size) };
            if code != 111 {
                break;
            }
        }
        if code != 0 {
            return None;
        }
        let (mut wired, mut wifi, mut cell) = (false, false, false);
        let mut p = buf.as_ptr() as *const IP_ADAPTER_ADDRESSES_LH;
        while !p.is_null() {
            let a = unsafe { &*p };
            if a.OperStatus == IfOperStatusUp && !a.FirstGatewayAddress.is_null() {
                match a.IfType {
                    6 => wired = true,          // Ethernet
                    71 => wifi = true,          // Wi-Fi
                    243 | 244 => cell = true,   // мобильная сеть
                    _ => {}
                }
            }
            p = a.Next;
        }
        Some(if wired { "ethernet" } else if wifi { "wifi" } else if cell { "cellular" } else { "none" })
    }
}

#[cfg(test)]
mod tests {
    use super::valid_link;

    #[test]
    fn only_nexa_links() {
        assert!(valid_link("nexa://chat/1b2c"));
        assert!(valid_link("NEXA://tab/today"));
        assert!(!valid_link("https://nexa-link.ru"));
        assert!(!valid_link("nexa://chat/a b"));
        assert!(!valid_link(&format!("nexa://{}", "a".repeat(600))));
    }
}
