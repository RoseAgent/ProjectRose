from contextlib import asynccontextmanager
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models.database import create_pool, close_pool, init_schema
from app.routes.transcribe import router as transcribe_router
from app.routes.speakers import router as speakers_router
from app.routes.sessions import router as sessions_router
from app.routes.training import router as training_router
from app.ws.live_handler import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_pool()
    await init_schema()
    yield
    await close_pool()


app = FastAPI(title="RoseSpeech", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(transcribe_router)
app.include_router(speakers_router)
app.include_router(sessions_router)
app.include_router(training_router)
app.include_router(ws_router)


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8040)
