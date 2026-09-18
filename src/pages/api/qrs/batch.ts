export const prerender = false;

import type { APIRoute } from 'astro';
import { createBatchCodes, MAX_BATCH, MIN_BATCH } from '../../../lib/qrs';

function json(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

/** POST /api/qrs/batch — create a "plancha" of N codes with no destination assigned. */
export const POST: APIRoute = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: 'invalid_count' }, 400);
	}

	if (typeof body !== 'object' || body === null) {
		return json({ ok: false, error: 'invalid_count' }, 400);
	}

	const count = (body as Record<string, unknown>).count;
	if (
		typeof count !== 'number' ||
		!Number.isInteger(count) ||
		count < MIN_BATCH ||
		count > MAX_BATCH
	) {
		return json({ ok: false, error: 'invalid_count' }, 400);
	}

	const created = await createBatchCodes(count);

	return json({ ok: true, codes: created.map(({ code, id }) => ({ code, id })) }, 200);
};
