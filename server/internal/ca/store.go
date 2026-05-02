package ca

import "sync"

// Store keeps unlocked tenant CAs in memory.
//
// On startup the server populates the store via the auto-unlock slot
// (LoadOrCreateServerKey + UnlockWithServerKey) so any user — admin or not —
// can pair devices without re-entering the admin password.
//
// The admin-password slot remains as a manual-unlock fallback (e.g. recovery
// after a server-key file loss).
type Store struct {
	mu  sync.RWMutex
	cas map[string]*CA
}

func NewStore() *Store { return &Store{cas: map[string]*CA{}} }

func (s *Store) Set(tenantID string, ca *CA) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cas[tenantID] = ca
}

func (s *Store) Get(tenantID string) (*CA, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	c, ok := s.cas[tenantID]
	return c, ok
}

func (s *Store) Forget(tenantID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.cas, tenantID)
}
