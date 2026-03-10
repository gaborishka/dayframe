#!/usr/bin/env bash
# Deploy DayFrame model serving to GPU Droplet.
# Usage: ./deploy.sh <droplet-ip> <adapter-path>
set -euo pipefail

DROPLET_IP="${1:?Usage: deploy.sh <droplet-ip> <adapter-path>}"
ADAPTER_PATH="${2:?Provide adapter directory path}"
REMOTE_DIR="/opt/dayframe-model"

echo "==> Uploading adapter to ${DROPLET_IP}..."
ssh "root@${DROPLET_IP}" "mkdir -p ${REMOTE_DIR}/final_adapter"
rsync -avz "${ADAPTER_PATH}/" "root@${DROPLET_IP}:${REMOTE_DIR}/final_adapter/"

echo "==> Installing vLLM (if needed)..."
ssh "root@${DROPLET_IP}" "pip install vllm>=0.6.0 2>/dev/null || true"

echo "==> Detecting VPC-internal IP..."
VPC_IP=$(ssh "root@${DROPLET_IP}" "ip -4 addr show eth1 2>/dev/null | grep -oP 'inet \K[\d.]+' || echo '0.0.0.0'")
echo "    Binding to VPC IP: ${VPC_IP} (SPEC requires VPC-internal only)"

echo "==> Configuring firewall (restrict port 8000 to VPC)..."
ssh "root@${DROPLET_IP}" "ufw allow from 10.0.0.0/8 to any port 8000 2>/dev/null || true"
ssh "root@${DROPLET_IP}" "ufw deny 8000 2>/dev/null || true"

echo "==> Starting vLLM server..."
ssh "root@${DROPLET_IP}" "cd ${REMOTE_DIR} && nohup vllm serve Qwen/Qwen3-8B \
  --enable-lora \
  --lora-modules dayframe-adapter=./final_adapter \
  --max-model-len 4096 \
  --dtype bfloat16 \
  --gpu-memory-utilization 0.85 \
  --host ${VPC_IP} \
  --port 8000 \
  --enforce-eager \
  > vllm.log 2>&1 &"

echo "==> Waiting for server to start..."
sleep 30

echo "==> Health check..."
ssh "root@${DROPLET_IP}" "curl -s http://${VPC_IP}:8000/v1/models | python3 -m json.tool"

echo "==> Done. VPC-internal endpoint: http://${VPC_IP}:8000"
echo "    NOTE: Port 8000 is firewalled to VPC traffic only per SPEC.md §10.3"
