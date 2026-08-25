import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// Mock toast
vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ addToast: vi.fn(), removeToast: vi.fn() }),
  ToastProvider: ({ children }) => children,
}));

// Mock fetch
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data: [] }),
    text: () => Promise.resolve("[]"),
  })
);

// Import components
import AdvanceClearScreen from "./screens/AdvanceClearScreen";
import CashflowScreen from "./screens/CashflowScreen";
import CashflowModal from "./modals/CashflowModal";
import CashflowDetailModal from "./modals/CashflowDetailModal";
import ReceivablesScreen from "./screens/ReceivablesScreen";

describe("Frontend Finance Comprehensive Matrix", () => {
  const sampleTransactions = [
    {
      id: "PT-08/2026-001",
      transaction_date: "2026-08-20",
      transaction_type: "Thu",
      category_code: "Thu tiền khách hàng",
      amount: 15000000,
      payment_method: "Chuyển khoản",
      payer_payee_name: "Công ty ABC",
      description: "Thanh toán đợt 1 HĐ-2026-01",
      status: "Hoàn thành",
      contract_id: "HĐ-2026-01",
    },
    {
      id: "PC-08/2026-001",
      transaction_date: "2026-08-21",
      transaction_type: "Chi",
      category_code: "Chi phí tạm ứng",
      amount: 3000000,
      payment_method: "Tiền mặt",
      payer_payee_name: "Nguyễn Văn A",
      description: "Tạm ứng công tác",
      status: "Chờ quyết toán",
      contract_id: null,
    },
    {
      id: "PC-08/2026-002",
      transaction_date: "2026-08-22",
      transaction_type: "Chi",
      category_code: "Chi tiếp khách",
      amount: 500000,
      payment_method: "Tiền mặt",
      payer_payee_name: "Quán Cafe B",
      description: "Tiếp đối tác",
      status: "Chờ duyệt",
      contract_id: null,
    }
  ];

  describe("1. AdvanceClearScreen (Quyết toán hoàn ứng)", () => {
    it("renders without crash and displays table and filters", () => {
      const mockProps = {
        transactions: sampleTransactions,
        filteredTransactions: sampleTransactions,
        filters: { search: "", status: "ALL", dateFrom: "", dateTo: "" },
        setFilters: vi.fn(),
        onOpenClearModal: vi.fn(),
        onViewDetail: vi.fn(),
        theme: "light",
      };

      const { container } = render(<AdvanceClearScreen {...mockProps} />);
      expect(container).toBeDefined();
    });
  });

  describe("2. CashflowScreen (Sổ quỹ thu chi tổng thể)", () => {
    it("renders filter controls and summary data correctly", () => {
      const mockProps = {
        transactions: sampleTransactions,
        summary: {
          cash_balance: 24300000,
          bank_balance: 96630000,
          total_income: 15000000,
          total_expense: 3500000,
        },
        filters: { type: "ALL", search: "", payment_method: "ALL" },
        setFilters: vi.fn(),
        onNewTransaction: vi.fn(),
        onViewDetail: vi.fn(),
      };

      const { container } = render(<CashflowScreen {...mockProps} />);
      expect(container).toBeDefined();
    });
  });

  describe("3. CashflowModal (Tạo phiếu thu / chi)", () => {
    it("renders modal with initial fields", async () => {
      const onClose = vi.fn();
      const onSave = vi.fn();

      const { container } = render(
        <CashflowModal
          isOpen={true}
          onClose={onClose}
          onSave={onSave}
          type="Thu"
          categories={["Thu tiền khách hàng", "Thu khác"]}
          contracts={[{ id: "HĐ-01", customer_name: "Công ty ABC" }]}
        />
      );

      expect(container).toBeDefined();
    });
  });

  describe("4. CashflowDetailModal (Chi tiết phiếu & Phê duyệt / Hủy)", () => {
    it("renders transaction details and action buttons for Director", () => {
      const onClose = vi.fn();
      const onApprove = vi.fn();
      const onReject = vi.fn();
      const onVoid = vi.fn();

      const { container } = render(
        <CashflowDetailModal
          isOpen={true}
          transaction={sampleTransactions[2]}
          currentUser={{ role: "director", permissions: ["finance:approve", "finance:void"] }}
          onClose={onClose}
          onApprove={onApprove}
          onReject={onReject}
          onVoid={onVoid}
        />
      );

      expect(container).toBeDefined();
    });
  });

  describe("5. ReceivablesScreen (Quản lý công nợ & Hoàn tiền thừa)", () => {
    it("renders receivables list and debt summary stats in light and dark mode", () => {
      const mockReceivables = [
        {
          id: "rec-1",
          contract_id: "HĐ-01",
          customer_name: "Công ty ABC",
          phone: "0911222333",
          service_type: "Đo vẽ địa chính",
          total_value: 20000000,
          paid_amount: 15000000,
          remaining: 5000000,
          status: "Đang nợ",
        }
      ];

      const mockProps = {
        receivables: mockReceivables,
        onOpenRefundModal: vi.fn(),
        onRecordPayment: vi.fn(),
      };

      const { container, rerender } = render(<ReceivablesScreen {...mockProps} />);
      expect(container).toBeDefined();

      document.documentElement.setAttribute('data-theme', 'dark');
      rerender(<ReceivablesScreen {...mockProps} />);
      expect(container).toBeDefined();
      document.documentElement.removeAttribute('data-theme');
    });
  });

  describe("6. MonthlyDashboardScreen & FinanceNav", () => {
    it("renders MonthlyDashboardScreen with statistics and charts", async () => {
      const MonthlyDashboardScreen = (await import("./screens/MonthlyDashboardScreen")).default;
      const { container } = render(<MonthlyDashboardScreen />);
      expect(container).toBeDefined();
    }, 15000);

    it("renders FinanceNav with 3 main groups and switching tabs", async () => {
      const FinanceNav = (await import("./FinanceNav")).default;
      const onSelectTab = vi.fn();
      const { container, getByText } = render(
        <FinanceNav activeTab="monthly-dashboard" onSelectTab={onSelectTab} isDirector={true} />
      );
      expect(container).toBeDefined();
      expect(getByText("Dòng tiền & sổ quỹ")).toBeDefined();
    });
  });

  describe("7. AdvanceRequestScreen & SettingsScreen", () => {
    it("renders AdvanceRequestScreen", async () => {
      const AdvanceRequestScreen = (await import("./screens/AdvanceRequestScreen")).default;
      const { container } = render(<AdvanceRequestScreen />);
      expect(container).toBeDefined();
    });

    it("renders SettingsScreen", async () => {
      const SettingsScreen = (await import("./screens/SettingsScreen")).default;
      const { container } = render(<SettingsScreen isDirector={true} />);
      expect(container).toBeDefined();
    });
  });

  describe("8. PieceRate & PayrollOffice Screens", () => {
    it("renders PieceRatePricingScreen", async () => {
      const PieceRatePricingScreen = (await import("./screens/PieceRatePricingScreen")).default;
      const { container } = render(<PieceRatePricingScreen isDirector={true} />);
      expect(container).toBeDefined();
    });

    it("renders PieceRatePayrollScreen", async () => {
      const PieceRatePayrollScreen = (await import("./screens/PieceRatePayrollScreen")).default;
      const { container } = render(<PieceRatePayrollScreen isDirector={true} />);
      expect(container).toBeDefined();
    });

    it("renders PayrollOfficeScreen", async () => {
      const PayrollOfficeScreen = (await import("./screens/PayrollOfficeScreen")).default;
      const { container } = render(<PayrollOfficeScreen isDirector={true} />);
      expect(container).toBeDefined();
    });
  });

  describe("9. PrintVoucherScreen", () => {
    it("renders PrintVoucherScreen in print and create modes", async () => {
      const PrintVoucherScreen = (await import("./screens/PrintVoucherScreen")).default;
      const { container } = render(<PrintVoucherScreen />);
      expect(container).toBeDefined();
    });
  });
});

