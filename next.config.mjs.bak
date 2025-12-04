/** next.config.mjs */
const relayer = process.env.NEXT_PUBLIC_ZAMA_RELAYER || 'https://relayer.testnet.zama.org';

export default {
  experimental: { appDir: true },
  // Explicit turbopack object prevents the "webpack config and no turbopack config" error
  turbopack: {},
  async rewrites() {
    return [
      { source: '/zama-gateway/:path*', destination: `${relayer}/:path*` }
    ];
  }
};
