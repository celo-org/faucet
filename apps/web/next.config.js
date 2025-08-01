/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['localhost'],
  async redirects() {
    return [
      {
        source: '/',
        destination: '/alfajores',
        permanent: true,
      },
    ]
  },
}

module.exports = nextConfig
