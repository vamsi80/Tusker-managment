// tsc follows apps/mobile/src/api/*'s "./client" import to the mobile client itself
// (Vite swaps in src/api/client.ts at build time, so it never ships here). That file
// imports this Expo module, which isn't resolvable from this app; declare the calls
// it makes, with expo-secure-store's signatures, so the type check passes without
// touching apps/mobile.
declare module "expo-secure-store" {
    export function getItemAsync(key: string): Promise<string | null>;
    export function setItemAsync(key: string, value: string): Promise<void>;
    export function deleteItemAsync(key: string): Promise<void>;
}
