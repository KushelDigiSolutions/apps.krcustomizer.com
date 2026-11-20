// app/components/clientCheckShop.tsx
"use client";
import React, { useEffect } from "react";
import { useShop } from "../contexts/ShopContext";
import { useRouter } from "next/navigation";

const ClientCheckShop = () => {
  const { shop, isLoading } = useShop();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!shop) {
      router.push("/");
    } else {
      router.push(`/dashboard?shop=${encodeURIComponent(shop)}`);
    }
  }, [shop, isLoading, router]);

  // Return null or loading indicator
  return (
    <div style={{ textAlign: "center", padding: "50px" }}>
      <h3>Loading...</h3>
    </div>
  );
};

export default ClientCheckShop;