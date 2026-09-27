FROM python:3.12-slim

WORKDIR /app

# System deps for scikit-learn/pandas wheels (mostly unnecessary with manylinux wheels, but
# keeps the build resilient if a package needs to compile something).
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py train.py ./
COPY model ./model

# Render sets $PORT at runtime; default to 8000 for local `docker run`.
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
