import { NextRequest, NextResponse } from 'next/server';
import { requireSession, handleApiError } from '@/lib/auth';

const MACHINE_TWIN_URL = process.env.MACHINE_TWIN_URL || 'http://127.0.0.1:8000';

/**
 * Ids arriving from the client are interpolated straight into the upstream URL,
 * so anything but a plain slug could walk out of `/projects/<id>` and reach
 * another path on the twin service. Reject rather than escape.
 */
const SLUG = /^[A-Za-z0-9_-]{1,64}$/;

function safeId(value: string | null): string | null {
  return value && SLUG.test(value) ? value : null;
}

/** The upstream host is an internal detail; do not hand it to the browser. */
function upstreamUnreachable(err: unknown) {
  console.error('[api/twin] machine-twin engine unreachable:', err);
  return NextResponse.json({ error: 'Machine Twin engine is unavailable' }, { status: 502 });
}

/**
 * GET /api/twin
 * Proxy endpoint to communicate with the Machine Twin photogrammetry engine (port 8000).
 */
export async function GET(req: NextRequest) {
  try {
    // Every other /api route verifies the session; this one proxies into an
    // internal service, so it must too.
    await requireSession(undefined, req);

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'projects';
    const projectId = safeId(searchParams.get('projectId'));
    const lod = /^\d{1,2}$/.test(searchParams.get('lod') ?? '') ? searchParams.get('lod') : '0';

    if (action === 'capabilities') {
      const res = await fetch(`${MACHINE_TWIN_URL}/capabilities`, { cache: 'no-store' });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    if (action === 'projects') {
      if (projectId) {
        const res = await fetch(`${MACHINE_TWIN_URL}/projects/${projectId}`, { cache: 'no-store' });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
      }
      const res = await fetch(`${MACHINE_TWIN_URL}/projects`, { cache: 'no-store' });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    if (action === 'components' && projectId) {
      const res = await fetch(`${MACHINE_TWIN_URL}/projects/${projectId}/components`, { cache: 'no-store' });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    if (action === 'coverage' && projectId) {
      const res = await fetch(`${MACHINE_TWIN_URL}/projects/${projectId}/coverage`, { cache: 'no-store' });
      if (res.status === 404 || res.status === 204) {
        return NextResponse.json(null);
      }
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    if (action === 'jobs' && projectId) {
      const res = await fetch(`${MACHINE_TWIN_URL}/projects/${projectId}/jobs`, { cache: 'no-store' });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    if (action === 'model' && projectId) {
      const res = await fetch(`${MACHINE_TWIN_URL}/projects/${projectId}/model?lod=${lod}`, { cache: 'no-store' });
      if (!res.ok) {
        return NextResponse.json({ error: `GLB model not found for project ${projectId}` }, { status: res.status });
      }
      const blob = await res.blob();
      return new NextResponse(blob, {
        headers: {
          'Content-Type': 'model/gltf-binary',
          'Content-Disposition': `inline; filename="${projectId}-lod${lod}.glb"`,
        },
      });
    }

    if (action === 'poster' && projectId) {
      const res = await fetch(`${MACHINE_TWIN_URL}/projects/${projectId}/poster`, { cache: 'no-store' });
      if (!res.ok) {
        return NextResponse.json({ error: `Poster not found for project ${projectId}` }, { status: res.status });
      }
      const blob = await res.blob();
      return new NextResponse(blob, {
        headers: {
          'Content-Type': 'image/webp',
          'Content-Disposition': `inline; filename="${projectId}-poster.webp"`,
        },
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    // An auth failure must surface as 401/403, not as a 502 about the engine.
    if (err instanceof Error && err.name === 'AuthError') return handleApiError(err);
    return upstreamUnreachable(err);
  }
}

/**
 * POST /api/twin
 * Create project, trigger photogrammetry stages, or upload assets to Machine Twin.
 */
export async function POST(req: NextRequest) {
  try {
    // Creating projects and triggering photogrammetry stages is a manager-level
    // content operation, not something an anonymous caller may do.
    await requireSession('manager', req);

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'create';
    const projectId = safeId(searchParams.get('projectId'));
    const stage = safeId(searchParams.get('stage')) ?? 'reconstruct';

    if (action === 'create') {
      const body = await req.json();
      const res = await fetch(`${MACHINE_TWIN_URL}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    if (action === 'stage' && projectId) {
      const res = await fetch(`${MACHINE_TWIN_URL}/projects/${projectId}/stages/${stage}`, {
        method: 'POST',
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    if (action === 'upload' && projectId) {
      const formData = await req.formData();
      const res = await fetch(`${MACHINE_TWIN_URL}/projects/${projectId}/assets`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    // An auth failure must surface as 401/403, not as a 502 about the engine.
    if (err instanceof Error && err.name === 'AuthError') return handleApiError(err);
    return upstreamUnreachable(err);
  }
}
