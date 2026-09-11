/**
 * Mirrors packages/core/src/lib/user-display-name.ts — mobile can't import
 * @tusker/core directly, so the (tiny, pure) precedence rule is duplicated
 * here. Keep the two in sync if the rule ever changes.
 *
 * `surname` is not a family name — it's where the app stores a member's
 * nickname ("niceName"). Nickname wins when present; `name` and email are
 * fallbacks for legacy users without one.
 */
export type UserDisplayNameSource =
    | {
          surname?: string | null;
          name?: string | null;
          email?: string | null;
      }
    | null
    | undefined;

const clean = (value?: string | null) => value?.trim() || "";

export function getUserDisplayName(user: UserDisplayNameSource, fallback = "Member"): string {
    const nickname = clean(user?.surname);
    if (nickname) return nickname;

    const fullName = clean(user?.name);
    if (fullName) return fullName;

    const email = clean(user?.email);
    if (email) return email.split("@")[0] || fallback;

    return fallback;
}

export function getUserDisplayInitial(user: UserDisplayNameSource, fallback = "?"): string {
    return getUserDisplayName(user, fallback).charAt(0).toLocaleUpperCase() || fallback;
}
