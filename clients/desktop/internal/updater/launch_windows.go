//go:build windows

package updater

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"unsafe"
)

// launchInstaller esegue l'installer NSIS in background e pianifica il
// rilancio della nuova app dopo l'aggiornamento.
//
// Non si tratta di un semplice spawn: per evitare due bug noti,
// orchestriamo la sequenza in cmd.exe con tre fasi serializzate:
//
//  1. `timeout /t 2`  — aspettiamo che il processo corrente termini
//     davvero. Senza questo, NSIS in modalita' /S tenta di sovrascrivere
//     `desktop.exe` mentre e' ancora caricato in memoria; la File
//     instruction fallisce SILENZIOSAMENTE in silent mode e l'utente si
//     ritrova la stessa versione installata. Cfr. Wails issue #1923 e
//     NSIS docs su SetOverwrite + locked files.
//
//  2. installer `/S /UPDATE` — silent install che reinstalla nello
//     stesso $INSTDIR (vedi project.nsi: WelcomePre/DirectoryPre
//     saltano in modalita' /UPDATE; comunque /S salta tutte le pagine
//     MUI). Il `&&` di cmd assicura che la fase 3 parta solo se NSIS
//     restituisce exit code 0.
//
//  3. `start "" "<selfExe>"` — rilancia la NUOVA app appena copiata.
//     Questo era l'altro bug: in /S NSIS salta MUI_FINISHPAGE_RUN, per
//     cui l'app non veniva mai riavviata e l'utente vedeva l'app
//     "scomparire" senza feedback.
//
// Il path del .exe da rilanciare e' quello del processo corrente
// (os.Executable). Coincide col path di installazione, quindi il file
// nuovo verra' lanciato dallo stesso percorso.
//
// Il processo cmd.exe e' detached (DETACHED_PROCESS +
// CREATE_NEW_PROCESS_GROUP) cosi' la chiusura dell'app non lo termina,
// e HideWindow=true evita il flash di una console nera.
//
// Eredita il token admin del processo corrente (manifest
// requireAdministrator) → no secondo prompt UAC. Se per qualche motivo
// l'app NON e' elevata (es. wails dev), CreateProcess fallirebbe con
// 740 (ERROR_ELEVATION_REQUIRED) ma cmd.exe non richiede elevazione,
// quindi la fase 1 parte sempre e l'installer chiamato dentro
// chiedera' UAC se serve (NSIS ha REQUEST_EXECUTION_LEVEL admin).
func launchInstaller(installerPath string) error {
	selfExe, err := os.Executable()
	if err != nil {
		// Senza self path possiamo ancora tentare l'install, ma
		// senza relaunch automatico: l'utente dovra' aprire l'app
		// dal menu Start. Fallback storico.
		return launchInstallerNoRelaunch(installerPath)
	}

	// Costruzione del comando cmd: attenzione al quoting per path con
	// spazi (es. "C:\Program Files\Lorenzo Campari\Bookeeper\..."). Il
	// trick `start "" "<exe>"` e' obbligatorio: se il primo argomento di
	// `start` e' tra virgolette, viene interpretato come TITOLO della
	// finestra, non come exe — per questo passiamo un titolo vuoto "".
	script := fmt.Sprintf(
		`timeout /t 2 /nobreak >nul & "%s" /S /UPDATE && start "" "%s"`,
		escapeForCmd(installerPath),
		escapeForCmd(selfExe),
	)
	cmd := exec.Command("cmd.exe", "/C", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		// 0x00000008 DETACHED_PROCESS | 0x00000200 CREATE_NEW_PROCESS_GROUP
		CreationFlags: 0x00000008 | 0x00000200,
		HideWindow:    true,
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("updater: avvio script di update: %w", err)
	}
	_ = cmd.Process.Release()
	return nil
}

// escapeForCmd rimuove caratteri pericolosi dai path passati a cmd.exe.
// I path Windows non possono contenere `"` quindi e' un controllo di
// sicurezza piu' che una vera escape. Refusiamo path con virgolette.
func escapeForCmd(path string) string {
	return strings.ReplaceAll(path, `"`, ``)
}

// launchInstallerNoRelaunch e' il vecchio path: spawna solo l'installer
// senza orchestrazione. Usato quando os.Executable() fallisce (raro).
// In questo caso l'app non si rilancia automaticamente.
func launchInstallerNoRelaunch(installerPath string) error {
	cmd := exec.Command(installerPath, "/S", "/UPDATE")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: 0x00000008 | 0x00000200,
		HideWindow:    true,
	}
	if err := cmd.Start(); err != nil {
		if e := launchInstallerElevated(installerPath); e == nil {
			return nil
		}
		return fmt.Errorf("updater: avvio installer: %w", err)
	}
	_ = cmd.Process.Release()
	return nil
}

// launchInstallerElevated e' il vecchio path basato su ShellExecuteW("runas").
// Tenuto come fallback nel caso il manifest non sia stato applicato (build di
// sviluppo, override di policy, ecc.).
func launchInstallerElevated(installerPath string) error {
	verb, _ := syscall.UTF16PtrFromString("runas")
	exe, _ := syscall.UTF16PtrFromString(installerPath)
	args, _ := syscall.UTF16PtrFromString("/S /UPDATE")

	const SW_SHOWNORMAL = 1
	if err := shellExecute(0, verb, exe, args, nil, SW_SHOWNORMAL); err != nil {
		return fmt.Errorf("updater: lancio installer (UAC fallback): %w", err)
	}
	return nil
}

// shellExecute wrappa ShellExecuteW. Ritorna errore se l'handle istanza
// e' <= 32 (convenzione Win32).
var (
	shell32           = syscall.NewLazyDLL("shell32.dll")
	procShellExecuteW = shell32.NewProc("ShellExecuteW")
)

func shellExecute(hwnd uintptr, verb, file, args, dir *uint16, show int) error {
	r, _, err := procShellExecuteW.Call(
		hwnd,
		uintptr(unsafe.Pointer(verb)),
		uintptr(unsafe.Pointer(file)),
		uintptr(unsafe.Pointer(args)),
		uintptr(unsafe.Pointer(dir)),
		uintptr(show),
	)
	// Convenzione: valori di ritorno > 32 = successo. <= 32 = codice errore.
	// Caso speciale: 1223 (ERROR_CANCELLED) = utente ha cliccato "No" su UAC.
	if r <= 32 {
		// err di Call() e' tipicamente "operazione completata correttamente":
		// l'errore vero e' nel valore di ritorno.
		if r == 1223 {
			return fmt.Errorf("operazione annullata dall'utente (UAC negato)")
		}
		return fmt.Errorf("ShellExecuteW codice %d: %v", r, err)
	}
	return nil
}
