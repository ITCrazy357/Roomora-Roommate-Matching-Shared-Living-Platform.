export function performanceRoute(pathname: string) {
  if (pathname === "/") return "home";
  if (pathname === "/tim-phong") return "listings";
  if (/^\/phong\/[^/]+$/.test(pathname)) return "listing";
  if (pathname === "/tim-nguoi-o-ghep") return "people";
  return null;
}
