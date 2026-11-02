# 🚀 Docker & Kubernetes Deployment Guide for Hackathon Portal

This directory contains production-ready Kubernetes manifests and orchestration configs for the Hackathon Portal.

---

## 🌐 The Two Deployment Links

Once deployed via Ingress or your reverse proxy, you have **two separate links**:

| Link Role | URL Example (Subdomain) | URL Example (Single Domain) | Intended Audience |
| :--- | :--- | :--- | :--- |
| **1. Public Interface** | `https://portal.yourhackathon.org/` | `https://yourhackathon.org/` | Participants, Attendees, Judges (Registration, Schedule, Payment, Passes) |
| **2. Admin Interface** | `https://admin.yourhackathon.org/` | `https://yourhackathon.org/admin/login` | Event Organizers & Core Staff (Review registrations, verify fees, check-ins, dispatch certificates) |

---

## 🐳 Part 1: Running with Docker

### 1. Build and Run with Docker Compose (Fastest & Simplest)
Runs both the Flask web portal and a dedicated MySQL 8.0 container with persistent volumes:

```bash
docker compose up -d --build
```

- **Public Interface:** [http://localhost:5000/](http://localhost:5000/)
- **Admin Interface:** [http://localhost:5000/admin/login](http://localhost:5000/admin/login)
- **Stop containers:** `docker compose down`

### 2. Manual Docker Build & Push
To push to your Docker Hub repository for Kubernetes:

```bash
# 1. Build Docker image
docker build -t your-dockerhub-username/hackathon-portal:latest .

# 2. Push to Docker Hub
docker push your-dockerhub-username/hackathon-portal:latest
```

---

## ☸️ Part 2: Deploying to Kubernetes (k8s)

### Step-by-Step Deployment:

1. **Deploy Namespace:**
   ```bash
   kubectl apply -f k8s/01-namespace.yaml
   ```

2. **Configure Secrets & ConfigMap:**
   *(Edit `k8s/02-secrets.yaml` with your custom passwords/keys)*
   ```bash
   kubectl apply -f k8s/02-secrets.yaml
   kubectl apply -f k8s/03-configmap.yaml
   ```

3. **Deploy MySQL Database:**
   ```bash
   kubectl apply -f k8s/04-mysql.yaml
   ```

4. **Deploy Hackathon Portal Web Service:**
   ```bash
   kubectl apply -f k8s/05-app-deployment.yaml
   ```

5. **Deploy Ingress (Routes Public & Admin links with SSL):**
   ```bash
   kubectl apply -f k8s/06-ingress.yaml
   ```

6. **Verify Running Pods & Services:**
   ```bash
   kubectl get pods -n hackathon-portal
   kubectl get svc -n hackathon-portal
   kubectl get ingress -n hackathon-portal
   ```

---

## 🛠️ How Docker & Kubernetes Work in this Portal

1. **Docker (Containerization):**
   - Packages Python 3.11, Gunicorn, all Python libraries, static assets, and templates into an isolated, reproducible container image.
   - Guarantees the portal runs identically on any cloud (AWS EKS, Google GKE, Azure AKS, DigitalOcean, or local Minikube).

2. **Kubernetes (Orchestration & High Availability):**
   - **Pod Scaling:** Runs multiple replicas (`replicas: 2+`) of the web application. When 1,000 students rush to register before deadline, traffic is load-balanced across all pods.
   - **Self-Healing:** If any Gunicorn process or pod crashes, Kubernetes automatically restarts it in seconds with zero downtime.
   - **Rolling Updates:** Deploying new code updates pods one by one, ensuring participants never experience downtime.
   - **Ingress Controller:** Serves as the entrance gate, automatically managing SSL certificates (HTTPS) and routing traffic to either the public pages or the isolated admin interface.
