package ca

import "sync"

// Store keeps unlocked tenant CAs in memory after the first successful
// admin-password unlock (typically at desktop bootstrap or login).
//
// The Store is process-local: restarting the server requires the next admin
// login to re-unlock. This is intentional — the admin password is never
// persisted on disk.
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
