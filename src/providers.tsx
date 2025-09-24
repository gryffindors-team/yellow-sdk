"use client";

import React, { ReactNode, useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { polygon, base } from "viem/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { injected } from "wagmi/connectors";
import { GryffindorsProvider } from "./components";
import { createGryffindorsSDK } from "./core";
import type { GryffindorsConfig } from "./types";

// Default wagmi config with injected connector - supports Polygon and Base
const defaultWagmiConfig = createConfig({
  chains: [polygon, base],
  connectors: [injected()],
  transports: {
    [polygon.id]: http(),
    [base.id]: http(),
  },
});

// Default Gryffindors config
const defaultGryffindorsConfig: GryffindorsConfig = {
  wsUrl: "wss://clearnet.yellow.com/ws",
  appName: "Gryffindors DApp",
  scope: "trading",
  sessionDuration: 3600,
  network: "mainnet"
};

interface GryffindorsAppProviderProps {
  children: ReactNode;
  gryffindorsConfig?: Partial<GryffindorsConfig>;
  wagmiConfig?: any; // Allow custom wagmi config
}

/**
 * All-in-one provider that sets up Wagmi, React Query, and Gryffindors SDK
 * Use this as the root provider in your Next.js app
 */
export function GryffindorsAppProvider({ 
  children, 
  gryffindorsConfig = {},
  wagmiConfig = defaultWagmiConfig
}: GryffindorsAppProviderProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [sdk] = useState(() => 
    createGryffindorsSDK({ ...defaultGryffindorsConfig, ...gryffindorsConfig })
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <GryffindorsProvider sdk={sdk}>
          {children}
        </GryffindorsProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

/**
 * Lightweight provider for when you already have Wagmi and React Query set up
 * Only adds the Gryffindors SDK context
 */
export function GryffindorsSDKProvider({ 
  children, 
  config = {} 
}: { 
  children: ReactNode; 
  config?: Partial<GryffindorsConfig> 
}) {
  const [sdk] = useState(() => 
    createGryffindorsSDK({ ...defaultGryffindorsConfig, ...config })
  );

  return (
    <GryffindorsProvider sdk={sdk}>
      {children}
    </GryffindorsProvider>
  );
}

// Export the default configs for advanced users
export { defaultWagmiConfig, defaultGryffindorsConfig };
