// Команды, которые интерфейс NEXA зовёт из окна ПК (src/lib/desktop.js → invoke).
// Каждая делает одно узкое дело — доступа к диску и системе «вообще» у страницы нет.
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::ipc::{InvokeBody, Request};

// Файлы больше 50 МБ NEXA не хранит — с запасом
const MAX_FILE_BYTES: usize = 60 * 1024 * 1024;
// Длинный текст в буфер не пишем (Flow и так до 2000 знаков)
const MAX_CLIPBOARD_CHARS: usize = 100_000;
// Временная папка для «Открыть»: чистится при каждом запуске
const OPEN_DIR: &str = "nexa-open";

// Такие файлы по «Открыть» не запускаем: это программы и сценарии.
// Их можно только сохранить («Скачать») и открыть самим, понимая, что это.
const BLOCKED_EXT: &[&str] = &[
    "exe", "com", "bat", "cmd", "msi", "msix", "msixbundle", "msp", "appx", "appxbundle", "appref-ms",
    "ps1", "psm1", "psd1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "hta", "html", "htm", "xhtml",
    "mht", "mhtml", "svg", "lnk", "url", "scr", "pif", "cpl", "reg", "jar", "inf", "scf", "chm",
    "dll", "sys", "application", "gadget", "msc", "iso", "img", "vhd", "vhdx", "xll", "library-ms",
    "settingcontent-ms", "search-ms",
];

/// Открыть ссылку во внешнем браузере. Только http и https.
#[tauri::command]
pub async fn open_url(url: String) -> Result<(), String> {
    let lower = url.to_ascii_lowercase();
    let ok = (lower.starts_with("https://") || lower.starts_with("http://"))
        && url.len() <= 4096
        && !url.chars().any(|c| c.is_control() || c.is_whitespace());
    if !ok {
        return Err("bad_url".into());
    }
    open::that_detached(&url).map_err(|_| "open_failed".into())
}

/// «Скачать»: системное окно «Сохранить как», потом запись файла.
/// Тело запроса — байты файла, имя — заголовок x-name (encodeURIComponent).
/// Ответ: true — сохранили, false — человек закрыл окно.
#[tauri::command]
pub async fn save_file(window: tauri::WebviewWindow, request: Request<'_>) -> Result<bool, String> {
    let (bytes, name) = file_from(&request)?;
    let picked = rfd::AsyncFileDialog::new()
        .set_parent(&window)
        .set_title("Сохранить файл")
        .set_file_name(&name)
        .save_file()
        .await;
    let Some(handle) = picked else { return Ok(false) };
    std::fs::write(handle.path(), bytes).map_err(|_| "write_failed".to_string())?;
    Ok(true)
}

/// «Открыть»: файл во временную папку и в программу Windows для этого типа.
/// Программы и сценарии не запускаем — ответ "blocked".
#[tauri::command]
pub async fn open_file(request: Request<'_>) -> Result<(), String> {
    let (bytes, name) = file_from(&request)?;
    let ext = name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).unwrap_or_default();
    if BLOCKED_EXT.contains(&ext.as_str()) {
        return Err("blocked".into());
    }
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let dir = open_dir().join(format!("{stamp:x}"));
    std::fs::create_dir_all(&dir).map_err(|_| "write_failed".to_string())?;
    let path = dir.join(&name);
    std::fs::write(&path, bytes).map_err(|_| "write_failed".to_string())?;
    open::that_detached(&path).map_err(|_| "open_failed".into())
}

/// Прочитать текст из буфера обмена (только по нажатию «Вставить скопированное»).
#[tauri::command]
pub async fn clipboard_read() -> Result<String, String> {
    let mut cb = arboard::Clipboard::new().map_err(|_| "clipboard".to_string())?;
    // Нет текста (картинка, пусто) — пустая строка
    Ok(cb.get_text().unwrap_or_default())
}

/// Записать текст в буфер обмена (кнопка «Копировать»).
#[tauri::command]
pub async fn clipboard_write(text: String) -> Result<(), String> {
    if text.chars().count() > MAX_CLIPBOARD_CHARS {
        return Err("too_long".into());
    }
    let mut cb = arboard::Clipboard::new().map_err(|_| "clipboard".to_string())?;
    cb.set_text(text).map_err(|_| "clipboard".to_string())?;
    // Это скопировала сама NEXA — слежение за буфером не примет это за новое копирование
    crate::clipboard::mark_own_write();
    Ok(())
}

/// При запуске: убрать файлы, открытые в прошлый раз (занятые программой — пропускаем).
pub fn cleanup_open_dir() {
    let _ = std::fs::remove_dir_all(open_dir());
}

fn open_dir() -> PathBuf {
    std::env::temp_dir().join(OPEN_DIR)
}

// Байты и безопасное имя файла из запроса
fn file_from(request: &Request<'_>) -> Result<(Vec<u8>, String), String> {
    let InvokeBody::Raw(bytes) = request.body() else { return Err("bad_body".into()) };
    if bytes.is_empty() || bytes.len() > MAX_FILE_BYTES {
        return Err("bad_size".into());
    }
    let raw = request.headers().get("x-name").and_then(|v| v.to_str().ok()).unwrap_or("");
    Ok((bytes.clone(), safe_name(&percent_decode(raw))))
}

// Обратное к encodeURIComponent: %D0%A4 → байты → UTF-8
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            let hex = |c: u8| (c as char).to_digit(16);
            if let (Some(h), Some(l)) = (hex(b[i + 1]), hex(b[i + 2])) {
                out.push((h * 16 + l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

// Имя без папок и запрещённых в Windows знаков, не пустое и не служебное (CON, NUL…)
pub fn safe_name(raw: &str) -> String {
    let last = raw.rsplit(['/', '\\']).next().unwrap_or("");
    let mut name: String = last
        .chars()
        .map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c })
        .collect();
    name = name.trim_matches(|c: char| c == '.' || c.is_whitespace()).to_string();
    if name.chars().count() > 150 {
        // Длинное имя укорачиваем, сохраняя расширение
        let (stem, ext) = match name.rsplit_once('.') {
            Some((s, e)) if e.len() <= 10 => (s.to_string(), format!(".{e}")),
            _ => (name.clone(), String::new()),
        };
        name = stem.chars().take(140).collect::<String>() + &ext;
    }
    if name.is_empty() {
        return "file".into();
    }
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = ["CON", "PRN", "AUX", "NUL"].contains(&stem.as_str())
        || ((stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.len() == 4
            && stem.as_bytes()[3].is_ascii_digit());
    if reserved {
        name.insert(0, '_');
    }
    name
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_safe() {
        assert_eq!(safe_name("отчёт.pdf"), "отчёт.pdf");
        assert_eq!(safe_name("..\\..\\Windows\\evil.txt"), "evil.txt");
        assert_eq!(safe_name("a/b/c:d?.txt"), "c_d_.txt");
        assert_eq!(safe_name("CON.txt"), "_CON.txt");
        assert_eq!(safe_name("com1"), "_com1");
        assert_eq!(safe_name("..."), "file");
        assert_eq!(safe_name(""), "file");
        assert!(safe_name(&"я".repeat(300)).chars().count() <= 150);
    }

    #[test]
    fn decodes_uri_component() {
        assert_eq!(percent_decode("%D0%BE%D1%82%D1%87%D1%91%D1%82%20(1).pdf"), "отчёт (1).pdf");
        assert_eq!(percent_decode("100%"), "100%");
    }
}
