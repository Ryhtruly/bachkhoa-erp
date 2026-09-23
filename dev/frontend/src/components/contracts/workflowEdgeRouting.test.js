import { describe, expect, it } from 'vitest';
import {
  checkSequentialConnection,
  hasCyclePath,
  neoTuyenVaoHandle,
  pathMidpoint,
} from './workflowEdgeRouting';

describe('workflowEdgeRouting - Geometry helpers', () => {
  it('calculates path midpoint accurately', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const mid = pathMidpoint(points);
    expect(mid.x).toBe(50);
    expect(mid.y).toBe(0);
  });

  it('snaps endpoints with neoTuyenVaoHandle', () => {
    const points = [
      { x: 10, y: 10 },
      { x: 50, y: 10 },
      { x: 90, y: 10 },
    ];
    const snapped = neoTuyenVaoHandle(points, 0, 0, 100, 20);
    expect(snapped[0]).toEqual({ x: 0, y: 0 });
    expect(snapped[snapped.length - 1]).toEqual({ x: 100, y: 20 });
  });
});

describe('workflowEdgeRouting - Sequential Connection Rules (1 node 1 đường mỗi đầu)', () => {
  it('cho phép nối 1-1 khi hai node chưa có đường nối nào', () => {
    const edges = [];
    const connection = { source: 'node1', target: 'node2' };
    const result = checkSequentialConnection(connection, edges);
    expect(result.ok).toBe(true);
  });

  it('cấm tự nối vào chính mình (self-loop)', () => {
    const edges = [];
    const connection = { source: 'node1', target: 'node1' };
    const result = checkSequentialConnection(connection, edges);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('self_loop');
    expect(result.message).toContain('Không thể nối bước với chính nó');
  });

  it('cấm nối nhiều hơn 1 đường từ đầu ra của node nguồn (source has outgoing)', () => {
    // node1 đã nối tới node2
    const edges = [{ id: 'e1', source: 'node1', target: 'node2' }];
    // ráng nối thêm đường thứ 2 từ node1 sang node3
    const connection = { source: 'node1', target: 'node3' };
    const result = checkSequentialConnection(connection, edges);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('source_has_outgoing');
    expect(result.message).toContain('Đầu ra của bước này đã có đường nối');
  });

  it('cấm nối nhiều hơn 1 đường vào đầu vào của node đích (target has incoming)', () => {
    // node1 đã nối tới node2
    const edges = [{ id: 'e1', source: 'node1', target: 'node2' }];
    // node3 ráng nối vào node2 (node2 đã có đường vào từ node1)
    const connection = { source: 'node3', target: 'node2' };
    const result = checkSequentialConnection(connection, edges);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('target_has_incoming');
    expect(result.message).toContain('Đầu vào của bước tiếp nhận đã có đường nối');
  });

  it('cấm nối tạo thành chu trình/vòng lặp (cycle)', () => {
    // Chuỗi: node1 -> node2 -> node3
    const edges = [
      { id: 'e1', source: 'node1', target: 'node2' },
      { id: 'e2', source: 'node2', target: 'node3' },
    ];
    // Ráng nối vòng ngược lại từ node3 về node1
    const connection = { source: 'node3', target: 'node1' };
    const result = checkSequentialConnection(connection, edges);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('cycle');
    expect(result.message).toContain('Không thể nối tạo thành vòng lặp');
  });

  it('hasCyclePath phát hiện chu trình gián tiếp qua nhiều bước', () => {
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' },
      { source: 'C', target: 'D' },
    ];
    // Nếu nối D -> A thì sẽ tạo vòng tròn A -> B -> C -> D -> A
    expect(hasCyclePath('A', 'D', edges)).toBe(true);
    // Nếu nối D -> B thì sẽ tạo vòng tròn B -> C -> D -> B
    expect(hasCyclePath('B', 'D', edges)).toBe(true);
    // Không có đường từ E tới A
    expect(hasCyclePath('E', 'A', edges)).toBe(false);
  });

  it('cho phép nối lại khi đường cũ đã bị xoá', () => {
    // Ban đầu có e1: node1 -> node2. Sau khi xoá e1, edges rỗng
    const edges = [];
    // node1 bây giờ có thể nối tới node3
    const connection = { source: 'node1', target: 'node3' };
    expect(checkSequentialConnection(connection, edges).ok).toBe(true);
  });
});

