import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE, readSessionEmail } from './lib/auth';

/**
 * Gates the admin surface. Public by design: `/`, `/login` and the scan pages
 * `/:code` — those must work for anyone holding a printed sticker.
 *
 * `PATCH /api/qrs/:code` is let through unauthenticated so a fresh sticker can
 * still be claimed from the scan page; the route itself only allows that when
 * the code has no destination yet.
 */
export const onRequest = defineMiddleware(async (context, next) => {
	const email = readSessionEmail(context.cookies.get(SESSION_COOKIE)?.value);
	context.locals.userEmail = email;
	context.locals.isAuthed = email !== null;

	if (context.locals.isAuthed) return next();

	const { pathname } = context.url;

	if (pathname === '/panel' || pathname.startsWith('/panel/')) {
		return context.redirect(`/login?next=${encodeURIComponent(pathname)}`);
	}

	if (pathname.startsWith('/api/qrs')) {
		const isScanClaim = context.request.method === 'PATCH' && pathname !== '/api/qrs/batch';
		if (!isScanClaim) {
			return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' },
			});
		}
	}

	return next();
});
