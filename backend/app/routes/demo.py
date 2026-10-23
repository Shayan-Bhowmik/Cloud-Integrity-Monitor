import os
import uuid
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.config import get_settings
from app.db import get_supabase_client
from app.integrity import calculate_sha256, compute_signature
from app.storage import delete_file_object, download_file_bytes, upload_file_bytes

router = APIRouter(prefix="/api/demo", tags=["demo"])

# Each demo file gets two clean versions. Attacks hit the newest version, so the older one
# stays a valid restore source and the seed -> attack -> verify -> restore flow can complete.
DEMO_FILES_DATA = [
    ("financial_report_q3.csv", [
        b"Quarter,Revenue,Expenses,Profit\nQ1,12000,8000,4000\nQ2,15000,9000,6000\n",
        b"Quarter,Revenue,Expenses,Profit\nQ1,12000,8000,4000\nQ2,15000,9000,6000\nQ3,18000,9500,8500\n",
    ]),
    ("patient_records_anonymized.json", [
        b'{"patients": [{"id": 101, "status": "stable"}]}',
        b'{"patients": [{"id": 101, "status": "stable"}, {"id": 102, "status": "critical"}]}',
    ]),
    ("production_database_backup.sql", [
        b"-- Production Backup\nCREATE TABLE users(id INT, email TEXT);\n",
        b"-- Production Backup\nCREATE TABLE users(id INT, email TEXT);\nINSERT INTO users VALUES (1, 'alice@example.com');\n",
    ]),
    ("system_auth_keys.pem", [
        b"-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Y34...[MOCK DEMO KEY V1]...=\n-----END RSA PRIVATE KEY-----\n",
        b"-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Y34...[MOCK DEMO KEY CERT]...=\n-----END RSA PRIVATE KEY-----\n",
    ]),
    ("client_contracts_2026.pdf", [
        b"%PDF-1.4 Mock Cairn Demo Document Draft %EOF",
        b"%PDF-1.4 Mock Cairn Encrypted Demo Document Structure for Verification testing %EOF",
    ]),
]


class AttackRequest(BaseModel):
    type: Literal["corrupt", "delete", "encrypt", "tamper_record"]
    file_id: Optional[str] = None  # If None, targets the first available demo file


@router.post("/seed", status_code=status.HTTP_201_CREATED)
def seed_demo_files(user_id: str = Depends(get_current_user_id)):
    settings = get_settings()
    client = get_supabase_client()

    created_files = []

    for name, contents in DEMO_FILES_DATA:
        # Check if demo file already exists for this user to avoid duplicates
        existing = (
            client.table("files")
            .select("id")
            .eq("user_id", user_id)
            .eq("name", name)
            .eq("is_demo", True)
            .maybe_single()
            .execute()
        )
        if existing and existing.data:
            continue

        file_id = str(uuid.uuid4())

        # 1. Create file record
        client.table("files").insert({
            "id": file_id,
            "user_id": user_id,
            "name": name,
            "is_demo": True,
        }).execute()

        for version_no, content in enumerate(contents, start=1):
            version_id = str(uuid.uuid4())
            storage_path = f"{user_id}/{file_id}/v{version_no}"
            sha256_hash = calculate_sha256(content)
            size = len(content)

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

            # 2. Upload file bytes
            upload_file_bytes(storage_path, content)

            # 3. Create version record
            client.table("versions").insert({
                "id": version_id,
                "file_id": file_id,
                "user_id": user_id,
                "version_no": version_no,
                "storage_path": storage_path,
                "size": size,
                "sha256": sha256_hash,
                "signature": signature,
                "status": "ok",
            }).execute()

        created_files.append({"id": file_id, "name": name, "version_id": version_id})

    return {
        "message": f"Demo files seeded successfully ({len(created_files)} added).",
        "files": created_files,
    }


@router.post("/attack", status_code=status.HTTP_200_OK)
def simulate_attack(payload: AttackRequest, user_id: str = Depends(get_current_user_id)):
    client = get_supabase_client()

    # 1. Strict boundary check: Only target files that have is_demo = true AND belong to current user
    if payload.file_id:
        file_res = (
            client.table("files")
            .select("*")
            .eq("id", payload.file_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        if not file_res or not file_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error_code": "FILE_NOT_FOUND", "message": "Target file not found"},
            )
        if not file_res.data.get("is_demo"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error_code": "DEMO_RESTRICTION",
                    "message": "Refused: Simulation attacks can only be executed on demo files.",
                },
            )
        target_file = file_res.data
    else:
        # Default to the first available demo file
        demo_files = (
            client.table("files")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_demo", True)
            .order("created_at")
            .limit(1)
            .execute()
        )
        if not demo_files.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error_code": "NO_DEMO_FILES", "message": "No demo files found. Run /api/demo/seed first."},
            )
        target_file = demo_files.data[0]

    file_id = target_file["id"]
    file_name = target_file["name"]

    # Get the latest version of this demo file
    version_res = (
        client.table("versions")
        .select("*")
        .eq("file_id", file_id)
        .order("version_no", desc=True)
        .limit(1)
        .execute()
    )
    if not version_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error_code": "NO_VERSION_FOUND", "message": "No version found for the demo file"},
        )
    target_version = version_res.data[0]
    version_id = target_version["id"]
    storage_path = target_version["storage_path"]

    # 2. Execute selected attack
    if payload.type == "corrupt":
        # Alter a few bytes in cloud storage
        try:
            original = download_file_bytes(storage_path)
            corrupted = original + b"\n-- CORRUPTED DATA INSERTED --\n"
        except Exception:
            corrupted = b"TAMPERED / CORRUPTED CONTENT"
        upload_file_bytes(storage_path, corrupted)
        action_msg = f"Injected corruption into storage object for '{file_name}'."

    elif payload.type == "delete":
        # Delete object from cloud storage
        delete_file_object(storage_path)
        action_msg = f"Deleted storage object for '{file_name}' from cloud bucket."

    elif payload.type == "encrypt":
        # Ransomware simulation: Overwrite cloud storage bytes with random high-entropy bytes
        ransomware_payload = os.urandom(target_version["size"] or 256)
        upload_file_bytes(storage_path, ransomware_payload)
        action_msg = f"Simulated ransomware encryption on storage object for '{file_name}'."

    elif payload.type == "tamper_record":
        # Malicious actor modified database metadata directly (e.g. injected bad hash or changed size)
        client.table("versions").update({
            "sha256": "0000000000000000000000000000000000000000000000000000000000000000"
        }).eq("id", version_id).execute()
        action_msg = f"Tampered with SHA-256 fingerprint in database row for '{file_name}'."

    return {
        "status": "attack_simulated",
        "attack_type": payload.type,
        "targeted_file": {"id": file_id, "name": file_name, "version_id": version_id},
        "action": action_msg,
        "next_step": "Run POST /api/verify to detect the integrity violation and generate alerts.",
    }
