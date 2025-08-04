import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    // Handle PDF.js imports
    config.resolve.alias = {
      ...config.resolve.alias,
      'pdfjs-dist/build/pdf': require.resolve('pdfjs-dist'),
      'pdfjs-dist': require.resolve('pdfjs-dist'),
    };

    // Handle PDF.js worker and prevent browser loading issues
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        stream: false,
        util: false,
      };
    }

    // Ensure proper module resolution
    config.module.rules.push({
      test: /pdf\.worker\.(min\.)?js/,
      type: 'asset/resource',
    });

    return config;
  },
  // Disable server-side rendering for PDF components
  experimental: {
    esmExternals: 'loose',
  },
};

export default nextConfig;