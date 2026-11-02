# Multi-platform production Dockerfile for Hackathon Portal
FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_ENV=production \
    PORT=5000

# Set working directory
WORKDIR /app

# Install minimal OS dependencies for healthchecks & network operations
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first for optimal Docker layer caching
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . /app

# Create necessary upload/instance directories and set safe non-root permissions
RUN mkdir -p /app/instance /app/app/static/certificates/templates /app/app/static/certificates/generated && \
    useradd --create-home --user-group appuser && \
    chown -R appuser:appuser /app

# Switch to non-root user for security best practice
USER appuser

# Expose HTTP port
EXPOSE 5000

# Container healthcheck using public health/config endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://127.0.0.1:5000/api/config || exit 1

# Production WSGI server command (Gunicorn with 3 workers and 2 threads)
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "3", "--threads", "2", "--timeout", "120", "wsgi:app"]
