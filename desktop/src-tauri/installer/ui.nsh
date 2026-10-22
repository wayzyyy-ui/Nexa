; NEXA: фирменный интерфейс установщика по макету автора (подключается из installer.nsi).
;
; Как устроено: обычный мастер NSIS (те же страницы и та же установка), но окно перерисовано:
;   • шапка (логотип, «Ваша экосистема», «Установка» / «Обновление») — картинка в главном окне;
;   • посередине — страница: свои экраны (nsDialogs) и страница установки NSIS с настоящим прогрессом;
;   • внизу — кнопки-«таблетки» из макета. Это картинки с номерами настоящих кнопок NSIS (1 — «Далее»,
;     2 — «Отмена»), поэтому нажатие делает ровно то же, что обычная кнопка, а сами кнопки NSIS спрятаны.
; Картинки рисует scripts/installer-art.mjs (Chrome, шрифт Raleway, тот же логотип, что в приложении):
; art/*.png в git → art/bmp/*.bmp при каждой сборке (build:desktop). Размеры — art/metrics.nsh.
; Тексты, которые меняются (папка, ход установки, причина ошибки), — обычные надписи Windows (Segoe UI).
; Тихая установка (/S) окна не показывает; тихое обновление (/P) показывает только страницу установки.

!include "${NEXA_INSTALLER_DIR}\art\metrics.nsh"

!define MUI_CUSTOMFUNCTION_GUIINIT NxGuiInit
AutoCloseWindow true ; установилось — сразу экран «NEXA установлена»; при сбое страница остаётся
Caption "${PRODUCTNAME}" ; заголовок окна и системных сообщений установщика

; Цвета: для SetCtlColors — RRGGBB, для полосы прогресса (Win32 COLORREF) — 0xBBGGRR
!define NX_C_PANEL 1D1D1D
!define NX_C_MUTED 92A2AF
!define NX_C_TRACK 737373
!define NX_C_MINT 00FFDF
!define NX_C_RED DE4747
!define NX_RGB_MINT 0xDFFF00
!define NX_RGB_TRACK 0x737373
!define NX_RGB_RED 0x4747DE

; Стили окошек Windows
!define NX_ST_IMG 0x5400014E   ; картинка: WS_CHILD|WS_VISIBLE|WS_CLIPSIBLINGS|SS_NOTIFY|SS_REALSIZECONTROL|SS_BITMAP
!define NX_ST_IMGH 0x4400014E  ; то же, но пока скрыта
!define NX_ST_BOX 0x54000000   ; цветная плашка (полоса)
!define NX_ST_PATH 0x54008180  ; путь: «…» посередине, нажимается
!define NX_ST_WRAP 0x54000080  ; текст с переносом строк

; Нижняя полоса окна (кнопки) начинается под линией прогресса
!define /math NX_STRIPY ${NX_LINEY} + 11
!define /math NX_PAGEH ${NX_STRIPY} - ${NX_HEADERH}

Var NxDpi       ; точек на дюйм у окна (96 = 100 %)
Var NxPct       ; какие картинки брать: 100 / 125 / 150 / 175 / 200
Var NxFont      ; Segoe UI для меняющихся надписей
Var NxHeader    ; шапка
Var NxNavL      ; кнопка слева — id 2 («Отмена» NSIS)
Var NxNavR      ; кнопка справа — id 1 («Далее» NSIS)
Var NxNavRetry  ; «Повторить» после сбоя — тоже id 2 («Закрыть»), различаем по месту нажатия
Var NxUpd       ; 1 — NEXA уже стоит (шапка «Обновление»)
Var NxExisting
Var NxDesktop   ; ярлык на рабочем столе: 1 / 0
Var NxAutostart ; запуск вместе с компьютером: 1 / 0
Var NxKeep      ; уже установлена: 1 — поставить поверх, 0 — сначала удалить
Var NxCmp       ; сравнение версий для PageLeaveReinstall
Var NxReinstallText
Var NxDlg
Var NxIcoDesk
Var NxIcoAuto
Var NxIcoKeep
Var NxIcoRemove
Var NxPathLbl
Var NxInstPage
Var NxInstTitle
Var NxInstSub
Var NxInstStatus
Var NxInstBar
Var NxT1
Var NxT2
Var NxT3
Var NxT4
Var NxT5
Var NxT6
Var NxT7
Var NxFailedUi ; 1 — показан экран ошибки с «Повторить»
Var NxI1 ; только для NxImg
Var NxI2
Var NxI3

; ── Пересчёт размеров ──
; Точки макета (при 100 %) → пиксели экрана с учётом масштаба Windows
!macro NxS _out _v
  IntOp ${_out} ${_v} * $NxDpi
  IntOp ${_out} ${_out} + 48
  IntOp ${_out} ${_out} / 96
!macroend
; То же для высоты на странице: страница начинается под шапкой
!macro NxSY _out _v
  IntOp ${_out} ${_v} - ${NX_HEADERH}
  !insertmacro NxS ${_out} ${_out}
!macroend

; ── Картинки ──
; Поставить на окошко картинку _name (файл $PLUGINSDIR\nx\<_name>@<масштаб>.bmp) нужного размера
!macro NxImg _hwnd _name
  !insertmacro NxS $NxI1 ${NX_${_name}_W}
  !insertmacro NxS $NxI2 ${NX_${_name}_H}
  System::Call 'user32::LoadImageW(p 0, w "$PLUGINSDIR\nx\${_name}@$NxPct.bmp", i 0, i $NxI1, i $NxI2, i 0x10) p .s'
  Pop $NxI3
  SendMessage ${_hwnd} 0x172 0 $NxI3 $NxI3 ; STM_SETIMAGE → прежняя картинка, её освобождаем
  ${If} $NxI3 <> 0
    System::Call 'gdi32::DeleteObject(p $NxI3)'
  ${EndIf}
!macroend
; Окошко на любом окне (CreateWindowEx): для главного окна и страницы установки
!macro NxStatic _out _parent _style _x _y _w _h _id
  System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "", i ${_style}, i ${_x}, i ${_y}, i ${_w}, i ${_h}, p ${_parent}, p ${_id}, p 0, p 0) p .s'
  Pop ${_out}
!macroend
; Картинка на своей странице (nsDialogs — чтобы работали нажатия). _x, _y — точки макета от верха окна
!macro NxPageImg _out _name _x _y
  !insertmacro NxS $NxT4 ${_x}
  !insertmacro NxSY $NxT5 ${_y}
  !insertmacro NxS $NxT6 ${NX_${_name}_W}
  !insertmacro NxS $NxT7 ${NX_${_name}_H}
  nsDialogs::CreateControl STATIC ${NX_ST_IMG} 0 $NxT4 $NxT5 $NxT6 $NxT7 ""
  Pop ${_out}
  !insertmacro NxImg ${_out} ${_name}
!macroend
; Надпись Segoe UI на своей странице
!macro NxPageText _out _style _x _y _w _h _text _color
  !insertmacro NxS $NxT4 ${_x}
  !insertmacro NxSY $NxT5 ${_y}
  !insertmacro NxS $NxT6 ${_w}
  !insertmacro NxS $NxT7 ${_h}
  nsDialogs::CreateControl STATIC ${_style} 0 $NxT4 $NxT5 $NxT6 $NxT7 "${_text}"
  Pop ${_out}
  SetCtlColors ${_out} ${_color} ${NX_C_PANEL}
  SendMessage ${_out} ${WM_SETFONT} $NxFont 1
!macroend
; Полоса шагов на своих экранах (на странице установки — настоящий прогресс): _part / 3 закрашено мятным
!macro NxStepLine _part
  !insertmacro NxS $NxT4 ${NX_LINEX}
  !insertmacro NxSY $NxT5 ${NX_LINEY}
  !insertmacro NxS $NxT6 ${NX_LINEW}
  !insertmacro NxS $NxT7 ${NX_LINEH}
  ${If} $NxT7 < 3
    StrCpy $NxT7 3
  ${EndIf}
  IntOp $NxT1 $NxT6 * ${_part}
  IntOp $NxT1 $NxT1 / 3
  nsDialogs::CreateControl STATIC ${NX_ST_BOX} 0 $NxT4 $NxT5 $NxT1 $NxT7 ""
  Pop $NxT2
  SetCtlColors $NxT2 "" ${NX_C_MINT}
  ${If} $NxT1 < $NxT6
    IntOp $NxT2 $NxT4 + $NxT1
    IntOp $NxT3 $NxT6 - $NxT1
    nsDialogs::CreateControl STATIC ${NX_ST_BOX} 0 $NxT2 $NxT5 $NxT3 $NxT7 ""
    Pop $NxT2
    SetCtlColors $NxT2 "" ${NX_C_TRACK}
  ${EndIf}
!macroend

; ── Кнопки внизу ──
; Поставить кнопку _name (btn_<_name>) на окошко _hwnd справа налево: правый край — $NxT7
!macro NxNavPut _hwnd _name
  !insertmacro NxS $NxT4 ${NX_btn_${_name}_W}
  !insertmacro NxS $NxT5 ${NX_btn_${_name}_H}
  !insertmacro NxS $NxT6 ${NX_BTNY}
  IntOp $NxT7 $NxT7 - $NxT4
  System::Call 'user32::SetWindowPos(p ${_hwnd}, p 0, i $NxT7, i $NxT6, i $NxT4, i $NxT5, i 0x14)'
  !insertmacro NxImg ${_hwnd} btn_${_name}
  ShowWindow ${_hwnd} ${SW_SHOW}
  !insertmacro NxS $NxT4 ${NX_BTNGAP}
  IntOp $NxT7 $NxT7 - $NxT4
!macroend
; Кнопки экрана: _L — слева (id 2: «Отмена» / «Готово» / «Закрыть»), _R — справа (id 1: «Дальше» …); "" — нет
!macro NxNav _L _R
  ShowWindow $NxNavL ${SW_HIDE}
  ShowWindow $NxNavR ${SW_HIDE}
  ShowWindow $NxNavRetry ${SW_HIDE}
  !insertmacro NxS $NxT7 ${NX_BTNRIGHT}
  !if "${_R}" != ""
    !insertmacro NxNavPut $NxNavR ${_R}
  !endif
  !if "${_L}" != ""
    !insertmacro NxNavPut $NxNavL ${_L}
  !endif
!macroend

; ── Окно ──
Function NxGuiInit
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  ; Масштаб экрана (Windows 10 1607+; раньше — 100 %) и набор картинок под него
  System::Call 'user32::GetDpiForWindow(p $HWNDPARENT) i .s'
  Pop $NxDpi
  ${If} $NxDpi < 96
    StrCpy $NxDpi 96
  ${EndIf}
  IntOp $NxPct $NxDpi * 100
  IntOp $NxPct $NxPct / 96
  IntOp $NxPct $NxPct + 12
  IntOp $NxPct $NxPct / 25
  IntOp $NxPct $NxPct * 25
  ${If} $NxPct < 100
    StrCpy $NxPct 100
  ${ElseIf} $NxPct > 200
    StrCpy $NxPct 200
  ${EndIf}
  InitPluginsDir
  SetOutPath "$PLUGINSDIR\nx"
  File "${NEXA_INSTALLER_DIR}\art\bmp\*.bmp"
  !insertmacro NxS $0 15
  IntOp $0 0 - $0
  System::Call 'gdi32::CreateFontW(i r0, i 0, i 0, i 0, i 400, i 0, i 0, i 0, i 1, i 0, i 0, i 5, i 0, w "Segoe UI") p .s'
  Pop $NxFont

  ; Уже установлена? Тогда шапка «Обновление», а ярлык и автозапуск — как сейчас у установленной NEXA
  ; (автозапуск могли выключить в её Настройках — не включаем его молча обратно)
  StrCpy $NxExisting 0
  ReadRegStr $0 SHCTX "${UNINSTKEY}" "UninstallString"
  ${IfThen} $0 != "" ${|} StrCpy $NxExisting 1 ${|}
  StrCpy $NxUpd $NxExisting
  ${IfThen} $UpdateMode = 1 ${|} StrCpy $NxUpd 1 ${|}
  StrCpy $NxDesktop 1
  StrCpy $NxAutostart 1
  StrCpy $NxKeep 1
  ${If} $NxExisting = 1
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
    ${IfThen} $0 == "" ${|} StrCpy $NxAutostart 0 ${|}
    ${IfNot} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
      StrCpy $NxDesktop 0
    ${EndIf}
  ${EndIf}

  ; Тёмная рамка (Windows 11: чёрная полоса заголовка сливается с шапкой); сам заголовок — NxHideStd
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4)'
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 35, *i 0x000000, i 4)'
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 36, *i 0xFFFFFF, i 4)'
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 34, *i 0x1D1D1D, i 4)'

  ; Размер окна: внутренняя часть — W × H точек макета; по центру рабочей области экрана
  !insertmacro NxS $1 ${NX_W}
  !insertmacro NxS $2 ${NX_H}
  System::Call '*(i 0, i 0, i r1, i r2) p .r0'
  System::Call 'user32::GetWindowLongW(p $HWNDPARENT, i -16) i .r3'
  System::Call 'user32::GetWindowLongW(p $HWNDPARENT, i -20) i .r4'
  System::Call 'user32::AdjustWindowRectExForDpi(p r0, i r3, i 0, i r4, i $NxDpi) i .r5'
  ${If} $5 = 0
    System::Call 'user32::AdjustWindowRectEx(p r0, i r3, i 0, i r4)'
  ${EndIf}
  System::Call '*$0(i .r3, i .r4, i .r5, i .r6)'
  IntOp $1 $5 - $3
  IntOp $2 $6 - $4
  System::Call 'user32::SystemParametersInfoW(i 0x30, i 0, p r0, i 0)'
  System::Call '*$0(i .r3, i .r4, i .r5, i .r6)'
  System::Free $0
  IntOp $5 $5 - $3
  IntOp $5 $5 - $1
  IntOp $5 $5 / 2
  IntOp $3 $3 + $5
  IntOp $6 $6 - $4
  IntOp $6 $6 - $2
  IntOp $6 $6 / 2
  IntOp $4 $4 + $6
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i r3, i r4, i r1, i r2, i 0x14)'

  ; Всё стандартное в окне прячем (кнопки остаются рабочими — на них ссылаются наши картинки)
  System::Call 'user32::GetWindow(p $HWNDPARENT, i 5) p .r0'
  ${DoWhile} $0 <> 0
    ShowWindow $0 ${SW_HIDE}
    System::Call 'user32::GetWindow(p r0, i 2) p .r0'
  ${Loop}
  ; Место страниц (элемент 1018): от шапки до полосы кнопок
  !insertmacro NxS $1 ${NX_HEADERH}
  !insertmacro NxS $2 ${NX_W}
  !insertmacro NxS $3 ${NX_PAGEH}
  GetDlgItem $0 $HWNDPARENT 1018
  System::Call 'user32::SetWindowPos(p r0, p 0, i 0, i r1, i r2, i r3, i 0x14)'

  ; Шапка
  !insertmacro NxS $2 ${NX_W}
  !insertmacro NxS $3 ${NX_HEADERH}
  !insertmacro NxStatic $NxHeader $HWNDPARENT ${NX_ST_IMG} 0 0 $2 $3 0
  ${If} $NxUpd = 1
    !insertmacro NxImg $NxHeader header_update
  ${Else}
    !insertmacro NxImg $NxHeader header_install
  ${EndIf}
  ; Полоса кнопок: фон панели и сами кнопки (id 1 и 2 — как у кнопок NSIS)
  !insertmacro NxS $1 ${NX_STRIPY}
  !insertmacro NxS $2 ${NX_W}
  !insertmacro NxS $3 ${NX_H}
  IntOp $3 $3 - $1
  !insertmacro NxStatic $5 $HWNDPARENT ${NX_ST_BOX} 0 $1 $2 $3 0
  SetCtlColors $5 "" ${NX_C_PANEL}
  !insertmacro NxStatic $NxNavR $HWNDPARENT ${NX_ST_IMGH} 0 0 1 1 1
  !insertmacro NxStatic $NxNavL $HWNDPARENT ${NX_ST_IMGH} 0 0 1 1 2
  !insertmacro NxStatic $NxNavRetry $HWNDPARENT ${NX_ST_IMGH} 0 0 1 1 2
  ; Наши окошки — в самый низ стопки: так GetDlgItem у NSIS по-прежнему находит его настоящие кнопки
  ; (включены ли они, их подписи), а нажатие на картинку приходит с тем же номером
  System::Call 'user32::SetWindowPos(p $NxNavRetry, p 1, i 0, i 0, i 0, i 0, i 0x13)'
  System::Call 'user32::SetWindowPos(p $NxNavL, p 1, i 0, i 0, i 0, i 0, i 0x13)'
  System::Call 'user32::SetWindowPos(p $NxNavR, p 1, i 0, i 0, i 0, i 0, i 0x13)'
  System::Call 'user32::SetWindowPos(p r5, p 1, i 0, i 0, i 0, i 0, i 0x13)'
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

; NSIS показывает свои кнопки и надписи и меняет заголовок окна при смене страницы — возвращаем своё
; Заголовок окна — просто «NEXA» (как Caption ниже: NSIS сам возвращает его при сбое).
; Установка это или обновление — написано в шапке
Function NxCaption
  SendMessage $HWNDPARENT ${WM_SETTEXT} 0 "STR:${PRODUCTNAME}"
FunctionEnd
Function NxHideStd
  Push $0
  Call NxCaption
  ${ForEach} $NxT1 1 3 + 1
    GetDlgItem $0 $HWNDPARENT $NxT1
    ShowWindow $0 ${SW_HIDE}
  ${Next}
  ${ForEach} $NxT1 1028 1045 + 1
    GetDlgItem $0 $HWNDPARENT $NxT1
    ${If} $0 <> 0
      ShowWindow $0 ${SW_HIDE}
    ${EndIf}
  ${Next}
  GetDlgItem $0 $HWNDPARENT 1256
  ShowWindow $0 ${SW_HIDE}
  Pop $0
FunctionEnd

; Начало своего экрана: страница nsDialogs цвета панели
Function NxPageBegin
  Call NxHideStd
  nsDialogs::Create 1018
  Pop $NxDlg
  SetCtlColors $NxDlg "" ${NX_C_PANEL}
FunctionEnd

; ── 1. Приветствие: папка, ярлык, автозапуск ──
Function NxWelcomeShow
  ${If} $PassiveMode = 1
    Abort
  ${EndIf}
  Call NxPageBegin
  !insertmacro NxPageImg $NxT1 title_welcome ${NX_TEXTX} ${NX_TITLEY}
  !insertmacro NxPageImg $NxT1 sub_welcome ${NX_TEXTX} ${NX_SUBY}
  ; Значок по центру строки
  !define /redef /math _NXD ${NX_ROWH} - ${NX_check_on_H}
  !define /redef /math _NXD ${_NXD} / 2
  !define /redef /math _NXI0 ${NX_ROWY0} + ${_NXD}
  !define /redef /math _NXI1 ${NX_ROWY1} + ${_NXD}
  !define /redef /math _NXI2 ${NX_ROWY2} + ${_NXD}
  ; Папка: значок всегда отмечен (папка выбрана всегда), нажатие на строку — выбрать другую
  !insertmacro NxPageImg $NxT1 check_on ${NX_ROWICONX} ${_NXI0}
  ${NSD_OnClick} $NxT1 NxBrowse
  !insertmacro NxPageImg $NxT1 row_folder ${NX_ROWTEXTX} ${NX_ROWY0}
  ${NSD_OnClick} $NxT1 NxBrowse
  !define /redef /math _NXP ${NX_ROWTEXTX} + 222
  !define /redef /math _NXPW ${NX_BTNRIGHT} - ${_NXP}
  !define /redef /math _NXPY ${NX_ROWY0} + 5
  !insertmacro NxPageText $NxPathLbl ${NX_ST_PATH} ${_NXP} ${_NXPY} ${_NXPW} 20 "$INSTDIR" ${NX_C_MUTED}
  ${NSD_OnClick} $NxPathLbl NxBrowse
  ; Ярлык и автозапуск — включить / выключить нажатием на строку
  !insertmacro NxPageImg $NxIcoDesk check_on ${NX_ROWICONX} ${_NXI1}
  ${NSD_OnClick} $NxIcoDesk NxToggleDesk
  !insertmacro NxPageImg $NxT1 row_desktop ${NX_ROWTEXTX} ${NX_ROWY1}
  ${NSD_OnClick} $NxT1 NxToggleDesk
  !insertmacro NxPageImg $NxIcoAuto check_on ${NX_ROWICONX} ${_NXI2}
  ${NSD_OnClick} $NxIcoAuto NxToggleAuto
  !insertmacro NxPageImg $NxT1 row_autostart ${NX_ROWTEXTX} ${NX_ROWY2}
  ${NSD_OnClick} $NxT1 NxToggleAuto
  Call NxDrawChecks
  ; Шаг 1 из 3 (дальше — установка и «Готово»; если NEXA уже стоит — ещё выбор, как ставить)
  !insertmacro NxStepLine 1
  ${If} $NxExisting = 1
    !insertmacro NxNav cancel next
  ${Else}
    !insertmacro NxNav cancel install
  ${EndIf}
  nsDialogs::Show
FunctionEnd
Function NxWelcomeLeave
FunctionEnd

Function NxDrawChecks
  ${If} $NxDesktop = 1
    !insertmacro NxImg $NxIcoDesk check_on
  ${Else}
    !insertmacro NxImg $NxIcoDesk check_off
  ${EndIf}
  ${If} $NxAutostart = 1
    !insertmacro NxImg $NxIcoAuto check_on
  ${Else}
    !insertmacro NxImg $NxIcoAuto check_off
  ${EndIf}
FunctionEnd
Function NxToggleDesk
  Pop $NxT1
  IntOp $NxDesktop $NxDesktop ^ 1
  Call NxDrawChecks
FunctionEnd
Function NxToggleAuto
  Pop $NxT1
  IntOp $NxAutostart $NxAutostart ^ 1
  Call NxDrawChecks
FunctionEnd

; Выбор папки. Как в обычном NSIS: если выбрали «C:\Программы», ставим в «C:\Программы\NEXA»
Function NxBrowse
  Pop $NxT1
  nsDialogs::SelectFolderDialog "Папка для NEXA" "$INSTDIR"
  Pop $NxT1
  ${If} $NxT1 == "error"
  ${OrIf} $NxT1 == ""
    Return
  ${EndIf}
  StrCpy $NxT2 $NxT1 "" -1
  ${IfThen} $NxT2 == "\" ${|} StrCpy $NxT1 $NxT1 -1 ${|}
  StrLen $NxT3 "${PRODUCTNAME}"
  IntOp $NxT3 $NxT3 + 1
  StrCpy $NxT2 $NxT1 "" -$NxT3
  ${If} $NxT2 != "\${PRODUCTNAME}"
    StrCpy $NxT1 "$NxT1\${PRODUCTNAME}"
  ${EndIf}
  StrCpy $INSTDIR $NxT1
  SendMessage $NxPathLbl ${WM_SETTEXT} 0 "STR:$INSTDIR"
FunctionEnd

; ── 2. NEXA уже установлена: поверх или сначала удалить ──
Function NxReinstallShow
  Call NxPageBegin
  !insertmacro NxPageImg $NxT1 title_reinstall ${NX_TEXTX} ${NX_TITLEY}
  ; Свой текст по сравнению версий (тексты Tauri советуют удалять — у нас по умолчанию «поверх»)
  ReadRegStr $NxT2 SHCTX "${UNINSTKEY}" "DisplayVersion"
  ${If} $NxCmp = 0
    StrCpy $NxT3 "Эта версия (${VERSION}) уже стоит. Можно поставить её заново поверх — данные и настройки останутся."
  ${ElseIf} $NxCmp = 1
    StrCpy $NxT3 "Сейчас установлена NEXA $NxT2. Новая версия ${VERSION} встанет поверх — данные и настройки останутся."
  ${Else}
    StrCpy $NxT3 "Установлена более новая NEXA $NxT2. Чтобы поставить ${VERSION}, сначала удалите текущую — данные и настройки останутся."
  ${EndIf}
  !define /redef /math _NXH ${NX_ROWY0} - ${NX_SUBY}
  !insertmacro NxPageText $NxT1 ${NX_ST_WRAP} ${NX_TEXTX} ${NX_SUBY} 812 ${_NXH} "$NxT3" ${NX_C_MUTED}
  !define /redef /math _NXD ${NX_ROWH} - ${NX_check_on_H}
  !define /redef /math _NXD ${_NXD} / 2
  !define /redef /math _NXI0 ${NX_ROWY0} + ${_NXD}
  !define /redef /math _NXI1 ${NX_ROWY1} + ${_NXD}
  ; Понижение версии без удаления запрещено (ALLOWDOWNGRADES) — остаётся только «сначала удалить»
  StrCpy $NxT6 1
  !if "${ALLOWDOWNGRADES}" == "false"
    ${If} $NxCmp = -1
      StrCpy $NxT6 0
      StrCpy $NxKeep 0
    ${EndIf}
  !endif
  ${If} $NxT6 = 1
    !insertmacro NxPageImg $NxIcoKeep check_on ${NX_ROWICONX} ${_NXI0}
    ${NSD_OnClick} $NxIcoKeep NxPickKeep
    !insertmacro NxPageImg $NxT1 row_keep ${NX_ROWTEXTX} ${NX_ROWY0}
    ${NSD_OnClick} $NxT1 NxPickKeep
  ${Else}
    StrCpy $NxIcoKeep 0
  ${EndIf}
  !insertmacro NxPageImg $NxIcoRemove check_off ${NX_ROWICONX} ${_NXI1}
  ${NSD_OnClick} $NxIcoRemove NxPickRemove
  !insertmacro NxPageImg $NxT1 row_remove ${NX_ROWTEXTX} ${NX_ROWY1}
  ${NSD_OnClick} $NxT1 NxPickRemove
  Call NxDrawKeep
  !insertmacro NxStepLine 2
  !insertmacro NxNav cancel install
  nsDialogs::Show
FunctionEnd
Function NxDrawKeep
  ${If} $NxIcoKeep <> 0
    ${If} $NxKeep = 1
      !insertmacro NxImg $NxIcoKeep check_on
    ${Else}
      !insertmacro NxImg $NxIcoKeep check_off
    ${EndIf}
  ${EndIf}
  ${If} $NxKeep = 1
    !insertmacro NxImg $NxIcoRemove check_off
  ${Else}
    !insertmacro NxImg $NxIcoRemove check_on
  ${EndIf}
FunctionEnd
Function NxPickKeep
  Pop $NxT1
  StrCpy $NxKeep 1
  Call NxDrawKeep
FunctionEnd
Function NxPickRemove
  Pop $NxT1
  StrCpy $NxKeep 0
  Call NxDrawKeep
FunctionEnd

; ── 3. Установка: страница NSIS (настоящий прогресс) в оформлении макета ──
Function NxInstShow
  Call NxHideStd
  !insertmacro NxNav "" ""
  FindWindow $NxInstPage "#32770" "" $HWNDPARENT
  SetCtlColors $NxInstPage "" ${NX_C_PANEL}
  ; NSIS ставит свою страницу в угол места 1018 в прежнем размере — растягиваем на всё место
  !insertmacro NxS $NxT4 ${NX_HEADERH}
  !insertmacro NxS $NxT5 ${NX_W}
  !insertmacro NxS $NxT6 ${NX_PAGEH}
  System::Call 'user32::SetWindowPos(p $NxInstPage, p 0, i 0, i $NxT4, i $NxT5, i $NxT6, i 0x14)'
  GetDlgItem $NxT1 $NxInstPage 1016 ; подробный журнал
  ShowWindow $NxT1 ${SW_HIDE}
  GetDlgItem $NxT1 $NxInstPage 1027 ; «Детали»
  ShowWindow $NxT1 ${SW_HIDE}
  ; Заголовок и описание
  !insertmacro NxS $NxT4 ${NX_TEXTX}
  !insertmacro NxSY $NxT5 ${NX_TITLEY}
  !insertmacro NxS $NxT6 ${NX_title_install_W}
  !insertmacro NxS $NxT7 ${NX_title_install_H}
  !insertmacro NxStatic $NxInstTitle $NxInstPage ${NX_ST_IMG} $NxT4 $NxT5 $NxT6 $NxT7 0
  !insertmacro NxSY $NxT5 ${NX_SUBY}
  !insertmacro NxS $NxT7 ${NX_sub_install_H}
  !insertmacro NxStatic $NxInstSub $NxInstPage ${NX_ST_IMG} $NxT4 $NxT5 $NxT6 $NxT7 0
  ${If} $NxUpd = 1
    !insertmacro NxImg $NxInstTitle title_update
    !insertmacro NxImg $NxInstSub sub_update
  ${Else}
    !insertmacro NxImg $NxInstTitle title_install
    !insertmacro NxImg $NxInstSub sub_install
  ${EndIf}
  ; Что сейчас делается — строка NSIS («Извлечение: …»)
  GetDlgItem $NxInstStatus $NxInstPage 1006
  !define /redef /math _NXY ${NX_ROWY0} + 4
  !insertmacro NxSY $NxT5 ${_NXY}
  !insertmacro NxS $NxT7 22
  System::Call 'user32::SetWindowPos(p $NxInstStatus, p 0, i $NxT4, i $NxT5, i $NxT6, i $NxT7, i 0x14)'
  SendMessage $NxInstStatus ${WM_SETFONT} $NxFont 1
  SetCtlColors $NxInstStatus ${NX_C_MUTED} ${NX_C_PANEL}
  ; Полоса прогресса NSIS — тонкая мятная линия макета (без темы Windows, сплошная)
  GetDlgItem $NxInstBar $NxInstPage 1004
  System::Call 'uxtheme::SetWindowTheme(p $NxInstBar, w "", w "")'
  System::Call 'user32::GetWindowLongW(p $NxInstBar, i -16) i .s'
  Pop $NxT1
  IntOp $NxT1 $NxT1 | 1 ; PBS_SMOOTH
  IntOp $NxT1 $NxT1 & 0xFF7FFFFF ; без WS_BORDER — иначе тонкая полоса целиком из рамки
  System::Call 'user32::SetWindowLongW(p $NxInstBar, i -16, i $NxT1)'
  System::Call 'user32::GetWindowLongW(p $NxInstBar, i -20) i .s'
  Pop $NxT1
  IntOp $NxT1 $NxT1 & 0xFFFDFDFF ; без WS_EX_STATICEDGE и WS_EX_CLIENTEDGE
  System::Call 'user32::SetWindowLongW(p $NxInstBar, i -20, i $NxT1)'
  SendMessage $NxInstBar 0x409 0 ${NX_RGB_MINT}  ; PBM_SETBARCOLOR
  SendMessage $NxInstBar 0x2001 0 ${NX_RGB_TRACK} ; PBM_SETBKCOLOR
  !insertmacro NxS $NxT4 ${NX_LINEX}
  !insertmacro NxSY $NxT5 ${NX_LINEY}
  !insertmacro NxS $NxT6 ${NX_LINEW}
  !insertmacro NxS $NxT7 ${NX_LINEH}
  ${If} $NxT7 < 3
    StrCpy $NxT7 3
  ${EndIf}
  System::Call 'user32::SetWindowPos(p $NxInstBar, p 0, i $NxT4, i $NxT5, i $NxT6, i $NxT7, i 0x34)' ; + SWP_FRAMECHANGED
FunctionEnd

; Установка закончилась. Успех — дальше сам (AutoCloseWindow). Сбой — экран ошибки: причина — в строке
; NSIS (сообщение Abort или «прервано»), красная полоса, «Повторить» (установщик запустится заново) и «Закрыть»
Function NxInstLeave
  IfAbort 0 nx_inst_ok
    StrCpy $NxFailedUi 1
    Call NxCaption
    !insertmacro NxImg $NxInstTitle title_error
    ShowWindow $NxInstSub ${SW_HIDE}
    !insertmacro NxS $NxT4 ${NX_TEXTX}
    !insertmacro NxSY $NxT5 ${NX_SUBY}
    !insertmacro NxS $NxT6 812
    !insertmacro NxS $NxT7 34
    ; Сначала цвета, потом текст: окошко рисуется сразу при создании
    !insertmacro NxStatic $NxT1 $NxInstPage 0x44000080 $NxT4 $NxT5 $NxT6 $NxT7 0
    SetCtlColors $NxT1 ${NX_C_MUTED} ${NX_C_PANEL}
    SendMessage $NxT1 ${WM_SETFONT} $NxFont 0
    SendMessage $NxT1 ${WM_SETTEXT} 0 "STR:Установка не завершилась, ваши данные не тронуты. Нажмите «Повторить» — установщик запустится заново."
    ShowWindow $NxT1 ${SW_SHOW}
    SetCtlColors $NxInstStatus ${NX_C_RED} ${NX_C_PANEL}
    System::Call 'user32::InvalidateRect(p $NxInstStatus, p 0, i 1)'
    SendMessage $NxInstBar 0x409 0 ${NX_RGB_RED}
    SendMessage $NxInstBar 0x406 0 100 ; PBM_SETRANGE32 0…100
    SendMessage $NxInstBar 0x402 100 0 ; PBM_SETPOS: вся полоса красная — видно, что остановилось
    ; Справа «Повторить» (номер 2, как «Закрыть»), слева «Закрыть»
    !insertmacro NxS $NxT7 ${NX_BTNRIGHT}
    !insertmacro NxNavPut $NxNavRetry retry
    !insertmacro NxNavPut $NxNavL close
  nx_inst_ok:
FunctionEnd

; Сбой, человек закрыл окно: нажал «Повторить» — запускаем установщик заново. Какую из двух кнопок
; нажали — по указателю мыши внутри «Повторить» (окно к этому времени NSIS уже прячет, поэтому сравниваем
; с прямоугольником кнопки, а не спрашиваем, какое окно под указателем). Esc и крестик — просто закрыть
Function .onInstFailed
  ${If} $NxFailedUi <> 1 ; экран ошибки не показывали (тихая установка) — нечего повторять
    Return
  ${EndIf}
  System::Call '*(i 0, i 0, i 0, i 0) p .s'
  Pop $NxT1
  System::Call 'user32::GetWindowRect(p $NxNavRetry, p $NxT1)'
  System::Call '*$NxT1(i .r0, i .r1, i .r2, i .r3)'
  System::Call 'user32::GetCursorPos(p $NxT1)'
  System::Call '*$NxT1(i .r4, i .r5)'
  System::Free $NxT1
  ${If} $4 >= $0
  ${AndIf} $4 < $2
  ${AndIf} $5 >= $1
  ${AndIf} $5 < $3
    Exec '"$EXEPATH"'
  ${EndIf}
FunctionEnd

; ── 4. Готово ──
Function NxFinishShow
  ${If} $PassiveMode = 1
    Abort
  ${EndIf}
  Call NxPageBegin
  ${If} $NxUpd = 1
    !insertmacro NxPageImg $NxT1 title_updated ${NX_TEXTX} ${NX_TITLEY}
    !insertmacro NxPageImg $NxT1 sub_updated ${NX_TEXTX} ${NX_SUBY}
  ${Else}
    !insertmacro NxPageImg $NxT1 title_finish ${NX_TEXTX} ${NX_TITLEY}
    !insertmacro NxPageImg $NxT1 sub_finish ${NX_TEXTX} ${NX_SUBY}
  ${EndIf}
  !insertmacro NxStepLine 3
  !insertmacro NxNav done launch
  GetDlgItem $NxT1 $HWNDPARENT 2 ; «Готово» = «Отмена» NSIS: после установки она просто закрывает окно
  EnableWindow $NxT1 1
  nsDialogs::Show
FunctionEnd
Function NxFinishLeave
  Call RunMainBinary ; «Запустить NEXA»
FunctionEnd

; ── После копирования файлов (из hooks.nsh): ярлык и автозапуск по выбору на первом экране ──
; Обновление (/UPDATE) и тихая установка ничего не меняют: остаётся как было у человека
Function NxApplyChoices
  ${If} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    Return
  ${EndIf}
  IfSilent 0 +2
    Return
  ${If} $NxDesktop = 1
    Call CreateOrUpdateDesktopShortcut
  ${EndIf}
  ; Автозапуск — ровно та же запись, что делает сама NEXA (tauri-plugin-autostart): HKCU\…\Run,
  ; имя «NEXA», «<путь> --minimized» (в трей). Тогда и переключатель в Настройках NEXA покажет правду
  ${If} $NxAutostart = 1
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}" "$INSTDIR\${MAINBINARYNAME}.exe --minimized"
    ; «Отключено» в диспетчере задач Windows помнит отдельно — снимаем, как это делает сама NEXA
    ClearErrors
    EnumRegValue $NxT1 HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" 0
    ${IfNot} ${Errors}
      WriteRegBin HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${PRODUCTNAME}" 020000000000000000000000
    ${EndIf}
  ${Else}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
  ${EndIf}
FunctionEnd
