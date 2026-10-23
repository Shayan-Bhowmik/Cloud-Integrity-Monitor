from app.integrity import calculate_sha256, compute_signature, verify_signature


def test_verify_algorithm_flow():
    secret = "test-secret-key-1234567890123456"
    version_id = "v-1"
    file_id = "f-1"
    user_id = "u-1"
    version_no = 1
    original_data = b"Clean uncorrupted backup content"
    sha256_hash = calculate_sha256(original_data)
    size = len(original_data)
    storage_path = "u-1/f-1/v1"

    signature = compute_signature(
        secret, version_id, file_id, user_id, version_no, sha256_hash, size, storage_path
    )

    # 1. Normal state: OK
    assert verify_signature(
        secret, signature, version_id, file_id, user_id, version_no, sha256_hash, size, storage_path
    ) is True
    assert calculate_sha256(original_data) == sha256_hash

    # 2. Record Tampered state: DB signature invalid
    assert verify_signature(
        secret, "tampered-bad-sig", version_id, file_id, user_id, version_no, sha256_hash, size, storage_path
    ) is False

    # 3. Modified state: File content altered in storage
    tampered_bytes = b"Encrypted / corrupted content"
    assert calculate_sha256(tampered_bytes) != sha256_hash
