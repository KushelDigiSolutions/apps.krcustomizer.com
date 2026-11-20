// app/api/products/remove/route.ts
import { NextRequest, NextResponse } from "next/server";
import { shopifyGraphQLFetch } from "@/lib/shopifyGraphQLFetch";
import { getValidSession } from "@/lib/session";
import langEng from "@/lang/en";
import { ShopInfo } from "@/lib/shopInfo";
import { verifyShopifySessionToken, isValidShopDomain } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { shop, rowId, productId, metafield } = body;

    if (!shop || !isValidShopDomain(shop) || !rowId || !metafield || !productId) {
      return NextResponse.json(
        { error: "Missing or invalid required fields (shop, rowId, productId, metafield)" },
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

    // Delete product from backend database
    const payload = {
      storeHash: (shopInfo as any)?.id?.toString() || shop,
      id: rowId,
      apiToken: `${langEng?.storeApi?.token}-product-delete`,
    };

    await fetch(`${langEng?.storeApi?.endPoint}product/remove`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Reset metafield in Shopify
    const mutation = `
      mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { field message }
        }
      }
    `;

    const variables = {
      metafields: [
        {
          ownerId: productId,
          namespace: metafield.namespace,
          key: metafield.key,
          value: String(metafield.value),
          type: metafield.type || "single_line_text_field",
        },
      ],
    };

    await shopifyGraphQLFetch(shop, accessToken, mutation, variables);

    return NextResponse.json({
      success: true,
      message: "Product customization removed successfully",
    });
  } catch (error: any) {
    console.error("Products Remove API Error:", error.message);
    return NextResponse.json(
      { error: "Failed to remove product customization" },
      { status: 500 }
    );
  }
}
