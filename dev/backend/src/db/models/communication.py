"""Communication & Chat models: ChatRoom, Message, ChatParticipant."""

from src.db.models._base import *


class ChatRoom(Base):
    __tablename__ = "chat_rooms"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=True)
    type = Column(String, nullable=True)
    # Cùng lý do như CashflowTransaction.project_id: "projects_tasks" là bảng ma.
    related_task_id = Column(String, ForeignKey("service_lines.id"), nullable=True)


class Message(Base):
    __tablename__ = "messages"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id = Column(String, ForeignKey("chat_rooms.id"), nullable=True)
    sender_id = Column(String, ForeignKey("users.id"), nullable=True)
    content = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    is_read = Column(Boolean, nullable=True, default=False)


class ChatParticipant(Base):
    __tablename__ = "chat_participants"
    room_id = Column(String, ForeignKey("chat_rooms.id"), primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), primary_key=True)
