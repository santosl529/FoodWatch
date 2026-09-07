/**
 * GoTrue's email OTP length is a project setting (`GOTRUE_MAILER_OTP_LENGTH`,
 * Authentication → Email), not a constant. The dashboard accepts 6–10 digits;
 * this project currently issues 8. Accept the full range so a settings change
 * never silently truncates or rejects a valid code. `verifyOtp` is the
 * authority on whether a given code is correct.
 */
export const OTP_TOKEN_MIN_LENGTH = 6;
export const OTP_TOKEN_MAX_LENGTH = 10;

/** Unanchored; HTML `pattern` already matches the whole value. */
export const OTP_TOKEN_DIGIT_PATTERN = `\\d{${OTP_TOKEN_MIN_LENGTH},${OTP_TOKEN_MAX_LENGTH}}`;

export const OTP_TOKEN_PATTERN = new RegExp(`^${OTP_TOKEN_DIGIT_PATTERN}$`);
