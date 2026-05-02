//go:build windows

package updater

import (
	"fmt"
	"syscall"
	"unsafe"
)

// launchInstaller esegue l'installer NSIS chiedendo elevazione UAC tramite
// ShellExecuteW con verbo "runas". Necessario perche' il setup gira come
// admin (REQUEST_EXECUTION_LEVEL admin nel project.nsi) e una semplice
// CreateProcess da un processo non elevato fallisce con
// "ERROR_ELEVATION_REQUIRED" (740).
//
// Il processo creato e' completamente detached: ritorniamo subito senza
// attendere, cosi' l'app puo' chiudersi e lasciare al setup la facolta'
// di sostituire il proprio .exe.
func launchInstaller(installerPath string) error {
	verb, _ := syscall.UTF16PtrFromString("runas")
	exe, _ := syscall.UTF16PtrFromString(installerPath)
	args, _ := syscall.UTF16PtrFromString("/S /UPDATE")

	// SW_SHOWNORMAL = 1. Il setup e' silent (/S), quindi non vedremo nulla,
	// ma alcuni shim UAC richiedono una nShow valida.
	const SW_SHOWNORMAL = 1

	if err := shellExecute(0, verb, exe, args, nil, SW_SHOWNORMAL); err != nil {
		return fmt.Errorf("updater: lancio installer (UAC): %w", err)
	}
	return nil
}

// shellExecute wrappa ShellExecuteW. Ritorna errore se l'handle istanza
// e' <= 32 (convenzione Win32).
var (
	shell32              = syscall.NewLazyDLL("shell32.dll")
	procShellExecuteW    = shell32.NewProc("ShellExecuteW")
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
