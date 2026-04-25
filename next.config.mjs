/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.ufs.sh' },          // UploadThing
      { protocol: 'https', hostname: 'utfs.io' },            // UploadThing legacy
      { protocol: 'https', hostname: '**' },                 // дев-fallback
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: '25mb' },
  },
};

export default nextConfig;
