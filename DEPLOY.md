# Deploy - DOOH Simulator no Azure

Guia de deploy com foco em custo baixo e ambiente fluido para desenvolvimento remoto.

Regiao recomendada: chilecentral
SKU recomendado: Standard_B2as_v2 (2 vCPU, 8 GB RAM, burstable)
Resource group: dooh

---

## Arquitetura

Internet -> Nginx (:80) -> Next.js Web (:3000)
                      -> Vision API (:8000)

VM: Standard_B2as_v2 (2 vCPU AMD, 8 GB RAM, disco 64 GB)
SO: Ubuntu 24.04 LTS

---

## Passo 1 - Instalar Azure CLI (Windows)

```powershell
winget install -e --id Microsoft.AzureCLI
az login
```

---

## Passo 2 - Criar a VM

```powershell
# Resource group
az group create --name dooh --location chilecentral

# VM
az vm create `
  --resource-group dooh `
  --name dooh-vm `
  --image Ubuntu2404 `
  --size Standard_B2as_v2 `
  --admin-username dooh `
  --generate-ssh-keys `
  --os-disk-size-gb 64 `
  --public-ip-sku Standard

# Abrir portas
az vm open-port --resource-group dooh --name dooh-vm --port 80 --priority 1000
az vm open-port --resource-group dooh --name dooh-vm --port 443 --priority 1001
az vm open-port --resource-group dooh --name dooh-vm --port 3000 --priority 1002
az vm open-port --resource-group dooh --name dooh-vm --port 8000 --priority 1003
```

Anote o IP publico retornado em publicIpAddress.

---

## Passo 3 - Conectar na VM

```powershell
ssh dooh@<IP_DA_VM>
```

---

## Passo 4 - Setup da VM

Dentro da VM:

```bash
sudo apt-get update && sudo apt-get upgrade -y

# Docker
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin git tmux htop
sudo usermod -aG docker $USER
mkdir -p ~/dooh-simulator
```

Saia e conecte de novo para aplicar o grupo docker.

---

## Passo 5 - Copiar projeto para a VM

Opcao A (Git):

```bash
cd ~/dooh-simulator
git clone https://github.com/SEU_USUARIO/SEU_REPO.git .
```

Opcao B (SCP) no Windows:

```powershell
tar --exclude="node_modules" --exclude=".next" --exclude="*.pth" --exclude="yolov8n.pt" --exclude="__pycache__" -czf dooh-project.tar.gz -C "C:\Developing" .
scp dooh-project.tar.gz dooh@<IP_DA_VM>:~/dooh-simulator/
ssh dooh@<IP_DA_VM> "cd ~/dooh-simulator && tar -xzf dooh-project.tar.gz && rm dooh-project.tar.gz"
```

---

## Passo 6 - SAM weights

```powershell
scp "C:\Developing\apps\vision\sam_weights\sam_vit_h_4b8939.pth" dooh@<IP_DA_VM>:~/dooh-simulator/apps/vision/sam_weights/
```

Ou baixar direto na VM:

```bash
cd ~/dooh-simulator/apps/vision/sam_weights
wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth
```

---

## Passo 7 - Variaveis de ambiente

Na VM, na raiz do projeto:

```bash
cd ~/dooh-simulator
echo "SERVER_IP=$(curl -s ifconfig.me)" > .env
cat .env
```

---

## Passo 8 - Subir containers

```bash
cd ~/dooh-simulator
docker compose up --build -d
docker compose ps
docker compose logs -f
```

---

## Passo 9 - Migracao e seed

```bash
docker compose exec web sh -c "cd apps/web && npx prisma migrate deploy && npx tsx prisma/seed.mts"
```

---

## URLs

- Simulador: http://<IP_DA_VM>/simulator
- Admin: http://<IP_DA_VM>/admin
- Vision docs: http://<IP_DA_VM>/api/vision/docs
- Health: http://<IP_DA_VM>/health

---

## Comandos uteis

```bash
docker compose ps
docker compose logs -f web
docker compose logs -f vision
docker compose up --build -d
docker compose down
docker compose down -v
```

---

## Custos estimados

- VM Standard_B2as_v2: ~USD 30-35/mes
- Disco 64 GB: ~USD 8/mes
- IP publico: ~USD 4/mes
- Total: ~USD 42-47/mes

Se desligar fora do horario de uso, o gasto mensal cai bastante.

Parar e iniciar:

```powershell
az vm deallocate --resource-group dooh --name dooh-vm
az vm start --resource-group dooh --name dooh-vm
az vm show -d --resource-group dooh --name dooh-vm --query publicIps -o tsv
```

Opcional: fixar IP estatico

```powershell
az network public-ip update --resource-group dooh --name dooh-vmPublicIP --allocation-method Static
```

---

## Cleanup

```powershell
az group delete --name dooh --yes --no-wait
```
