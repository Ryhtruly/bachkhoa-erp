import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import NodeChain from './NodeChain'

afterEach(cleanup)

const NODES = [
  { id: 'n1', node_code: 'K01', name: 'Tiếp nhận hồ sơ', status: 'accepted' },
  { id: 'n2', node_code: 'K02', name: 'Kiểm tra', status: 'in_progress' },
  { id: 'n3', node_code: 'K03', name: 'Phê duyệt', status: 'ready' },
  { id: 'n4', node_code: 'K04', name: 'Hoàn tất', status: 'pending' },
]

describe('NodeChain', () => {
  describe('thứ tự tuyến tính', () => {
    it('liệt kê node theo đúng thứ tự truyền vào', () => {
      render(<NodeChain nodes={NODES} />)

      const items = screen.getAllByRole('listitem')
      expect(items).toHaveLength(4)
      expect(items[0]).toHaveTextContent('K01')
      expect(items[1]).toHaveTextContent('K02')
      expect(items[2]).toHaveTextContent('K03')
      expect(items[3]).toHaveTextContent('K04')
    })

    it('node cuối không có mũi tên phân cách', () => {
      const { container } = render(<NodeChain nodes={NODES} />)

      const arrows = container.querySelectorAll('.eiw-chain__arrow')
      expect(arrows).toHaveLength(3)
    })

    it('hiển thị tên node và tooltip đầy đủ', () => {
      render(<NodeChain nodes={NODES} />)

      const names = document.querySelectorAll('.eiw-step__name')
      expect(names).toHaveLength(4)
      expect(names[0].textContent).toBe('Tiếp nhận hồ sơ')
      expect(names[0].getAttribute('title')).toBe('Tiếp nhận hồ sơ')
    })
  })

  describe('nhãn trạng thái', () => {
    it('node hoàn thành hiển thị ĐÃ HOÀN THÀNH', () => {
      render(<NodeChain nodes={NODES} />)

      expect(screen.getAllByText('ĐÃ HOÀN THÀNH')).toHaveLength(1)
    })

    it('node đang chạy hiển thị ĐANG XỬ LÝ (chỉ khi là activeNodeId)', () => {
      render(<NodeChain nodes={NODES} activeNodeId="n2" />)

      expect(screen.getByText('ĐANG XỬ LÝ')).toBeInTheDocument()
    })

    it('node ready/rework_required/submitted hiển thị ĐANG MỞ', () => {
      render(<NodeChain nodes={NODES} />)

      expect(screen.getAllByText('ĐANG MỞ')).toHaveLength(2)
    })

    it('node chưa tới hiển thị CHƯA TỚI', () => {
      render(<NodeChain nodes={NODES} />)

      expect(screen.getByText('CHƯA TỚI')).toBeInTheDocument()
    })
  })

  describe('node active vàCircle step', () => {
    it('node active có circle hiển thị số thứ tự', () => {
      const { container } = render(<NodeChain nodes={NODES} activeNodeId="n2" />)

      const circles = container.querySelectorAll('.eiw-step__circle')
      expect(circles[1].textContent).toBe('2')
    })

    it('node done có circle hiển thị check icon', () => {
      const { container } = render(<NodeChain nodes={NODES} />)

      const circles = container.querySelectorAll('.eiw-step__circle')
      expect(circles[0].querySelector('svg')).toBeInTheDocument()
    })

    it('node active có pulse indicator khi chưa hoàn tất', () => {
      const { container } = render(<NodeChain nodes={NODES} activeNodeId="n2" />)

      const pulse = container.querySelectorAll('.eiw-step__pulse')
      expect(pulse).toHaveLength(1)
    })

    it('node active nhưng đã hoàn tất (accepted/completed) không có pulse indicator', () => {
      const { container: acceptedContainer } = render(<NodeChain nodes={NODES} activeNodeId="n1" />)
      expect(acceptedContainer.querySelectorAll('.eiw-step__pulse')).toHaveLength(0)

      cleanup()

      const completedNodes = [
        { id: 'c1', node_code: 'K01', name: 'Tiếp nhận hồ sơ', status: 'completed' },
      ]
      const { container: completedContainer } = render(<NodeChain nodes={completedNodes} activeNodeId="c1" />)
      expect(completedContainer.querySelectorAll('.eiw-step__pulse')).toHaveLength(0)
    })

    it('node active có aria-current="step"', () => {
      render(<NodeChain nodes={NODES} activeNodeId="n2" />)

      const buttons = screen.getAllByRole('button')
      expect(buttons[1]).toHaveAttribute('aria-current', 'step')
    })
  })

  describe('chọn node và trạng tháidisabled', () => {
    it('node openable gọi onSelect khi bấm', () => {
      const onSelect = vi.fn()
      render(<NodeChain nodes={NODES} openableIds={['n2', 'n3']} onSelect={onSelect} />)

      fireEvent.click(screen.getAllByRole('button')[1])
      expect(onSelect).toHaveBeenCalledWith('n2')
    })

    it('node không openable thì bị disabled', () => {
      render(<NodeChain nodes={NODES} openableIds={['n2']} />)

      const buttons = screen.getAllByRole('button')
      expect(buttons[0]).toBeDisabled()
      expect(buttons[1]).not.toBeDisabled()
      expect(buttons[2]).toBeDisabled()
      expect(buttons[3]).toBeDisabled()
    })

    it('node không openable có title cảnh báo', () => {
      render(<NodeChain nodes={NODES} openableIds={['n2']} />)

      const buttons = screen.getAllByRole('button')
      expect(buttons[0]).toHaveAttribute('title', 'Tiếp nhận hồ sơ — bước của người khác')
    })

    it('node openable có title tên node', () => {
      render(<NodeChain nodes={NODES} openableIds={['n2']} />)

      const buttons = screen.getAllByRole('button')
      expect(buttons[1]).toHaveAttribute('title', 'Kiểm tra')
    })

    it('openableIds là Set vẫn hoạt động', () => {
      const onSelect = vi.fn()
      render(<NodeChain nodes={NODES} openableIds={new Set(['n3'])} onSelect={onSelect} />)

      fireEvent.click(screen.getAllByRole('button')[2])
      expect(onSelect).toHaveBeenCalledWith('n3')
    })

    it('openableIds mặc định là mảng rỗng — tất cả disabled', () => {
      render(<NodeChain nodes={NODES} />)

      const buttons = screen.getAllByRole('button')
      buttons.forEach(btn => expect(btn).toBeDisabled())
    })
  })

  describe('tone CSS class', () => {
    it('node done có class is-done', () => {
      render(<NodeChain nodes={NODES} />)

      const buttons = screen.getAllByRole('button')
      expect(buttons[0].className).toContain('is-done')
    })

    it('node active có class is-current', () => {
      render(<NodeChain nodes={NODES} activeNodeId="n3" />)

      const buttons = screen.getAllByRole('button')
      expect(buttons[2].className).toContain('is-current')
    })

    it('node in_progress/ready có class is-open', () => {
      render(<NodeChain nodes={NODES} />)

      const buttons = screen.getAllByRole('button')
      expect(buttons[1].className).toContain('is-open')
    })

    it('node pending có class is-idle', () => {
      render(<NodeChain nodes={NODES} />)

      const buttons = screen.getAllByRole('button')
      expect(buttons[3].className).toContain('is-idle')
    })
  })

  describe('node thuộc phòng ban khác (prohibited)', () => {
    const MIXED_NODES = [
      { id: 'n1', node_code: 'K01', name: 'Đo hiện trường', status: 'completed', is_my_department: true },
      { id: 'n2', node_code: 'K02', name: 'Chuẩn hoá', status: 'in_progress', is_my_department: true },
      {
        id: 'n3',
        node_code: 'K03',
        name: 'Soạn hồ sơ',
        status: 'pending',
        is_my_department: false,
        pool_department_code: 'LEGAL',
        department_name: 'Phòng Pháp lý',
      },
      {
        id: 'n4',
        node_code: 'K04',
        name: 'Thẩm định',
        status: 'pending',
        is_my_department: false,
        pool_department_code: 'LEGAL',
        department_name: 'Phòng Pháp lý',
      },
    ]

    it('hiển thị nhãn phòng ban phụ trách trên bước bị cấm', () => {
      render(<NodeChain nodes={MIXED_NODES} />)

      expect(screen.getAllByText('THUỘC PHÁP LÝ')).toHaveLength(2)
    })

    it('gắn class is-prohibited và icon Ban trên bước bị cấm', () => {
      const { container } = render(<NodeChain nodes={MIXED_NODES} />)

      const buttons = screen.getAllByRole('button')
      expect(buttons[2].className).toContain('is-prohibited')
      expect(buttons[3].className).toContain('is-prohibited')

      const prohibitIcons = container.querySelectorAll('.eiw-step__prohibit-icon')
      expect(prohibitIcons).toHaveLength(2)
    })

    it('bước bị cấm luôn bị disabled và không gọi onSelect kể cả khi có trong openableIds', () => {
      const onSelect = vi.fn()
      render(<NodeChain nodes={MIXED_NODES} openableIds={['n1', 'n2', 'n3']} onSelect={onSelect} />)

      const buttons = screen.getAllByRole('button')
      expect(buttons[2]).toBeDisabled()

      fireEvent.click(buttons[2])
      expect(onSelect).not.toHaveBeenCalled()
    })

    it('tooltip của bước bị cấm thông báo rõ quyền hạn và phòng ban', () => {
      render(<NodeChain nodes={MIXED_NODES} />)

      const buttons = screen.getAllByRole('button')
      expect(buttons[2].getAttribute('title')).toContain('Thuộc Phòng Pháp lý (Bạn không có quyền thao tác)')
    })
  })
})

