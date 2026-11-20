// app/api/auth/install/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { isValidShopDomain } from "@/lib/auth";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const shop = searchParams.get("shop");

  // Enforce strict shop domain validation to prevent open redirects and SSRF
  if (!shop || !isValidShopDomain(shop)) {
    return NextResponse.json(
      { error: "Missing or invalid 'shop' parameter. Must be in the format {shop}.myshopify.com" },
      { status: 400 }
    );
  }

  const scopes = process.env.SHOPIFY_API_SCOPES || "read_products,write_products,read_orders,write_draft_orders";
  const appUrl = process.env.SHOPIFY_APP_URL?.replace(/\/$/, "");
  const redirectUri = `${appUrl}/api/auth/callback`;

  // Cryptographically secure random state to prevent OAuth CSRF
  const state = crypto.randomBytes(16).toString("hex");

  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${
    process.env.SHOPIFY_API_KEY
  }&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&state=${state}&grant_options[]=per-user`;

  // Frame breakout HTML required by Shopify embedded apps
  const html = `<!DOCTYPE html>
<html>
  <head>
    <script type="text/javascript">
      if (window.top === window.self) {
        window.location.href = "${installUrl}";
      } else {
        window.top.location.href = "${installUrl}";
      }
    </script>
  </head>
  <body>Redirecting to Shopify authorization...</body>
</html>`;

  const response = new Response(html, {
    headers: {
      "Content-Type": "text/html",
      // Set secure HTTP-only cookie with state for verification in callback
      "Set-Cookie": `shopify_oauth_state=${state}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600; ${
        process.env.NODE_ENV === "production" ? "Secure;" : ""
      }`,
    },
  });

  return response;
}
