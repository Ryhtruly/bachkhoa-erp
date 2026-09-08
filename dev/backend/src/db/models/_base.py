"""Shared base, utilities, and common imports for all model modules."""

from sqlalchemy import Column, Integer, String, Boolean, Numeric, Date, DateTime, ForeignKey, Text, BigInteger, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
import uuid
import datetime
from src.db.database import Base


def get_utc_now():
    return datetime.datetime.now(datetime.timezone.utc)
