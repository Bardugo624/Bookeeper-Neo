; Defined at the top: inside a macro, __FILEDIR__ would be the folder of installer.nsi.
!define BK_HOOKS_DIR "${__FILEDIR__}"

!macro NSIS_HOOK_POSTINSTALL
  !if /FileExists "${BK_HOOKS_DIR}\bookeeper-setup.exe"
    SetOverwrite try
    File "/oname=$INSTDIR\bookeeper-setup.exe" "${BK_HOOKS_DIR}\bookeeper-setup.exe"
    SetOverwrite on
    WriteRegStr SHCTX "${UNINSTKEY}" "UninstallString" "$\"$INSTDIR\bookeeper-setup.exe$\" --uninstall"
    WriteRegStr SHCTX "${UNINSTKEY}" "QuietUninstallString" "$\"$INSTDIR\uninstall.exe$\" /S"
  !endif
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$INSTDIR\bookeeper-setup.exe"
  RMDir "$INSTDIR"
!macroend
