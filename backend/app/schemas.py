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
