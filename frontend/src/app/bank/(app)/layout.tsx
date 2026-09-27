import { BankShell } from "@/components/bank/BankShell";

export default function BankAppLayout({ children }: { children: React.ReactNode }) {
  return <BankShell>{children}</BankShell>;
}
