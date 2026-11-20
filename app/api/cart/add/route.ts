// app/api/cart/add/route.ts
import { NextRequest, NextResponse } from "next/server";
import { shopifyGraphQLFetch } from "@/lib/shopifyGraphQLFetch";
import { getValidSession } from "@/lib/session";
import langEng from "@/lang/en";
import { ShopInfo } from "@/lib/shopInfo";
import { isValidShopDomain } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

function convertToString(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export async function POST(request: NextRequest) {
  // 1. IP-Based Rate Limiting to mitigate DDoS and Shopify draft order flooding
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1";

  const rateCheck = checkRateLimit(`cart_add_${clientIp}`, 15, 60000);
  if (!rateCheck.success) {
    return NextResponse.json(
      { error: "Too many cart requests. Please wait a moment and try again." },
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Retry-After": Math.ceil(rateCheck.resetMs / 1000).toString(),
        },
      }
    );
  }

  try {
    const body = await request.json();
    const { kr_shop, variantId, quantity = 1, kr_design_id = 0 } = body;

    // 2. Strict Input Validation
    if (!kr_shop || !isValidShopDomain(kr_shop)) {
      return NextResponse.json(
        { error: "Invalid or missing shop domain" },
        { status: 400, headers: corsHeaders }
      );
    }

    const numQty = parseInt(quantity, 10);
    if (isNaN(numQty) || numQty < 1 || numQty > 100) {
      return NextResponse.json(
        { error: "Quantity must be an integer between 1 and 100" },
        { status: 400, headers: corsHeaders }
      );
    }

    const designIdNum = parseInt(kr_design_id, 10);
    if (isNaN(designIdNum) || designIdNum <= 0) {
      return NextResponse.json(
        { error: "Your design is not ready. Please reload the browser and try again." },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!variantId) {
      return NextResponse.json(
        { error: "Missing variant ID" },
        { status: 400, headers: corsHeaders }
      );
    }

    // 3. Verify store session
    const session = await getValidSession(kr_shop);
    if (!session) {
      return NextResponse.json(
        { error: "Customizer is not active for this store" },
        { status: 401, headers: corsHeaders }
      );
    }

    const accessToken = session.accessToken;

    // 4. Fetch variant details from Shopify GraphQL
    const variantQuery = `
      query getVariant($id: ID!) {
        productVariant(id: $id) {
          id
          title
          price
          product { title }
        }
      }
    `;

    const variantResponse = await shopifyGraphQLFetch(
      kr_shop,
      accessToken,
      variantQuery,
      { id: variantId }
    );

    if (!variantResponse.data?.productVariant) {
      return NextResponse.json(
        { error: "Variant not found on Shopify store" },
        { status: 404, headers: corsHeaders }
      );
    }

    // 5. Fetch saved design details from backend with timeout
    const shopInfo = await ShopInfo(kr_shop, accessToken);
    const payloadSaved = {
      storeHash: (shopInfo as any)?.id?.toString() || kr_shop,
      designId: designIdNum,
    };

    const savedController = new AbortController();
    const savedTimer = setTimeout(() => savedController.abort(), 7000);

    let savedData: any = null;
    try {
      const savedRes = await fetch(`${langEng?.storeApi?.endPoint}product/saved`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadSaved),
        signal: savedController.signal,
      });
      savedData = await savedRes.json();
    } catch (saveErr: any) {
      return NextResponse.json(
        { error: "Could not retrieve customized design data. Please try again." },
        { status: 502, headers: corsHeaders }
      );
    } finally {
      clearTimeout(savedTimer);
    }

    if (!savedData || savedData?.status === false) {
      return NextResponse.json(
        { error: "Your design is not ready. Please reload and try again." },
        { status: 400, headers: corsHeaders }
      );
    }

    let productSaveResult: any = {};
    try {
      productSaveResult = typeof savedData?.data?.product_data === "string"
        ? JSON.parse(savedData?.data?.product_data)
        : savedData?.data?.product_data || {};
    } catch (e) {
      productSaveResult = {};
    }

    const finallyCartPrice = parseFloat(productSaveResult?.customizations?.krCustomizedPrice) || 0;
    const designImage = productSaveResult?.screenshots?.length > 0
      ? productSaveResult.screenshots[0]?.url
      : "";
    const designArea = JSON.stringify(productSaveResult);

    const variant = variantResponse.data.productVariant;
    const originalPrice = parseFloat(variant.price);
    const newTotalPrice = parseFloat((originalPrice + finallyCartPrice).toFixed(2));

    // 6. Build line items
    const lineItems: any[] = [
      {
        variantId: variantId,
        quantity: numQty,
        customAttributes: [
          { key: "_Design Id", value: convertToString(designIdNum) },
          { key: "_Design Area", value: convertToString(designArea) },
          { key: "View Design", value: convertToString(designImage) },
        ],
      },
    ];

    if (finallyCartPrice > 0) {
      lineItems.push({
        title: "Customization additional charges",
        quantity: numQty,
        originalUnitPrice: finallyCartPrice,
        requiresShipping: false,
        taxable: false,
        customAttributes: [
          { key: "Linked Product", value: convertToString(variant?.product?.title) },
          { key: "View Design", value: convertToString(designImage) },
        ],
      });
    }

    // 7. Create Shopify Draft Order
    const draftOrderMutation = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            invoiceUrl
            totalPrice
            subtotalPrice
          }
          userErrors { field message }
        }
      }
    `;

    const draftOrderResponse = await shopifyGraphQLFetch(
      kr_shop,
      accessToken,
      draftOrderMutation,
      { input: { lineItems } }
    );

    if (draftOrderResponse.errors && draftOrderResponse.errors.length > 0) {
      return NextResponse.json(
        { error: draftOrderResponse.errors[0]?.message || "Failed to create checkout order" },
        { status: 500, headers: corsHeaders }
      );
    }

    const userErrors = draftOrderResponse.data?.draftOrderCreate?.userErrors;
    if (userErrors && userErrors.length > 0) {
      return NextResponse.json(
        { error: userErrors[0]?.message || "Shopify draft order error" },
        { status: 400, headers: corsHeaders }
      );
    }

    const draftOrder = draftOrderResponse.data?.draftOrderCreate?.draftOrder;

    return NextResponse.json(
      {
        success: true,
        checkoutUrl: draftOrder.invoiceUrl,
        draftOrderId: draftOrder.id,
        totalPrice: draftOrder.totalPrice,
        pricing: {
          originalPrice,
          finallyCartPriceAdded: finallyCartPrice,
          customerPays: newTotalPrice,
        },
        product: {
          title: variant.product.title,
          variant: variant.title,
          quantity: numQty,
        },
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Cart Add API Error:", error.message);
    return NextResponse.json(
      { error: "Internal server error occurred while creating cart" },
      { status: 500, headers: corsHeaders }
    );
  }
}
