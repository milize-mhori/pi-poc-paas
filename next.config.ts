import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // トレイリングスラッシュを無効化
  trailingSlash: false,
  
  experimental: {
    // Server Actions を有効化
    serverActions: {
      allowedOrigins: ["localhost:3000", "127.0.0.1:3000"],
    },
  },
  // WebSocket サポート（将来的な実装のための準備）
  async rewrites() {
    return [
      {
        source: '/api/transcribe',
        destination: '/api/transcribe',
      },
    ];
  },
  // 外部ドメインに対するリクエストを許可
  async headers() {
    return [
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
