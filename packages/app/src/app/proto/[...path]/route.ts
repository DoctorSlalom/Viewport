import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';

// MIME types for assets commonly found inside prototype folders.
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function prototypesRoot(): string {
  return process.env['PROTOTYPES_ROOT'] ?? resolve(process.cwd(), '../../prototypes');
}

// CSP for the prototype origin: allow inline scripts/styles (prototypes are
// arbitrary HTML), block all external fetches so prototypes can't exfiltrate
// data, and forbid framing this origin from anywhere except the app itself.
function cspHeader(): string {
  const appOrigin = process.env['NEXT_PUBLIC_APP_URL'] ?? '*';
  return [
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:",
    'connect-src \'none\'',
    `frame-ancestors '${appOrigin}'`,
  ].join('; ');
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;

  // Reject any segment that would escape the prototypes root.
  if (segments.some((s) => s === '..' || s === '.' || s.includes('\0'))) {
    return new NextResponse('Not found', { status: 404 });
  }

  const relative = segments.join('/');
  const root = prototypesRoot();
  const absolute = join(root, relative);

  // Confirm the resolved path is still inside the root (defence-in-depth).
  if (!absolute.startsWith(resolve(root) + '/') && absolute !== resolve(root)) {
    return new NextResponse('Not found', { status: 404 });
  }

  // Block access to _template and dotfiles.
  if (segments[0]?.startsWith('_') || segments.some((s) => s.startsWith('.'))) {
    return new NextResponse('Not found', { status: 404 });
  }

  let body: Uint8Array<ArrayBuffer>;
  try {
    body = Uint8Array.from(await readFile(absolute));
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }

  const mime = MIME[extname(absolute).toLowerCase()] ?? 'application/octet-stream';

  const headers: Record<string, string> = {
    'Content-Type': mime,
    'Cache-Control': 'no-store',
    'Content-Security-Policy': cspHeader(),
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
  };

  return new NextResponse(body, { status: 200, headers });
}
