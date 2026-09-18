<#
.SYNOPSIS
    Purge Legacy Binary Backups from Git History (Windows / PowerShell)
.DESCRIPTION
    Script này thực hiện viết lại toàn bộ lịch sử commit (history rewrite) của Git bằng git-filter-repo.
    KHÔNG CHẠY script này một cách tự ý khi chưa có sự đồng thuận của toàn bộ team!
    Sau khi chạy, commit hash sẽ thay đổi, đòi hỏi git push --force và mọi thành viên
    phải clone lại repository hoặc reset branch tương ứng.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

Write-Host "===> Kiểm tra cài đặt git-filter-repo..." -ForegroundColor Cyan
if (-not (Get-Command git-filter-repo -ErrorAction SilentlyContinue)) {
    Write-Error "LỖI: Chưa cài đặt git-filter-repo. Vui lòng cài đặt bằng: pip install git-filter-repo"
    exit 1
}

$confirmation = Read-Host "CẢNH BÁO: Thao tác này sẽ viết lại git history. Bạn có chắc chắn muốn tiếp tục? (y/N)"
if ($confirmation -notmatch "^[Yy]$") {
    Write-Host "Đã hủy thao tác." -ForegroundColor Yellow
    exit 0
}

Write-Host "===> Bắt đầu purge các file binary backup khỏi toàn bộ lịch sử Git..." -ForegroundColor Cyan
git-filter-repo --invert-paths `
    --path-glob "backups/*.xlsx" `
    --path-glob "backups/backup_v1/static/generated_contracts/*.docx" `
    --path-glob "backups/backup_v1/static/*.pdf" `
    --path-glob "backups/backup_v1/static/*.png" `
    --path-glob "backups/backup_v1/templates/*.docx" `
    --path-glob "dev/backend/backups/*.json" `
    --force

Write-Host "===> Thu dọn và tối ưu hóa git database..." -ForegroundColor Cyan
git reflog expire --expire=now --all
git gc --prune=now --aggressive

Write-Host "===> Hoàn tất! Dung lượng repository đã được tối ưu." -ForegroundColor Green
Write-Host "Bước tiếp theo:" -ForegroundColor Yellow
Write-Host "1. Kiểm tra lại git log để đảm bảo không mất commit nghiệp vụ."
Write-Host "2. Thông báo cho toàn team trước khi chạy: git push origin --force --all"
