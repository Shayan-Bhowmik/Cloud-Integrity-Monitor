import uuid
from typing import Annotated, List
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status

from app.auth import get_current_user_id
from app.config import get_settings
from app.db import get_supabase_client
from app.integrity import calculate_sha256, compute_signature
from app.schemas import FileItemResponse, FilesListResponse, VersionResponse
from app.storage import download_file_bytes, upload_file_bytes

router = APIRouter(prefix="/api", tags=["files"])


@router.post("/files", response_model=VersionResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: Annotated[UploadFile, File()],
    user_id: str = Depends(get_current_user_id),
):
    settings = get_settings()
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024

    content = await file.read()
    size = len(content)

    if size > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "error_code": "FILE_TOO_LARGE",
                "message": f"File size exceeds maximum limit of {settings.MAX_UPLOAD_MB} MB",
            },
        )

    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error_code": "INVALID_FILENAME", "message": "Filename must not be empty"},
        )

    client = get_supabase_client()

    # 1. Check if file with same name already exists for this user
    file_record = (
        client.table("files")
        .select("*")
        .eq("user_id", user_id)
        .eq("name", file.filename)
        .maybe_single()
        .execute()
    )

    if file_record and file_record.data:
        file_id = file_record.data["id"]
        # Determine next version number
        versions_res = (
            client.table("versions")
            .select("version_no")
            .eq("file_id", file_id)
            .order("version_no", desc=True)
            .limit(1)
            .execute()
        )
        version_no = (versions_res.data[0]["version_no"] + 1) if versions_res.data else 1
    else:
        # Create new file record
        file_id = str(uuid.uuid4())
        client.table("files").insert({
            "id": file_id,
            "user_id": user_id,
            "name": file.filename,
            "is_demo": False,
        }).execute()
        version_no = 1

    # 2. Compute hash and path
    version_id = str(uuid.uuid4())
    sha256_hash = calculate_sha256(content)
    storage_path = f"{user_id}/{file_id}/v{version_no}"
    signature = compute_signature(
        secret=settings.SIGNING_SECRET,
        version_id=version_id,
        file_id=file_id,
        user_id=user_id,
        version_no=version_no,
        sha256_hash=sha256_hash,
        size=size,
        storage_path=storage_path,
    )

    # 3. Upload to Supabase Storage
    try:
        upload_file_bytes(storage_path, content, content_type=file.content_type or "application/octet-stream")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error_code": "STORAGE_ERROR", "message": "Failed to store file in cloud storage"},
        )

    # 4. Insert version row
    version_data = {
        "id": version_id,
        "file_id": file_id,
        "user_id": user_id,
        "version_no": version_no,
        "storage_path": storage_path,
        "size": size,
        "sha256": sha256_hash,
        "signature": signature,
        "status": "ok",
    }
    insert_res = client.table("versions").insert(version_data).execute()

    return insert_res.data[0]


@router.get("/files", response_model=FilesListResponse)
def list_files(user_id: str = Depends(get_current_user_id)):
    client = get_supabase_client()
    files_res = client.table("files").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()

    result = []
    for f in (files_res.data or []):
        latest_ver_res = (
            client.table("versions")
            .select("*")
            .eq("file_id", f["id"])
            .order("version_no", desc=True)
            .limit(1)
            .execute()
        )
        latest_version = latest_ver_res.data[0] if latest_ver_res.data else None
        result.append(
            FileItemResponse(
                id=f["id"],
                name=f["name"],
                is_demo=f["is_demo"],
                created_at=f["created_at"],
                latest_version=latest_version,
            )
        )

    return FilesListResponse(files=result)


@router.get("/files/{file_id}/versions", response_model=List[VersionResponse])
def get_file_versions(file_id: str, user_id: str = Depends(get_current_user_id)):
    client = get_supabase_client()
    # Confirm file ownership
    file_res = client.table("files").select("id").eq("id", file_id).eq("user_id", user_id).maybe_single().execute()
    if not file_res or not file_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error_code": "FILE_NOT_FOUND", "message": "File not found"},
        )

    versions_res = (
        client.table("versions")
        .select("*")
        .eq("file_id", file_id)
        .order("version_no", desc=True)
        .execute()
    )
    return versions_res.data or []


@router.get("/versions/{version_id}/download")
def download_version(version_id: str, user_id: str = Depends(get_current_user_id)):
    client = get_supabase_client()
    version_res = (
        client.table("versions")
        .select("*, files(name)")
        .eq("id", version_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )

    if not version_res or not version_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error_code": "VERSION_NOT_FOUND", "message": "Version not found"},
        )

    v_data = version_res.data
    storage_path = v_data["storage_path"]
    expected_hash = v_data["sha256"]
    file_name = v_data.get("files", {}).get("name", "backup_file")

    try:
        content = download_file_bytes(storage_path)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error_code": "FILE_NOT_FOUND_IN_STORAGE", "message": "Object not found in cloud storage"},
        )

    # Integrity check before serving download
    actual_hash = calculate_sha256(content)
    if actual_hash != expected_hash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error_code": "INTEGRITY_COMPROMISED",
                "message": "File integrity verification failed: stored hash differs from file content.",
            },
        )

    return Response(
        content=content,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
    )
