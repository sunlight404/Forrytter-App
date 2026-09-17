# Version 1.7.0

Min oversikt now groups horse name, actual date, training and the date's checkable standard/extra tasks in one card. Today's horse is shown when assigned, followed by the next confirmed horse day. Feeding duties are shown only when assigned, without duplicating today's next shift. Agreements, other dates and notification settings are under Flere valg. Existing calendars, swaps and extra tasks are preserved.

Session storage retains the existing Supabase key and refreshes tokens. A membership network error preserves the known membership instead of displaying a false waiting-for-approval screen. Native foreground events restart token refresh. Membership state is cleared on account changes.

Password recovery UI, recovery callback handling and password confirmation are implemented. **Email sending is intentionally gated by authConfiguration.js until the production Auth URL Configuration is corrected.** An invalid-token routing check with the requested production redirect returned http://localhost:3000. The user must sign in to the Supabase dashboard so Site URL / allowed redirects and email delivery settings can be checked. Do not tell users the reset flow is active until this is complete. No real recovery email or real account password was changed during testing.

Verification: 13 tests pass, including stored-session restoration and refresh-token rotation using the actual Supabase client with mocked network responses. Web export passes. The browser renders the password help flow and rejects an empty email in the prepared enabled form. Real email delivery remains unverified.
