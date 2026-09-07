# Fixed issues

Short log of problems that were confirmed working and removed from `docs/progress.md`.

- **OTP input assumed 6 digits.** This project issues 8-digit email OTPs (GoTrue allows 6–10). The form’s `maxLength={6}` / `pattern="\d{6}"` and a Zod `^\d{6}$` check truncated a correct code before `verifyOtp`. Isolated with `admin/generate_link`: `type: "email"` succeeds, `type: "magiclink"` does not. Length is now the shared 6–10 range in `lib/auth/otp-token.ts`. Confirmed with a real emailed-code sign-in.
