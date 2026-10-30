"""
report_generator.py (v2 - visual upgrade)

Generates an audit-ready ESG PDF report using ReportLab, with a cohesive
color palette, cleaner chart styling, page numbers, and improved table
formatting.

USAGE:
    pip install reportlab pandas matplotlib
    python reports/report_generator.py
    python reports/report_generator.py --company "Aarti Industries Ltd"

OUTPUT:
    reports/output/ESG_Report_<timestamp>.pdf
"""

import pandas as pd
import numpy as np
import argparse
import os
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, Image as RLImage, HRFlowable
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.pdfgen import canvas as pdf_canvas

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

DATA_PATH = "data/processed/scope3_final_corrected.csv"
COMPARISON_PATH = "data/processed/full_model_comparison.csv"
RELIABILITY_PATH = "data/processed/model_reliability_by_segment.csv"
OUTPUT_DIR = "reports/output"
CHART_DIR = "reports/output/_charts"

# ---------------------------------------------------------------------------
# Cohesive ESG color palette
# ---------------------------------------------------------------------------
NAVY = colors.HexColor("#0B2545")
TEAL = colors.HexColor("#2E86AB")
GREEN = colors.HexColor("#2A9D8F")
CORAL = colors.HexColor("#E76F51")
AMBER = colors.HexColor("#E9C46A")
GREY_BG = colors.HexColor("#F4F6F8")
GREY_TEXT = colors.HexColor("#6B7280")
DARK_TEXT = colors.HexColor("#1F2937")

MPL_PALETTE = ["#0B2545", "#2E86AB", "#2A9D8F", "#E76F51", "#E9C46A", "#8AB6D6"]

plt.rcParams.update({
    "font.family": "sans-serif",
    "font.size": 10,
    "axes.edgecolor": "#D1D5DB",
    "axes.labelcolor": "#1F2937",
    "text.color": "#1F2937",
    "xtick.color": "#4B5563",
    "ytick.color": "#4B5563",
    "axes.spines.top": False,
    "axes.spines.right": False,
    "figure.facecolor": "white",
    "axes.facecolor": "white",
    "axes.grid": True,
    "grid.color": "#E5E7EB",
    "grid.linewidth": 0.6,
})


def _style_ax(ax):
    ax.set_axisbelow(True)
    ax.tick_params(length=0)


def make_sector_chart(df: pd.DataFrame) -> str:
    sector_summary = df.groupby("sics_sector")[["scope_1", "scope_2", "scope_3"]].median()
    sector_summary = sector_summary.sort_values("scope_3", ascending=True)

    fig, ax = plt.subplots(figsize=(7.2, 4.2), dpi=150)
    sector_summary.plot(kind="barh", ax=ax, color=[MPL_PALETTE[1], MPL_PALETTE[4], MPL_PALETTE[0]], width=0.72)
    ax.set_xlabel("Median tCO\u2082e (log scale)", fontsize=9)
    ax.set_xscale("log")
    ax.set_ylabel("")
    ax.set_title("Median Emissions by Sector and Scope", fontsize=12, fontweight="bold", color="#0B2545", pad=12)
    ax.legend(["Scope 1", "Scope 2", "Scope 3"], frameon=False, loc="lower right", fontsize=8)
    _style_ax(ax)
    plt.tight_layout()

    path = os.path.join(CHART_DIR, "sector_chart.png")
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return path


def make_jurisdiction_chart(df: pd.DataFrame) -> str:
    counts = df["jurisdiction"].value_counts().head(10).sort_values()

    fig, ax = plt.subplots(figsize=(7.2, 4.2), dpi=150)
    bars = ax.barh(counts.index, counts.values, color=MPL_PALETTE[1], height=0.65)
    ax.set_xlabel("Company Count", fontsize=9)
    ax.set_title("Top 10 Jurisdictions by Company Count", fontsize=12, fontweight="bold", color="#0B2545", pad=12)
    for bar in bars:
        w = bar.get_width()
        ax.text(w + max(counts.values)*0.01, bar.get_y() + bar.get_height()/2, f"{int(w)}",
                 va="center", fontsize=8, color="#1F2937")
    _style_ax(ax)
    plt.tight_layout()

    path = os.path.join(CHART_DIR, "jurisdiction_chart.png")
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return path


