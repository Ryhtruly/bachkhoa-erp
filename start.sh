#!/bin/bash

# ============================================================
#  🚀 BÁCH KHOA ERP - Script Chạy Nhanh
# ============================================================

# Màu sắc terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Đường dẫn gốc của project
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/dev/backend"
FRONTEND_DIR="$PROJECT_ROOT/dev/frontend"

BACKEND_PORT=8080
FRONTEND_PORT=5173

echo ""
echo -e "${CYAN}${BOLD}╔════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║      🏢 BÁCH KHOA ERP SYSTEM           ║${NC}"
echo -e "${CYAN}${BOLD}╚════════════════════════════════════════╝${NC}"
echo ""

# ---- Hàm kiểm tra port có đang dùng không ----
check_port() {
  local port=$1
  lsof -i :$port > /dev/null 2>&1
  return $?
}

# ---- Hàm kill process đang dùng port ----
kill_port() {
  local port=$1
  local pid=$(lsof -ti :$port)
  if [ -n "$pid" ]; then
    echo -e "  ${YELLOW}⚠️  Port $port đang bận (PID: $pid) → đang kill...${NC}"
    kill -9 $pid 2>/dev/null
    sleep 1
  fi
}

# ---- Kiểm tra môi trường ----
echo -e "${BLUE}${BOLD}[1/4] Kiểm tra môi trường...${NC}"

# Kiểm tra Python
if ! command -v python3 &> /dev/null; then
  echo -e "  ${RED}✗ Không tìm thấy Python 3. Hãy cài đặt Python 3.10+${NC}"
  exit 1
fi
echo -e "  ${GREEN}✓ Python: $(python3 --version)${NC}"

# Kiểm tra Node.js
if ! command -v node &> /dev/null; then
  echo -e "  ${RED}✗ Không tìm thấy Node.js. Hãy cài đặt Node.js 18+${NC}"
  exit 1
fi
echo -e "  ${GREEN}✓ Node.js: $(node --version)${NC}"

# Kiểm tra file .env
if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo -e "  ${YELLOW}⚠️  Không tìm thấy .env → Đang copy từ .env.example...${NC}"
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  echo -e "  ${YELLOW}   Nhớ điền thông tin Database vào file: $BACKEND_DIR/.env${NC}"
fi
echo -e "  ${GREEN}✓ File .env: OK${NC}"

echo ""

# ---- Giải phóng port nếu cần ----
echo -e "${BLUE}${BOLD}[2/4] Kiểm tra cổng mạng...${NC}"
kill_port $BACKEND_PORT
kill_port $FRONTEND_PORT
echo -e "  ${GREEN}✓ Port $BACKEND_PORT (Backend) & $FRONTEND_PORT (Frontend): Sẵn sàng${NC}"
echo ""

# ---- Khởi động Backend ----
echo -e "${BLUE}${BOLD}[3/4] Khởi động Backend (FastAPI)...${NC}"

cd "$BACKEND_DIR"

# Kích hoạt virtual env nếu có
if [ -d "venv" ]; then
  source venv/bin/activate
  echo -e "  ${GREEN}✓ Virtual environment: Đã kích hoạt${NC}"
else
  echo -e "  ${YELLOW}⚠️  Không có venv, dùng Python hệ thống${NC}"
fi

# Cài requirements nếu cần
if ! python3 -c "import fastapi" 2>/dev/null; then
  echo -e "  ${YELLOW}📦 Đang cài đặt dependencies backend...${NC}"
  pip install -r requirements.txt -q
fi

# Chạy backend
echo -e "  ${GREEN}▶ Đang khởi động server tại: http://localhost:$BACKEND_PORT${NC}"
uvicorn src.index:app --reload --port $BACKEND_PORT --log-level warning &
BACKEND_PID=$!
echo -e "  ${GREEN}✓ Backend PID: $BACKEND_PID${NC}"

# Chờ backend sẵn sàng
echo -n "  ⏳ Chờ backend khởi động"
for i in {1..15}; do
  sleep 1
  echo -n "."
  if curl -s http://localhost:$BACKEND_PORT/ > /dev/null 2>&1; then
    echo ""
    echo -e "  ${GREEN}✓ Backend đã sẵn sàng!${NC}"
    break
  fi
done
echo ""

# ---- Khởi động Frontend ----
echo -e "${BLUE}${BOLD}[4/4] Khởi động Frontend (React/Vite)...${NC}"

cd "$FRONTEND_DIR"

# Cài node_modules nếu chưa có
if [ ! -d "node_modules" ]; then
  echo -e "  ${YELLOW}📦 Đang cài đặt dependencies frontend...${NC}"
  npm install --silent
fi

echo -e "  ${GREEN}▶ Đang khởi động Vite tại: http://localhost:$FRONTEND_PORT${NC}"
npm run dev &
FRONTEND_PID=$!
echo -e "  ${GREEN}✓ Frontend PID: $FRONTEND_PID${NC}"

# Chờ frontend sẵn sàng
sleep 3

# ---- Tóm tắt ----
echo ""
echo -e "${CYAN}${BOLD}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║         ✅ HỆ THỐNG ĐÃ KHỞI ĐỘNG THÀNH CÔNG!     ║${NC}"
echo -e "${CYAN}${BOLD}╠════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}${BOLD}║${NC}  🌐 Frontend  : ${GREEN}http://localhost:$FRONTEND_PORT${NC}            ${CYAN}${BOLD}║${NC}"
echo -e "${CYAN}${BOLD}║${NC}  ⚙️  Backend   : ${GREEN}http://localhost:$BACKEND_PORT${NC}            ${CYAN}${BOLD}║${NC}"
echo -e "${CYAN}${BOLD}║${NC}  📚 API Docs  : ${GREEN}http://localhost:$BACKEND_PORT/docs${NC}        ${CYAN}${BOLD}║${NC}"
echo -e "${CYAN}${BOLD}╠════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}${BOLD}║${NC}  💡 Nhấn ${RED}Ctrl+C${NC} để tắt toàn bộ hệ thống           ${CYAN}${BOLD}║${NC}"
echo -e "${CYAN}${BOLD}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Mở trình duyệt (macOS)
if command -v open &> /dev/null; then
  sleep 2
  open "http://localhost:$FRONTEND_PORT"
fi

# ---- Bắt tín hiệu Ctrl+C để tắt sạch ----
cleanup() {
  echo ""
  echo -e "${YELLOW}${BOLD}⏹  Đang tắt hệ thống...${NC}"
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  # Kill bất kỳ process nào còn trên port
  kill_port $BACKEND_PORT
  kill_port $FRONTEND_PORT
  echo -e "${GREEN}✓ Đã tắt toàn bộ. Tạm biệt! 👋${NC}"
  echo ""
  exit 0
}

trap cleanup SIGINT SIGTERM

# Giữ script chạy
wait
