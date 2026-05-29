; Custom NSIS hooks for NovaPad. Wired up via `nsis.include: build/installer.nsh`
; in electron-builder.yml — NOT auto-discovered, because this project sets
; `directories.buildResources: resources`, so electron-builder's default lookup
; (resources/installer.nsh) would miss this file.
;
; Why this file exists:
;   electron-builder's `fileAssociations` field adds the app to Windows'
;   "Open with" menu via per-extension ProgIDs. It does NOT create a
;   top-level "Edit with NovaPad" right-click entry like VS Code's
;   "Open with Code" verb. To get that, we have to write our own shell
;   verbs into the registry — that's what the macros below do.
;
; Scope:
;   We install per-user (perMachine: false) so we write under
;   HKCU\Software\Classes. No admin/UAC required, and the entries
;   uninstall cleanly without touching the system-wide registry.
;
; Windows 11 note:
;   File Explorer shows a simplified context menu by default; custom verbs
;   like ours appear under "Show more options" (or Shift+F10).

!macro customInstall
  ; ── "Edit with NovaPad" verb on every file (HKCR\* equivalent) ──────────
  WriteRegStr HKCU "Software\Classes\*\shell\NovaPadEditWith" "" "Edit with NovaPad"
  WriteRegStr HKCU "Software\Classes\*\shell\NovaPadEditWith" "Icon" '"$INSTDIR\NovaPad.exe"'
  WriteRegStr HKCU "Software\Classes\*\shell\NovaPadEditWith\command" "" '"$INSTDIR\NovaPad.exe" "%1"'

  ; ── "Open with NovaPad" verb on folders (right-click a folder) ──────────
  WriteRegStr HKCU "Software\Classes\Directory\shell\NovaPadOpenFolder" "" "Open with NovaPad"
  WriteRegStr HKCU "Software\Classes\Directory\shell\NovaPadOpenFolder" "Icon" '"$INSTDIR\NovaPad.exe"'
  WriteRegStr HKCU "Software\Classes\Directory\shell\NovaPadOpenFolder\command" "" '"$INSTDIR\NovaPad.exe" "%V"'

  ; ── Same verb on the folder background (right-click empty area) ─────────
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\NovaPadOpenFolder" "" "Open with NovaPad"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\NovaPadOpenFolder" "Icon" '"$INSTDIR\NovaPad.exe"'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\NovaPadOpenFolder\command" "" '"$INSTDIR\NovaPad.exe" "%V"'

  ; Tell Explorer to refresh icons / verbs without a logoff.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\NovaPadEditWith"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\NovaPadOpenFolder"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\NovaPadOpenFolder"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
