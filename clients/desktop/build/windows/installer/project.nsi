Unicode true

####
## Please note: Template replacements don't work in this file. They are provided with default defines like
## mentioned underneath.
## If the keyword is not defined, "wails_tools.nsh" will populate them with the values from ProjectInfo.
## If they are defined here, "wails_tools.nsh" will not touch them. This allows to use this project.nsi manually
## from outside of Wails for debugging and development of the installer.
##
## For development first make a wails nsis build to populate the "wails_tools.nsh":
## > wails build --target windows/amd64 --nsis
## Then you can call makensis on this file with specifying the path to your binary:
## For a AMD64 only installer:
## > makensis -DARG_WAILS_AMD64_BINARY=..\..\bin\app.exe
## For a ARM64 only installer:
## > makensis -DARG_WAILS_ARM64_BINARY=..\..\bin\app.exe
## For a installer with both architectures:
## > makensis -DARG_WAILS_AMD64_BINARY=..\..\bin\app-amd64.exe -DARG_WAILS_ARM64_BINARY=..\..\bin\app-arm64.exe
####
## The following information is taken from the ProjectInfo file, but they can be overwritten here.
####
## !define INFO_PROJECTNAME    "MyProject" # Default "{{.Name}}"
## !define INFO_COMPANYNAME    "MyCompany" # Default "{{.Info.CompanyName}}"
## !define INFO_PRODUCTNAME    "MyProduct" # Default "{{.Info.ProductName}}"
## !define INFO_PRODUCTVERSION "1.0.0"     # Default "{{.Info.ProductVersion}}"
## !define INFO_COPYRIGHT      "Copyright" # Default "{{.Info.Copyright}}"
###
## !define PRODUCT_EXECUTABLE  "Application.exe"      # Default "${INFO_PROJECTNAME}.exe"
## !define UNINST_KEY_NAME     "UninstKeyInRegistry"  # Default "${INFO_COMPANYNAME}${INFO_PRODUCTNAME}"
####
## !define REQUEST_EXECUTION_LEVEL "admin"            # Default "admin"  see also https://nsis.sourceforge.io/Docs/Chapter4.html
####
## Include the wails tools
####
!include "wails_tools.nsh"
!include "FileFunc.nsh"   # ${GetParameters}, ${GetOptions}
!include "LogicLib.nsh"   # ${If}, ${EndIf}

# /UPDATE flag (set by .onInit) — usato da WelcomePre/DirectoryPre
Var IsUpdate

# The version information for this two must consist of 4 parts
VIProductVersion "${INFO_PRODUCTVERSION}.0"
VIFileVersion    "${INFO_PRODUCTVERSION}.0"

VIAddVersionKey "CompanyName"     "${INFO_COMPANYNAME}"
VIAddVersionKey "FileDescription" "${INFO_PRODUCTNAME} Installer"
VIAddVersionKey "ProductVersion"  "${INFO_PRODUCTVERSION}"
VIAddVersionKey "FileVersion"     "${INFO_PRODUCTVERSION}"
VIAddVersionKey "LegalCopyright"  "${INFO_COPYRIGHT}"
VIAddVersionKey "ProductName"     "${INFO_PRODUCTNAME}"

# Enable HiDPI support. https://nsis.sourceforge.io/Reference/ManifestDPIAware
ManifestDPIAware true

!include "MUI.nsh"

!define MUI_ICON "..\icon.ico"
!define MUI_UNICON "..\icon.ico"
# Brand bitmaps generati da deploy/scripts/gen-installer-bitmaps.ps1
# Sage gradient (#4d8369 -> #386650) + cream wordmark.
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "header.bmp"        # 150x57, top-right durante install
!define MUI_HEADERIMAGE_UNBITMAP "header.bmp"
!define MUI_WELCOMEFINISHPAGE_BITMAP "wizard.bmp"  # 164x314, sinistra welcome/finish
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "wizard.bmp"
!define MUI_FINISHPAGE_NOAUTOCLOSE # Wait on the INSTFILES page so the user can take a look into the details of the installation steps
!define MUI_ABORTWARNING # This will warn the user if they exit from the installer.

# Custom strings italiane on-brand: tono editoriale, sereno, "libroso".
!define MUI_WELCOMEPAGE_TITLE "Benvenuto in Bookeeper"
!define MUI_WELCOMEPAGE_TEXT "Bookeeper è la tua biblioteca personale: cataloga, ritrova e valorizza i libri che possiedi.$\r$\n$\r$\nL'installazione richiede meno di un minuto. Fai clic su Avanti per iniziare."
!define MUI_FINISHPAGE_TITLE "Tutto pronto"
!define MUI_FINISHPAGE_TEXT "Bookeeper è installato sul tuo computer. Lo trovi nel menu Start e sul desktop.$\r$\n$\r$\nBuona lettura."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${PRODUCT_EXECUTABLE}"
!define MUI_FINISHPAGE_RUN_TEXT "Avvia Bookeeper ora"

# Branding text in fondo a tutte le pagine (sostituisce "Nullsoft Install System")
BrandingText "Bookeeper — la tua biblioteca personale"

# Pagine: in modalita' /UPDATE saltiamo welcome, directory e finish
# (l'app si rilancia da sola e la finestra si chiude automaticamente).
# Lo skip e' implementato nelle PRE function piu' sotto.
!define MUI_PAGE_CUSTOMFUNCTION_PRE WelcomePre
!insertmacro MUI_PAGE_WELCOME
!define MUI_PAGE_CUSTOMFUNCTION_PRE DirectoryPre
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_PAGE_CUSTOMFUNCTION_PRE FinishPre
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_INSTFILES # Uinstalling page

