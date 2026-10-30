import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Allow local development origins */
  allowedDevOrigins: ["127.0.0.1", "localhost", "10.20.25.109"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
