// Hình học đường nối của sơ đồ quy trình. Tách khỏi ContractWorkflowDesigner.jsx
// để file đó chỉ còn export component (fast refresh), và để phần tính toán này
// kiểm thử được mà không phải dựng cả màn thiết kế.

/** Điểm giữa theo độ dài đường gấp khúc — dùng để đặt nhãn "Hoàn thành". */
export function pathMidpoint(points) {
  const segments = points.slice(1).map((point, index) => ({
    from: points[index],
    to: point,
    length: Math.abs(point.x - points[index].x) + Math.abs(point.y - points[index].y),
  }));
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  let travelled = 0;
  for (const segment of segments) {
    if (travelled + segment.length >= total / 2) {
      const ratio = segment.length ? (total / 2 - travelled) / segment.length : 0;
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
        y: segment.from.y + (segment.to.y - segment.from.y) * ratio,
      };
    }
    travelled += segment.length;
  }
  return points[Math.floor(points.length / 2)] || { x: 0, y: 0 };
}

// ELK dựng tuyến theo mô hình node của nó, không theo DOM thật. Chỉ cần mô hình
// lệch (node cao 109px mà khai 168px) là cả đường nối tụt xuống dưới, rời khỏi
// chấm nối — và tuyến đã lưu trong ui.edges thì còn lệch mãi cho tới lần tự sắp
// xếp sau. Vì vậy luôn ép hai đầu về đúng toạ độ handle mà React Flow đo được,
// và dịch các điểm gãy theo cùng một phép nội suy để không méo hình dáng tuyến.
export function neoTuyenVaoHandle(points, sourceX, sourceY, targetX, targetY) {
  if (!Array.isArray(points) || points.length < 2) return points;
  if ([sourceX, sourceY, targetX, targetY].some(value => !Number.isFinite(value))) return points;
  const dauLech = { x: sourceX - points[0].x, y: sourceY - points[0].y };
  const cuoiLech = {
    x: targetX - points[points.length - 1].x,
    y: targetY - points[points.length - 1].y,
  };
  if (!dauLech.x && !dauLech.y && !cuoiLech.x && !cuoiLech.y) return points;
  const chiSoCuoi = points.length - 1;
  return points.map((point, index) => {
    const t = index / chiSoCuoi;
    return {
      x: point.x + dauLech.x + (cuoiLech.x - dauLech.x) * t,
      y: point.y + dauLech.y + (cuoiLech.y - dauLech.y) * t,
    };
  });
}
