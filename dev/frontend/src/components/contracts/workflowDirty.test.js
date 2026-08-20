import { describe, expect, it } from 'vitest';
import { dauVanTayGraph } from './workflowDirty';

// Sơ đồ mẫu tối giản, đúng hình dạng flowToGraph sinh ra: phần nghiệp vụ nằm ở
// `nodes` / `start_node`, còn toạ độ nằm gọn trong `ui`.
const soDoGoc = {
  start_node: 'k01',
  nodes: {
    k01: { name: 'Tiếp nhận', duration_days: 1, checklist: [], transitions: { COMPLETED: 'k02' } },
    k02: { name: 'Khảo sát', duration_days: 3, checklist: [], transitions: {} },
  },
  ui: { k01: { x: 0, y: 0 }, k02: { x: 260, y: 0 }, edges: {} },
};

const sao = (goc) => JSON.parse(JSON.stringify(goc));

describe('dauVanTayGraph — nhận biết sơ đồ có thay đổi chưa lưu', () => {
  it('kéo node đổi chỗ thì KHÔNG tính là thay đổi', () => {
    const daKeo = sao(soDoGoc);
    daKeo.ui.k02 = { x: 900, y: 420 };
    daKeo.ui.edges = { 'k01:COMPLETED:k02': [{ x: 100, y: 50 }] };

    expect(dauVanTayGraph(daKeo)).toBe(dauVanTayGraph(soDoGoc));
  });

  it('tháo một đường nối thì TÍNH là thay đổi', () => {
    const daThao = sao(soDoGoc);
    daThao.nodes.k01.transitions = {};

    expect(dauVanTayGraph(daThao)).not.toBe(dauVanTayGraph(soDoGoc));
  });

  it('thêm node thì TÍNH là thay đổi', () => {
    const daThem = sao(soDoGoc);
    daThem.nodes.k03 = { name: 'Bàn giao', duration_days: 1, checklist: [], transitions: {} };

    expect(dauVanTayGraph(daThem)).not.toBe(dauVanTayGraph(soDoGoc));
  });

  it('sửa tên bước, thời lượng hay checklist đều TÍNH là thay đổi', () => {
    const doiTen = sao(soDoGoc);
    doiTen.nodes.k01.name = 'Tiếp nhận hồ sơ';
    const doiHan = sao(soDoGoc);
    doiHan.nodes.k02.duration_days = 5;
    const doiChecklist = sao(soDoGoc);
    doiChecklist.nodes.k02.checklist = [{ key: 'anh', label: 'Ảnh hiện trạng' }];

    const goc = dauVanTayGraph(soDoGoc);
    expect(dauVanTayGraph(doiTen)).not.toBe(goc);
    expect(dauVanTayGraph(doiHan)).not.toBe(goc);
    expect(dauVanTayGraph(doiChecklist)).not.toBe(goc);
  });

  it('đổi node bắt đầu thì TÍNH là thay đổi', () => {
    const doiDiemDau = sao(soDoGoc);
    doiDiemDau.start_node = 'k02';

    expect(dauVanTayGraph(doiDiemDau)).not.toBe(dauVanTayGraph(soDoGoc));
  });

  it('cùng nội dung nhưng khác thứ tự khoá vẫn là một', () => {
    // Máy chủ trả về thứ tự khoá khác lúc gửi đi là chuyện thường. Không chuẩn
    // hoá thì vừa nạp trang đã bị báo "có thay đổi chưa lưu".
    const daoThuTu = {
      ui: soDoGoc.ui,
      nodes: {
        k02: { transitions: {}, checklist: [], duration_days: 3, name: 'Khảo sát' },
        k01: { transitions: { COMPLETED: 'k02' }, checklist: [], duration_days: 1, name: 'Tiếp nhận' },
      },
      start_node: 'k01',
    };

    expect(dauVanTayGraph(daoThuTu)).toBe(dauVanTayGraph(soDoGoc));
  });
});
