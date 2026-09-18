export const prerender = false;

import type { APIRoute } from 'astro';
import { deleteQr, setDestination, updateLabel } from '../../../lib/qrs';

function json(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

/**
 * PATCH /api/qrs/:code — update one field of a code.
 * `{ destination_url }` assigns or re-assigns the destination;
 * `{ label }` sets or (with `null` / `""`) clears the business name.
 */
export const PATCH: APIRoute = async ({ params, request, locals }) => {
	const code = params.code;
	if (!code) {
		return json({ ok: false, error: 'not_found' }, 404);
	}

	// Any input-shape problem reports as `invalid_url`: the frontend only
	// distinguishes `invalid_url` from a generic failure.
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: 'invalid_url' }, 400);
	}

	if (typeof body !== 'object' || body === null) {
		return json({ ok: false, error: 'invalid_url' }, 400);
	}

	const fields = body as Record<string, unknown>;

	// The panel PATCHes this same endpoint for two independent purposes.
	// `destination_url` takes precedence if both keys somehow arrive together.
	if ('destination_url' in fields) {
		const destinationUrl = fields.destination_url;
		if (typeof destinationUrl !== 'string') {
			return json({ ok: false, error: 'invalid_url' }, 400);
		}

		// Anonymous visitors may only claim a sticker that has no destination yet.
		// Re-assigning an active code is an admin action.
		const result = await setDestination(code, destinationUrl, {
			onlyIfUnassigned: !locals.isAuthed,
		});

		if (!result.ok) {
			if (result.error === 'not_found') return json({ ok: false, error: result.error }, 404);
			if (result.error === 'already_assigned') return json({ ok: false, error: result.error }, 403);
			return json({ ok: false, error: result.error }, 400);
		}

		return json({ ok: true, code, destination_url: result.destination_url }, 200);
	}

	if ('label' in fields) {
		// Labels are panel-only metadata; the scan page never sets them.
		if (!locals.isAuthed) {
			return json({ ok: false, error: 'unauthorized' }, 401);
		}

		const label = fields.label;
		if (typeof label !== 'string' && label !== null) {
			return json({ ok: false, error: 'invalid_url' }, 400);
		}

		const result = await updateLabel(code, label);

		if (!result.ok) {
			return json({ ok: false, error: result.error }, 404);
		}

		return json({ ok: true, code, label: result.label }, 200);
	}

	// Neither key present: nothing to update.
	return json({ ok: false, error: 'invalid_url' }, 400);
};

/** DELETE /api/qrs/:code — permanently remove a code. No request body. */
export const DELETE: APIRoute = async ({ params }) => {
	const code = params.code;
	if (!code) {
		return json({ ok: false, error: 'not_found' }, 404);
	}

	const result = await deleteQr(code);

	if (!result.ok) {
		return json({ ok: false, error: result.error }, 404);
	}

	return json({ ok: true }, 200);
};
