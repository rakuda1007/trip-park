import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin は Node.js ネイティブモジュールを含むためバンドルせず外部参照にする
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
