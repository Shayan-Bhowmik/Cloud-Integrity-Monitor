from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.db import get_supabase_client
from app.schemas import AlertResponse, AlertsListResponse, SummaryResponse

router = APIRouter(prefix="/api", tags=["alerts"])


@router.get("/alerts", response_model=AlertsListResponse)
def list_alerts(user_id: str = Depends(get_current_user_id)):
    client = get_supabase_client()
    alerts_res = (
        client.table("alerts")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return AlertsListResponse(alerts=alerts_res.data or [])


@router.post("/alerts/{alert_id}/ack", response_model=AlertResponse)
def acknowledge_alert(alert_id: str, user_id: str = Depends(get_current_user_id)):
    client = get_supabase_client()
    res = (
        client.table("alerts")
        .update({"acknowledged": True})
        .eq("id", alert_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error_code": "ALERT_NOT_FOUND", "message": "Alert not found"},
        )
    return res.data[0]


@router.get("/summary", response_model=SummaryResponse)
def get_summary(user_id: str = Depends(get_current_user_id)):
    client = get_supabase_client()

    # Total files
    files_res = client.table("files").select("id", count="exact").eq("user_id", user_id).execute()
    total_files = files_res.count or len(files_res.data or [])

    # Total versions and last checked
    versions_res = (
        client.table("versions")
        .select("id, status, last_checked_at")
        .eq("user_id", user_id)
        .execute()
    )
    versions = versions_res.data or []
    total_versions = len(versions)

    # Latest last_checked_at timestamp across versions
    last_check_times = [v["last_checked_at"] for v in versions if v.get("last_checked_at")]
    last_check_at = max(last_check_times) if last_check_times else None

    # Open (unacknowledged) alerts count
    open_alerts_res = (
        client.table("alerts")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .eq("acknowledged", False)
        .execute()
    )
    open_alerts = open_alerts_res.count or len(open_alerts_res.data or [])

    # Health status: compromised (modified/tampered/missing versions or open alerts) > warning > healthy
    has_bad_versions = any(v.get("status") in ("modified", "missing", "record_tampered") for v in versions)
    if has_bad_versions or open_alerts > 0:
        overall_status = "compromised"
    else:
        overall_status = "healthy"

    return SummaryResponse(
        total_files=total_files,
        total_versions=total_versions,
        last_check_at=last_check_at,
        open_alerts=open_alerts,
        status=overall_status,
    )
