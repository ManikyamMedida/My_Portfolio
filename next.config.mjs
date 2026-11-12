import withBundleAnalyzer from "@next/bundle-analyzer";

const analyze = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "react-icons"],
  },
  async headers() {
    const immutable = [
      {
        key: "Cache-Control",
        value: "public, max-age=31536000, immutable",
      },
    ];
    return [
      { source: "/agent/:path*", headers: immutable },
      { source: "/logo.svg", headers: immutable },
      { source: "/logos/:path*", headers: immutable },
      { source: "/exp/:path*", headers: immutable },
      {
        source: "/:path(.*\\.(?:png|jpg|jpeg|webp|svg|ico))",
        headers: immutable,
      },
    ];
  },
};

export default analyze(nextConfig);
