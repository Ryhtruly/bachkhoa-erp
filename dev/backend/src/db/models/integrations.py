"""External integrations configuration: GoogleSheetSyncConfig."""

from src.db.models._base import *


class GoogleSheetSyncConfig(Base):
    __tablename__ = "google_sheet_sync_config"
    id = Column(Integer, primary_key=True, autoincrement=True)
    sheet_url = Column(String, nullable=True)
    table_name = Column(String, nullable=True)
    sync_direction = Column(String, nullable=True)
    sheet_id = Column(String, nullable=True)
    worksheet_name = Column(String, nullable=True)
    credential = Column(Text, nullable=True)
    last_sync = Column(DateTime(timezone=True), nullable=True)
    sync_status = Column(String, nullable=True)
