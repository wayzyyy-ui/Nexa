// Без чёрного окна консоли у собранного приложения (в режиме разработки консоль остаётся)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nexa_desktop_lib::run()
}
