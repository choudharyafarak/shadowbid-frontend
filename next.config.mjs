/** @type {import('next').NextConfig} */
const relayer = process.env.NEXT_PUBLIC_ZAMA_RELAYER || 'https://relayer.testnet.zama.org';

const nextConfig = {
  reactStrictMode: true,
  // 1. Removed 'experimental: { appDir: true }' (Default in Next.js 16)
  
  // 2. Add Webpack config for Zama WASM support
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false, // Fixes "fs" module errors common in crypto libraries
    };

    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true, // Crucial: Enables Zama encryption
      layers: true,
    };

    return config;
  },

  // 3. Keep your existing rewrites for the relayer
  async rewrites() {
    return [
      {
        source: '/zama-gateway/:path*',
        destination: `${relayer}/:path*`,
      },
    ];
  },
};

export default nextConfig;
