export interface WalletDetectionInfo {
  isInstalled: boolean;
  walletName: string;
}

export function detectFreighterWallet(): WalletDetectionInfo {
  const isAvailable = typeof window !== 'undefined' && 'freighter' in window;
  return {
    isInstalled: Boolean(isAvailable),
    walletName: 'Freighter',
  };
}
