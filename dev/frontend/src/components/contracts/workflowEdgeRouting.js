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

/**
 * Kiểm tra xem nếu nối từ source tới target thì có tạo thành chu trình (vòng lặp) không.
 * Duyệt BFS từ target: nếu có thể đi tới source thì tức là việc nối source -> target
 * sẽ khép kín một vòng lặp.
 */
export function hasCyclePath(fromNodeId, toNodeId, currentEdges = []) {
  if (!fromNodeId || !toNodeId) return false;
  if (fromNodeId === toNodeId) return true;
  const visited = new Set();
  const queue = [fromNodeId];
  while (queue.length > 0) {
    const curr = queue.shift();
    if (curr === toNodeId) return true;
    if (!visited.has(curr)) {
      visited.add(curr);
      for (const edge of currentEdges) {
        if (edge.source === curr && !visited.has(edge.target)) {
          queue.push(edge.target);
        }
      }
    }
  }
  return false;
}

/**
 * Kiểm tra quy tắc nối tuần tự 1-1 cho sơ đồ quy trình:
 * 1. Không tự nối vào chính mình (self-loop).
 * 2. Một đầu chỉ được phép có 1 đường nối:
 *    - Đầu ra (source) tối đa 1 đường ra.
 *    - Đầu vào (target) tối đa 1 đường vào.
 * 3. Không tạo thành vòng lặp khép kín (cycle).
 *
 * @param {Object} connection - { source, target, id? }
 * @param {Array} edges - danh sách edges hiện có
 * @returns {{ ok: boolean, reason?: string, message?: string }}
 */
export function checkSequentialConnection(connection, edges = []) {
  const { source, target, id } = connection || {};
  if (!source || !target) {
    return { ok: false, reason: 'missing_nodes', message: 'Thiếu thông tin bước nối.' };
  }
  if (source === target) {
    return { ok: false, reason: 'self_loop', message: 'Không thể nối bước với chính nó!' };
  }

  // Đầu ra của node nguồn: chỉ được phép có tối đa 1 đường
  const hasOutgoing = edges.some(e => e.source === source && e.id !== id);
  if (hasOutgoing) {
    return {
      ok: false,
      reason: 'source_has_outgoing',
      message: 'Đầu ra của bước này đã có đường nối. Mỗi đầu chỉ được phép có 1 đường nối duy nhất!',
    };
  }

  // Đầu vào của node đích: chỉ được phép có tối đa 1 đường
  const hasIncoming = edges.some(e => e.target === target && e.id !== id);
  if (hasIncoming) {
    return {
      ok: false,
      reason: 'target_has_incoming',
      message: 'Đầu vào của bước tiếp nhận đã có đường nối. Mỗi đầu chỉ được phép có 1 đường nối duy nhất!',
    };
  }

  // Chặn tạo vòng lặp
  if (hasCyclePath(target, source, edges)) {
    return {
      ok: false,
      reason: 'cycle',
      message: 'Không thể nối tạo thành vòng lặp! Quy trình phải chạy tuần tự từ trước ra sau.',
    };
  }

  return { ok: true };
}
