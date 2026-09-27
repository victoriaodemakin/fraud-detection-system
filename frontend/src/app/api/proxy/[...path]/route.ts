import { NextRequest, NextResponse } from "next/server";

// Server-side only - never exposed to the browser bundle (no NEXT_PUBLIC_ prefix).
// The browser talks only to this proxy; the proxy forwards to the ASP.NET API.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:5073";

async function handler(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const targetUrl = `${BACKEND_URL}/api/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const name of ["authorization", "content-type", "x-device-id"]) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = !["GET", "HEAD"].includes(req.method);

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: hasBody ? await req.text() : undefined,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "Backend is unreachable." }, { status: 502 });
  }

  // Pass the body through as bytes so binary responses (Excel exports, database backups) stay intact.
  const bytes = await upstream.arrayBuffer();
  const out = new Headers();
  out.set("content-type", upstream.headers.get("content-type") ?? "application/json");
  const disposition = upstream.headers.get("content-disposition");
  if (disposition) out.set("content-disposition", disposition);

  return new NextResponse(upstream.status === 204 ? null : bytes, { status: upstream.status, headers: out });
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
