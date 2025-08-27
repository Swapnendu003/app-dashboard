// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",           
  images: {
    unoptimized: true,
    domains: ['avatars.githubusercontent.com'],
  },
};

export default nextConfig;
