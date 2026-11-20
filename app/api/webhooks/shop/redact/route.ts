// app/api/webhooks/shop/redact/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";

const SHOPIFY_SECRET = process.env.SHOPIFY_API_SECRET || "";

export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: "active",
    webhook: "shop/redact",
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
    const shopDomain = payload.shop_domain;

    console.log(`[GDPR] Shop redact request received for ${shopDomain}`);

    // Redact/Delete stored merchant session from database
    if (shopDomain) {
      await prisma.session.deleteMany({
        where: { shop: shopDomain },
      });
      console.log(`[GDPR] Successfully removed session records for ${shopDomain}`);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[GDPR] Shop redact error:", err.message);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
