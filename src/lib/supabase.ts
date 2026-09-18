import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client.
 *
 * Uses the SERVICE ROLE key, which bypasses Row Level Security. The `qrs` table
 * has RLS enabled with zero policies, so all access must go through this client
 * from server code only (Astro frontmatter / API routes).
 *
 * NEVER import this module from client-side code, and never rename these env
 * vars with a `PUBLIC_` prefix — that would ship the service role key to the browser.
 */

const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseServiceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
	throw new Error(
		'Missing Supabase server credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment (.env locally, project env vars on Vercel).'
	);
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
	auth: {
		persistSession: false,
		autoRefreshToken: false,
	},
});
