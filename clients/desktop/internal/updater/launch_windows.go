//go:build windows

package updater

import (
	"fmt"
	"os/exec"
	"syscall"
	"unsafe"
)

// launchInstaller esegue l'installer NSIS in background.
//
// Nota: l'app principale gira gia' come "requireAdministrator" (vedi
// build/windows/wails.exe.manifest), quindi qualsiasi processo figlio
// eredita il token elevato e Windows NON mostra un secondo prompt UAC.
// Sfruttiamo questo per lanciare l'installer via CreateProcess diretto
// (exec.Command) invece di ShellExecuteW("runas") che, anche quando
// "runas" e' tecnicamente un no-op, attivava un round-trip asincrono
// col servizio AIS che a volte falliva o lasciava il setup invisibile.
//
// Se per qualche motivo (manifest non applicato, esecuzione da dev
// senza elevazione) il processo NON e' elevato, CreateProcess fallisce
// con ERROR_ELEVATION_REQUIRED (740) e ricadiamo su ShellExecuteW per
// chiedere comunque UAC.
//
// Il processo creato e' detached (CREATE_NEW_PROCESS_GROUP +
// DETACHED_PROCESS) cosi' chiudere l'app principale non lo termina.
func launchInstaller(installerPath string) error {
	cmd := exec.Command(installerPath, "/S", "/UPDATE")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		// 0x00000008 DETACHED_PROCESS | 0x00000200 CREATE_NEW_PROCESS_GROUP
		CreationFlags: 0x00000008 | 0x00000200,
		HideWindow:    true,
	}
	if err := cmd.Start(); err != nil {
		// Start fallisce tipicamente per ERROR_ELEVATION_REQUIRED (740)
		// quando l'app NON e' elevata (es. eseguita da `wails dev` o
		// build senza il manifest applicato). Tentiamo comunque il path
		// con UAC esplicito come fallback.
		if e := launchInstallerElevated(installerPath); e == nil {
			return nil
		}
		return fmt.Errorf("updater: avvio installer: %w", err)
	}
	// Detach: non vogliamo aspettare. Release rilascia l'handle.
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
