// app/api/auth/callback/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import langEng from "@/lang/en";
import prisma from "@/lib/prisma";
import { AddMetafieldProduct } from "@/lib/product/metafields";
import { RegisterOrderWebhook } from "@/lib/shopify-webhooks";
import { getCurrentShopifyVersion } from "@/lib/shopifyVersion";
import { isValidShopDomain } from "@/lib/auth";

function verifyShopifyCallbackHmac(url: URL, secret: string): boolean {
  const hmac = url.searchParams.get("hmac");
  if (!hmac) return false;

  const params: string[] = [];
  // Sort query parameters alphabetically, excluding 'hmac' and 'signature'
  const keys = Array.from(url.searchParams.keys()).sort();
  for (const key of keys) {
    if (key !== "hmac" && key !== "signature") {
      params.push(`${key}=${url.searchParams.get(key)}`);
    }
  }

  const message = params.join("&");
  const digest = crypto.createHmac("sha256", secret).update(message).digest("hex");

  const digestBuf = Buffer.from(digest, "utf8");
  const hmacBuf = Buffer.from(hmac, "utf8");

  if (digestBuf.length !== hmacBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(digestBuf, hmacBuf);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const apiVersion = getCurrentShopifyVersion();
  const secret = process.env.SHOPIFY_API_SECRET || "";

  // 1. Validate shop domain format
  if (!shop || !isValidShopDomain(shop) || !code) {
    return NextResponse.json(
      { error: "Missing or invalid shop domain or authorization code" },
      { status: 400 }
    );
  }

  // 2. Validate HMAC signature from Shopify
  if (!secret || !verifyShopifyCallbackHmac(url, secret)) {
    console.error("Shopify OAuth callback HMAC verification failed for shop:", shop);
    return NextResponse.json(
      { error: "HMAC signature verification failed" },
      { status: 400 }
    );
  }

  // 3. Verify OAuth state from cookie (CSRF protection)
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(/shopify_oauth_state=([^;]+)/);
  const storedState = match ? match[1] : null;

  if (storedState && state && storedState !== state) {
    console.error("OAuth state mismatch: potential CSRF attack detected");
    return NextResponse.json(
      { error: "Invalid OAuth state parameter. Please restart authorization." },
      { status: 400 }
    );
  }

  try {
    // 4. Exchange authorization code for permanent offline access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Failed to exchange code for access token:", errText);
      return NextResponse.json(
        { error: "Failed to obtain access token from Shopify" },
        { status: 400 }
      );
    }

    const data = await tokenRes.json();
    const accessToken = data.access_token;
    const scope = data.scope || process.env.SHOPIFY_API_SCOPES || "";

    // 5. Store session in Prisma database
    await prisma.session.upsert({
      where: { shop },
      update: {
        accessToken,
        scope,
      },
      create: {
        shop,
        accessToken,
        scope,
      },
    });

    // 6. Fetch store info from Shopify API
    let shopInfo: any = {};
    try {
      const shopRes = await fetch(
        `https://${shop}/admin/api/${apiVersion}/shop.json`,
        {
          headers: { "X-Shopify-Access-Token": accessToken },
        }
      );
      if (shopRes.ok) {
        const shopData = await shopRes.json();
        shopInfo = shopData.shop || {};
      }
    } catch (shopErr) {
      console.warn("Could not fetch shop details from Shopify:", shopErr);
    }

    const shopOwner = shopInfo.shop_owner || "";
    const [firstName, ...lastNameParts] = shopOwner.split(" ");
    const lastName = lastNameParts.join(" ") || "";
    const email = shopInfo.email || shopInfo.customer_email || "support@krcustomizer.com";
    const phone = shopInfo.phone || "";

    // 7. Register store in KR Customizer Core backend
    try {
      const payload = {
        platform: "shopify",
        storeHash: shopInfo.id ? shopInfo.id.toString() : shop,
        firstName,
        lastName,
        phone,
        storeUrl: `https://${shopInfo.domain || shop}`,
        storeName: shopInfo.name || shop,
        email,
        apiToken: `${langEng?.storeApi?.token}-login`,
      };

      await fetch(`${langEng?.storeApi?.endPoint}login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (backendErr) {
      console.warn("Warning: Could not notify backend login endpoint:", backendErr);
    }

    // 8. Register Webhook and Metafields
    try {
      await RegisterOrderWebhook(shop, accessToken);
      await AddMetafieldProduct(shop, accessToken);
    } catch (setupErr) {
      console.warn("Webhook or Metafield setup warning:", setupErr);
    }

    // 9. Redirect to Dashboard within Shopify Admin
    const finalHost =
      host ||
      Buffer.from(
        `admin.shopify.com/store/${shop.replace(".myshopify.com", "")}`
      ).toString("base64");

    const appKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || process.env.SHOPIFY_API_KEY;
    const redirectUrl = `${process.env.SHOPIFY_APP_URL}/dashboard?shop=${encodeURIComponent(
      shop
    )}&host=${encodeURIComponent(finalHost)}`;

    const html = `<!DOCTYPE html>
<html>
  <head>
    <script type="text/javascript">
      const shop = "${shop}";
      const appKey = "${appKey}";
      const finalHost = "${finalHost}";
      const redirectUrl = "${redirectUrl}";

      if (window.top === window.self) {
        window.top.location.href = "https://admin.shopify.com/store/" + 
          shop.replace(".myshopify.com", "") +
          "/apps/" + appKey + "?shop=" + encodeURIComponent(shop) + "&host=" + encodeURIComponent(finalHost);
      } else {
        window.top.location.href = redirectUrl;
      }
    </script>
  </head>
  <body>Loading KR Customizer...</body>
</html>`;

    return new Response(html, {
      headers: {
        "Content-Type": "text/html",
        "Set-Cookie": "shopify_oauth_state=deleted; Path=/api/auth; Max-Age=0;",
      },
    });
  } catch (error: any) {
    console.error("OAuth callback processing error:", error);
    return NextResponse.json(
      { error: "OAuth authorization failed", details: error.message },
      { status: 500 }
    );
  }
}
