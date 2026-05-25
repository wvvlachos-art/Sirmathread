import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// This runs on every page request (Next.js calls this a "proxy"; it used to be
// called "middleware"). It keeps the user's login session fresh by
// reading/refreshing the auth cookies. Without it, logins would silently
// expire and server pages wouldn't reliably know who is signed in.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Touching getUser() refreshes the session token when needed.
  await supabase.auth.getUser();

  return response;
}

// Run on all routes except static assets and image files.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
