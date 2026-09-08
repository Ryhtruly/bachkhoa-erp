"""System-wide configuration settings: SystemSetting."""

from src.db.models._base import *


class SystemSetting(Base):
    __tablename__ = "system_settings"
    key = Column(String, primary_key=True)
    value = Column(String, nullable=True)
    description = Column(String, nullable=True)
