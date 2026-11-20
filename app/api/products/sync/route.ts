// app/api/products/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { shopifyGraphQLFetch } from "@/lib/shopifyGraphQLFetch";
import { getValidSession } from "@/lib/session";
import langEng from "@/lang/en";
import { ShopInfo } from "@/lib/shopInfo";
import { searchProductsById } from "@/lib/product/searchProductsById";
import { verifyShopifySessionToken, isValidShopDomain } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { shop, rowId, productId, metafield } = body;

    if (!shop || !isValidShopDomain(shop) || !rowId || !productId || !metafield) {
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

    // Sync metafield with Shopify
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

    const result = await shopifyGraphQLFetch(shop, accessToken, mutation, variables);
    if (result?.errors && result.errors.length > 0) {
      return NextResponse.json({ error: result.errors[0]?.message }, { status: 500 });
    }

    // Update product info in backend
    try {
      const product = await searchProductsById(shop, accessToken, productId);
      const shopInfo = await ShopInfo(shop, accessToken);

      const payload = {
        storeHash: (shopInfo as any)?.id?.toString() || shop,
        id: rowId,
        productId,
        productName: product?.title || "",
        defaultImage: product?.featuredImage?.url || "",
        apiToken: `${langEng?.storeApi?.token}-product-update`,
      };

      await fetch(`${langEng?.storeApi?.endPoint}product/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (backendErr) {
      console.warn("Backend product sync notice:", backendErr);
    }

    return NextResponse.json({
      success: true,
      message: "Product synced successfully",
    });
  } catch (error: any) {
    console.error("Products Sync API Error:", error.message);
    return NextResponse.json({ error: "Failed to sync product" }, { status: 500 });
  }
}
