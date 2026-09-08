export function createChecklistDefinition(position, idFactory = null) {
  const generatedId = idFactory?.()
    || globalThis.crypto?.randomUUID?.()
    || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return {
    key: `item_${generatedId}`,
    name: `Checklist ${position}`,
    required: true,
    require_evidence: false,
    approver_role: 'admin',
    assignee_employee_id: null,
    evidence_description: '',
    drive_folder_url: '',
    compensation: { is_payable: false },
  };
}

export function removeChecklistDefinition(items, index) {
  return (items || []).filter((_, itemIndex) => itemIndex !== index);
}
