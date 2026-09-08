/**
 * What to call a supplier / contractor on screen.
 *
 * A GSTIN lookup fills `name` with the trade name — the shop — and
 * `companyName` with the legal name, which for a proprietorship is the owner's
 * own name ("SINGH TRADING COMPANY" vs "MUNI SINGH"). Screens that led with the
 * legal name were showing the owner instead of the shop, so the trade name
 * leads everywhere and the legal name is only the fallback.
 */
export const vendorDisplayName = (
  vendor: { name?: string | null; companyName?: string | null } | null | undefined,
  fallback = "-"
) => vendor?.name?.trim() || vendor?.companyName?.trim() || fallback;
