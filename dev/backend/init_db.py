import os
import sys

# Add the parent directory to sys.path so we can import app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.db.database import engine, Base
from src.db.models import *

print("Creating database tables...")
Base.metadata.create_all(bind=engine)
print("Database tables created successfully!")
