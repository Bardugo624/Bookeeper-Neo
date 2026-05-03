//go:build windows

package updater

import (
	"fmt"
	"os/exec"
	"syscall"
	"unsafe"
)

// launchInstaller esegue l'installer NSIS in background, senza alcun
// wrapper. Tutta la logica di "kill old app + wait file unlock +
// relaunch new app" e' DENTRO l'installer (vedi project.nsi, sezione
// con $IsUpdate == "1"). In questo modo:
//
//   - non mostriamo finestre cmd.exe ("In attesa da N secondi...")
//   - non c'e' race tra app vecchia che esce e installer che parte
//   - il rilancio dell'app nuova e' garantito anche in /S silent mode
//     (NSIS chiama ExecShell, che bypassa il MUI_FINISHPAGE_RUN saltato
//     in silent)
//
// L'app gira con manifest requireAdministrator, quindi questo CreateProcess
// figlio eredita il token elevato senza UAC. Se per qualche ragione (dev
// build senza manifest) l'app non e' elevata, ricadiamo su ShellExecuteW
// con verb "runas" che mostra UAC.
func launchInstaller(installerPath string) error {
	// NB: NON usiamo /S (silent). In silent mode NSIS sopprime tutti
	// gli errori (file lock, permessi, antivirus) → l'utente non capisce
	// perche' l'aggiornamento non funziona. Con /UPDATE l'installer
	// salta Welcome+Directory (vedi WelcomePre/DirectoryPre in
	// project.nsi) e mostra solo la progress bar + auto-close, che
	// l'utente vede per ~2 secondi prima del relaunch automatico.
	cmd := exec.Command(installerPath, "/UPDATE")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		// CREATE_NEW_PROCESS_GROUP — sopravvive alla chiusura del padre.
		// NON usiamo DETACHED_PROCESS perche' l'installer NSIS HA una GUI
		// e va attaccato alla sessione interattiva dell'utente.
		CreationFlags: 0x00000200,
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

// launchInstallerElevated e' il fallback basato su ShellExecuteW("runas"):
// usato solo se CreateProcess fallisce per ERROR_ELEVATION_REQUIRED (740),
// tipico in build di sviluppo senza manifest applicato.
func launchInstallerElevated(installerPath string) error {
	verb, _ := syscall.UTF16PtrFromString("runas")
	exe, _ := syscall.UTF16PtrFromString(installerPath)
	args, _ := syscall.UTF16PtrFromString("/UPDATE")

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
