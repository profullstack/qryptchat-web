export async function GET() {
  return new Response(
    JSON.stringify({
      name: "QryptChat - Quantum-Resistant Messaging",
      short_name: "QryptChat",
      description: "Secure, quantum-resistant end-to-end encrypted messaging",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#6366f1",
      icons: [
        {
          src: "/icons/favicon-16x16.png",
          sizes: "16x16",
          type: "image/png"
        },
        {
          src: "/icons/favicon-32x32.png",
          sizes: "32x32",
          type: "image/png"
        },
        {
          src: "/icons/favicon-48x48.png",
          sizes: "48x48",
          type: "image/png"
        },
        {
          src: "/icons/favicon-64x64.png",
          sizes: "64x64",
          type: "image/png"
        },
        {
          src: "/icons/favicon-128x128.png",
          sizes: "128x128",
          type: "image/png"
        },
        {
          src: "/icons/favicon-256x256.png",
          sizes: "256x256",
          type: "image/png"
        },
        {
          src: "/icons/favicon-512x512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable any"
        }
      ]
    }),
    {
      headers: {
        "Content-Type": "application/manifest+json"
      }
    }
  );
}