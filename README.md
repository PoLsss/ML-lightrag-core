# 🎓 UIT Master Chatbot - LightRAG

A chatbot system for answering questions about the Master's program at UIT (University of Information Technology), using LightRAG for information retrieval and processing.

## 📋 Table of Contents

- [System Requirements](#-system-requirements)
- [Installation](#-installation)
  - [1. Clone repository](#1-clone-repository)
  - [2. Setup Python environment](#2-setup-python-environment)
  - [3. Configure environment](#3-configure-environment)
  - [4. Start Docker](#4-start-docker)
  - [5. Setup Custom WebUI](#5-setup-custom-webui)
- [Usage](#-usage)
- [Project Structure](#-project-structure)

---

## 🖥️ System Requirements

### Required:
- **Python**: 3.10 or higher
- **Docker Desktop**: [Download here](https://www.docker.com/products/docker-desktop/)
- **Node.js**: 18.x or higher (for WebUI)
- **npm**: 9.x or higher (comes with Node.js)
- **Git**: [Download here](https://git-scm.com/downloads)

### Check installed versions:
```bash
python --version      # Python 3.10+
node --version        # v18.0.0+
npm --version         # 9.0.0+
docker --version      # Docker 24.0+
git --version         # git 2.0+
```

---

## 🚀 Installation

### 1. Clone repository

```bash
# Create project folder and clone
git clone https://github.com/PoLsss/ML-lightrag-core.git
cd ML-lightrag-core
```

### 2. Setup Python environment

**Windows:**
```powershell
# Create virtual environment
python -m venv venv

# Activate environment
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

**Linux/macOS:**
```bash
# Create virtual environment
python -m venv venv

# Activate environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure environment

```bash
cd LightRag
cp env.example .env
```
config your setup in the .env file

### 4. Start Docker

> ⚠️ **Note**: Make sure Docker Desktop is running before executing this command!

**Windows:**
```powershell
docker compose up -d
```

**Linux/macOS:**
```bash
sudo docker compose up -d
```

Wait about 10-30 seconds for the containers to start. Then access:
- **LightRAG WebUI (original)**: http://localhost:9621/webui/

---

### 5. Setup Custom WebUI

The custom WebUI is developed separately with a better interface and additional features.

#### 5.1. Install Node.js (if not installed)

**Windows:**
Install Node.js LTS on Windows via CMD / PowerShell

 1. Open **PowerShell** (Run as Administrator)

 2. Run this command to download and install Node.js LTS:
```powershell
winget install OpenJS.NodeJS.LTS

3. Open a new PowerShell and verify:
   ```powershell
   node --version   # Should display v18.x.x or higher
   npm --version    # Should display 9.x.x or higher
   ```

**Linux (Ubuntu/Debian):**
```bash
# Install Node.js 20.x LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version
npm --version
```

**macOS:**
```bash
# Using Homebrew
brew install node

# Or download from https://nodejs.org/
```

#### 5.2. Install WebUI dependencies

```bash
# From the ML-lightrag-core root folder, navigate to webui folder
cd webui

# Install packages
npm install
```

> 💡 **Note**: This process may take 2-5 minutes depending on network speed.

#### 5.3. Configure WebUI

Create `.env.development` file in the `webui` folder:

```bash
# Windows (PowerShell)
cp .env.example .env.development

# Linux/macOS
cp .env.example .env.development
```

Open `webui/.env.development` and edit:

```env
# LightRAG backend API endpoint
VITE_API_BASE_URL=http://localhost:9621

# OpenAI API Key (get from https://platform.openai.com/api-keys)
VITE_OPENAI_API_KEY=sk-your-api-key-here

# Model to use
VITE_OPENAI_MODEL=gpt-4o-mini
```

#### 5.4. Run WebUI

```bash
# Make sure you're in the webui folder
cd webui

# Run development server
npm run dev
```

WebUI will run at: **http://localhost:3000**

---

## 📖 Usage

### Main tabs:

| Tab | Function |
|-----|----------|
| **💬 Chat** | Chat with the bot, ask questions about UIT |
| **📊 Knowledge Graph** | View the extracted knowledge graph |
| **📁 Documents** | Manage documents (upload, view, delete) |
| **📜 Histories** | View conversation history |

### Query modes:

- **Local**: Search in narrow scope, specific answers
- **Global**: Search for overview, general answers
- **Hybrid**: Combination of Local and Global
- **Mix** (default): Automatically selects the most suitable mode

### Agent Mode:
Enable Agent mode for more complex reasoning capabilities and automatic tool selection.

---

## 📁 Project Structure

```
ML-lightrag-core/
├── LightRag/              # LightRAG core (backend API)
│   ├── .env               # Backend configuration (API keys, database)
│   ├── docker-compose.yml # Docker configuration
│   ├── lightrag/          # LightRAG source code
│   └── data/              # Indexed data
├── webui/                 # Custom WebUI (frontend)
│   ├── src/               # React source code
│   ├── .env.development   # Frontend configuration
│   └── package.json       # Dependencies
├── requirements.txt       # Python dependencies
└── README.md              # This file
```

---

## ❓ Troubleshooting

### Common errors:

**1. Docker won't start:**
```
Error: Cannot connect to the Docker daemon
```
→ Open Docker Desktop and wait for it to fully start.

**2. npm install fails:**
```
npm ERR! code ENOENT
```
→ Check if Node.js is installed correctly: `node --version`

**3. WebUI can't connect to backend:**
```
Network Error / 404
```
→ Check if Docker containers are running: `docker ps`
→ Make sure `VITE_API_BASE_URL=http://localhost:9621` is in `.env.development`

**4. API Key error:**
```
Invalid API Key
```
→ Check the API key in `.env.development` file