def make_reliability_chart(rel_df: pd.DataFrame) -> str:
    sector_rel = rel_df[rel_df["segment_type"] == "Sector"].sort_values("r2", ascending=True)

    fig, ax = plt.subplots(figsize=(7.2, 3.8), dpi=150)
    colors_list = [MPL_PALETTE[2] if v >= 0.5 else (MPL_PALETTE[4] if v >= 0.4 else MPL_PALETTE[3])
                   for v in sector_rel["r2"]]
    bars = ax.barh(sector_rel["segment"], sector_rel["r2"], color=colors_list, height=0.6)
    ax.set_xlabel("Out-of-fold R\u00b2 (higher = more reliable)", fontsize=9)
    ax.set_xlim(0, max(0.75, sector_rel["r2"].max() + 0.1))
    ax.set_title("Model Reliability by Sector", fontsize=12, fontweight="bold", color="#0B2545", pad=12)
    for bar, n in zip(bars, sector_rel["n_companies"]):
        ax.text(bar.get_width() + 0.01, bar.get_y() + bar.get_height()/2, f"n={n}",
                 va="center", fontsize=7.5, color="#6B7280")
    _style_ax(ax)
    plt.tight_layout()

    path = os.path.join(CHART_DIR, "reliability_chart.png")
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return path


def make_model_comparison_chart(comp_df: pd.DataFrame) -> str:
    comp_df = comp_df.sort_values("CV R2 mean", ascending=True)

    fig, ax = plt.subplots(figsize=(7.2, 4.0), dpi=150)
    ax.barh(comp_df["Model"], comp_df["CV R2 mean"],
            xerr=comp_df["CV R2 std"], color=MPL_PALETTE[0], height=0.6,
            error_kw={"ecolor": "#9CA3AF", "capsize": 3, "elinewidth": 1})
    ax.set_xlabel("Cross-Validated R\u00b2 (mean \u00b1 std)", fontsize=9)
    ax.set_title("Model Comparison \u2014 Scope 3 Prediction", fontsize=12, fontweight="bold", color="#0B2545", pad=12)
    _style_ax(ax)
    plt.tight_layout()

    path = os.path.join(CHART_DIR, "model_comparison_chart.png")
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return path


def _add_page_decoration(canvas: pdf_canvas.Canvas, doc):
    canvas.saveState()
    page_w, page_h = A4

    canvas.setFillColor(NAVY)
    canvas.rect(0, page_h - 0.35*cm, page_w, 0.35*cm, fill=1, stroke=0)

    canvas.setFillColor(GREY_TEXT)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(2*cm, 1.2*cm, "AI-Driven Carbon Footprint & ESG Intelligence Report")
    canvas.drawRightString(page_w - 2*cm, 1.2*cm, f"Page {doc.page}")
    canvas.setStrokeColor(colors.HexColor("#E5E7EB"))
    canvas.line(2*cm, 1.5*cm, page_w - 2*cm, 1.5*cm)

    canvas.restoreState()


def styled_table(data, col_widths, header_bg=TEAL, font_size=8.5, align_left_col0=True):
    t = Table(data, colWidths=col_widths)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), header_bg),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), font_size),
        ("FONTSIZE", (0, 1), (-1, -1), font_size),
        ("LINEBELOW", (0, 0), (-1, 0), 1, header_bg),
        ("GRID", (0, 1), (-1, -1), 0.4, colors.HexColor("#E5E7EB")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GREY_BG]),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    if align_left_col0:
        style.append(("ALIGN", (0, 0), (0, -1), "LEFT"))
        style.append(("ALIGN", (1, 0), (-1, -1), "CENTER"))
    t.setStyle(TableStyle(style))
    return t