!insertmacro MUI_LANGUAGE "Italian" # UI installer in italiano
!insertmacro MUI_LANGUAGE "English" # Fallback per locale non-IT

## The following two statements can be used to sign the installer and the uninstaller. The path to the binaries are provided in %1
#!uninstfinalize 'signtool --file "%1"'
#!finalize 'signtool --file "%1"'

Name "${INFO_PRODUCTNAME}"
OutFile "..\..\bin\${INFO_PROJECTNAME}-${ARCH}-installer.exe" # Name of the installer's file.
InstallDir "$PROGRAMFILES64\${INFO_COMPANYNAME}\${INFO_PRODUCTNAME}" # Default installing folder ($PROGRAMFILES is Program Files folder).
ShowInstDetails show # This will always show the installation details.

Function .onInit
   !insertmacro wails.checkArchitecture
   # /UPDATE: aggiornamento da app esistente. Salta welcome/directory.
   StrCpy $IsUpdate "0"
   ${GetParameters} $R0
   ClearErrors
   ${GetOptions} $R0 "/UPDATE" $R1
   ${IfNot} ${Errors}
       StrCpy $IsUpdate "1"
   ${EndIf}
FunctionEnd

Function WelcomePre
    ${If} $IsUpdate == "1"
        Abort   ; salta la pagina
    ${EndIf}
FunctionEnd

Function DirectoryPre
    ${If} $IsUpdate == "1"
        Abort   ; usa $INSTDIR ereditato dal registry uninstall key
    ${EndIf}
FunctionEnd

Function FinishPre
    ${If} $IsUpdate == "1"
        Abort   ; in update mode la finestra si chiude da sola (SetAutoClose true)
    ${EndIf}
FunctionEnd

Section
    !insertmacro wails.setShellContext

    !insertmacro wails.webview2runtime

    # In modalita' update: chiudiamo l'app vecchia e aspettiamo che
    # Windows rilasci il lock su desktop.exe prima di sovrascriverlo.
    # Senza questo step NSIS in /S fallirebbe SILENZIOSAMENTE la File
    # instruction lasciando installata la versione precedente.
    ${If} $IsUpdate == "1"
        DetailPrint "Aggiornamento in corso: chiusura della versione precedente..."

        # nsExec::Exec gira completamente nascosto, niente flash di
        # console nera. taskkill /F /IM termina tutte le istanze.
        # NON usiamo /T (kill tree): l'installer NSIS e' a sua volta
        # un figlio di desktop.exe (lo ha spawnato l'app stessa) e
        # /T lo ammazzerebbe interrompendo l'aggiornamento.
        nsExec::Exec 'taskkill /F /IM "${PRODUCT_EXECUTABLE}"'
        Pop $0  ; ignoriamo l'exit code: se non c'e' nulla da uccidere e' OK

        # Loop di attesa unlock: tentiamo di rinominare il vecchio
        # exe; se la rename riesce significa che Windows ha rilasciato
        # l'handle. Massimo ~6 secondi (30 × 200ms). Su SSD e PC
        # moderni di solito basta 1 ciclo.
        StrCpy $1 0  ; counter
        unlock_retry:
            ClearErrors
            Delete "$INSTDIR\${PRODUCT_EXECUTABLE}"
            ${IfNot} ${Errors}
                Goto unlock_done
            ${EndIf}
            IntOp $1 $1 + 1
            ${If} $1 >= 30
                Goto unlock_done   ; abbiamo provato abbastanza, andiamo avanti comunque
            ${EndIf}
            Sleep 200
            Goto unlock_retry
        unlock_done:
    ${EndIf}

    SetOutPath $INSTDIR

    !insertmacro wails.files

    CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"
    CreateShortCut "$DESKTOP\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"

    !insertmacro wails.associateFiles
    !insertmacro wails.associateCustomProtocols

    !insertmacro wails.writeUninstaller

    # Rilancio automatico dopo update. La pagina FINISH viene saltata
    # (vedi FinishPre) e SetAutoClose chiude l'installer subito dopo
    # la fine della section. ExecShell async non blocca.
    ${If} $IsUpdate == "1"
        SetAutoClose true
        ExecShell "" "$INSTDIR\${PRODUCT_EXECUTABLE}"
    ${EndIf}
SectionEnd

Section "uninstall"
    !insertmacro wails.setShellContext

    # Sicurezza dati utente: chiedi esplicitamente prima di cancellare la
    # cartella WebView2/AppData, che contiene anche cache locali (cover,
    # cookies di sessione). Default = No (preserva i dati).
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
        "Vuoi cancellare anche i dati locali di Bookeeper su questo computer?$\r$\n$\r$\nIncludono cache delle copertine e dati di sessione. La tua biblioteca sul server resta intatta.$\r$\n$\r$\nScegli 'No' se prevedi di reinstallare." \
        IDNO skip_userdata
        RMDir /r "$AppData\${PRODUCT_EXECUTABLE}"
    skip_userdata:

    RMDir /r $INSTDIR

    Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"
    Delete "$DESKTOP\${INFO_PRODUCTNAME}.lnk"

    !insertmacro wails.unassociateFiles
    !insertmacro wails.unassociateCustomProtocols

    !insertmacro wails.deleteUninstaller
SectionEnd
