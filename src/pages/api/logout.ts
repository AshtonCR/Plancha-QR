export const prerender = false;

import type { APIRoute } from 'astro';
import { SESSION_COOKIE } from '../../lib/auth';

/** POST /api/logout — clears the session cookie and returns to the login page. */
export const POST: APIRoute = async ({ cookies, redirect }) => {
	cookies.delete(SESSION_COOKIE, { path: '/' });
	return redirect('/login');
};
