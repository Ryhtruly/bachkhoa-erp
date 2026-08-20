/**
 * So sánh "sơ đồ đang sửa" với "sơ đồ đã lưu" để biết còn gì chưa cất.
 *
 * Tách khỏi ContractWorkflowDesigner vì đây là quy tắc nghiệp vụ có thể sai một
 * cách âm thầm: nhận nhầm thì hoặc chặn đường người dùng vô cớ, hoặc để họ mất
 * bài mà không một lời cảnh báo. Ở riêng thì kiểm bằng test được.
 */

/** Sắp xếp khoá để hai graph giống nhau luôn cho ra cùng một chuỗi. */
export function sapXepKhoa(giaTri) {
  if (Array.isArray(giaTri)) return giaTri.map(sapXepKhoa);
  if (giaTri && typeof giaTri === 'object') {
    return Object.keys(giaTri).sort().reduce((gom, khoa) => {
      gom[khoa] = sapXepKhoa(giaTri[khoa]);
      return gom;
    }, {});
  }
  return giaTri;
}

/**
 * Dấu vân tay phần NGHIỆP VỤ của sơ đồ — bỏ hẳn `ui` ra ngoài.
 *
 * `ui` là nơi flowToGraph cất toạ độ node và điểm bẻ của đường nối. Kéo node cho
 * dễ nhìn chỉ đổi toạ độ, không đổi quy trình, và đã có nút "Lưu bố cục" riêng lo
 * việc đó. Tính cả toạ độ vào thì nắn sơ đồ cho gọn mắt xong thoát ra cũng bị hộp
 * thoại chặn đường — phiền mà chẳng cứu được gì.
 */
export function dauVanTayGraph(graph) {
  const { ui: _boCuc, ...phanNghiepVu } = graph || {};
  return JSON.stringify(sapXepKhoa(phanNghiepVu));
}
