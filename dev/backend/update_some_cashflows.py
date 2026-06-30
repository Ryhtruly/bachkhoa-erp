from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import sys
import os

from src.db.models import CashflowTransaction, Contract

engine = create_engine("sqlite:////Users/macbook/Desktop/bachkhoa-erp/dev/backend/db.sqlite")
Session = sessionmaker(bind=engine)
session = Session()

contracts = session.query(Contract).limit(3).all()
if not contracts:
    print("No contracts found")
    sys.exit(0)

cashflows = session.query(CashflowTransaction).order_by(CashflowTransaction.created_at.desc()).limit(15).all()

for i, cf in enumerate(cashflows):
    contract = contracts[i % len(contracts)]
    cf.contract_id = contract.id
    print(f"Updated {cf.id} with contract {contract.id}")

session.commit()
print("Updated successfully")
