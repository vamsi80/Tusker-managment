export type UserDisplayNameSource = {
  /** The application stores a member's nickname (niceName) in `surname`. */
  surname?: string | null;
  name?: string | null;
  email?: string | null;
} | null | undefined;

const clean = (value?: string | null) => value?.trim() || "";

/**
 * Return the name that may be shown outside the Team page.
 * Nickname is always preferred; legacy users without one fall back safely.
 */
export function getUserDisplayName(
  user: UserDisplayNameSource,
  fallback = "Member",
): string {
  const nickname = clean(user?.surname);
  if (nickname) return nickname;

  const fullName = clean(user?.name);
  if (fullName) return fullName;

  const email = clean(user?.email);
  if (email) return email.split("@")[0] || fallback;

  return fallback;
}

export function getUserDisplayInitial(
  user: UserDisplayNameSource,
  fallback = "?",
): string {
  return getUserDisplayName(user, fallback).charAt(0).toLocaleUpperCase() || fallback;
}
