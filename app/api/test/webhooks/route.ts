// app/api/test/webhooks/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // Permanently disable HMAC signing test oracle in production to prevent security exploits
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Test webhook endpoint is disabled in production environments" },
      { status: 403 }
    );
  }

  // Require explicit local debug secret in non-production
  const url = new URL(request.url);
  const debugKey = url.searchParams.get("key");
  if (debugKey !== process.env.DEBUG_SECRET_KEY && process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    status: "Test endpoint active in development mode only",
  });
}
