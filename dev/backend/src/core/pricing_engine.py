def calculate_quote(service_type: str, area_sqm: float, location_zone: int) -> float:
    """
    Mock pricing engine.
    Calculates the final quote based on service type, area, and location.
    location_zone: 1 (Urban), 2 (Suburban), 3 (Remote)
    """
    base_rates = {
        "Đo hiện trạng": 5000000,
        "Cắm mốc": 3000000,
        "Hoàn công": 10000000,
        "Cấp đổi": 7000000
    }
    
    base = base_rates.get(service_type, 4000000)
    
    # Add 10,000 VND per extra square meter above 100
    area_fee = max(0, area_sqm - 100) * 10000
    
    # Location multiplier
    location_multiplier = {1: 1.0, 2: 1.2, 3: 1.5}.get(location_zone, 1.0)
    
    final_price = (base + area_fee) * location_multiplier
    return final_price
