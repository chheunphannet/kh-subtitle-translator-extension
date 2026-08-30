#!/usr/bin/env bash
set -e

# Get current user and home directory
CURRENT_USER=$(whoami)
USER_HOME=$HOME
APP_DIR="$USER_HOME/kh-translator"

echo "=== 1. Setting up 4GB Swap Space ==="
if [ ! -f /swapfile ]; then
    sudo fallocate -l 4G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "Swap space successfully created."
else
    echo "Swap space already exists, skipping."
fi

echo "=== 2. Updating System and Installing Packages ==="
sudo apt-get update
sudo apt-get install -y python3-pip python3-venv redis-server libgl1 libglib2.0-0 git

echo "=== 3. Starting Redis Cache ==="
sudo systemctl start redis-server
sudo systemctl enable redis-server

echo "=== 4. Cloning the GitHub Repository ==="
rm -rf "$APP_DIR"
git clone -b feature/manga-split-pipeline-two-step \
  https://github.com/chheunphannet/kh-subtitle-translator-extension.git \
  "$APP_DIR"

cd "$APP_DIR/server"

# Dynamically write requirements.txt if it is missing from Git
if [ ! -f requirements.txt ]; then
    echo "requirements.txt is missing from git, creating it..."
    cat << 'EOF' > requirements.txt
fastapi
uvicorn
python-multipart
redis
easyocr
opencv-python-headless
numpy
slowapi
playwright
EOF
fi

echo "=== 5. Setting up Python Virtual Environment ==="
python3 -m venv .venv
source .venv/bin/activate

echo "=== 6. Installing Python dependencies ==="
pip install --upgrade pip
pip install -r requirements.txt
pip install playwright

echo "=== 7. Downloading EasyOCR Model Weights (Pre-download to prevent race conditions) ==="
# Running a quick script in Python to pre-download the models safely in a single thread
.venv/bin/python3 -c "import easyocr; easyocr.Reader(['en', 'ja'])"

echo "=== 8. Installing Playwright Chromium browser ==="
.venv/bin/playwright install chromium
sudo .venv/bin/playwright install-deps chromium

echo "=== 9. Configuring Port Forwarding (Port 80 -> 8000) ==="
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8000
# Install and configure iptables-persistent non-interactively
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | sudo debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | sudo debconf-set-selections
sudo apt-get install -y iptables-persistent
# Save the iptables rule so it survives reboots
sudo netfilter-persistent save

echo "=== 10. Creating Systemd Service for Auto-start ==="
sudo tee /etc/systemd/system/erase-server.service > /dev/null <<EOF
[Unit]
Description=Erase Server API FastAPI Application
After=network.target redis-server.service

[Service]
User=$CURRENT_USER
WorkingDirectory=$APP_DIR/server
ExecStart=$APP_DIR/server/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
Environment=WORKER_COUNT=2
Environment=REDIS_URL=redis://localhost:6379
Environment=HOME=$USER_HOME
Environment=PRODUCTION=true

[Install]
WantedBy=multi-user.target
EOF

echo "=== 11. Starting the Erase Server Service ==="
sudo systemctl daemon-reload
sudo systemctl start erase-server
sudo systemctl enable erase-server

echo "=== Setup Complete! ==="
echo "The server is running on port 8000 (and forwarded to port 80)."

echo "You can check status using: sudo systemctl status erase-server"
echo "Or view live logs using: sudo journalctl -u erase-server -f"
