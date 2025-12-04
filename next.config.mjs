/** next.config.mjs */
const relayer = process.env.NEXT_PUBLIC_ZAMA_RELAYER || 'https://relayer.testnet.zama.org';
export default {
  experimental: { appDir: true },
  turbopack: {},
  async rewrites() { return [{ source: '/zama-gateway/:path*', destination: `${relayer}/:path*` }]; }
};
