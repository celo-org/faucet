/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/',
        destination: '/alfajores',
        permanent: false,
      },
    ]
  },
}

module.exports = nextConfig
