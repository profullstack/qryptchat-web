// Redirect legacy .webmanifest requests to .json
export async function GET() {
	return new Response(null, {
		status: 301,
		headers: {
			'Location': '/manifest.json'
		}
	});
}