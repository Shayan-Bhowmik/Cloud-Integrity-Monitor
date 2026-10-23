import hashlib
import hmac


def calculate_sha256(data: bytes) -> str:
    """Calculates SHA-256 hex digest of the given bytes."""
    return hashlib.sha256(data).hexdigest()


def compute_signature(
    secret: str,
    version_id: str,
    file_id: str,
    user_id: str,
    version_no: int,
    sha256_hash: str,
    size: int,
    storage_path: str,
) -> str:
    """Computes HMAC-SHA256 signature for version metadata."""
    message = f"{version_id}|{file_id}|{user_id}|{version_no}|{sha256_hash}|{size}|{storage_path}"
    return hmac.new(
        secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def verify_signature(
    secret: str,
    signature: str,
    version_id: str,
    file_id: str,
    user_id: str,
    version_no: int,
    sha256_hash: str,
    size: int,
    storage_path: str,
) -> bool:
    """Verifies that the HMAC signature matches the version metadata."""
    expected = compute_signature(
        secret,
        version_id,
        file_id,
        user_id,
        version_no,
        sha256_hash,
        size,
        storage_path,
    )
    return hmac.compare_digest(expected, signature)
