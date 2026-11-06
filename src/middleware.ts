import { NextResponse, type NextRequest } from "next/server";

/** Pages require a session cookie (the API routes verify it fully). */
export function middleware(req: NextRequest) {
  if (!req.cookies.get("wt_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/", "/ar/:path*", "/he/:path*"] };
