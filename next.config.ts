import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: [
    "@prisma/adapter-pg",
    "@prisma/client",
  ],
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
};

export default nextConfig;
