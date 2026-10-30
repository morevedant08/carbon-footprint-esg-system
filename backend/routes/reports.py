"""
routes/reports.py

Wraps the ReportLab PDF generation engine (reports/report_generator.py)
behind POST /reports/generate.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import os

router = APIRouter()


class ReportGenerateRequest(BaseModel):
    company_name: Optional[str] = None


@router.post("/reports/generate")
def generate_report(req: ReportGenerateRequest):
    """
    Generates an audit-ready ESG PDF report using ReportLab and matplotlib.
    Optionally filters/spotlights a specific company if provided.
    Returns the compiled PDF file directly for download.
    """
    try:
        from reports.report_generator import build_report

        filter_name = req.company_name if req.company_name and req.company_name.strip() else None
        output_pdf_path = build_report(company_filter=filter_name)

        if not os.path.exists(output_pdf_path):
            raise HTTPException(status_code=500, detail="Report generation failed to create PDF file.")

        filename = os.path.basename(output_pdf_path)

        return FileResponse(
            path=output_pdf_path,
            filename=filename,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate ESG report: {str(e)}")
