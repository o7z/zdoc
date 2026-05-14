import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		// Self-hosted docs viewer: only POST is the password login on the same origin.
		// Origin/host mismatches happen under reverse proxies (HTTPS→HTTP) and break the login form.
		csrf: { trustedOrigins: ['*'] }
	}
};

export default config;
