/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // 1. Security Headers for Zama Encryption
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },

  // 2. Proxy for Zama Gateway (Bypasses CORS)
  async rewrites() {
    return [
      {
        source: '/zama-gateway/:path*',
        destination: 'https://gateway.sepolia.zama.ai/:path*',
      },
      {
        source: '/zama-relayer/:path*',
        destination: 'https://relayer.testnet.zama.org/:path*',
      },
    ];
  },

  // 3. Allow your Cloudflare Tunnel
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000", 
        "bean-appears-sofa-delivers.trycloudflare.com" // <--- YOUR EXACT TUNNEL URL
      ],
    },
  },

  // 4. Build Settings
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true }
};

export default nextConfig;
