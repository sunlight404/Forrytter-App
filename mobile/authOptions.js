// Keep the existing default storage key so upgrades retain already saved sessions.
export const authOptions = (storage, isWeb) => ({
  storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: isWeb,
});
