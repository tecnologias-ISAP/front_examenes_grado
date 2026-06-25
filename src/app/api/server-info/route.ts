import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  const nodeOptions = process.env.NODE_OPTIONS ?? null;
  const maxOldSpaceMatch = nodeOptions?.match(/--max-old-space-size=(\d+)/);

  return NextResponse.json({
    NODE_ENV: process.env.NODE_ENV ?? null,
    NODE_OPTIONS: nodeOptions,
    max_old_space_mb: maxOldSpaceMatch ? parseInt(maxOldSpaceMatch[1]) : null,
    node_version: process.version,
    platform: process.platform,
    uptime_seconds: Math.floor(process.uptime()),
    memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    memory_limit_mb: maxOldSpaceMatch ? parseInt(maxOldSpaceMatch[1]) : 'sin límite (default Node.js)',
  });
}
