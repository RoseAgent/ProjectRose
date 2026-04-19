FROM pytorch/pytorch:2.3.1-cuda12.1-cudnn8-runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg build-essential && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/
COPY main.py .

RUN mkdir -p data/recordings data/models

EXPOSE 8040

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8040"]
