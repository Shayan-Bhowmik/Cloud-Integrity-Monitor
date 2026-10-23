from app.db import get_supabase_client

BUCKET_NAME = "backups"


def upload_file_bytes(storage_path: str, file_bytes: bytes, content_type: str = "application/octet-stream") -> None:
    client = get_supabase_client()
    client.storage.from_(BUCKET_NAME).upload(
        path=storage_path,
        file=file_bytes,
        file_options={"content-type": content_type, "upsert": "true"},
    )


def download_file_bytes(storage_path: str) -> bytes:
    client = get_supabase_client()
    return client.storage.from_(BUCKET_NAME).download(storage_path)


def file_exists(storage_path: str) -> bool:
    client = get_supabase_client()
    try:
        # Split folder and filename to check existence via list()
        parts = storage_path.rsplit("/", 1)
        folder = parts[0] if len(parts) > 1 else ""
        filename = parts[-1]
        files = client.storage.from_(BUCKET_NAME).list(path=folder)
        return any(f.get("name") == filename for f in files)
    except Exception:
        return False
