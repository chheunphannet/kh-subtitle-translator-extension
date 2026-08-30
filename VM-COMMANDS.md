# 🐧 Linux VM / VPS Command Cheat Sheet

> **Quick Reference Guide** for managing and maintaining the **FastAPI Erase Server**, **Redis**, **Systemd Services**, and **Playwright/EasyOCR** on your Linux VPS (Ubuntu/Debian).

---

## ⚡ Top 5 Daily Commands (Quick Copy-Paste)

| Action | Command |
| :--- | :--- |
| **View Live Logs** | `sudo journalctl -u erase-server -f` |
| **Restart Server** | `sudo systemctl restart erase-server` |
| **Check Server Status** | `sudo systemctl status erase-server` |
| **Clear All Redis Cache** | `redis-cli flushall` |
| **Update Code & Restart** | `cd ~/kh-translator && git pull && sudo systemctl restart erase-server` |

---

## 🛠 1. Service Management (`systemd`)

The Erase Server runs as a background service managed by `systemd` under the unit name `erase-server.service`.

### Check Status
```bash
sudo systemctl status erase-server
```

### Restart Server (e.g., after config change or code update)
```bash
sudo systemctl restart erase-server
```

### Start / Stop Service
```bash
sudo systemctl start erase-server
sudo systemctl stop erase-server
```

### Enable / Disable Autostart on Boot
```bash
sudo systemctl enable erase-server   # Enable autostart on system boot
sudo systemctl disable erase-server  # Disable autostart
```

### Reload Configuration (After editing `/etc/systemd/system/erase-server.service`)
```bash
sudo systemctl daemon-reload
sudo systemctl restart erase-server
```

---

## 🌍 2. Check Environment Variables & Runtime Settings

### Check Service Environment Variables (Systemd)
```bash
# View all environment variables configured for the erase-server service
sudo systemctl show erase-server --property=Environment

# View environment variables of the currently running uvicorn process
cat /proc/$(pgrep -f uvicorn | head -n 1)/environ | tr '\0' '\n'

# View the systemd service file directly
cat /etc/systemd/system/erase-server.service
```

### Check Shell Environment Variables
```bash
# Print all system/shell environment variables
printenv
# or
env

# Search for specific variables
printenv REDIS_URL
printenv PATH
env | grep -i redis
```

### Check Python Virtual Environment (`.venv`)
```bash
# Activate virtual environment
source ~/kh-translator/server/.venv/bin/activate

# Check active Python interpreter path
which python
which python3

# Check Python version
python3 --version

# List installed packages
pip list
# or
pip freeze
```

---

## 📜 3. Real-Time Logs & Debugging (`journalctl`)

### Follow Live Logs in Real Time
```bash
sudo journalctl -u erase-server -f
```

### View Last 100 Lines of Logs
```bash
sudo journalctl -u erase-server -n 100 --no-pager
```

### View Logs Since Today's Boot
```bash
sudo journalctl -u erase-server -b
```

### View Errors and Critical Logs Only
```bash
sudo journalctl -u erase-server -p err..emerg -f
```

---

## 🔄 4. Update Code & Dependencies from GitHub

### Fast One-Liner Update
```bash
cd ~/kh-translator && git pull origin feature/manga-split-pipeline-two-step && sudo systemctl restart erase-server
```

### Full Update (With New Dependencies / Python Packages)
```bash
cd ~/kh-translator

# 1. Pull latest git commits
git pull origin feature/manga-split-pipeline-two-step

# 2. Activate Python virtual environment & install requirements
source server/.venv/bin/activate
pip install -r server/requirements.txt

# 3. Update Playwright browser if needed
playwright install chromium
sudo playwright install-deps chromium

# 4. Restart service
sudo systemctl restart erase-server

# 5. Verify live status
sudo systemctl status erase-server
```

---

## 🗄 5. Redis Cache Operations

### Check Redis Status
```bash
sudo systemctl status redis-server
```

### Restart Redis
```bash
sudo systemctl restart redis-server
```

### Clear All Cached Images & Jobs
```bash
redis-cli flushall
```

### Check Cached Keys Count & Memory
```bash
redis-cli dbsize          # Number of stored keys
redis-cli info memory     # Memory consumed by Redis
```

### Monitor Redis Live Operations
```bash
redis-cli monitor
```

---

## 🌐 6. Network, Ports & Health Testing

### Test Local Health Endpoint
```bash
curl http://localhost:8000/health
# or (via port 80 redirect)
curl http://localhost/health
```

### Check Active Listening Ports (Port 80, 8000, 6379)
```bash
sudo ss -tulpn | grep -E '80|8000|6379'
# or
sudo netstat -tulpn | grep -E '80|8000|6379'
```

### Check / Verify Port Forwarding (Port 80 -> 8000)
```bash
sudo iptables -t nat -L PREROUTING -n -v
```

If port 80 redirection is missing, restore it:
```bash
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8000
sudo netfilter-persistent save
```

---

## 📊 7. System Resource Monitoring & Memory Safety

### Check RAM and Swap Memory Usage
```bash
free -h
```
*Expected: 4GB+ Swap space should be available.*

### Real-Time CPU & Process Monitor
```bash
htop
# If htop is not installed: sudo apt install -y htop
```

### Check Disk Space
```bash
df -h
```

### Kill Orphan / Stuck Python Workers
```bash
sudo pkill -f uvicorn
sudo systemctl start erase-server
```

---

## 🚀 8. Fresh VM Setup / Reinstallation

To set up a brand new Ubuntu/Debian VM from scratch:

```bash
# 1. Download setup script
curl -sSL https://raw.githubusercontent.com/chheunphannet/kh-subtitle-translator-extension/feature/manga-split-pipeline-two-step/server/setup_vm.sh -o setup_vm.sh

# 2. Make executable and run
chmod +x setup_vm.sh
./setup_vm.sh
```

---

## 📁 Key File Locations on VM

| File / Path | Purpose |
| :--- | :--- |
| `~/kh-translator/` | Main application root folder |
| `~/kh-translator/server/` | FastAPI server code directory |
| `~/kh-translator/server/.venv/` | Python virtual environment |
| `/etc/systemd/system/erase-server.service` | Systemd service definition file |
| `/swapfile` | 4GB Swap memory file |
| `/var/log/syslog` / `journalctl` | System and server logs |
