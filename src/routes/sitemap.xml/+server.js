/** @type {import('@sveltejs/kit').RequestHandler} */
export function GET() {
	const baseUrl = 'https://qrypt.chat';
	const lastmod = '2026-06-02';

	const pages = [
		'/',
		'/about',
		'/security',
		'/privacy',
		'/terms',
		'/contact',
		'/warrant-canary',
		'/encryption-test',
	];

	const urls = pages
		.map(
			(page) => `
	<url>
		<loc>${baseUrl}${page}</loc>
		<lastmod>${lastmod}</lastmod>
		<changefreq>monthly</changefreq>
		<priority>${page === '/' ? '1.0' : '0.8'}</priority>
	</url>`
		)
		.join('');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'max-age=3600',
		},
	});
}
