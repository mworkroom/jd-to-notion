#Requires AutoHotkey v2.0
#SingleInstance Force
SetTitleMatchMode(2)

; Macro keyboard shortcut: Ctrl + Alt + Shift + F12.
; The app's internal focus shortcut is intentionally different: Ctrl + Alt + Shift + F11.
; DOM extraction runs first; manual ⋯ -> Copy remains the fallback.

appWindowTitle := "Admissions Guideline Helper"

^!+F12::
{
    global appWindowTitle

    ToolTip("JANDI 메시지를 읽는 중입니다.")
    importedMessage := TryExtractHoveredMessage()
    if importedMessage != "" {
        ToolTip()
        A_Clipboard := importedMessage
        ActivateAppAndPaste()
        return
    }

    previousClipboard := ClipboardAll()
    A_Clipboard := ""
    ToolTip("JANDI에서 메시지의 ⋯ → 복사를 눌러주세요.")

    if !ClipWait(15) {
        ToolTip()
        A_Clipboard := previousClipboard
        MsgBox("15초 안에 JANDI 복사가 감지되지 않았습니다.", "JANDI 가져오기", "Icon!")
        return
    }

    ToolTip()
    ActivateAppAndPaste()
}

TryExtractHoveredMessage()
{
    shell := ComObject("WScript.Shell")
    scriptPath := A_ScriptDir "\inspect-jandi-cdp.mjs"
    outputPath := A_Temp "\jandi-cdp-" A_TickCount ".txt"
    quote := Chr(34)
    powershellCommand := "& node " . quote . scriptPath . quote . " --extract --output=" . quote . outputPath . quote
    command := "powershell.exe -NoProfile -WindowStyle Hidden -Command " . quote . powershellCommand . quote
    exitCode := shell.Run(command, 0, true)

    if exitCode != 0 || !FileExist(outputPath) {
        if FileExist(outputPath) {
            FileDelete(outputPath)
        }
        return ""
    }

    output := FileRead(outputPath, "UTF-8")
    FileDelete(outputPath)

    if InStr(output, "ECONNREFUSED") || InStr(output, "Node.js") || InStr(output, "fetch failed") {
        return ""
    }

    return Trim(output, " `t`r`n")
}

ActivateAppAndPaste()
{
    global appWindowTitle

    Run("http://127.0.0.1:3000")
    appHwnd := WinWait(appWindowTitle, , 10)
    if !appHwnd {
        MsgBox("입학요강 앱 창을 열지 못했습니다. Browser Tamer와 로컬 앱 서버를 확인해주세요.", "JANDI 가져오기", "Icon!")
        return
    }

    WinActivate("ahk_id " appHwnd)
    if !WinWaitActive("ahk_id " appHwnd, , 3) {
        MsgBox("입학요강 앱 창을 활성화하지 못했습니다.", "JANDI 가져오기", "Icon!")
        return
    }

    Sleep(1000)
    ; Handled by public/app.js: focus and select the JANDI input textarea.
    Send("^!+{F11}")
    Sleep(150)
    Send("^v")
}
