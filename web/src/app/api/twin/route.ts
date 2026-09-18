import { NextRequest, NextResponse } from 'next/server';

const MACHINE_TWIN_URL = process.env.MACHINE_TWIN_URL || 'http://127.0.0.1:8000';

/**
 * GET /api/twin
 * Proxy endpoint to communicate with the Machine Twin photogrammetry engine (port 8000).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || 'projects';
  const projectId = searchParams.get('projectId');
  const lod = searchParams.get('lod') || '0';

  try {
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
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Machine Twin Engine unreachable at ${MACHINE_TWIN_URL}: ${msg}` },
      { status: 502 }
    );
  }
}

/**
 * POST /api/twin
 * Create project, trigger photogrammetry stages, or upload assets to Machine Twin.
 */
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || 'create';
  const projectId = searchParams.get('projectId');
  const stage = searchParams.get('stage') || 'reconstruct';

  try {
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
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Machine Twin Engine unreachable at ${MACHINE_TWIN_URL}: ${msg}` },
      { status: 502 }
    );
  }
}
