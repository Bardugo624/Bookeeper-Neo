//go:build windows

package version

import (
	"os"
	"syscall"
	"unsafe"
)

// init prova a leggere ProductVersion dalla VERSIONINFO embeddata nell'exe
// (Wails la genera automaticamente da wails.json info.productVersion).
// Cosi' anche build "dev" senza ldflags mostrano la versione giusta in UI.
// Non sovrascrive valori gia' impostati via -ldflags.
func init() {
	if Version != "dev" && Version != "" {
		return // gia' iniettata via ldflags
	}
	if v := readProductVersion(); v != "" {
		Version = v
	}
}

var (
	modVersion                  = syscall.NewLazyDLL("version.dll")
	procGetFileVersionInfoSizeW = modVersion.NewProc("GetFileVersionInfoSizeW")
	procGetFileVersionInfoW     = modVersion.NewProc("GetFileVersionInfoW")
	procVerQueryValueW          = modVersion.NewProc("VerQueryValueW")
)

func readProductVersion() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	exePtr, _ := syscall.UTF16PtrFromString(exe)

	var dummy uint32
	size, _, _ := procGetFileVersionInfoSizeW.Call(uintptr(unsafe.Pointer(exePtr)), uintptr(unsafe.Pointer(&dummy)))
	if size == 0 {
		return ""
	}
	buf := make([]byte, size)
	r, _, _ := procGetFileVersionInfoW.Call(
		uintptr(unsafe.Pointer(exePtr)),
		0,
		size,
		uintptr(unsafe.Pointer(&buf[0])),
	)
	if r == 0 {
		return ""
	}

	// Strategia: cerca il primo \StringFileInfo\<lang-codepage>\ProductVersion
	// disponibile. Wails di default usa "040904b0" (en-US, Unicode), ma per
	// robustezza enumeriamo i language IDs presenti via VarFileInfo.
	type langCp struct {
		Lang     uint16
		Codepage uint16
	}
	var lcPtr *langCp
	var lcLen uint32
	tr, _ := syscall.UTF16PtrFromString(`\VarFileInfo\Translation`)
	r, _, _ = procVerQueryValueW.Call(
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(unsafe.Pointer(tr)),
		uintptr(unsafe.Pointer(&lcPtr)),
		uintptr(unsafe.Pointer(&lcLen)),
	)

	tryQuery := func(subBlock string) string {
		sbPtr, _ := syscall.UTF16PtrFromString(subBlock)
		var valPtr *uint16
		var valLen uint32
		ok, _, _ := procVerQueryValueW.Call(
			uintptr(unsafe.Pointer(&buf[0])),
			uintptr(unsafe.Pointer(sbPtr)),
			uintptr(unsafe.Pointer(&valPtr)),
			uintptr(unsafe.Pointer(&valLen)),
		)
		if ok == 0 || valPtr == nil || valLen == 0 {
			return ""
		}
		s := utf16PtrToStringN(valPtr, valLen)
		return s
	}

	if r != 0 && lcPtr != nil && lcLen >= 4 {
		// Itera su tutti i lang/codepage trovati
		count := int(lcLen) / 4
		base := unsafe.Pointer(lcPtr)
		for i := 0; i < count; i++ {
			lc := (*langCp)(unsafe.Pointer(uintptr(base) + uintptr(i*4)))
			sb := formatStringFileInfoBlock(lc.Lang, lc.Codepage, "ProductVersion")
			if v := tryQuery(sb); v != "" {
				return v
			}
		}
	}

	// Fallback: tentativi comuni (en-US Unicode, en-US ANSI, neutral Unicode).
	for _, lc := range []string{`040904b0`, `040904E4`, `000004b0`} {
		if v := tryQuery(`\StringFileInfo\` + lc + `\ProductVersion`); v != "" {
			return v
		}
	}
	return ""
}

func formatStringFileInfoBlock(lang, cp uint16, key string) string {
	hex := func(v uint16) string {
		const digits = "0123456789abcdef"
		return string([]byte{
			digits[(v>>12)&0xF],
			digits[(v>>8)&0xF],
			digits[(v>>4)&0xF],
			digits[v&0xF],
		})
	}
	return `\StringFileInfo\` + hex(lang) + hex(cp) + `\` + key
}

func utf16PtrToStringN(p *uint16, lenChars uint32) string {
	if p == nil || lenChars == 0 {
		return ""
	}
	// lenChars include il NUL finale; trimma.
	slice := unsafe.Slice(p, lenChars)
	for i, c := range slice {
		if c == 0 {
			slice = slice[:i]
			break
		}
	}
	return syscall.UTF16ToString(slice)
}
