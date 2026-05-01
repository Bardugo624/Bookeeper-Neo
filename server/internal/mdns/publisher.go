// Package mdns publishes the bookeeper service on the local network so
// clients can discover the server without manual IP configuration.
package mdns

import (
	"log/slog"
	"os"

	"github.com/grandcat/zeroconf"
)

// Publish announces the service via mDNS and returns a handle the caller
// should Shutdown() before exit. The advertised TXT records carry the
// CA fingerprint so clients can pin trust before the first request.
func Publish(serviceName string, port int, fingerprint string) (*zeroconf.Server, error) {
	host, _ := os.Hostname()
	server, err := zeroconf.Register(
		serviceName,         // instance name
		"_bookeeper._tcp",   // service type
		"local.",            // domain
		port,                // port
		[]string{"v=1", "fp=" + fingerprint, "host=" + host},
		nil, // interfaces — nil means all
	)
	if err != nil {
		return nil, err
	}
	slog.Info("mdns advertised",
		"service", "_bookeeper._tcp",
		"name", serviceName,
		"port", port,
	)
	return server, nil
}
