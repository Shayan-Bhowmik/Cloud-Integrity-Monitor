from fastapi import FastAPI, Request, status, Depends
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.auth import get_current_user_id
from app.routes import files

settings = get_settings()

app = FastAPI(title="Cairn API", docs_url=None, redoc_url=None)

# 1. CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 2. Consistent Error Response Format
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    if isinstance(exc.detail, dict) and "error_code" in exc.detail and "message" in exc.detail:
        content = exc.detail
    else:
        error_code = "HTTP_ERROR"
        if exc.status_code == status.HTTP_401_UNAUTHORIZED:
            error_code = "UNAUTHORIZED"
        elif exc.status_code == status.HTTP_403_FORBIDDEN:
            error_code = "FORBIDDEN"
        elif exc.status_code == status.HTTP_404_NOT_FOUND:
            error_code = "NOT_FOUND"
        content = {"error_code": error_code, "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content=content)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error_code": "VALIDATION_ERROR", "message": str(exc.errors()[0].get("msg", "Validation error"))},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error_code": "INTERNAL_SERVER_ERROR", "message": "An unexpected server error occurred."},
    )


# 3. Public Health Check
@app.get("/health", status_code=status.HTTP_200_OK)
def health_check():
    return {"status": "ok"}


# 4. Protected Test Route
@app.get("/api/auth-test", status_code=status.HTTP_200_OK)
def auth_test(user_id: str = Depends(get_current_user_id)):
    return {"user_id": user_id}


# 5. Include Routers
app.include_router(files.router)
