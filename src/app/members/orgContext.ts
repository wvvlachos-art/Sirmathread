// The Members and Activity pages resolve the active workspace through the
// shared resolver (cookie-backed). Kept as a thin re-export so existing imports
// (getActiveOrg) keep working.
export { resolveActiveOrg as getActiveOrg, type MyOrg as ActiveOrg, type OrgRole } from "@/lib/activeOrg";
