#!/usr/bin/env bash
# =============================================================================
# Purge Legacy Binary Backups from Git History
# =============================================================================
# CHÚ Ý:
# Script này thực hiện viết lại toàn bộ lịch sử commit (history rewrite) của Git.
# KHÔNG CHẠY script này một cách tự ý khi chưa có sự đồng thuận của toàn bộ team!
# Sau khi chạy, commit hash sẽ thay đổi, đòi hỏi git push --force và mọi thành viên
# phải clone lại repository hoặc reset branch tương ứng.
# =============================================================================

set -euo pipefail

echo "===> Kiểm tra cài đặt git-filter-repo..."
if ! command -v git-filter-repo &> /dev/null; then
    echo "LỖI: Chưa cài đặt git-filter-repo. Vui lòng chạy: pip install git-filter-repo"
    exit 1
fi

read -p "CẢNH BÁO: Thao tác này sẽ viết lại git history. Bạn có chắc chắn muốn tiếp tục? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Đã hủy thao tác."
    exit 0
fi

echo "===> Bắt đầu purge các file binary backup khỏi toàn bộ lịch sử Git..."

git-filter-repo --invert-paths \
    --path-glob 'backups/*.xlsx' \
    --path-glob 'backups/backup_v1/static/generated_contracts/*.docx' \
    --path-glob 'backups/backup_v1/static/*.pdf' \
    --path-glob 'backups/backup_v1/static/*.png' \
    --path-glob 'backups/backup_v1/templates/*.docx' \
    --path-glob 'dev/backend/backups/*.json' \
    --force

echo "===> Thu dọn và tối ưu hóa git database..."
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo "===> Hoàn tất! Dung lượng repository đã được tối ưu."
echo "Bước tiếp theo:"
echo "1. Kiểm tra lại git log để đảm bảo không mất commit nghiệp vụ."
echo "2. Thông báo cho toàn team trước khi chạy: git push origin --force --all"
