/**
 * Process and Node execution type definitions
 */

export type NodeStatus = 'active' | 'next' | 'waiting_approval' | 'target' | 'completed';

export interface ProcessStep {
  id: string;
  order: number;
  code: string;
  status: NodeStatus;
  statusLabel: string;
  badgeText: string;
  isCurrent: boolean;
}

export interface AttachmentFile {
  id: string;
  name: string;
  size: string;
  type: string;
  uploadDate: string;
  url?: string;
}

export type ChecklistStatusVariant = 'green' | 'red' | 'blue' | 'yellow';

export interface ChecklistItem {
  id: string;
  title: string;
  status: 'valid' | 'rejected' | 'pending_signature' | 'pending_review';
  statusLabel: string;
  statusVariant: ChecklistStatusVariant;
  hasWarningIcon?: boolean;
  uploaderInfo: string;
  note?: string;
  updateDate: string;
  fileName: string;
  fileSize?: string;
  fileType?: string;
  fileDataUrl?: string;
  rejectionReason?: string;
  resolvedAt?: string;
}

export interface NodeDetail {
  id: string;
  code: string;
  codeTag: string;
  title: string;
  remainingTime: string;
  onTimeStatus: string;
  description: string;
  assignee: string;
  assigneeRole: string;
  attachments: AttachmentFile[];
  taskCost: number;
  bonusRate: number;
  bonusAmount: number;
  totalEstimatedCost: number;
  currency: string;
  checklistHeader: string;
  checklistLinkedCount: number;
  checklistItems: ChecklistItem[];
  submissionWarning?: string;
  submitButtonText: string;
}

export interface ProcessModule {
  id: string;
  title: string;
  category: string;
  stage: string;
  activeNodeId: string;
  steps: ProcessStep[];
  nodes: Record<string, NodeDetail>;
}

export interface ProcessDataResponse {
  module: ProcessModule;
}

export interface SubmissionResult {
  success: boolean;
  message: string;
  nextNodeId?: string;
}
