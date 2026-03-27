export function isAuthDisabled(): boolean {
  if (process.env.FORCE_AUTH === "true") {
    return false;
  }

  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const publicFlag = process.env.NEXT_PUBLIC_DISABLE_AUTH;
  const serverFlag = process.env.DISABLE_AUTH;

  // Default to guest mode unless auth is explicitly forced on.
  if (publicFlag === "false" || serverFlag === "false") {
    return false;
  }

  return true;
}

export function getGuestEmail(): string {
  return "guest@tripintel.local";
}
