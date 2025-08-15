/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['localhost'],
  async redirects() {
    return [
      {
        source: '/',
        destination: '/celo-sepolia',
        permanent: false,
      },
    ]
  },
}

module.exports = nextConfig
