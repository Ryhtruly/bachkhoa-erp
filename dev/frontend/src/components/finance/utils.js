export const fmt = (n) => new Intl.NumberFormat('vi-VN').format(Number(n) || 0) + '₫';
export const fmtShort = (v) => fmt(v);
export const fmtAmt = (v) => v ? Number(v.replace(/[^\d]/g, '')).toLocaleString('vi-VN') : '';
export const parseAmt = (v) => parseFloat(String(v).replace(/[^\d]/g, '')) || 0;
export const formatDate = (value) => {
  if (!value) return '—';
  try {
    const str = String(value).trim();
    const d = new Date(str.includes('T') ? str : `${str}T00:00:00`);
    if (isNaN(d.getTime())) return str;
    return new Intl.DateTimeFormat('vi-VN').format(d);
  } catch {
    return String(value);
  }
};

export const getLocalISOTime = () => {
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzOffset)).toISOString().slice(0, 16);
};

export const spellVietnameseCurrency = (number) => {
  const num = Number(number) || 0;
  if (num === 0) return 'Không đồng';
  const digits = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const tens = ['', 'mười', 'hai mươi', 'ba mươi', 'bốn mươi', 'năm mươi', 'sáu mươi', 'bảy mươi', 'tám mươi', 'chín mươi'];
  const hundreds = ['không trăm', 'một trăm', 'hai trăm', 'ba trăm', 'bốn trăm', 'năm trăm', 'sáu trăm', 'bảy trăm', 'tám trăm', 'chín trăm'];

  function readGroupOfThree(n, showZeroHundreds) {
    const hundredDigit = Math.floor(n / 100);
    const tenDigit = Math.floor((n % 100) / 10);
    const unitDigit = n % 10;
    let res = '';
    if (hundredDigit > 0 || showZeroHundreds) {
      res += hundreds[hundredDigit] + ' ';
    }
    if (tenDigit > 0) {
      if (tenDigit === 1) res += 'mười ';
      else res += tens[tenDigit] + ' ';
    } else if (hundredDigit > 0 && unitDigit > 0) {
      res += 'lẻ ';
    }
    if (unitDigit > 0) {
      if (unitDigit === 1 && tenDigit > 1) res += 'mốt ';
      else if (unitDigit === 5 && tenDigit > 0) res += 'lăm ';
      else res += digits[unitDigit] + ' ';
    }
    return res;
  }

  let str = '';
  const billions = Math.floor(num / 1e9);
  const millions = Math.floor((num % 1e9) / 1e6);
  const thousands = Math.floor((num % 1e6) / 1e3);
  const units = Math.floor(num % 1e3);

  if (billions > 0) {
    str += readGroupOfThree(billions, false) + 'tỷ ';
  }
  if (millions > 0) {
    str += readGroupOfThree(millions, billions > 0) + 'triệu ';
  }
  if (thousands > 0) {
    str += readGroupOfThree(thousands, billions > 0 || millions > 0) + 'nghìn ';
  }
  if (units > 0) {
    str += readGroupOfThree(units, billions > 0 || millions > 0 || thousands > 0) + '';
  }

  let res = str.trim();
  if (res.length > 0) {
    res = res.charAt(0).toUpperCase() + res.slice(1) + ' đồng chẵn';
  }
  return res;
};

export const CATEGORY_AUTO_MAPPING = {
  "Văn phòng phẩm": { department_code: "Phòng Đo vẽ", payer_payee: "", created_by: "", approved_by: "" },
  "In ấn - Photocopy": { department_code: "Phòng Pháp lý", payer_payee: "", created_by: "", approved_by: "" },
  "Chi tiếp khách & Giao tế": { department_code: "Phòng Sale / CSKH", payer_payee: "", created_by: "", approved_by: "" },
  "Chi thụ lý bản vẽ & Trích lục": { department_code: "Phòng Đo vẽ", payer_payee: "", created_by: "", approved_by: "" }
};
