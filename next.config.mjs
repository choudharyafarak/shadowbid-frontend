cat > next.config.mjs <<'EOF'
/** next.config.mjs */
const relayer = process.env.NEXT_PUBLIC_ZAMA_RELAYER || 'https://relayer.testnet.zama.org';

export default {
  experimental: { appDir: true },
  // Add an explicit turbopack config object so Next.js doesn't error when a webpack config exists.
  turbopack: {},
  // Rewrites: proxy /zama-gateway to relayer (same-origin) — adjust if you use API routes instead.
  async rewrites() {
    return [
      {
        source: '/zama-gateway/:path*',
        destination: `${relayer}/:path*`
      }
    ];
  }
  // NOTE: if you previously added a custom webpack() function to modify externals, remove it.
  // If you really need a custom webpack hook, we'll have to migrate or force webpack (see Option 2).
};
