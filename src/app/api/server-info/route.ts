import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Historial de muestras de memoria — persiste mientras el proceso vive
const memorySamples: { ts: number; heap_mb: number; rss_mb: number }[] = [];
const MAX_SAMPLES = 60;

export function GET() {
  const mem = process.memoryUsage();
  const nodeOptions = process.env.NODE_OPTIONS ?? null;
  const maxOldSpaceMatch = nodeOptions?.match(/--max-old-space-size=(\d+)/);
  const limit_mb = maxOldSpaceMatch ? parseInt(maxOldSpaceMatch[1]) : null;

  const sample = {
    ts: Date.now(),
    heap_mb: Math.round(mem.heapUsed / 1024 / 1024),
    rss_mb: Math.round(mem.rss / 1024 / 1024),
  };
  memorySamples.push(sample);
  if (memorySamples.length > MAX_SAMPLES) memorySamples.shift();

  const first = memorySamples[0];
  const growth_mb = memorySamples.length > 1 ? sample.heap_mb - first.heap_mb : 0;
  const elapsed_min = memorySamples.length > 1
    ? Math.round((sample.ts - first.ts) / 60000)
    : 0;

  return NextResponse.json({
    NODE_ENV: process.env.NODE_ENV ?? null,
    NODE_OPTIONS: nodeOptions,
    max_old_space_mb: limit_mb,
    node_version: process.version,
    platform: process.platform,
    uptime_seconds: Math.floor(process.uptime()),
    heap_mb: sample.heap_mb,
    rss_mb: sample.rss_mb,
    heap_pct: limit_mb ? Math.round((sample.heap_mb / limit_mb) * 100) : null,
    growth_mb,
    elapsed_min,
    samples: memorySamples,
  });
}
