import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Meta does not follow redirects when it delivers webhook events. Answer
  // "/api/webhook/" directly instead of redirecting it to "/api/webhook".
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
