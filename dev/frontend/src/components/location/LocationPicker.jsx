import { useCallback, useEffect, useMemo, useState } from 'react'

const emptyValue = {
  provinceCode: '', provinceName: '', wardCode: '', wardName: '', detail: '', displayAddress: '',
}

function displayAddress(value) {
  return [value.detail, value.wardName, value.provinceName]
    .map(part => part?.trim())
    .filter(Boolean)
    .join(', ')
}

export default function LocationPicker({ value = emptyValue, onChange }) {
  const location = useMemo(() => ({ ...emptyValue, ...value }), [value])
  const [provinces, setProvinces] = useState([])
  const [wards, setWards] = useState([])
  const [provincesError, setProvincesError] = useState('')
  const [wardsError, setWardsError] = useState('')
  const [loadingProvinces, setLoadingProvinces] = useState(false)
  const [loadingWards, setLoadingWards] = useState(false)

  const update = useCallback((patch) => {
    const next = { ...location, ...patch }
    onChange?.({ ...next, displayAddress: displayAddress(next) })
  }, [location, onChange])

  const loadProvinces = useCallback(async () => {
    setLoadingProvinces(true)
    setProvincesError('')
    try {
      const response = await fetch('/api/survey-records/wards/provinces')
      if (!response.ok) throw new Error('Không thể tải danh sách tỉnh/thành phố')
      const payload = await response.json()
      setProvinces(payload.data || [])
    } catch (error) {
      setProvincesError(error.message || 'Không thể tải danh sách tỉnh/thành phố')
    } finally {
      setLoadingProvinces(false)
    }
  }, [])

  const loadWards = useCallback(async (provinceCode) => {
    if (!provinceCode) {
      setWards([])
      return
    }
    setLoadingWards(true)
    setWardsError('')
    try {
      const response = await fetch(`/api/survey-records/wards?province_code=${encodeURIComponent(provinceCode)}`)
      if (!response.ok) throw new Error('Không thể tải danh sách phường/xã')
      const payload = await response.json()
      setWards(payload.data || [])
    } catch (error) {
      setWardsError(error.message || 'Không thể tải danh sách phường/xã')
    } finally {
      setLoadingWards(false)
    }
  }, [])

  useEffect(() => { loadProvinces() }, [loadProvinces])
  useEffect(() => { loadWards(location.provinceCode) }, [loadWards, location.provinceCode])

  return <div className="location-picker">
    <label>
      Tỉnh/Thành phố
      <select
        className="form-control"
        value={location.provinceCode}
        required
        disabled={loadingProvinces}
        onChange={(event) => {
          const province = provinces.find(item => item.code === event.target.value)
          update({
            provinceCode: province?.code || '',
            provinceName: province?.name || '',
            wardCode: '',
            wardName: '',
          })
        }}
      >
        <option value="">— Chọn tỉnh/thành phố —</option>
        {provinces.map(province => <option key={province.code} value={province.code}>{province.name}</option>)}
      </select>
    </label>
    {provincesError && <p role="alert">{provincesError} <button type="button" className="btn btn-link" onClick={loadProvinces}>Thử lại</button></p>}

    <label>
      Phường/Xã
      <select
        className="form-control"
        value={location.wardCode}
        required
        disabled={!location.provinceCode || loadingWards}
        onChange={(event) => {
          const ward = wards.find(item => item.code === event.target.value)
          update({ wardCode: ward?.code || '', wardName: ward?.name || '' })
        }}
      >
        <option value="">— Chọn phường/xã —</option>
        {wards.map(ward => <option key={ward.code} value={ward.code}>{ward.name}</option>)}
      </select>
    </label>
    {wardsError && <p role="alert">{wardsError} <button type="button" className="btn btn-link" onClick={() => loadWards(location.provinceCode)}>Thử lại</button></p>}

    <label>
      Số nhà, đường
      <input
        className="form-control"
        value={location.detail}
        onChange={event => update({ detail: event.target.value })}
        type="text"
      />
    </label>
  </div>
}
