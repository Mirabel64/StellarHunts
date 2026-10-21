"use client";

import React from "react";
import Link from "next/link";
import WalletConnectButton from "@/components/WalletConnectButton";

export default function ConnectWalletPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Connect Wallet</h1>
        <p className="text-gray-600">
          Connect your Freighter wallet to submit puzzle answers and claim
          on-chain NFT rewards.
        </p>

        <div className="flex justify-center">
          <WalletConnectButton />
        </div>

        <Link
          href="/puzzles"
          className="inline-block text-sm text-blue-600 hover:underline"
        >
          Back to puzzles
        </Link>
      </div>
    </div>
  );
}
