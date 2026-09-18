import { supabase } from './supabase';
import { generateCode } from './codes';

export type Qr = {
	code: string;
	destination_url: string | null;
	label: string | null;
};

export type QrListItem = {
	code: string;
	label: string | null;
	destination_url: string | null;
	created_at: string;
};

export type SetDestinationResult =
	| { ok: true; destination_url: string }
	| { ok: false; error: 'not_found' | 'invalid_url' | 'already_assigned' };

export type UpdateLabelResult =
	| { ok: true; label: string | null }
	| { ok: false; error: 'not_found' };

export type DeleteQrResult = { ok: true } | { ok: false; error: 'not_found' };

/** Batch size limits for `createBatchCodes`. */
export const MIN_BATCH = 1;
export const MAX_BATCH = 200;

/** How many times we retry a bulk insert that hit the `code` unique constraint. */
const MAX_COLLISION_RETRIES = 10;

/** Postgres unique-violation error code, surfaced by PostgREST as `code`. */
const UNIQUE_VIOLATION = '23505';

/**
 * Normalizes and validates a destination URL.
 * Only well-formed absolute `http://` / `https://` URLs are accepted —
 * anything else (`javascript:`, `data:`, relative paths, bare words) is rejected.
 */
function normalizeDestinationUrl(input: unknown): string | null {
	if (typeof input !== 'string') return null;

	const trimmed = input.trim();
	if (!trimmed) return null;

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return null;
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
	// `new URL('http:foo')` parses but has no host — reject those too.
	if (!parsed.hostname) return null;

	return parsed.toString();
}

/** Looks up a single QR by its public code. Returns null when it does not exist. */
export async function getQrByCode(code: string): Promise<Qr | null> {
	if (typeof code !== 'string' || !code.trim()) return null;

	const { data, error } = await supabase
		.from('qrs')
		.select('code, destination_url, label')
		.eq('code', code.trim())
		.maybeSingle();

	if (error) throw new Error(`getQrByCode failed: ${error.message}`);
	return (data as Qr | null) ?? null;
}

/** All QRs, most recently created first. */
export async function listQrs(): Promise<QrListItem[]> {
	const { data, error } = await supabase
		.from('qrs')
		.select('code, label, destination_url, created_at')
		.order('created_at', { ascending: false });

	if (error) throw new Error(`listQrs failed: ${error.message}`);
	return (data as QrListItem[] | null) ?? [];
}

/**
 * Assigns (or re-assigns) the destination of a code.
 * The URL is validated before the database is touched.
 *
 * With `onlyIfUnassigned`, the update is filtered on `destination_url IS NULL`,
 * so an anonymous visitor can claim a blank sticker but cannot hijack a code
 * that already points somewhere. The filter runs in the database, so two
 * simultaneous claims cannot both win.
 */
export async function setDestination(
	code: string,
	destinationUrl: string,
	{ onlyIfUnassigned = false }: { onlyIfUnassigned?: boolean } = {}
): Promise<SetDestinationResult> {
	const normalized = normalizeDestinationUrl(destinationUrl);
	if (!normalized) return { ok: false, error: 'invalid_url' };

	if (typeof code !== 'string' || !code.trim()) return { ok: false, error: 'not_found' };

	const query = supabase
		.from('qrs')
		.update({ destination_url: normalized, updated_at: new Date().toISOString() })
		.eq('code', code.trim());

	if (onlyIfUnassigned) query.is('destination_url', null);

	const { data, error } = await query.select('destination_url').maybeSingle();

	if (error) throw new Error(`setDestination failed: ${error.message}`);

	if (!data) {
		if (!onlyIfUnassigned) return { ok: false, error: 'not_found' };
		// Nothing matched: either the code does not exist, or it was already claimed.
		const existing = await getQrByCode(code);
		return { ok: false, error: existing ? 'already_assigned' : 'not_found' };
	}

	return { ok: true, destination_url: (data as { destination_url: string }).destination_url };
}

/**
 * Sets (or clears) the human-readable business label of a code.
 * `label` is free text — it is only trimmed; an empty string clears it (stores `null`).
 */
export async function updateLabel(code: string, label: string | null): Promise<UpdateLabelResult> {
	if (typeof code !== 'string' || !code.trim()) return { ok: false, error: 'not_found' };

	const trimmed = typeof label === 'string' ? label.trim() : '';
	const normalized = trimmed ? trimmed : null;

	const { data, error } = await supabase
		.from('qrs')
		.update({ label: normalized, updated_at: new Date().toISOString() })
		.eq('code', code.trim())
		.select('label')
		.maybeSingle();

	if (error) throw new Error(`updateLabel failed: ${error.message}`);
	if (!data) return { ok: false, error: 'not_found' };

	return { ok: true, label: (data as { label: string | null }).label };
}

/**
 * Permanently removes a code (e.g. the physical sticker was lost).
 * Returns `not_found` when no row matched, so the caller can answer 404.
 */
export async function deleteQr(code: string): Promise<DeleteQrResult> {
	if (typeof code !== 'string' || !code.trim()) return { ok: false, error: 'not_found' };

	const { data, error } = await supabase
		.from('qrs')
		.delete()
		.eq('code', code.trim())
		.select('code')
		.maybeSingle();

	if (error) throw new Error(`deleteQr failed: ${error.message}`);
	if (!data) return { ok: false, error: 'not_found' };

	return { ok: true };
}

/** Generates `count` distinct codes locally (no DB round-trip). */
function generateDistinctCodes(count: number): string[] {
	const codes = new Set<string>();
	// Guard against a pathological loop; the alphabet^length space is huge
	// compared to MAX_BATCH, so this ceiling is never reached in practice.
	let guard = count * 100 + 100;
	while (codes.size < count && guard-- > 0) {
		codes.add(generateCode());
	}
	if (codes.size < count) {
		throw new Error('Could not generate enough distinct codes');
	}
	return [...codes];
}

/**
 * Creates `count` new codes with no destination assigned.
 * Retries with fresh codes if the bulk insert collides with an existing `code`.
 */
export async function createBatchCodes(count: number): Promise<{ code: string; id: string }[]> {
	if (!Number.isInteger(count) || count < MIN_BATCH || count > MAX_BATCH) {
		throw new Error(`count must be an integer between ${MIN_BATCH} and ${MAX_BATCH}`);
	}

	for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
		const rows = generateDistinctCodes(count).map((code) => ({
			code,
			destination_url: null,
		}));

		const { data, error } = await supabase.from('qrs').insert(rows).select('id, code');

		if (!error) {
			return (data as { id: string; code: string }[] | null) ?? [];
		}

		// Unique collision against an already-stored code: try again with new codes.
		if (error.code === UNIQUE_VIOLATION) continue;

		throw new Error(`createBatchCodes failed: ${error.message}`);
	}

	throw new Error('createBatchCodes failed: too many code collisions, try again');
}
