import { create } from 'zustand';
import { authService } from '../services/authService';

/**
 * Auth state, backed by localStorage so the session survives refreshes.
 *
 * The store talks to `authService` only — it never knows whether auth is
 * mocked or backed by a real API. Swapping in a real auth backend is a
 * change in authService alone.
 */
export const useAuthStore = create((set) => ({
  // Initialise from persisted session (if any).
  user: authService.getCurrentUser(),
  isAuthenticated: authService.isAuthenticated(),
  error: null,
  loading: false,

  /**
   * Attempt a login. Returns true on success, false on failure.
   */
  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const user = await authService.login(email, password);
      set({ user, isAuthenticated: true, loading: false, error: null });
      return true;
    } catch (err) {
      set({
        user: null,
        isAuthenticated: false,
        loading: false,
        error: err.message || 'Login failed',
      });
      return false;
    }
  },

  logout: () => {
    authService.logout();
    set({ user: null, isAuthenticated: false, error: null });
  },

  clearError: () => set({ error: null }),
}));
