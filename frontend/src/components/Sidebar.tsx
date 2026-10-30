"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart2,
  Cpu,
  Truck,
  FileText,
  Upload,
  Layers,
  Calendar,
  Database,
  SlidersHorizontal,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function Sidebar() {
  const pathname = usePathname();

  const { data: health, error } = useQuery({
    queryKey: ["backend-health"],
    queryFn: api.checkHealth,
    refetchInterval: 10000,
  });

  const isOnline = Boolean(health) && !error;

  const navSections = [
    {
      label: "Overview",
      items: [
        {
          name: "Dashboard",
          href: "/",
          icon: LayoutDashboard,
        },
      ],
    },
    {
      label: "Emissions",
      items: [
        {
          name: "Emissions Analytics",
          href: "/emissions-analytics",
          icon: BarChart2,
        },
        {
          name: "Predictions",
          href: "/predictions",
          icon: Cpu,
        },
      ],
    },
    {
      label: "Action",
      items: [
        {
          name: "Reduction Advisor",
          href: "/reduction-advisor",
          icon: Truck,
        },
      ],
    },
    {
      label: "Compliance",
      items: [
        {
          name: "Reports & ESG Export",
          href: "/reports",
          icon: FileText,
        },
        {
          name: "Data Upload",
          href: "/data-upload",
          icon: Upload,
        },
      ],
    },
  ];

  return (
    <aside className="w-60 bg-[#0c1017] border-r border-[#1f2735] flex flex-col shrink-0 min-h-screen z-30 select-none">
      {/* App Header / Brand - Restrained precision engineering mark, no green leaf icons */}
      <div className="p-4 border-b border-[#1f2735]">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded bg-[#182332] border border-[#2c3d53] flex items-center justify-center text-[#38bdf8] shrink-0">
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="font-semibold text-xs text-slate-100 block tracking-tight">
              CarbonIntelligence AI
            </span>
            <span className="text-[11px] text-slate-400 block font-normal">
              Industrial Scope 3 Engine
            </span>
          </div>
        </Link>
      </div>

      {/* Nav Sections - Clean sentence case, no tracked-out all caps */}
      <nav className="flex-1 px-2.5 py-4 space-y-5 overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.label} className="space-y-1">
            <div className="px-2.5 text-[11px] font-medium text-slate-400 mb-1">
              {section.label}
            </div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-[#18202d] text-slate-100 border border-[#2b394e]"
                      : "text-slate-400 hover:text-slate-200 hover:bg-[#131924]"
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      isActive ? "text-[#38bdf8]" : "text-slate-500"
                    }`}
                  />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom Sidebar: Reporting Period & Live API Status */}
      <div className="p-3.5 border-t border-[#1f2735] bg-[#090d14] text-xs space-y-2.5">
        <div className="flex items-start gap-2 text-slate-400">
          <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
          <div>
            <span className="text-[10px] text-slate-500 block">
              Reporting period
            </span>
            <span className="text-slate-300 font-normal text-[11px]">
              FY2019–2024 Disclosures
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2 text-slate-400">
          <Database className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
          <div>
            <span className="text-[10px] text-slate-500 block">
              Baseline disclosures
            </span>
            <span className="text-slate-300 font-normal text-[11px]">
              1,069 Companies (Self-Reported CDP / ADEME)
            </span>
          </div>
        </div>

        <div className="pt-2 border-t border-[#1c2432] flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isOnline ? "bg-[#2dd4bf]" : "bg-[#f87171]"
              }`}
            />
            <span className="text-slate-400">
              {isOnline ? "FastAPI live" : "FastAPI offline"}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 num-tabular">v2.0</span>
        </div>
      </div>
    </aside>
  );
}
