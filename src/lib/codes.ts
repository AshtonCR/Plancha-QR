import { customAlphabet } from 'nanoid';

/**
 * Lowercase, URL-safe, human-typeable alphabet.
 * Ambiguous characters are excluded on purpose so a code can be read off a
 * printed sheet and typed by hand without mistakes:
 *   - no `0` / `o`
 *   - no `1` / `l` / `i`
 */
export const CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

export const CODE_LENGTH = 6;

const nanoid = customAlphabet(CODE_ALPHABET, CODE_LENGTH);

/** Generates a short public code, e.g. `re007`-style: `k7m2pq`. */
export function generateCode(): string {
	return nanoid();
}
