"""SQLAlchemy database models for BachKhoa ERP.

This module exposes all models under a single package, preserving imports like
`from src.db.models import User`.
"""

from src.db.models._base import get_utc_now
from src.db.models.auth import (
    User,
    Role,
    UserRole,
    RolePermission,
    AuthToken,
    AuditLog,
    Notification,
)
from src.db.models.crm import (
    Customer,
    LeadPipeline,
    Contract,
    ZaloInteraction,
    ServiceLine,
)
from src.db.models.operations import (
    TaskType,
    TaskTypeRate,
    ProjectTask,
    TaskSubmission,
    TaskPayRecord,
    LegalSubmission,
)
from src.db.models.finance import (
    CashflowTransaction,
    Receivable,
    FundOpeningBalance,
    FinanceSetting,
    ContractExpense,
)
from src.db.models.hr_payroll import (
    Department,
    Employee,
    KpiPayroll,
    PayrollPeriod,
    PayrollAdjustment,
    Attendance,
    LeaveRecord,
)
from src.db.models.communication import (
    ChatRoom,
    Message,
    ChatParticipant,
)
from src.db.models.wiki import (
    WikiDocument,
    WikiChunk,
)
from src.db.models.settings import (
    SystemSetting,
)
from src.db.models.integrations import (
    GoogleSheetSyncConfig,
)

__all__ = [
    "get_utc_now",
    "User",
    "Role",
    "UserRole",
    "RolePermission",
    "AuthToken",
    "AuditLog",
    "Notification",
    "Customer",
    "LeadPipeline",
    "Contract",
    "ZaloInteraction",
    "ServiceLine",
    "TaskType",
    "TaskTypeRate",
    "ProjectTask",
    "TaskSubmission",
    "TaskPayRecord",
    "LegalSubmission",
    "CashflowTransaction",
    "Receivable",
    "FundOpeningBalance",
    "FinanceSetting",
    "ContractExpense",
    "Department",
    "Employee",
    "KpiPayroll",
    "PayrollPeriod",
    "PayrollAdjustment",
    "Attendance",
    "LeaveRecord",
    "ChatRoom",
    "Message",
    "ChatParticipant",
    "WikiDocument",
    "WikiChunk",
    "SystemSetting",
    "GoogleSheetSyncConfig",
]
