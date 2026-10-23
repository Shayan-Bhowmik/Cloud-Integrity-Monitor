from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user_id
from app.config import get_settings
from app.db import get_supabase_client
from app.integrity import calculate_sha256, verify_signature
from app.schemas import VerifyItemResult, VerifyResponse
from app.storage import download_file_bytes, file_exists

router = APIRouter(prefix="/api", tags=["verify"])


def check_and_create_alert(
    client, user_id: str, alert_type: str, message: str, version_id: str | None = None
) -> bool:
    """Creates alert only if no unacknowledged alert of the same type and version exists."""
    query = (
        client.table("alerts")
        .select("id")
        .eq("user_id", user_id)
        .eq("type", alert_type)
        .eq("acknowledged", False)
    )
    if version_id:
        query = query.eq("version_id", version_id)
    else:
        query = query.is_("version_id", "null")

    existing = query.maybe_single().execute()
    if existing and existing.data:
        return False  # Already an active alert

    client.table("alerts").insert({
        "user_id": user_id,
        "type": alert_type,
        "message": message,
        "version_id": version_id,
        "acknowledged": False,
    }).execute()
    return True


@router.post("/verify", response_model=VerifyResponse)
def verify_integrity(user_id: str = Depends(get_current_user_id)):
    settings = get_settings()
    client = get_supabase_client()

    # Get all versions for the user
    versions_res = (
        client.table("versions")
        .select("*, files(name)")
        .eq("user_id", user_id)
        .execute()
    )
    versions = versions_res.data or []

    now_iso = datetime.now(timezone.utc).isoformat()
    results: List[VerifyItemResult] = []

    counts = {"ok": 0, "modified": 0, "missing": 0, "record_tampered": 0}

    for v in versions:
        version_id = v["id"]
        file_id = v["file_id"]
        version_no = v["version_no"]
        storage_path = v["storage_path"]
        size = v["size"]
        expected_hash = v["sha256"]
        stored_signature = v["signature"]
        file_name = v.get("files", {}).get("name", "Unknown file")
        old_status = v["status"]

        # 1. Verify DB record signature
        is_sig_valid = verify_signature(
            secret=settings.SIGNING_SECRET,
            signature=stored_signature,
            version_id=version_id,
            file_id=file_id,
            user_id=user_id,
            version_no=version_no,
            sha256_hash=expected_hash,
            size=size,
            storage_path=storage_path,
        )

        alert_created = False
        new_status = "ok"

        if not is_sig_valid:
            new_status = "record_tampered"
            counts["record_tampered"] += 1
            alert_created = check_and_create_alert(
                client,
                user_id,
                alert_type="record_tampered",
                message=f"Database record signature mismatch for '{file_name}' (v{version_no}). Record was tampered with.",
                version_id=version_id,
            )
        else:
            # 2. Check if file exists in cloud storage
            if not file_exists(storage_path):
                new_status = "missing"
                counts["missing"] += 1
                alert_created = check_and_create_alert(
                    client,
                    user_id,
                    alert_type="missing",
                    message=f"Storage object missing for '{file_name}' (v{version_no}) at {storage_path}.",
                    version_id=version_id,
                )
            else:
                # 3. Download and verify hash
                try:
                    actual_bytes = download_file_bytes(storage_path)
                    actual_hash = calculate_sha256(actual_bytes)
                    if actual_hash != expected_hash:
                        new_status = "modified"
                        counts["modified"] += 1
                        alert_created = check_and_create_alert(
                            client,
                            user_id,
                            alert_type="modified",
                            message=f"Integrity check failed for '{file_name}' (v{version_no}). Stored SHA-256 fingerprint differs from content.",
                            version_id=version_id,
                        )
                    else:
                        new_status = "ok"
                        counts["ok"] += 1
                except Exception:
                    new_status = "missing"
                    counts["missing"] += 1
                    alert_created = check_and_create_alert(
                        client,
                        user_id,
                        alert_type="missing",
                        message=f"Could not read storage object for '{file_name}' (v{version_no}).",
                        version_id=version_id,
                    )

        # Update version status and last_checked_at in DB
        client.table("versions").update({
            "status": new_status,
            "last_checked_at": now_iso,
        }).eq("id", version_id).execute()

        results.append(
            VerifyItemResult(
                version_id=version_id,
                file_id=file_id,
                version_no=version_no,
                old_status=old_status,
                new_status=new_status,
                alert_created=alert_created,
            )
        )

    # Mass-change rule: 3 or more modified versions in one check -> mass_change critical alert
    mass_change_alert_created = False
    if counts["modified"] >= 3:
        mass_change_alert_created = check_and_create_alert(
            client,
            user_id,
            alert_type="mass_change",
            message=f"CRITICAL: Mass modification detected! {counts['modified']} files were modified simultaneously. Possible ransomware activity.",
            version_id=None,
        )

    return VerifyResponse(
        total_checked=len(versions),
        ok_count=counts["ok"],
        modified_count=counts["modified"],
        missing_count=counts["missing"],
        tampered_count=counts["record_tampered"],
        mass_change_alert_created=mass_change_alert_created,
        results=results,
    )
