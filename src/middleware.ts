import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_API = ["/api/health", "/api/auth/login", "/api/auth/register", "/api/plans"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = req.cookies.get("kispa_session")?.value;

  const isApi = pathname.startsWith("/api/");
  const isProtectedPage = pathname.startsWith("/app") || pathname.startsWith("/onboarding");
  const isPublicApi = PUBLIC_API.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (isApi && !isPublicApi && !session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (isProtectedPage && !session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/onboarding", "/api/:path*"],
};
