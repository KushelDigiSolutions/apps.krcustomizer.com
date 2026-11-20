// app/api/settings/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/session";
import langEng from "@/lang/en";
import { ShopInfo } from "@/lib/shopInfo";
import { verifyShopifySessionToken, isValidShopDomain } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { shop } = body;

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
          success: true,
          data: {
            enableShare: false,
            designerButtonName: "Customize",
            designerButton: "",
            addtocartForm: "",
            cssCode: ".example-css-custom{color:red;}",
          },
          status: true,
        });
      }
      return NextResponse.json({ error: "Store session not found" }, { status: 401 });
    }

    const accessToken = session.accessToken;
    const shopInfo = await ShopInfo(shop, accessToken);

    const payload = {
      storeHash: (shopInfo as any)?.id?.toString() || shop,
      apiToken: `${langEng?.storeApi?.token}-settings-get`,
    };

    const settingsRes = await fetch(`${langEng?.storeApi?.endPoint}settings/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!settingsRes.ok) {
      return NextResponse.json({
        success: true,
        data: {
          enableShare: false,
          designerButtonName: "Customize",
          designerButton: "",
          cssCode: ".example-css-custom{color:red;}",
        },
        status: true,
      });
    }

    const settingsData = await settingsRes.json();

    return NextResponse.json({
      success: true,
      data: settingsData?.data || {
        enableShare: false,
        designerButtonName: "Customize",
        designerButton: "",
        cssCode: ".example-css-custom{color:red;}",
      },
      status: true,
    });
  } catch (error: any) {
    console.error("Settings Get API Error:", error.message);
    return NextResponse.json(
      { error: "Failed to retrieve settings", status: false },
      { status: 500 }
    );
  }
}
