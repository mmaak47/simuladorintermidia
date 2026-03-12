#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Azure VM setup for DOOH Simulator
# Run this ONCE after creating the VM via the Azure CLI commands
# in DEPLOY.md
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

echo "══════ Updating system ══════"
sudo apt-get update && sudo apt-get upgrade -y

echo "══════ Installing Docker ══════"
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "══════ Configuring Docker ══════"
sudo usermod -aG docker "$USER"
sudo systemctl enable docker
sudo systemctl start docker

echo "══════ Installing useful tools ══════"
sudo apt-get install -y git htop tmux

echo "══════ Creating project directory ══════"
mkdir -p ~/dooh-simulator

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Log out and back in (for docker group)"
echo "  2. cd ~/dooh-simulator"
echo "  3. Clone/copy your project files"
echo "  4. Copy SAM weights to apps/vision/sam_weights/"
echo "  5. Create .env file with SERVER_IP=<your-vm-ip>"
echo "  6. docker compose up --build -d"
echo ""
