import { AdminWorkspace } from "@/components/admin/admin-workspace";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdminWorkspace>{children}</AdminWorkspace>;
}
