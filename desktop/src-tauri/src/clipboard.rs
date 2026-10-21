// Общий буфер обмена на ПК (этап 5): следим за буфером Windows и отдаём новый текст интерфейсу
// (событие nexa-clip) — только пока синхронизация включена на этом устройстве (clip_watch).
// Решение «отправлять ли» (пустое, длинное, повтор, петля, похоже на пароль) — в интерфейсе
// (src/lib/clipsync.js); здесь — то, что видит только система:
// - менеджеры паролей помечают скопированное особыми форматами — такое не трогаем вовсе;
// - то, что записала сама NEXA (кнопка «Скопировать»), — не новое копирование (защита от петли).
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

static WATCH: AtomicBool = AtomicBool::new(false);
// Номер изменения буфера, которое сделала сама NEXA, — его пропускаем
static OWN_SEQ: AtomicU32 = AtomicU32::new(0);
const POLL: Duration = Duration::from_millis(700);
const MAX_CHARS: usize = 10_000;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClipEvent {
    text: Option<String>,
    // Скопировали больше 10 000 знаков — сам текст не передаём, только «слишком длинный»
    long: bool,
}

/// Включить / выключить слежение (переключатель в Настройках этого устройства).
#[tauri::command]
pub fn clip_watch(on: bool) {
    WATCH.store(on, Ordering::SeqCst);
}

/// Запомнить: это изменение буфера — наше (после записи «Скопировать»).
pub fn mark_own_write() {
    OWN_SEQ.store(win::seq(), Ordering::SeqCst);
}

// Отдельный поток: раз в 0,7 с сравниваем номер изменения буфера (дёшево, буфер не открываем)
pub fn start<R: Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || {
        // То, что лежало в буфере до включения, не отправляем — только новое копирование
        let mut last = win::seq();
        loop {
            std::thread::sleep(POLL);
            let now = win::seq();
            if now == last {
                continue;
            }
            last = now;
            if !WATCH.load(Ordering::SeqCst) || now == OWN_SEQ.load(Ordering::SeqCst) || win::excluded() {
                continue;
            }
            let Some(text) = win::read_text() else { continue };
            if text.trim().is_empty() {
                continue;
            }
            let ev = if text.chars().count() > MAX_CHARS {
                ClipEvent { text: None, long: true }
            } else {
                ClipEvent { text: Some(text), long: false }
            };
            let _ = app.emit("nexa-clip", ev);
        }
    });
}

#[cfg(not(windows))]
mod win {
    pub fn seq() -> u32 { 0 }
    pub fn excluded() -> bool { true }
    pub fn read_text() -> Option<String> { None }
}

#[cfg(windows)]
mod win {
    use windows::core::w;
    use windows::Win32::Foundation::HGLOBAL;
    use windows::Win32::System::DataExchange::{
        CloseClipboard, GetClipboardData, GetClipboardSequenceNumber, IsClipboardFormatAvailable, OpenClipboard,
        RegisterClipboardFormatW,
    };
    use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};

    pub fn seq() -> u32 {
        unsafe { GetClipboardSequenceNumber() }
    }

    /* Скопированное просили не трогать (так делают менеджеры паролей и сама Windows):
       - ExcludeClipboardContentFromMonitorProcessing / Clipboard Viewer Ignore — «не для программ,
         которые следят за буфером»;
       - CanIncludeInClipboardHistory = 0 / CanUploadToCloudClipboard = 0 — «не в журнал буфера
         и не в облачный буфер». Есть такой формат, но значение не прочитать — тоже не трогаем */
    pub fn excluded() -> bool {
        unsafe {
            let exclude = RegisterClipboardFormatW(w!("ExcludeClipboardContentFromMonitorProcessing"));
            let ignore = RegisterClipboardFormatW(w!("Clipboard Viewer Ignore"));
            if (exclude != 0 && IsClipboardFormatAvailable(exclude).is_ok()) || (ignore != 0 && IsClipboardFormatAvailable(ignore).is_ok()) {
                return true;
            }
            for name in [w!("CanIncludeInClipboardHistory"), w!("CanUploadToCloudClipboard")] {
                let f = RegisterClipboardFormatW(name);
                if f != 0 && IsClipboardFormatAvailable(f).is_ok() && dword(f) != Some(1) {
                    return true;
                }
            }
            false
        }
    }

    // Значение формата-флага (DWORD). Буфер открываем ненадолго и сразу закрываем
    unsafe fn dword(format: u32) -> Option<u32> {
        if OpenClipboard(None).is_err() {
            return None;
        }
        let mut out = None;
        if let Ok(h) = GetClipboardData(format) {
            let g = HGLOBAL(h.0);
            if GlobalSize(g) >= 4 {
                let p = GlobalLock(g) as *const u32;
                if !p.is_null() {
                    out = Some(p.read_unaligned());
                    let _ = GlobalUnlock(g);
                }
            }
        }
        let _ = CloseClipboard();
        out
    }

    // Текст из буфера (буфер бывает занят другой программой — одна повторная попытка)
    pub fn read_text() -> Option<String> {
        for _ in 0..2 {
            if let Ok(mut cb) = arboard::Clipboard::new() {
                match cb.get_text() {
                    Ok(t) => return Some(t),
                    Err(arboard::Error::ContentNotAvailable) => return None,
                    Err(_) => {}
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(120));
        }
        None
    }
}
