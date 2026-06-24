/**
 * authService
 * -----------
 * Frontend-only authentication using static credentials.
 *
 * Everything related to "how do we authenticate" lives here. UI components and
 * the auth store depend on this module's interface, never on its internals, so
 * replacing the mock with a real API touches only this file.
 */

const STORAGE_KEY = 'db-explorer.auth';

// Static credentials for the mock login. In a real app these never live on the
// client — the backend validates them instead.
const STATIC_USER = {
  email: 'admin@example.com',
  password: 'admin123',
  name: 'Admin',
  role: 'administrator',
};

// Simulate async latency so the UI behaves like it will against a real API.
const delay = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

export const authService = {
  /**
   * Validate credentials and persist the session on success.
   * @returns {Promise<{email,name,role}>} the logged-in user
   * @throws {Error} when credentials are invalid
   */
  async login(email, password) {
    // Future API:
    // const { data } = await axios.post('/api/auth/login', { email, password });
    // localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
    // return data.user;

    await delay();

    const normalizedEmail = (email || '').trim().toLowerCase();
    if (
      normalizedEmail === STATIC_USER.email &&
      password === STATIC_USER.password
    ) {
      const user = {
        email: STATIC_USER.email,
        name: STATIC_USER.name,
        role: STATIC_USER.role,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      return user;
    }

    throw new Error('Invalid email or password.');
  },

  logout() {
    // Future API:
    // await axios.post('/api/auth/logout');
    localStorage.removeItem(STORAGE_KEY);
  },

  /**
   * @returns {{email,name,role}|null} the persisted user, or null
   */
  getCurrentUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  isAuthenticated() {
    return Boolean(this.getCurrentUser());
  },
};
