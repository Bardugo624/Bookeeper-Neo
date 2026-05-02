//go:build !windows

package updater

import (
	"fmt"
	"os/exec"
)

// launchInstaller fallback non-Windows. L'updater oggi e' progettato per
// Windows (NSIS), ma manteniamo il symbol per compilare cross-platform.
func launchInstaller(installerPath string) error {
	cmd := exec.Command(installerPath, "/S", "/UPDATE")
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("updater: lancio installer: %w", err)
	}
	return nil
}
