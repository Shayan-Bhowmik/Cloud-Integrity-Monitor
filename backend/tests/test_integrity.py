import hashlib
from app.integrity import calculate_sha256, compute_signature, verify_signature


def test_calculate_sha256():
    data = b"Hello, Cairn Vault!"
    expected = hashlib.sha256(data).hexdigest()
    assert calculate_sha256(data) == expected


def test_signature_verification_success():
    secret = "test-secret-key-1234567890123456"
    version_id = "v-1"
    file_id = "f-1"
    user_id = "u-1"
    version_no = 1
    sha256_hash = calculate_sha256(b"content")
    size = 7
    storage_path = "u-1/f-1/v1"

    sig = compute_signature(
        secret, version_id, file_id, user_id, version_no, sha256_hash, size, storage_path
    )
    assert verify_signature(
        secret, sig, version_id, file_id, user_id, version_no, sha256_hash, size, storage_path
    ) is True


def test_signature_verification_tamper_detection():
    secret = "test-secret-key-1234567890123456"
    version_id = "v-1"
    file_id = "f-1"
    user_id = "u-1"
    version_no = 1
    sha256_hash = calculate_sha256(b"content")
    size = 7
    storage_path = "u-1/f-1/v1"

    sig = compute_signature(
        secret, version_id, file_id, user_id, version_no, sha256_hash, size, storage_path
    )
    # Tamper with the hash value in the record
    tampered_hash = calculate_sha256(b"tampered content")
    assert verify_signature(
        secret, sig, version_id, file_id, user_id, version_no, tampered_hash, size, storage_path
    ) is False
