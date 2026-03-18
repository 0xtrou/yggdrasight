FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl gcc python3-dev build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY pyproject.toml uv.lock* ./

RUN uv sync --no-dev

COPY . .

ENV FLASK_HOST=0.0.0.0
ENV FLASK_PORT=5001
ENV PYTHONUNBUFFERED=1

EXPOSE 5001

CMD ["uv", "run", "python", "run.py"]
