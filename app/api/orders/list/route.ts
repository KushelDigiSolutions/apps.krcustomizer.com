// app/api/orders/list/route.ts
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
            orders: [],
            pagination: { total: 0, page: 1, limit: 15, totalPages: 0 },
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
      apiToken: `${langEng?.storeApi?.token}-order-list`,
    };

    const orderRes = await fetch(`${langEng?.storeApi?.endPoint}order/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!orderRes.ok) {
      throw new Error(`Orders API responded with status ${orderRes.status}`);
    }

    const ordersData = await orderRes.json();

    return NextResponse.json({
      success: true,
      data: ordersData?.data || { orders: [], pagination: {} },
    });
  } catch (error: any) {
    console.error("Orders List API Error:", error.message);
    return NextResponse.json(
      { error: "Failed to retrieve orders list" },
      { status: 500 }
    );
  }
}
