// app/api/products/search/route.ts
import { NextResponse } from "next/server";
import { getValidSession } from "@/lib/session";
import { searchProducts } from "@/lib/product/searchProducts";
import { verifyShopifySessionToken, isValidShopDomain } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const shop = searchParams.get("shop");
  const term = searchParams.get("q") || "";

  if (!shop || !isValidShopDomain(shop)) {
    return NextResponse.json({ error: "Missing or invalid shop domain" }, { status: 400 });
  }

  // Rate limit searches to protect Shopify API quota
  const rateCheck = checkRateLimit(`search_${shop}`, 30, 60000);
  if (!rateCheck.success) {
    return NextResponse.json(
      { error: "Too many search requests. Please wait a moment." },
      { status: 429 }
    );
  }

  // Authenticate request using Shopify Session Token
  const authResult = verifyShopifySessionToken(req, shop);
  if (!authResult.isValid && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or missing Shopify session token" },
      { status: 401 }
    );
  }

  const session = await getValidSession(shop);
  if (!session) {
    return NextResponse.json({ error: "Store session not found" }, { status: 401 });
  }

  const results = await searchProducts(shop, session.accessToken, term);
  return NextResponse.json(results);
}