def build_report(company_filter: str = None):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(CHART_DIR, exist_ok=True)

    df = pd.read_csv(DATA_PATH)

    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    output_path = os.path.join(OUTPUT_DIR, f"ESG_Report_{timestamp}.pdf")

    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        topMargin=2.2*cm, bottomMargin=2*cm, leftMargin=2*cm, rightMargin=2*cm
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TitleCustom", parent=styles["Title"], fontSize=22, leading=26,
        textColor=NAVY, spaceAfter=4, fontName="Helvetica-Bold"
    )
    subtitle_style = ParagraphStyle(
        "Subtitle", parent=styles["Normal"], fontSize=11, textColor=GREY_TEXT,
        alignment=TA_CENTER, spaceAfter=6
    )
    kicker_style = ParagraphStyle(
        "Kicker", parent=styles["Normal"], fontSize=9, textColor=TEAL,
        alignment=TA_CENTER, spaceAfter=2, fontName="Helvetica-Bold"
    )
    h2 = ParagraphStyle(
        "H2", parent=styles["Heading2"], textColor=NAVY, fontSize=15,
        spaceBefore=18, spaceAfter=10, fontName="Helvetica-Bold"
    )
    h3 = ParagraphStyle(
        "H3", parent=styles["Heading3"], textColor=TEAL, fontSize=12,
        spaceBefore=10, spaceAfter=6, fontName="Helvetica-Bold"
    )
    body = ParagraphStyle(
        "BodyCustom", parent=styles["Normal"], fontSize=9.5, leading=14,
        textColor=DARK_TEXT, alignment=TA_LEFT
    )
    note_style = ParagraphStyle(
        "Note", parent=styles["Normal"], fontSize=8, textColor=GREY_TEXT,
        spaceBefore=6, leading=11,
    )

    elements = []

    elements.append(Spacer(1, 4*cm))
    elements.append(Paragraph("ESG INTELLIGENCE REPORT", kicker_style))
    elements.append(Paragraph("AI-Driven Industrial Carbon Footprint", title_style))
    elements.append(Paragraph("& ESG Intelligence Report", title_style))
    elements.append(Spacer(1, 0.3*cm))
    elements.append(HRFlowable(width="30%", thickness=1.5, color=TEAL, spaceAfter=10, hAlign="CENTER"))
    elements.append(Paragraph(f"Generated {datetime.now().strftime('%B %d, %Y')}", subtitle_style))
    elements.append(Spacer(1, 1.5*cm))

    elements.append(Paragraph("Executive Summary", h2))
    elements.append(HRFlowable(width="100%", thickness=0.75, color=colors.HexColor("#E5E7EB"), spaceAfter=10))

    total_companies = len(df)
    total_scope1 = df["scope_1"].sum()
    total_scope2 = df["scope_2"].sum()
    total_scope3 = df["scope_3"].sum()
    n_sectors = df["sics_sector"].nunique()
    n_countries = df["jurisdiction"].nunique()

    summary_text = f"""
    This report summarizes greenhouse gas (GHG) emissions data across
    {total_companies:,} companies spanning {n_sectors} industrial sectors and
    {n_countries} jurisdictions, sourced from real, verified corporate
    disclosures (NZDPU / Climate Data Utility, drawing on CDP and ADEME).
    Aggregate emissions: Scope 1 totals {total_scope1:,.0f} tCO\u2082e, Scope 2
    totals {total_scope2:,.0f} tCO\u2082e, and Scope 3 (value chain) totals
    {total_scope3:,.0f} tCO\u2082e \u2014 consistent with the well-documented pattern
    that Scope 3 dominates most companies' overall footprint.
    """
    elements.append(Paragraph(summary_text, body))
    elements.append(Spacer(1, 0.4*cm))

    summary_table_data = [
        ["Metric", "Value"],
        ["Companies covered", f"{total_companies:,}"],
        ["Sectors covered", str(n_sectors)],
        ["Jurisdictions covered", str(n_countries)],
        ["Total Scope 1 (tCO\u2082e)", f"{total_scope1:,.0f}"],
        ["Total Scope 2 (tCO\u2082e)", f"{total_scope2:,.0f}"],
        ["Total Scope 3 (tCO\u2082e)", f"{total_scope3:,.0f}"],
    ]
    elements.append(styled_table(summary_table_data, [8*cm, 6*cm], header_bg=NAVY))

    elements.append(Paragraph("Emissions by Sector", h2))
    elements.append(HRFlowable(width="100%", thickness=0.75, color=colors.HexColor("#E5E7EB"), spaceAfter=10))
    sector_chart_path = make_sector_chart(df)
    elements.append(RLImage(sector_chart_path, width=16*cm, height=9.3*cm))

    elements.append(Paragraph("Geographic Coverage", h2))
    elements.append(HRFlowable(width="100%", thickness=0.75, color=colors.HexColor("#E5E7EB"), spaceAfter=10))
    juris_chart_path = make_jurisdiction_chart(df)
    elements.append(RLImage(juris_chart_path, width=16*cm, height=9.3*cm))

    elements.append(PageBreak())

    elements.append(Paragraph("Scope 3 Prediction Methodology", h2))
    elements.append(HRFlowable(width="100%", thickness=0.75, color=colors.HexColor("#E5E7EB"), spaceAfter=10))
    method_text = """
    Scope 3 emissions \u2014 the hardest to measure of the three GHG Protocol
    scopes \u2014 are estimated using machine learning trained on real company
    disclosures, sector classification, jurisdiction, and firm financial
    indicators (revenue, employee count, market capitalization, EBITDA).
    Financial features were found to be the strongest predictor of Scope 3
    emissions, consistent with published benchmark research (GHGbench, 2026).
    Seven regression approaches were compared under identical conditions.
    """
    elements.append(Paragraph(method_text, body))

    if os.path.exists(COMPARISON_PATH):
        comp_df = pd.read_csv(COMPARISON_PATH)
        chart_path = make_model_comparison_chart(comp_df)
        elements.append(Spacer(1, 0.3*cm))
        elements.append(RLImage(chart_path, width=16*cm, height=9*cm))

        elements.append(Paragraph("Full Model Comparison", h3))
        comp_display = comp_df.sort_values("CV R2 mean", ascending=False)
        comp_table_data = [list(comp_display.columns)] + comp_display.astype(str).values.tolist()
        elements.append(styled_table(comp_table_data, [4.8*cm, 2.4*cm, 2.4*cm, 2.4*cm, 2.4*cm, 2.4*cm]))
        elements.append(Paragraph(
            "R\u00b2 in the 0.48\u20130.50 range across all seven models is consistent with, and "
            "directionally explained by, published Scope 3 prediction benchmarks (GHGbench, "
            "arXiv:2605.13743) given this project's smaller sample size relative to that study. "
            "XGBoost is used as the deployed model for its lowest cross-validation variance.",
            note_style
        ))

    if os.path.exists(RELIABILITY_PATH):
        rel_df = pd.read_csv(RELIABILITY_PATH)
        elements.append(Paragraph("Model Reliability by Segment", h2))
        elements.append(HRFlowable(width="100%", thickness=0.75, color=colors.HexColor("#E5E7EB"), spaceAfter=10))
        elements.append(Paragraph(
            "Out-of-fold R\u00b2 (each company predicted by a model that never saw it during "
            "training) broken down by sector, jurisdiction, and company size. This identifies "
            "where predictions are most and least reliable.", body
        ))

        rel_chart_path = make_reliability_chart(rel_df)
        elements.append(Spacer(1, 0.2*cm))
        elements.append(RLImage(rel_chart_path, width=16*cm, height=8.5*cm))

        rel_table_data = [["Segment Type", "Segment", "R\u00b2", "Companies"]] + \
            rel_df[["segment_type", "segment", "r2", "n_companies"]].astype(str).values.tolist()
        elements.append(styled_table(rel_table_data, [4.2*cm, 6.5*cm, 2*cm, 2.3*cm], font_size=7.5))

    if company_filter:
        match = df[df["company_name"].str.contains(company_filter, case=False, na=False)]
        if len(match) > 0:
            elements.append(PageBreak())
            row = match.iloc[0]
            elements.append(Paragraph("Company Spotlight", h2))
            elements.append(HRFlowable(width="100%", thickness=0.75, color=colors.HexColor("#E5E7EB"), spaceAfter=10))
            elements.append(Paragraph(str(row['company_name']), h3))
            spotlight_data = [
                ["Field", "Value"],
                ["Jurisdiction", str(row.get("jurisdiction", "N/A"))],
                ["Sector", str(row.get("sics_sector", "N/A"))],
                ["Scope 1 (tCO\u2082e)", f"{row.get('scope_1', 0):,.0f}"],
                ["Scope 2 (tCO\u2082e)", f"{row.get('scope_2', 0):,.0f}"],
                ["Scope 3 (tCO\u2082e)", f"{row.get('scope_3', 0):,.0f}"],
            ]
            elements.append(styled_table(spotlight_data, [6*cm, 8*cm], header_bg=CORAL))

    elements.append(PageBreak())
    elements.append(Paragraph("Data Sources & Limitations", h2))
    elements.append(HRFlowable(width="100%", thickness=0.75, color=colors.HexColor("#E5E7EB"), spaceAfter=10))
    limitations_text = """
    <b>Scope 1/2/3 data:</b> Real, verified corporate disclosures sourced from
    NZDPU / Climate Data Utility (CDP and ADEME providers).<br/><br/>

    <b>Data quality correction:</b> 172 of 1,206 companies (14.3%) showed
    Scope 3-to-Scope 1/2 ratios inconsistent with sector norms. 35 were
    corrected for a diagnosed kg-vs-tonne unit error; 137 were excluded as
    irreconcilable rather than estimated.<br/><br/>

    <b>Logistics/routing data:</b> Synthetic, explicitly disclosed. Cost-per-km
    figures are documented modeling assumptions, not real company pricing.<br/><br/>

    <b>Model accuracy:</b> R\u00b2 \u2248 0.48\u20130.50 on held-out data \u2014 a directional
    estimate, not an audit-grade figure. Weaker for the largest companies
    by revenue (known tree-model extrapolation limitation).<br/><br/>

    <b>Regulatory status:</b> AI-generated emission estimates are not
    universally recognized as valid compliance data by all regulatory bodies.
    """
    elements.append(Paragraph(limitations_text, body))

    doc.build(elements, onFirstPage=_add_page_decoration, onLaterPages=_add_page_decoration)
    return output_path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--company", type=str, default=None)
    args = parser.parse_args()

    if not os.path.exists(DATA_PATH):
        print(f"ERROR: {DATA_PATH} not found. Run the data pipeline first.")
        return

    output_path = build_report(company_filter=args.company)
    print(f"Report saved to: {output_path}")


if __name__ == "__main__":
    main()
