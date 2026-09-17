from src.finance.schemas import CashflowIn


def test_cashflow_category_accepts_long_ui_label_and_description():
    payload = CashflowIn(
        type="INCOME",
        amount=110000,
        category="Thu góp vốn / Vay mượn kinh doanh: Test thu KH ngoài hợp đồng",
        payer_payee="Khách hàng Cam Trang",
        payment_method="BANK_TRANSFER",
        description="Test thu KH ngoài hợp đồng",
    )

    assert payload.category == "Thu góp vốn / Vay mượn kinh doanh: Test thu KH ngoài hợp đồng"
