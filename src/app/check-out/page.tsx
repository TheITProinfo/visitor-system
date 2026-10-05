import Link from "next/link";
import { CheckOutForm } from "@/features/visitor-check-out/check-out-form";

export default function CheckOutPage() {
  return (
    <main className="visitor-page">
      <div className="visitor-page-shell visitor-checkout-shell">
        <Link className="visitor-back" href="/">← Visitor System</Link>
        <header className="visitor-page-heading"><p className="visitor-eyebrow">THANK YOU FOR VISITING</p><h1>Check out</h1><p>Record your departure before you leave.</p></header>
        <CheckOutForm />
        <footer className="visitor-page-footer">Checking out is optional. You may leave at any time.</footer>
      </div>
    </main>
  );
}
