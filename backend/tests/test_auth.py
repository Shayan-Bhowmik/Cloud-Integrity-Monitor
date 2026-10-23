from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException

from app import auth

HS_SECRET = "test-jwt-secret-for-hs256-tokens-0123456789"
USER_ID = "0e6a4242-bf3f-4915-9629-8d8324de5849"


@pytest.fixture(autouse=True)
def fake_settings(monkeypatch):
    monkeypatch.setattr(
        auth, "get_settings",
        lambda: SimpleNamespace(SUPABASE_JWT_SECRET=HS_SECRET, SUPABASE_URL="https://example.supabase.co"),
    )


@pytest.fixture
def es256_key(monkeypatch):
    private_key = ec.generate_private_key(ec.SECP256R1())
    fake_client = SimpleNamespace(get_signing_key_from_jwt=lambda token: SimpleNamespace(key=private_key.public_key()))
    monkeypatch.setattr(auth, "get_jwks_client", lambda: fake_client)
    return private_key


def test_accepts_legacy_hs256_token():
    token = jwt.encode({"sub": USER_ID}, HS_SECRET, algorithm="HS256")
    assert auth.get_current_user_id(f"Bearer {token}") == USER_ID


def test_accepts_es256_token_from_jwks(es256_key):
    token = jwt.encode({"sub": USER_ID, "aud": "authenticated"}, es256_key, algorithm="ES256")
    assert auth.get_current_user_id(f"Bearer {token}") == USER_ID


def test_rejects_es256_token_signed_by_other_key(es256_key):
    other_key = ec.generate_private_key(ec.SECP256R1())
    token = jwt.encode({"sub": USER_ID}, other_key, algorithm="ES256")
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user_id(f"Bearer {token}")
    assert exc.value.detail["error_code"] == "INVALID_TOKEN"


def test_rejects_unsigned_token():
    token = jwt.encode({"sub": USER_ID}, None, algorithm="none")
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user_id(f"Bearer {token}")
    assert exc.value.status_code == 401


def test_rejects_missing_header():
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user_id(None)
    assert exc.value.detail["error_code"] == "MISSING_TOKEN"
