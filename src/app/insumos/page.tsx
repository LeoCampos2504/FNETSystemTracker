import { SuppliesControl } from "@/components/supplies-control";
import Link from 'next/link';
export const dynamic = "force-dynamic";
export default function InsumosPage() { return <main style={{ padding: "28px", background: "#f7f8fc", minHeight: "100vh" }}><Link href="/">← Volver a FNET</Link><SuppliesControl /></main>; }
