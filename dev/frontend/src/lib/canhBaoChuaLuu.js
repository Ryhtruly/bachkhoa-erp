/**
 * Chốt chặn "còn thay đổi chưa lưu".
 *
 * Sơ đồ quy trình nằm sâu ba tầng (App → Contracts → ContractWorkspace →
 * ContractWorkflowDesigner), trong khi những nút làm người dùng rời khỏi nó lại
 * nằm rải ở cả ba tầng trên. Luồn một prop xuyên qua từng tầng chỉ để hỏi "còn
 * gì chưa lưu không" là bắt ba file không liên quan phải biết chuyện của file
 * thứ tư.
 *
 * Nên đảo chiều: màn nào đang giữ dữ liệu chưa lưu thì tự đăng ký một chốt chặn.
 * Ai định điều hướng đi chỗ khác thì gọi `xinPhepRoiDi()` và chờ câu trả lời.
 * Hộp thoại hỏi vẫn do chính màn đó vẽ — vì chỉ nó biết đang lỡ dở cái gì và
 * biết cách lưu lại.
 */

let nguoiGiu = null;

/**
 * Đăng ký chốt chặn. Trả về hàm huỷ đăng ký để dùng thẳng trong cleanup của
 * useEffect.
 *
 * @param {{ coThayDoi: () => boolean, hoi: () => Promise<boolean> }} chotChan
 *   - `coThayDoi`: hiện có gì chưa lưu không.
 *   - `hoi`: hiện hộp thoại, trả về true nếu cho phép đi tiếp.
 */
export function giuKhiChuaLuu(chotChan) {
  nguoiGiu = chotChan;
  return () => {
    if (nguoiGiu === chotChan) nguoiGiu = null;
  };
}

/**
 * Xin phép rời khỏi màn đang mở. Trả về true nếu được đi.
 *
 * Chốt chặn hỏng thì cho đi luôn: nhốt người dùng lại trong một màn hình vì lỗi
 * của chính cơ chế cảnh báo còn tệ hơn nhiều so với việc mất một bản nháp.
 */
export async function xinPhepRoiDi() {
  if (!nguoiGiu) return true;
  try {
    if (!nguoiGiu.coThayDoi()) return true;
    return await nguoiGiu.hoi();
  } catch {
    return true;
  }
}
