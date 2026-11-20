// app/api/orders/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/session";
import langEng from "@/lang/en";
import { ShopInfo } from "@/lib/shopInfo";
import { verifyShopifySessionToken, isValidShopDomain } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { shop, orderId } = body;

    if (!shop || !isValidShopDomain(shop) || !orderId) {
      return NextResponse.json(
        { error: "Valid shop and orderId are required" },
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
      return NextResponse.json({ error: "Store session not found" }, { status: 401 });
    }

    const accessToken = session.accessToken;
    const shopInfo = await ShopInfo(shop, accessToken);

    const payload = {
      storeHash: (shopInfo as any)?.id?.toString() || shop,
      orderId: String(orderId),
      apiToken: `${langEng?.storeApi?.token}-order-items`,
    };

    const itemsRes = await fetch(`${langEng?.storeApi?.endPoint}order/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!itemsRes.ok) {
      throw new Error(`Order items API responded with status ${itemsRes.status}`);
    }

    const itemsData = await itemsRes.json();

    return NextResponse.json({
      success: true,
      orders: itemsData?.data || [],
      status: true,
    });
  } catch (error: any) {
    console.error("Order Items API Error:", error.message);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to retrieve order items",
        orders: [],
        status: false,
      },
      { status: 500 }
    );
  }
}
