; NEXA: хуки установщика Tauri (tauri.conf.json → bundle.windows.nsis.installerHooks).
; Tauri подключает этот файл в самом начале шаблона (installer.nsi) по полному пути — поэтому здесь
; запоминаем свою папку: оттуда шаблон берёт интерфейс (ui.nsh) и картинки (art/).
!define NEXA_INSTALLER_DIR "${__FILEDIR__}"

; После копирования файлов: ярлык на рабочем столе и автозапуск — по выбору на первом экране (ui.nsh)
!macro NSIS_HOOK_POSTINSTALL
  Call NxApplyChoices
!macroend
