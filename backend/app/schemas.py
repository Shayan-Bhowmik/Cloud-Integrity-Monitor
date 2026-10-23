from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


class VersionResponse(BaseModel):
    id: str
    file_id: str
    user_id: str
    version_no: int
    storage_path: str
    size: int
    sha256: str
    signature: str
    status: str
    last_checked_at: Optional[datetime] = None
    created_at: datetime


class FileItemResponse(BaseModel):
    id: str
    name: str
    is_demo: bool
    created_at: datetime
    latest_version: Optional[VersionResponse] = None


class FilesListResponse(BaseModel):
    files: List[FileItemResponse]


class AlertResponse(BaseModel):
    id: str
    user_id: str
    type: str
    message: str
    version_id: Optional[str] = None
    acknowledged: bool
    created_at: datetime


class AlertsListResponse(BaseModel):
    alerts: List[AlertResponse]


class VerifyItemResult(BaseModel):
    version_id: str
    file_id: str
    version_no: int
    old_status: str
    new_status: str
    alert_created: bool


class VerifyResponse(BaseModel):
    total_checked: int
    ok_count: int
    modified_count: int
    missing_count: int
    tampered_count: int
    mass_change_alert_created: bool
    results: List[VerifyItemResult]


class SummaryResponse(BaseModel):
    total_files: int
    total_versions: int
    last_check_at: Optional[datetime] = None
    open_alerts: int
    status: str  # healthy | warning | compromised
