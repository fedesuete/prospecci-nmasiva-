/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL || 'http://prospeccion-api:3001'}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
