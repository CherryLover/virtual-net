import { create } from "zustand";
import { parseIp } from "../engine";

export function createAddressRedactor() {
  const aliases = new Map<number, string>();
  return (text: string): string =>
    text.replace(/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g, (address) => {
      const ip = parseIp(address);
      if (ip === null) return address;
      let alias = aliases.get(ip);
      if (!alias) {
        alias = `地址 ${aliases.size + 1}`;
        aliases.set(ip, alias);
      }
      return alias;
    });
}

// Presentation only: the network, simulation and saved project retain their real addresses.
const redact = createAddressRedactor();
const identity = (text: string) => text;
export const usePrivacyStore = create<{ hidden: boolean; toggle: () => void }>((set) => ({
  hidden: false,
  toggle: () => set((state) => ({ hidden: !state.hidden })),
}));

export function useDisplayText() {
  return usePrivacyStore((state) => (state.hidden ? redact : identity));
}
