// app/api/settings/add/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getValidSession } from "@/lib/session";
import langEng from "@/lang/en";
import { ShopInfo } from "@/lib/shopInfo";
import { verifyShopifySessionToken, isValidShopDomain } from "@/lib/auth";

const MAX_CSS_LENGTH = 5000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      shop,
      enableShare,
      designerButtonName,
      designerButton,
      addtocartForm,
      cssCode,
    } = body;

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
          status: true,
          message: "Settings saved successfully (Dev Mode)",
          data: {
            enableShare: Boolean(enableShare),
            designerButtonName: String(designerButtonName || "Customize"),
            designerButton: String(designerButton || ""),
            addtocartForm: String(addtocartForm || ""),
            cssCode: String(cssCode || ""),
          },
        });
      }
      return NextResponse.json({ error: "Store session not found" }, { status: 401 });
    }

    const cleanCss = String(cssCode || "").slice(0, MAX_CSS_LENGTH);

    const accessToken = session.accessToken;
    const shopInfo = await ShopInfo(shop, accessToken);

    const payload = {
      storeHash: (shopInfo as any)?.id?.toString() || shop,
      userId: "0",
      enableShare: Boolean(enableShare),
      designerButtonName: String(designerButtonName || "Customize").slice(0, 50),
      designerButton: String(designerButton || "").slice(0, 200),
      addtocartForm: String(addtocartForm || "").slice(0, 200),
      cssCode: cleanCss,
      apiToken: `${langEng?.storeApi?.token}-settings-save`,
    };

    const saveRes = await fetch(`${langEng?.storeApi?.endPoint}settings/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!saveRes.ok) {
      throw new Error(`Settings save API responded with status ${saveRes.status}`);
    }

    const saveData = await saveRes.json();

    return NextResponse.json({
      success: true,
      status: saveData?.status || true,
      message: "Settings saved successfully",
      data: saveData?.data || payload,
    });
  } catch (error: any) {
    console.error("Settings Save API Error:", error.message);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to save settings",
        status: false,
      },
      { status: 500 }
    );
  }
}
