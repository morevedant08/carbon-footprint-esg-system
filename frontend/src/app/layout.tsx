import type { Metadata } from "next";
import "./globals.css";
import QueryProvider from "@/components/QueryProvider";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "CarbonIntelligence AI — Industrial Carbon Footprint & ESG Intelligence",
  description:
    "AI-Driven Scope 3 emissions prediction on real NZDPU/CDU corporate disclosures, MILP logistics routing optimization, and segment reliability analytics.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full bg-[#0a0e17]">
      <body className="h-full bg-[#0a0e17] text-slate-100 flex overflow-hidden">
        <QueryProvider>
          <div className="flex h-screen w-screen overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
              <main className="flex-1 p-6 sm:p-8 max-w-7xl w-full mx-auto">
                {children}
              </main>
            </div>
          </div>
        </QueryProvider>
      </body>
    </html>
  );
}
