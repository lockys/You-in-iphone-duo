import type { NextConfig } from 'next';
import withRspack from 'next-rspack';
const config: NextConfig = {
  output: 'standalone',
  logging: false,
  // next-rspack 16.3.4 omits this config.js dependency from its standalone trace.
  outputFileTracingIncludes: {
    '/*': ['./node_modules/next/dist/server/mcp/tools/next-instance-error-state.js'],
  },
  outputFileTracingExcludes: {
    '*': [
      './.media-cache*/**/*',
      './evidence/**/*',
      './tests/**/*',
      './e2e/**/*',
      './tools/**/*',
      './test-results/**/*',
      './playwright-report/**/*',
      './8150.mp4',
      './.env*',
    ],
  },
  serverExternalPackages: ['busboy', 'ffmpeg-static', 'ffprobe-static'],
  async headers() {
    return [
      { source: '/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};
export default withRspack(config);
