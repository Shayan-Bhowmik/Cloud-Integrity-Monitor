from functools import lru_cache
from typing import Annotated
import jwt
from fastapi import Depends, Header, HTTPException, status
from app.config import get_settings

# Supabase projects sign user tokens either with the legacy shared secret (HS256)
# or with asymmetric signing keys published at the project's JWKS endpoint.
ASYMMETRIC_ALGORITHMS = {"ES256", "RS256"}


@lru_cache()
def get_jwks_client() -> jwt.PyJWKClient:
    settings = get_settings()
    jwks_url = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return jwt.PyJWKClient(jwks_url, cache_keys=True)


def decode_token(token: str) -> dict:
    settings = get_settings()
    algorithm = jwt.get_unverified_header(token).get("alg")

    if algorithm == "HS256":
        key = settings.SUPABASE_JWT_SECRET
    elif algorithm in ASYMMETRIC_ALGORITHMS:
        key = get_jwks_client().get_signing_key_from_jwt(token).key
    else:
        raise jwt.InvalidAlgorithmError(f"Unsupported token algorithm: {algorithm}")

    # The accepted algorithm list is pinned per branch so a token cannot pick a different key type.
    return jwt.decode(token, key, algorithms=[algorithm], options={"verify_aud": False})


def get_current_user_id(
    authorization: Annotated[str | None, Header()] = None
) -> str:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error_code": "MISSING_TOKEN", "message": "Authorization header is required"},
        )

    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error_code": "INVALID_TOKEN_FORMAT", "message": "Token must be 'Bearer <token>'"},
        )

    token = parts[1]

    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error_code": "INVALID_PAYLOAD", "message": "Token subject (sub) missing"},
            )
        return str(user_id)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error_code": "TOKEN_EXPIRED", "message": "Token has expired"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error_code": "INVALID_TOKEN", "message": "Token verification failed"},
        )
