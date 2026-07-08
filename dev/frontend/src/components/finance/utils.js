export const fmt = (n) => new Intl.NumberFormat('vi-VN').format(Number(n) || 0) + '₫';
export const fmtShort = (v) => fmt(v);
export const fmtAmt = (v) => v ? Number(v.replace(/[^\d]/g, '')).toLocaleString('vi-VN') : '';
export const parseAmt = (v) => parseFloat(String(v).replace(/[^\d]/g, '')) || 0;

export const getLocalISOTime = () => {
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzOffset)).toISOString().slice(0, 16);
};

export const docSoTiengViet = (number) => {
  const num = Number(number) || 0;
  if (num === 0) return 'Không đồng';
  const dv = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const chuc = ['', 'mười', 'hai mươi', 'ba mươi', 'bốn mươi', 'năm mươi', 'sáu mươi', 'bảy mươi', 'tám mươi', 'chín mươi'];
  const tram = ['không trăm', 'một trăm', 'hai trăm', 'ba trăm', 'bốn trăm', 'năm trăm', 'sáu trăm', 'bảy trăm', 'tám trăm', 'chín trăm'];

  function doc3So(n, showZeroTram) {
    let tr = Math.floor(n / 100);
    let ch = Math.floor((n % 100) / 10);
    let dv_val = n % 10;
    let res = '';
    if (tr > 0 || showZeroTram) {
      res += tram[tr] + ' ';
    }
    if (ch > 0) {
      if (ch === 1) res += 'mười ';
      else res += chuc[ch] + ' ';
    } else if (tr > 0 && dv_val > 0) {
      res += 'lẻ ';
    }
    if (dv_val > 0) {
      if (dv_val === 1 && ch > 1) res += 'mốt ';
      else if (dv_val === 5 && ch > 0) res += 'lăm ';
      else res += dv[dv_val] + ' ';
    }
    return res;
  }

  let str = '';
  let ty = Math.floor(num / 1e9);
  let tr_t = Math.floor((num % 1e9) / 1e6);
  let ng = Math.floor((num % 1e6) / 1e3);
  let d = Math.floor(num % 1e3);

  if (ty > 0) {
    str += doc3So(ty, false) + 'tỷ ';
  }
  if (tr_t > 0) {
    str += doc3So(tr_t, ty > 0) + 'triệu ';
  }
  if (ng > 0) {
    str += doc3So(ng, ty > 0 || tr_t > 0) + 'nghìn ';
  }
  if (d > 0) {
    str += doc3So(d, ty > 0 || tr_t > 0 || ng > 0) + '';
  }

  let res = str.trim();
  if (res.length > 0) {
    res = res.charAt(0).toUpperCase() + res.slice(1) + ' đồng chẵn';
  }
  return res;
};

export const CATEGORY_AUTO_MAPPING = {
  "Văn phòng phẩm": { phong_ban: "Phòng Kỹ Thuật", doi_tac: "Hằng", nguoi_lap: "Hằng", nguoi_duyet: "Giám đốc" },
  "In ấn - Photocopy": { phong_ban: "Phòng Pháp Lý", doi_tac: "Nguyễn Thị A", nguoi_lap: "Nguyễn Thị A", nguoi_duyet: "Giám đốc" },
  "Chi quầy tiếp nhận": { phong_ban: "Phòng Marketing", doi_tac: "Nhân viên Marketing", nguoi_lap: "Nhân viên Marketing", nguoi_duyet: "Giám đốc" },
  "Chi thụ lý bản vẽ": { phong_ban: "Phòng Kỹ Thuật", doi_tac: "Lê Văn Dựng", nguoi_lap: "Lê Văn Dựng", nguoi_duyet: "Giám đốc" }
};
