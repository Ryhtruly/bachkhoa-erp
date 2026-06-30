from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import sys
import os

sys.path.append(os.path.join(os.getcwd(), 'dev', 'backend', 'src'))

from db.models import CashflowTransaction, Contract

engine = create_engine("sqlite:///dev/backend/db.sqlite")
Session = sessionmaker(bind=engine)
session = Session()

# Find some contracts
contracts = session.query(Contract).limit(3).all()
if not contracts:
    print("No contracts found")
    sys.exit(0)

# Get some recent cashflow transactions
cashflows = session.query(CashflowTransaction).order_by(CashflowTransaction.created_at.desc()).limit(10).all()

for i, cf in enumerate(cashflows):
    # Assign contract sequentially
    contract = contracts[i % len(contracts)]
    cf.contract_id = contract.id
    print(f"Updated {cf.id} with contract {contract.id}")

session.commit()
print("Updated successfully")
