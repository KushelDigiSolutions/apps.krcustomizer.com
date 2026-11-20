// app/api/products/add/route.ts
import { NextRequest, NextResponse } from "next/server";
import { shopifyGraphQLFetch } from "@/lib/shopifyGraphQLFetch";
import { getValidSession } from "@/lib/session";
import langEng from "@/lang/en";
import { ShopInfo } from "@/lib/shopInfo";
import { verifyShopifySessionToken, isValidShopDomain } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { shop, productId, productName, defaultImage, metafield } = body;

    if (!shop || !isValidShopDomain(shop) || !productId || !metafield) {
      return NextResponse.json(
        { error: "Missing or invalid required fields (shop, productId, metafield)" },
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

    if (!metafield.namespace || !metafield.key || metafield.value === undefined) {
      return NextResponse.json(
        { error: "Metafield must include namespace, key, and value" },
        { status: 400 }
      );
    }

    // Set Metafield in Shopify
    const mutation = `
      mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
            type
          }
          userErrors {
            field
            message
          }
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
      return NextResponse.json(
        { error: "GraphQL mutation failed", details: result.errors[0]?.message },
        { status: 500 }
      );
    }

    const userErrors = result?.data?.metafieldsSet?.userErrors;
    if (userErrors && userErrors.length > 0) {
      return NextResponse.json(
        { error: "Metafield update failed", details: userErrors[0]?.message },
        { status: 400 }
      );
    }

    // Register product in backend
    try {
      const shopInfo = await ShopInfo(shop, accessToken);
      const payload = {
        storeHash: (shopInfo as any)?.id?.toString() || shop,
        productId,
        productName: productName || "",
        defaultImage: defaultImage || "",
        apiToken: `${langEng?.storeApi?.token}-product-add`,
      };

      await fetch(`${langEng?.storeApi?.endPoint}product/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (backendErr) {
      console.warn("Backend product sync notice:", backendErr);
    }

    return NextResponse.json({
      success: true,
      message: "Product added for customization successfully",
    });
  } catch (error: any) {
    console.error("Products Add API Error:", error.message);
    return NextResponse.json(
      { error: "Internal server error occurred" },
      { status: 500 }
    );
  }
}
