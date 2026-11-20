// app/api/products/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/session";
import langEng from "@/lang/en";
import { ShopInfo } from "@/lib/shopInfo";
import { verifyShopifySessionToken, isValidShopDomain } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { shop, page = 1, limit = 15, searchTerm = "" } = body;

    if (!shop || !isValidShopDomain(shop)) {
      return NextResponse.json(
        { error: "Valid shop parameter is required" },
        { status: 400 }
      );
    }

    // Authenticate request using Shopify Session Token
    const authResult = verifyShopifySessionToken(request, shop);
    if (!authResult.isValid && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing Shopify session token" },
        { status: 401 }
      );
    }

    const session = await getValidSession(shop);
    if (!session) {
      if (process.env.NODE_ENV !== "production") {
        return NextResponse.json({
          status: true,
          data: {
            products: [],
            pagination: { total: 0, page: 1, limit: 15 },
          },
        });
      }
      return NextResponse.json({ error: "Store session not found" }, { status: 401 });
    }

    const accessToken = session.accessToken;
    const shopInfo = await ShopInfo(shop, accessToken);

    const payload = {
      storeHash: (shopInfo as any)?.id?.toString() || shop,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 15,
      searchTerm: String(searchTerm),
      apiToken: `${langEng?.storeApi?.token}-product-list`,
    };

    const productRes = await fetch(`${langEng?.storeApi?.endPoint}product/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!productRes.ok) {
      throw new Error(`Products API responded with status ${productRes.status}`);
    }

    const product = await productRes.json();

    return NextResponse.json({
      success: true,
      data: product?.data,
    });
  } catch (error: any) {
    console.error("Product List Error:", error.message);
    return NextResponse.json({ error: "Failed to retrieve products" }, { status: 500 });
  }
}
