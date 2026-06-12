const BACKEND_ORIGIN = (process.env.TONGPIN_BACKEND_ORIGIN || "http://39.103.91.85").replace(/\/+$/, "");

async function proxy(request) {
  const incomingUrl = new URL(request.url);
  const targetUrl = `${BACKEND_ORIGIN}${incomingUrl.pathname}${incomingUrl.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(targetUrl, init);
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request) {
  return proxy(request);
}

export async function POST(request) {
  return proxy(request);
}

export async function OPTIONS(request) {
  return proxy(request);
}
