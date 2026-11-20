// app/api/webhooks/customers/data_request/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const SHOPIFY_SECRET = process.env.SHOPIFY_API_SECRET || "";

export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: "active",
    webhook: "customers/data_request",
  });
}

function verifyWebhookHmac(hmacHeader: string | null, rawBody: string): boolean {
  if (!SHOPIFY_SECRET || !hmacHeader) return false;
  const digest = crypto
    .createHmac("sha256", SHOPIFY_SECRET)
    .update(rawBody, "utf8")
    .digest("base64");
  const digestBuf = Buffer.from(digest, "utf8");
  const hmacBuf = Buffer.from(hmacHeader, "utf8");
  if (digestBuf.length !== hmacBuf.length) return false;
  return crypto.timingSafeEqual(digestBuf, hmacBuf);
}

export async function POST(req: Request) {
  const hmac = req.headers.get("x-shopify-hmac-sha256");
  const body = await req.text();

  if (!verifyWebhookHmac(hmac, body)) {
    return NextResponse.json({ error: "Invalid HMAC" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(body);
    console.log(`[GDPR] Customer data request received for customer ${payload.customer?.id} on ${payload.shop_domain}`);
    // No sensitive customer PII is retained permanently in standalone apps beyond standard Shopify order associations
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
