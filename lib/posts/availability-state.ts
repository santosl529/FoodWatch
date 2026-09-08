/**
 * Result of an availability action. Lives outside the `"use server"` module,
 * which may only export async functions.
 */
export type AvailabilityState = {
  error: string | null;
};
