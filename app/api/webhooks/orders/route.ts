// app/api/webhooks/orders/route.ts
import langEng from "@/lang/en";
import { getValidSession } from "@/lib/session";
import { ShopInfo } from "@/lib/shopInfo";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

const SHOPIFY_SECRET = process.env.SHOPIFY_API_SECRET || "";

export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: "active",
    webhook: "orders",
  });
}

const fetchWithTimeout = (url: string, options: RequestInit = {}, timeout = 8000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));
};

/**
 * Constant-time HMAC verification safe against buffer-length RangeError crashes
 */
function verifyHmac(req: NextRequest, rawBody: string): boolean {
  if (!SHOPIFY_SECRET) {
    console.error("SHOPIFY_API_SECRET is missing. Cannot verify webhook HMAC.");
    return false;
  }

  const hmac = req.headers.get("x-shopify-hmac-sha256") || "";
  if (!hmac) return false;

  const digest = crypto
    .createHmac("sha256", SHOPIFY_SECRET)
    .update(rawBody, "utf8")
    .digest("base64");

  const hmacBuf = Buffer.from(hmac, "utf8");
  const digestBuf = Buffer.from(digest, "utf8");

  // Prevent RangeError: Input buffers must have the same byte length
  if (hmacBuf.length !== digestBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(digestBuf, hmacBuf);
}

export async function POST(req: NextRequest) {
  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch (err) {
    return NextResponse.json({ error: "Cannot read request body" }, { status: 400 });
  }

  // 1. Verify HMAC signature
  if (!verifyHmac(req, rawBody)) {
    return NextResponse.json(
      { ok: false, message: "Invalid HMAC signature" },
      { status: 401 }
    );
  }

  // 2. Parse body
  let orderData: any;
  try {
    orderData = JSON.parse(rawBody);
  } catch (parseErr) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const shop = req.headers.get("x-shopify-shop-domain") || "unknown_shop";

  // 3. Process asynchronously to respond to Shopify within 50ms
  // Shopify requires a 200 response within 5 seconds; otherwise it retries up to 19 times
  // causing exponential retry storms (DDoS).
  processOrderAsync(shop, orderData).catch((err) => {
    console.error(`[Background] Error processing order webhook for ${shop}:`, err);
  });

  // 4. Immediate acknowledgment to Shopify
  return NextResponse.json({ ok: true, received: true });
}

async function processOrderAsync(shop: string, orderData: any) {
  let storeHash = "not_found";
  let accessToken = "";

  if (shop && shop !== "unknown_shop") {
    try {
      const session = await getValidSession(shop);
      if (session?.accessToken) {
        accessToken = session.accessToken;
        const shopInfo = await ShopInfo(shop, accessToken);
        storeHash = (shopInfo as any)?.id?.toString() || "not_found";
      }
    } catch (shopInfoError) {
      console.warn(`Could not fetch store info for ${shop}:`, shopInfoError);
    }
  }

  await saveOrderToDatabase({
    shop,
    storeHash,
    orderData,
  });
}

async function saveOrderToDatabase(params: {
  shop: string;
  storeHash: string;
  orderData: any;
}) {
  const { shop, storeHash, orderData } = params;

  try {
    const orderPayload = {
      storeHash: storeHash,
      orderId: orderData?.id,
      orderNumber: orderData?.order_number,
      order_total_inc_tax: orderData?.total_price,
      order_total_ex_tax: orderData?.total_price,
      order_items_total: orderData?.line_items?.length || 0,
      customerId: orderData?.customer?.id,
      order_json: JSON.stringify(orderData),
      apiToken: `${langEng?.storeApi?.token}-order-add`,
    };

    console.log(`[OrderWebhook] Saving order ${orderData?.id} for shop ${shop}...`);
    const orderRes = await fetchWithTimeout(
      `${langEng?.storeApi?.endPoint}order/add`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      },
      8000
    );

    if (!orderRes.ok) {
      console.error(`[OrderWebhook] Order API returned status ${orderRes.status}`);
      return;
    }

    // Process line items
    const lineItems = orderData?.line_items || [];
    for (const item of lineItems) {
      try {
        let designId = null;
        let viewDesign = null;
        let designArea = null;

        if (item?.properties && Array.isArray(item.properties)) {
          for (const prop of item.properties) {
            if (prop?.name === "_Design Id") designId = prop?.value;
            else if (prop?.name === "View Design") viewDesign = prop?.value;
            else if (prop?.name === "_Design Area") designArea = prop?.value;
          }
        }

        const itemPayload = {
          storeHash,
          bcOrdersId: orderData?.id,
          orderId: orderData?.id,
          productId: item?.product_id || "custom_product",
          productName: item?.name,
          productSku: item?.variant_id || item?.variant_title,
          designId,
          designArea: designArea ? JSON.stringify(designArea) : null,
          previewUrl: viewDesign,
          productJson: JSON.stringify(item),
          apiToken: `${langEng?.storeApi?.token}-order-item-add`,
        };

        await fetchWithTimeout(
          `${langEng?.storeApi?.endPoint}order/items-add`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(itemPayload),
          },
          5000
        );
      } catch (itemErr: any) {
        console.error(`[OrderWebhook] Failed to save line item for order ${orderData?.id}:`, itemErr.message);
      }
    }
  } catch (error: any) {
    console.error(`[OrderWebhook] Database save failure for order ${orderData?.id}:`, error.message);
  }
}
